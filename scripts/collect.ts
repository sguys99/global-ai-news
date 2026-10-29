/**
 * 수집 배치 오케스트레이터. PRD §3.2 / WORK-PLAN Phase 1~3.
 * 실행: npm run collect  (= tsx scripts/collect.ts)
 *       npm run collect -- --dry-run  — ①~② 만 돌려 notes·선별 풀 구성을 출력한다. LLM 호출·API 키·DB 쓰기 없음
 *       (DB 는 readonly 로 열어 기존 기사·seen 키 확인에만 쓴다). 소스·할당 조정을 비용 없이 확인할 때 쓴다.
 *       npm run collect -- --no-save  — ①~④ 를 실제로 돌리되(LLM 비용 발생) DB 에 쓰지 않는다. dry-run 처럼 readonly 로
 *       열어 ensureSchema·syncSources·⑤ 저장·collection_runs 를 건너뛰고, 게재 목록·notes·단계별 비용을 출력한다.
 *       풀·선별·가공 결과는 data/eval/run-<시각>.json 스냅숏으로 남는다(npm run triage:compare 로 개편 전 선별과 비교).
 *       --db <path>  — dry-run·no-save 전용. 다른 DB 파일(예: 배포 브랜치 DB 사본)을 readonly 로 연다.
 *
 * ① 다중 어댑터 수집(RSS/HN/GitHub/HF 논문·모델/arXiv) → 소스별 상한·dedup·trendingScore
 * ② 선별 풀: 신규 후보 + 최근 가공 실패분을 소스별 라운드로빈으로 TRIAGE_POOL_SIZE 건(비뉴스·Physical AI 최소 할당)
 * ③ LLM 선별 1회: 최대 MAX_PICKS_PER_RUN 건 선정·같은 사건 묶기·중요도 상대 평가(형식 안에서)
 *    — 오늘 할당(비뉴스·Physical AI)과 최근 3개 호 게재 제목("이미 보도함")을 함께 넣고, 할당 미달은 notes 에 경고
 * ④ LLM 가공: 선정 기사만 10건씩 묶어 한국어 제목·요약·카테고리·태그 (비용 가드 적용)
 * ⑤ SQLite 저장: 선정 → articles, 미선정 → seen_items(키만) + collection_runs 기록
 *
 * LLM 호출은 기본적으로 Message Batches API(50% 할인)로 보낸다(lib/llm.ts).
 * 소스별 try/catch 로 부분 실패를 격리한다(한 소스 실패가 전체를 막지 않음).
 */
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { CATEGORY_LABELS, FORMAT_LABELS, toFormat } from "../src/lib/labels";
import { DB_PATH } from "../src/lib/paths";
import type { RawItem } from "../src/lib/types";
import { fetchGithub, fetchHf, fetchHfModels, fetchHn } from "./lib/collect/api";
import { fetchArxiv } from "./lib/collect/arxiv";
import { applyKeywordFilter } from "./lib/collect/keywordFilter";
import { fetchReddit } from "./lib/collect/reddit";
import { fetchRss, type SourceConfig } from "./lib/collect/rss";
import { estimateCost } from "./lib/cost";
import { dedupKey } from "./lib/dedup";
import {
  buildEnrichRequests,
  enrichFormat,
  estimateEnrichTokens,
  resolveEnrichments,
  type EnrichChunk,
} from "./lib/enrich";
import { envFlag, envNonNegativeInt, envNonNegativeNumber, envString } from "./lib/env";
import {
  categoryCounts,
  describeUsage,
  emptyUsage,
  formatCounts,
  parseCollectArgs,
  pickRows,
  snapshotPath,
  summarizePicks,
  usageSince,
  writeSnapshot,
  type EvalSnapshot,
} from "./lib/evalRun";
import { ensureSchema } from "./lib/initDb";
import { LlmRunner, parseStructured, type LlmRequest } from "./lib/llm";
import type { ArticleEnrichment } from "./lib/schema";
import { describeSync, loadSourcesConfig, syncSources } from "./lib/syncSources";
import { saveTags } from "./lib/tags";
import {
  alreadyReportedNote,
  buildTriagePool,
  buildTriageRequest,
  estimateTriageTokens,
  loadReportedHeadlines,
  pickTargets,
  poolMixNotes,
  quotaOverflowNote,
  quotaShortfallNote,
  REPORTED_ISSUES,
  resolvePicks,
  triageFormat,
  triageLine,
  type Candidate,
  type Pick,
} from "./lib/triage";
import { trendingScore } from "./lib/trending";

