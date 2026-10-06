/**
 * 수집 배치 오케스트레이터. PRD §3.2 / WORK-PLAN Phase 1~3.
 * 실행: npm run collect  (= tsx scripts/collect.ts)
 *
 * ① 다중 어댑터 수집(RSS/HN/GitHub/HF/arXiv) → 소스별 상한·dedup·trendingScore
 * ② 선별 풀: 신규 후보 + 최근 가공 실패분을 소스별 라운드로빈으로 TRIAGE_POOL_SIZE 건
 * ③ LLM 선별 1회: 최대 MAX_PICKS_PER_RUN 건 선정·같은 사건 묶기·중요도 상대 평가
 * ④ LLM 가공: 선정 기사만 10건씩 묶어 한국어 제목·요약·카테고리·태그 (비용 가드 적용)
 * ⑤ SQLite 저장: 선정 → articles, 미선정 → seen_items(키만) + collection_runs 기록
 *
 * LLM 호출은 기본적으로 Message Batches API(50% 할인)로 보낸다(lib/llm.ts).
 * 소스별 try/catch 로 부분 실패를 격리한다(한 소스 실패가 전체를 막지 않음).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { CONFIGS_DIR, DB_PATH } from "../src/lib/paths";
import type { RawItem } from "../src/lib/types";
import { fetchGithub, fetchHf, fetchHn } from "./lib/collect/api";
import { fetchArxiv } from "./lib/collect/arxiv";
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
import { ensureSchema } from "./lib/initDb";
import { LlmRunner, parseStructured } from "./lib/llm";
import type { ArticleEnrichment } from "./lib/schema";
import { saveTags } from "./lib/tags";
import {
  buildTriagePool,
  buildTriageRequest,
  estimateTriageTokens,
  resolvePicks,
  triageFormat,
  type Candidate,
  type Pick,
} from "./lib/triage";
import { trendingScore } from "./lib/trending";

/** 선별·가공 모델 (Haiku 4.5 — 가장 저렴한 Claude 모델). */
const MODEL = envString("LLM_MODEL", "claude-haiku-4-5");
/** 1회 실행당 가공(지면 게재) 상한. */
const MAX_PICKS_PER_RUN = envNonNegativeInt("MAX_PICKS_PER_RUN", 30);
/** LLM 선별에 보내는 후보 수 상한(선별 입력 비용을 묶는다). */
const TRIAGE_POOL_SIZE = envNonNegativeInt("TRIAGE_POOL_SIZE", 150);
/** 1회 실행 LLM 비용 상한(USD). 예상 비용이 넘는 가공 요청은 보내지 않는다. */
const MAX_COST_USD_PER_RUN = envNonNegativeNumber("MAX_COST_USD_PER_RUN", 0.1);
/** Message Batches API 사용 여부(끄면 일반 호출 — 표준 단가). */
const USE_BATCH = envFlag("LLM_USE_BATCH", true);
/** 배치 1건 대기 상한(분). 넘으면 취소하고 남은 요청을 일반 호출로 보낸다. */
const BATCH_TIMEOUT_MIN = envNonNegativeInt("BATCH_TIMEOUT_MIN", 25);

/**
 * 가공에 실패한 기사(summary_ko IS NULL)를 다시 선별 후보로 올리는 기간. 이보다 오래된
 * 미가공 행은 지면에 오를 일이 없으므로 정리(seen_items 로 이동)한다.
 */
const BACKFILL_DAYS = 7;
/** seen_items 보존 기간. RSS 수집 기간 창(7일)보다 넉넉하게 둔다. */
const SEEN_RETENTION_DAYS = 30;

/** kind → 수집 어댑터. WEB 은 등록만 하고 수집하지 않는다(Post-MVP). */
const ADAPTERS: Record<string, (s: SourceConfig) => Promise<RawItem[]>> = {
  rss: fetchRss,
  hn: fetchHn,
  github: fetchGithub,
  hf: fetchHf,
  reddit: fetchReddit,
  arxiv: fetchArxiv,
};