/** 선별·가공 모델 (Haiku 4.5 — 가장 저렴한 Claude 모델). */
const MODEL = envString("LLM_MODEL", "claude-haiku-4-5");
/** 1회 실행당 가공(지면 게재) 상한. */
const MAX_PICKS_PER_RUN = envNonNegativeInt("MAX_PICKS_PER_RUN", 35);
/** LLM 선별에 보내는 후보 수 상한(선별 입력 비용을 묶는다). */
const TRIAGE_POOL_SIZE = envNonNegativeInt("TRIAGE_POOL_SIZE", 180);
/** 1회 실행 LLM 비용 상한(USD). 예상 비용이 넘는 가공 요청은 보내지 않는다. */
const MAX_COST_USD_PER_RUN = envNonNegativeNumber("MAX_COST_USD_PER_RUN", 0.1);
/** Message Batches API 사용 여부(끄면 일반 호출 — 표준 단가). */
const USE_BATCH = envFlag("LLM_USE_BATCH", true);
/** 배치 1건 대기 상한(분). 넘으면 취소하고 남은 요청을 일반 호출로 보낸다. */
const BATCH_TIMEOUT_MIN = envNonNegativeInt("BATCH_TIMEOUT_MIN", 25);
const ARGS = parseCollectArgs(process.argv.slice(2));
/** `--dry-run`: 수집·선별 풀까지만(LLM·DB 쓰기 없음). */
const DRY_RUN = ARGS.dryRun;
/** `--no-save`: 선별·가공까지 돌리되 DB 쓰기 없음(결과는 data/eval 스냅숏). */
const NO_SAVE = ARGS.noSave;
/** DB 를 readonly 로 여는 모드 — ensureSchema·syncSources·저장·collection_runs 를 모두 건너뛴다. */
const READ_ONLY = DRY_RUN || NO_SAVE;
/** dry-run 에서 출력할 선별 풀 앞부분 줄 수. */
const DRY_RUN_PREVIEW_LINES = 40;

/**
 * 가공에 실패한 기사(summary_ko IS NULL)를 다시 선별 후보로 올리는 기간. 이보다 오래된
 * 미가공 행은 지면에 오를 일이 없으므로 정리(seen_items 로 이동)한다.
 */
const BACKFILL_DAYS = 7;
/** seen_items 보존 기간. RSS 수집 기간 창(7일)보다 넉넉하게 둔다. */
const SEEN_RETENTION_DAYS = 30;

/**
 * kind → 수집 어댑터. 여기 없는 kind(web — Post-MVP)는
 * sources 테이블에는 동기화되지만 수집에서는 건너뛴다.
 */
const ADAPTERS: Record<string, (s: SourceConfig) => Promise<RawItem[]>> = {
  rss: fetchRss,
  hn: fetchHn,
  github: fetchGithub,
  hf: fetchHf,
  hf_models: fetchHfModels,
  reddit: fetchReddit,
  arxiv: fetchArxiv,
};

const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

interface RunStats {
  status: "success" | "partial" | "failed";
  itemsCollected: number;
  /** 이번 실행으로 지면에 새로 실린 카드 수(신규 + 재가공 성공). */
  itemsPublished: number;
  notes: string[];
}

/** ① 전 소스 수집 → 소스별 상한 → 배치/DB dedup → 신규 후보. */
async function collectCandidates(
  db: DatabaseType,
  sources: SourceConfig[],
  stats: RunStats,
): Promise<Candidate[]> {
  // 지면에 실린 기사도, 선별에서 떨어진 기사도 다시 심사하지 않는다.
  const known = db.prepare(
    `SELECT 1 FROM articles WHERE dedup_key = @key
     UNION ALL SELECT 1 FROM seen_items WHERE dedup_key = @key LIMIT 1`,
  );

  const seen = new Set<string>(); // 배치 전체 중복 방지
  const candidates: Candidate[] = [];

  for (const source of sources) {
    try {
      const fetched = await ADAPTERS[source.kind](source);
      stats.itemsCollected += fetched.length;
      // 키워드 사전 필터: 주제가 섞인 소스(전체 언어 GitHub Trending 등)에서 관련 없는 항목은 dedup 키도 남기지 않고 버린다.
      const { kept: items, dropped } = source.keywordFilter
        ? applyKeywordFilter(fetched, source.keywordFilter)
        : { kept: fetched, dropped: [] };

      const fresh: Candidate[] = [];
      for (const item of items) {
        const key = dedupKey(item.url);
        if (seen.has(key)) continue;
        seen.add(key);
        if (known.get({ key })) continue;
        fresh.push({
          item,
          key,
          score: trendingScore(item),
          sourceName: source.name,
          format: toFormat(source.format),
          topic: source.topic,
        });
      }
      // 소스별 신규 상한: 화제 점수 → 최신 순 상위만(넘친 기사는 키를 남기지 않아 다음 실행에 다시 겨룬다).
      fresh.sort(
        (a, b) => b.score - a.score || b.item.publishedAt.localeCompare(a.item.publishedAt),
      );
      const kept = source.maxItems !== undefined ? fresh.slice(0, source.maxItems) : fresh;
      candidates.push(...kept);

      const capped = kept.length < fresh.length ? `, 상한 ${source.maxItems}` : "";
      const filtered = dropped.length > 0 ? `, 키워드 제외 ${dropped.length}` : "";
      stats.notes.push(
        `${source.id}: ${fetched.length}건(신규 ${fresh.length}${capped}${filtered})`,
      );
    } catch (err) {
      stats.status = "partial";
      stats.notes.push(`${source.id}: 실패 ${(err as Error).message}`);
      console.error(`[collect] source ${source.id} failed:`, err);
    }
  }
  return candidates;
}

/**
 * 최근 가공 실패 행 → 재심사 후보. 형식·topic 은 sources.json(비활성 포함)에서 찾는다 — topic 은 DB 에 없고,
 * 형식도 같은 출처를 써야 dry-run(sources 동기화 생략)에서도 신규 후보와 어긋나지 않는다.
 * sources.json 에서 빠진 소스는 news·topic 없음으로 센다.
 */
function loadBackfill(db: DatabaseType, sourcesConfig: SourceConfig[]): Candidate[] {
  const configById = new Map(sourcesConfig.map((s) => [s.id, s]));
  const rows = db
    .prepare(
      `SELECT a.id, a.dedup_key, a.source_id, s.name AS source_name, a.url, a.title_original,
              a.content_raw, a.published_at, a.trending_score
         FROM articles a JOIN sources s ON s.id = a.source_id
        WHERE a.summary_ko IS NULL AND a.published_at >= ?`,
    )
    .all(daysAgoIso(BACKFILL_DAYS)) as {
    id: number;
    dedup_key: string;
    source_id: string;
    source_name: string;
    url: string;
    title_original: string;
    content_raw: string | null;
    published_at: string;
    trending_score: number;
  }[];
  return rows.map((r) => ({
    item: {
      sourceId: r.source_id,
      url: r.url,
      title: r.title_original,
      contentRaw: r.content_raw ?? undefined,
      publishedAt: r.published_at,
    },
    key: r.dedup_key,
    score: r.trending_score,
    sourceName: r.source_name,
    format: toFormat(configById.get(r.source_id)?.format),
    topic: configById.get(r.source_id)?.topic,
    articleId: r.id,
  }));
}