function loadSources(): SourceConfig[] {
  const file = path.join(CONFIGS_DIR, "sources.json");
  return JSON.parse(readFileSync(file, "utf-8")) as SourceConfig[];
}

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
  const upsertSource = db.prepare(
    `INSERT INTO sources (id, name, kind, url, enabled)
     VALUES (@id, @name, @kind, @url, @enabled)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, kind = excluded.kind,
       url = excluded.url, enabled = excluded.enabled`,
  );
  // 지면에 실린 기사도, 선별에서 떨어진 기사도 다시 심사하지 않는다.
  const known = db.prepare(
    `SELECT 1 FROM articles WHERE dedup_key = @key
     UNION ALL SELECT 1 FROM seen_items WHERE dedup_key = @key LIMIT 1`,
  );

  const seen = new Set<string>(); // 배치 전체 중복 방지
  const candidates: Candidate[] = [];

  for (const source of sources) {
    const { id, name, kind, url, enabled } = source;
    upsertSource.run({ id, name, kind, url, enabled });
    try {
      const items = await ADAPTERS[source.kind](source);
      stats.itemsCollected += items.length;

      const fresh: Candidate[] = [];
      for (const item of items) {
        const key = dedupKey(item.url);
        if (seen.has(key)) continue;
        seen.add(key);
        if (known.get({ key })) continue;
        fresh.push({ item, key, score: trendingScore(item), sourceName: source.name });
      }
      // 소스별 신규 상한: 화제 점수 → 최신 순 상위만(넘친 기사는 키를 남기지 않아 다음 실행에 다시 겨룬다).
      fresh.sort(
        (a, b) => b.score - a.score || b.item.publishedAt.localeCompare(a.item.publishedAt),
      );
      const kept = source.maxItems !== undefined ? fresh.slice(0, source.maxItems) : fresh;
      candidates.push(...kept);

      const capped = kept.length < fresh.length ? `, 상한 ${source.maxItems}` : "";
      stats.notes.push(`${source.id}: ${items.length}건(신규 ${fresh.length}${capped})`);
    } catch (err) {
      stats.status = "partial";
      stats.notes.push(`${source.id}: 실패 ${(err as Error).message}`);
      console.error(`[collect] source ${source.id} failed:`, err);
    }
  }
  return candidates;
}

/** 최근 가공 실패 행 → 재심사 후보. */
function loadBackfill(db: DatabaseType): Candidate[] {
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
  const updateArticle = db.prepare(
    `UPDATE articles
        SET title_ko = @title_ko, summary_ko = @summary_ko, category = @category,
            importance = @importance, related_json = @related_json
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

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const llm = new LlmRunner({ useBatch: USE_BATCH, batchTimeoutMs: BATCH_TIMEOUT_MIN * 60_000 });
  const stats: RunStats = { status: "success", itemsCollected: 0, itemsPublished: 0, notes: [] };

  try {
    ensureSchema(db);

    if (MAX_PICKS_PER_RUN === 0) {
      stats.notes.push("MAX_PICKS_PER_RUN=0 — 수집·선별·가공 생략");
      return;
    }
    // 키 없이 진행하면 아무것도 가공하지 못한다. 저장 없이 실패 처리해 잡을 빨갛게 만들고,
    // 후보는 다음 실행의 신규로 남긴다.
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new Error("ANTHROPIC_API_KEY 미설정 — LLM 가공 불가로 수집을 중단합니다");
    }

    const sources = loadSources().filter((s) => s.enabled === 1 && s.kind in ADAPTERS);
    const candidates = [...(await collectCandidates(db, sources, stats)), ...loadBackfill(db)];

    const pool = buildTriagePool(candidates, TRIAGE_POOL_SIZE);
    const inPool = new Set(pool);
    const overflow = candidates.filter((c) => !inPool.has(c));
    stats.notes.push(`선별 풀: 후보 ${candidates.length}건 중 ${pool.length}건`);

    if (pool.length === 0) {
      persist(db, pool, overflow, [], new Map(), stats);
      return;
    }

    // ── ③ 선별 ──
    const triageReq = buildTriageRequest(pool, MAX_PICKS_PER_RUN, MODEL);
    const triageEst = estimateTriageTokens(triageReq, MAX_PICKS_PER_RUN);
    const triageCost = estimateCost(triageEst.input, triageEst.output, MODEL, { batch: USE_BATCH });
    if (triageCost > MAX_COST_USD_PER_RUN) {
      throw new Error(`선별 예상 비용 $${triageCost.toFixed(4)} 가 한도를 넘어 중단합니다`);
    }
    const triageRes = (await llm.run([triageReq])).get(triageReq.id);
    const triage = parseStructured(triageRes?.message ?? null, triageFormat);
    // 선별 실패 시 아무것도 저장하지 않는다 → 다음 실행에서 같은 후보로 다시 선별.
    if (!triage) throw new Error(`선별 실패: ${triageRes?.error ?? "응답 검증 실패"}`);

    const picks = resolvePicks(triage, pool.length, MAX_PICKS_PER_RUN);
    const grouped = picks.reduce((n, p) => n + p.duplicates.length, 0);
    stats.notes.push(`선정 ${picks.length}건(같은 사건으로 묶인 기사 ${grouped}건)`);
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

    const unfinished = picks.length - enriched.size;
    if (unfinished > 0) {
      stats.status = "partial";
      stats.notes.push(`가공 실패·보류 ${unfinished}건(다음 실행에서 재심사)`);
    }

    persist(db, pool, overflow, picks, enriched, stats);

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
    const { calls, inputTokens, outputTokens, costUsd } = llm.usage;
    stats.notes.push(
      `LLM ${USE_BATCH ? "batch" : "direct"} 호출 ${calls}회, $${costUsd.toFixed(4)}`,
    );
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

main();