/** ④ 비용 가드: 이미 쓴 비용 + 예상 비용이 한도를 넘는 가공 요청은 뒤에서부터 뺀다. */
function withinBudget(chunks: EnrichChunk[], spent: number, stats: RunStats): EnrichChunk[] {
  let remaining = MAX_COST_USD_PER_RUN - spent;
  const allowed: EnrichChunk[] = [];
  for (const chunk of chunks) {
    const est = estimateEnrichTokens(chunk);
    const cost = estimateCost(est.input, est.output, MODEL, { batch: USE_BATCH });
    if (cost > remaining) {
      const held = chunks.slice(allowed.length).reduce((n, c) => n + c.ids.length, 0);
      stats.notes.push(
        `비용 가드: 한도 $${MAX_COST_USD_PER_RUN} 초과 예상으로 ${held}건 가공 보류`,
      );
      break;
    }
    remaining -= cost;
    allowed.push(chunk);
  }
  return allowed;
}

/** ⑤ 선별·가공 결과 저장. 한 트랜잭션으로 묶는다. */
function persist(
  db: DatabaseType,
  pool: Candidate[],
  overflow: Candidate[],
  picks: Pick[],
  enriched: Map<number, ArticleEnrichment>,
  stats: RunStats,
): void {
  const insertArticle = db.prepare(
    `INSERT OR IGNORE INTO articles
       (dedup_key, source_id, url, title_original, content_raw,
        published_at, engagement_json, trending_score,
        title_ko, summary_ko, category, importance, related_json)
     VALUES
       (@dedup_key, @source_id, @url, @title_original, @content_raw,
        @published_at, @engagement_json, @trending_score,
        @title_ko, @summary_ko, @category, @importance, @related_json)`,
  );
  // 재심사 행을 이번 회차가 게재하면 created_at 도 지금으로 옮긴다. 호 경계는 created_at(= 게재한 회차)이라,
  // 옛 수집 시각을 두면 오늘 고른 기사가 지난 호로 소급돼 오늘 1면에 오르지 못한다.
  const updateArticle = db.prepare(
    `UPDATE articles
        SET title_ko = @title_ko, summary_ko = @summary_ko, category = @category,
            importance = @importance, related_json = @related_json,
            created_at = datetime('now')
      WHERE id = @id`,
  );
  const markSeen = db.prepare("INSERT OR IGNORE INTO seen_items (dedup_key) VALUES (?)");
  const dropUnenriched = db.prepare("DELETE FROM articles WHERE id = ? AND summary_ko IS NULL");

  /** 선별에서 떨어진 후보: 키만 남기고, 재심사 중이던 미가공 행은 지운다. */
  const reject = (c: Candidate) => {
    markSeen.run(c.key);
    if (c.articleId !== undefined) dropUnenriched.run(c.articleId);
  };

  db.transaction(() => {
    const judged = new Set<number>();
    for (const pick of picks) {
      judged.add(pick.index);
      for (const d of pick.duplicates) judged.add(d);

      const c = pool[pick.index];
      const e = enriched.get(pick.index);
      const related = pick.duplicates.map((d) => ({
        source: pool[d].sourceName,
        url: pool[d].item.url,
        title: pool[d].item.title,
      }));
      const fields = {
        title_ko: e?.title_ko ?? null,
        summary_ko: e?.summary_ko ?? null,
        category: e?.category ?? null,
        importance: pick.importance,
        related_json: related.length ? JSON.stringify(related) : null,
      };

      let articleId: number | bigint | undefined = c.articleId;
      if (articleId !== undefined) {
        // 재심사 행: 이번에도 가공에 실패하면 그대로 두어 다음 실행에서 다시 후보가 된다.
        if (e) updateArticle.run({ id: articleId, ...fields });
      } else {
        // 가공에 실패해도 저장(미노출) → BACKFILL_DAYS 동안 다음 실행에서 재심사.
        articleId = insertArticle.run({
          dedup_key: c.key,
          source_id: c.item.sourceId,
          url: c.item.url,
          title_original: c.item.title,
          content_raw: c.item.contentRaw ?? null,
          published_at: c.item.publishedAt,
          engagement_json: c.item.engagement ? JSON.stringify(c.item.engagement) : null,
          trending_score: c.score,
          ...fields,
        }).lastInsertRowid;
      }

      if (e) {
        saveTags(db, articleId, e.tags);
        stats.itemsPublished += 1;
      }
      // 묶인 기사는 대표 기사의 related_json 으로만 남긴다.
      for (const d of pick.duplicates) reject(pool[d]);
    }

    pool.forEach((c, i) => {
      if (!judged.has(i)) reject(c);
    });
    // 풀에 들지 못한 신규 후보도 다음 실행에서 다시 겨루지 않게 키를 남긴다.
    // (재심사 행은 심사받지 못했으므로 기간 창 안에서 다음 기회를 준다.)
    for (const c of overflow) if (c.articleId === undefined) markSeen.run(c.key);

    // 기간 창을 지난 미가공 행 정리 + 오래된 seen 키 정리.
    const cutoff = daysAgoIso(BACKFILL_DAYS);
    db.prepare(
      `INSERT OR IGNORE INTO seen_items (dedup_key)
       SELECT dedup_key FROM articles WHERE summary_ko IS NULL AND published_at < ?`,
    ).run(cutoff);
    db.prepare("DELETE FROM articles WHERE summary_ko IS NULL AND published_at < ?").run(cutoff);
    db.prepare("DELETE FROM seen_items WHERE seen_at < datetime('now', ?)").run(
      `-${SEEN_RETENTION_DAYS} days`,
    );
  })();
}

/**
 * dry-run: 선별 풀의 소스별 수·오늘 할당 목표·선별 요청 추정 비용과 앞부분 줄(선별 입력 형식 그대로)을 출력한다.
 * 형식별·Physical AI 수와 이미 보도함 주입 수는 notes 에 있다.
 */
function printPoolPreview(pool: Candidate[], triageReq: LlmRequest): void {
  const bySource = new Map<string, number>();
  for (const c of pool) bySource.set(c.item.sourceId, (bySource.get(c.item.sourceId) ?? 0) + 1);
  const sources = [...bySource].map(([id, n]) => `${id} ${n}`).join(", ");
  console.log(`[collect] dry-run 선별 풀 소스별: ${sources}`);
  const t = pickTargets(pool, MAX_PICKS_PER_RUN);
  console.log(
    `[collect] dry-run 오늘 할당: 비뉴스 ${t.nonNews}(오픈소스 ${t.formats.oss}·모델 ${t.formats.model}·` +
      `논문 ${t.formats.paper}), Physical AI ${t.physical}~${t.physicalMax}`,
  );
  const est = estimateTriageTokens(triageReq, MAX_PICKS_PER_RUN);
  const cost = estimateCost(est.input, est.output, MODEL, { batch: USE_BATCH });
  console.log(
    `[collect] dry-run 선별 요청 추정: 입력 ${est.input}·출력 ${est.output}토큰(근사), $${cost.toFixed(4)}`,
  );
  console.log(`[collect] dry-run 선별 풀 앞 ${DRY_RUN_PREVIEW_LINES}줄:`);
  pool.slice(0, DRY_RUN_PREVIEW_LINES).forEach((c, i) => console.log(`  ${triageLine(c, i)}`));
}

/** no-save: 게재(선정) 목록과 형식·분야 분포. Physical AI 는 가공 분야 기준(소스 topic 기준은 notes). */
function printNoSaveResult(
  pool: Candidate[],
  picks: Pick[],
  enriched: Map<number, ArticleEnrichment>,
): void {
  console.log(`[collect] no-save 선정 ${picks.length}건 (중요도 | 형식 | 분야 | 매체 | 제목):`);
  for (const p of picks) {
    const c = pool[p.index];
    const e = enriched.get(p.index);
    console.log(
      `  ${p.importance} | ${FORMAT_LABELS[c.format]} | ${e ? CATEGORY_LABELS[e.category] : "-"} | ` +
        `${c.sourceName} | ${e?.title_ko ?? `(미가공) ${c.item.title}`}`,
    );
  }
  const s = summarizePicks(pickRows(pool, picks, enriched));
  console.log(`[collect] no-save 형식별: ${formatCounts(s)} (비뉴스 ${s.nonNews})`);
  console.log(`[collect] no-save 분야별(가공): ${categoryCounts(s)}`);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  // dry-run·no-save 는 readonly 로 연다 — 커밋 대상인 data/app.db 를 실수로라도 바꾸지 않는다.
  const db = new Database(ARGS.db ?? DB_PATH, { readonly: READ_ONLY, fileMustExist: READ_ONLY });
  db.pragma("foreign_keys = ON");

  const llm = new LlmRunner({ useBatch: USE_BATCH, batchTimeoutMs: BATCH_TIMEOUT_MIN * 60_000 });
  const stats: RunStats = { status: "success", itemsCollected: 0, itemsPublished: 0, notes: [] };
  /** 형식별·Physical AI 후보 → 풀 → 게재 notes 재료. 선별 풀을 만든 뒤에 채운다. */
  let mix: Parameters<typeof poolMixNotes> | null = null;
  /** no-save 스냅숏. 풀을 만든 뒤 채우고 finally 에서 쓴다(선별이 실패해도 풀은 남는다). */
  let snapshot: EvalSnapshot | null = null;
  /** 선별 단계까지의 누적 usage(가공 몫 = 전체 − 이것). */
  let triageUsage = emptyUsage();

  try {
    // 소스 행(형식 포함)은 실행 시작에 sources.json 전체와 한 번에 맞춘다 — 비활성·삭제 소스도 반영된다.
    // dry-run·no-save 는 둘 다 건너뛴다(DB 쓰기). 수집·풀은 sources.json 만 보므로 결과는 같다.
    const sourcesConfig = loadSourcesConfig();
    if (!READ_ONLY) {
      ensureSchema(db);
      console.log(`[collect] sources sync: ${describeSync(syncSources(db, sourcesConfig))}`);
    }

    if (MAX_PICKS_PER_RUN === 0) {
      stats.notes.push("MAX_PICKS_PER_RUN=0 — 수집·선별·가공 생략");
      return;
    }
    // 키 없이 진행하면 아무것도 가공하지 못한다. 저장 없이 실패 처리해 잡을 빨갛게 만들고,
    // 후보는 다음 실행의 신규로 남긴다.
    if (!DRY_RUN && !process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new Error("ANTHROPIC_API_KEY 미설정 — LLM 가공 불가로 수집을 중단합니다");
    }

    const sources = sourcesConfig.filter((s) => s.enabled === 1 && Object.hasOwn(ADAPTERS, s.kind));
    const candidates = [
      ...(await collectCandidates(db, sources, stats)),
      ...loadBackfill(db, sourcesConfig),
    ];

    const pool = buildTriagePool(candidates, TRIAGE_POOL_SIZE);
    const inPool = new Set(pool);
    const overflow = candidates.filter((c) => !inPool.has(c));
    stats.notes.push(`선별 풀: 후보 ${candidates.length}건 중 ${pool.length}건`);
    // 이틀에 걸친 같은 사건 중복 방지: 최근 호 게재 제목을 선별에 "이미 보도함"으로 넣는다(읽기 전용 — dry-run 도 같다).
    const reported = loadReportedHeadlines(db);
    stats.notes.push(`이미 보도함: 최근 ${REPORTED_ISSUES}개 호 제목 ${reported.length}건`);
    const triageReq = buildTriageRequest(pool, MAX_PICKS_PER_RUN, MODEL, { reported });
    if (DRY_RUN) {
      mix = [candidates, pool];
      printPoolPreview(pool, triageReq);
      return;
    }
    mix = [candidates, pool, []];
    if (NO_SAVE) {
      snapshot = {
        createdAt: startedAt,
        model: MODEL,
        maxPicks: MAX_PICKS_PER_RUN,
        poolSize: TRIAGE_POOL_SIZE,
        useBatch: USE_BATCH,
        db: db.name,
        candidates: candidates.length,
        pool,
        reported,
        triage: null,
        picks: [],
        enrichments: {},
        usage: { triage: emptyUsage(), enrich: emptyUsage() },
        notes: stats.notes,
      };
    }

    if (pool.length === 0) {
      if (!NO_SAVE) persist(db, pool, overflow, [], new Map(), stats);
      return;
    }

    // ── ③ 선별 ──
    const triageEst = estimateTriageTokens(triageReq, MAX_PICKS_PER_RUN);
    const triageCost = estimateCost(triageEst.input, triageEst.output, MODEL, { batch: USE_BATCH });
    if (triageCost > MAX_COST_USD_PER_RUN) {
      throw new Error(`선별 예상 비용 $${triageCost.toFixed(4)} 가 한도를 넘어 중단합니다`);
    }
    const triageRes = (await llm.run([triageReq])).get(triageReq.id);
    const triage = parseStructured(triageRes?.message ?? null, triageFormat);
    triageUsage = { ...llm.usage };
    if (snapshot) snapshot.triage = triage;
    // 선별 실패 시 아무것도 저장하지 않는다 → 다음 실행에서 같은 후보로 다시 선별.
    if (!triage) throw new Error(`선별 실패: ${triageRes?.error ?? "응답 검증 실패"}`);

    // 이미 보도함으로 표시된 후보는 resolvePicks 가 선정·묶음에서 빼고, 미선정으로 남아 seen_items 로 간다.
    const picks = resolvePicks(triage, pool.length, MAX_PICKS_PER_RUN);
    const grouped = picks.reduce((n, p) => n + p.duplicates.length, 0);
    stats.notes.push(`선정 ${picks.length}건(같은 사건으로 묶인 기사 ${grouped}건)`);
    const reportedNote = alreadyReportedNote(triage, pool.length);
    if (reportedNote) stats.notes.push(reportedNote);
    if (snapshot) snapshot.picks = picks;
    for (const p of picks) {
      const c = pool[p.index];
      console.log(`[collect] pick ${p.importance} | ${c.sourceName} | ${c.item.title}`);
    }

    // ── ④ 가공 ──
    const chunks = withinBudget(
      buildEnrichRequests(
        picks.map((p) => ({
          id: p.index,
          item: pool[p.index].item,
          sourceName: pool[p.index].sourceName,
          format: pool[p.index].format,
        })),
        MODEL,
      ),
      llm.usage.costUsd,
      stats,
    );
    const results = await llm.run(chunks.map((c) => c.request));
    const enriched = new Map<number, ArticleEnrichment>();
    for (const chunk of chunks) {
      const parsed = parseStructured(results.get(chunk.request.id)?.message ?? null, enrichFormat);
      if (!parsed) continue;
      for (const [id, e] of resolveEnrichments(parsed, chunk.ids)) enriched.set(id, e);
    }
    if (snapshot) snapshot.enrichments = Object.fromEntries(enriched);

    const unfinished = picks.length - enriched.size;
    if (unfinished > 0) {
      stats.status = "partial";
      stats.notes.push(`가공 실패·보류 ${unfinished}건(다음 실행에서 재심사)`);
    }
    // 할당 미달·초과 경고(강제로 채우거나 덜어 내지 않는다). Physical AI 는 가공된 기사의 분야로 센다 — 소스 topic 은
    // 일반 매체의 로봇 기사를 놓친다. 가공되지 않은 선정만 소스 topic 으로 대신한다.
    const mixPicked = picks.map((p) => ({
      format: pool[p.index].format,
      physical: (enriched.get(p.index)?.category ?? pool[p.index].topic) === "physical",
    }));
    const targets = pickTargets(pool, MAX_PICKS_PER_RUN);
    for (const note of [
      quotaShortfallNote(mixPicked, targets),
      quotaOverflowNote(mixPicked, targets),
    ]) {
      if (note) stats.notes.push(note);
    }

    if (NO_SAVE) printNoSaveResult(pool, picks, enriched);
    else persist(db, pool, overflow, picks, enriched, stats);
    // 게재 = 이번 회차에 가공까지 마친 선정 기사(재심사 행 포함).
    mix = [candidates, pool, [...enriched.keys()].map((i) => pool[i])];

    // 선정이 있었는데 한 건도 가공되지 않았다면(키 오류·크레딧 소진 등) 파이프라인 고장이다.
    if (picks.length > 0 && enriched.size === 0) {
      stats.status = "failed";
      stats.notes.push(`LLM 가공 전부 실패(${picks.length}건) — API 키·크레딧을 확인하세요`);
    }
  } catch (err) {
    stats.status = "failed";
    stats.notes.push((err as Error).message);
    console.error("[collect] fatal:", err);
  } finally {
    if (mix) stats.notes.push(...poolMixNotes(...mix));
    const { calls, inputTokens, outputTokens, costUsd } = llm.usage;
    stats.notes.push(
      `LLM ${USE_BATCH ? "batch" : "direct"} 호출 ${calls}회, $${costUsd.toFixed(4)}`,
    );
    if (READ_ONLY) {
      // 실행 기록도 남기지 않는다 — notes 를 그대로 출력만 한다.
      for (const note of stats.notes) console.log(`[collect] note: ${note}`);
      if (NO_SAVE) {
        const enrichUsage = usageSince(llm.usage, triageUsage);
        console.log(`[collect] no-save ${describeUsage("선별", triageUsage, MODEL, USE_BATCH)}`);
        console.log(`[collect] no-save ${describeUsage("가공", enrichUsage, MODEL, USE_BATCH)}`);
        console.log(`[collect] no-save ${describeUsage("합계", llm.usage, MODEL, USE_BATCH)}`);
      }
      if (snapshot) {
        snapshot.usage = { triage: triageUsage, enrich: usageSince(llm.usage, triageUsage) };
        const file = snapshotPath(startedAt);
        writeSnapshot(file, snapshot);
        console.log(`[collect] no-save 스냅숏: ${file}`);
      }
    } else {
      db.prepare(
        `INSERT INTO collection_runs
           (started_at, finished_at, items_collected, items_new,
            llm_calls, input_tokens, output_tokens, est_cost_usd, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        startedAt,
        new Date().toISOString(),
        stats.itemsCollected,
        stats.itemsPublished,
        calls,
        inputTokens,
        outputTokens,
        costUsd,
        stats.status,
        stats.notes.join("; "),
      );
    }
    db.close();
  }

  const { calls, inputTokens, outputTokens, costUsd } = llm.usage;
  console.log(
    `[collect] status=${stats.status} collected=${stats.itemsCollected} ` +
      `published=${stats.itemsPublished} llm_calls=${calls} ` +
      `tokens=${inputTokens}/${outputTokens} est_cost=$${costUsd.toFixed(4)}`,
  );
  if (stats.status === "failed") process.exit(1);
}

// 작업이 끝나면(DB 는 finally 에서 이미 닫힘) 명시적으로 종료한다. 수집 어댑터·SDK 가 남긴
// 열린 소켓·타이머가 이벤트 루프를 붙잡으면 잡이 timeout-minutes 에 걸려 취소되고,
// 커밋 스텝이 건너뛰어져 그날 결과가 통째로 버려진다(2026-10-07 사고).
main().then(() => process.exit());
