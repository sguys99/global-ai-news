/**
 * 기존 기사 분야 재분류(docs/contents-upgrade-plan.md Phase 2-3).
 * 실행: npm run db:reclassify -- [--dry-run | --apply] [옵션]
 *
 * 구 분야 값(Agents·Dev Tools·Language Models·MLOps·산업·정책·연구·논문)을 6개 키로 옮긴다.
 *
 * 1. 규칙 매핑(LEGACY_CATEGORY_MAP)을 폴백으로 먼저 정한다.
 * 2. LLM 이 제목·요약·태그·매체를 보고 다시 분류한다. 가공(enrich)과 같은 분야 정의
 *    (configs/prompts/categories.md)를 쓰고, CHUNK 건씩 묶은 요청 전부를 Message Batch 1개로 보낸다.
 *    결과가 없거나 틀린 기사는 규칙 값을 유지한다.
 * 3. LLM 결과는 캐시 파일에 남긴다. dry-run 으로 분포를 본 뒤 --apply 하면 캐시를 재사용해
 *    같은 기사에 두 번 과금하지 않는다(입력·모델·분야 정의가 바뀐 기사만 다시 묻는다).
 * 4. --apply 는 DB 를 data/app.db.bak-YYYYMMDD(KST)로 백업한 뒤 한 트랜잭션으로 UPDATE 하고
 *    FTS 를 재색인한다. FTS 에는 category 가 없고 articles_au 트리거가 행마다 동기화하지만,
 *    계획서대로 같은 트랜잭션에서 'rebuild' 해 둔다(약 1천 건이라 즉시 끝난다).
 *
 * 옵션
 *   --dry-run          (기본) 분포·전이표만 출력하고 DB 는 쓰지 않는다. LLM 결과는 캐시에 남는다.
 *   --apply            백업 후 DB 에 쓴다.
 *   --only-legacy      6개 키가 아닌 행만 대상으로 한다(배포 브랜치 병합 후 재실행용).
 *   --limit N          앞에서부터 N건만(표본 확인용).
 *   --rules-only       LLM 없이 규칙 매핑만 적용한다(캐시에 있는 LLM 결과는 그대로 쓴다).
 *   --db PATH          대상 DB(기본 data/app.db).
 *   --cache PATH       LLM 결과 캐시(기본 data/reclassify-cache.json).
 *   --chunk N          요청 1건에 묶는 기사 수(기본 20).
 *   --max-cost USD     예상 비용 상한(기본 0.5, 환경변수 RECLASSIFY_MAX_COST_USD). 넘으면 호출하지 않는다.
 * 환경변수 LLM_MODEL·LLM_USE_BATCH·BATCH_TIMEOUT_MIN 은 수집과 같은 뜻이다.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { z } from "zod/v4";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  isCategory,
  kstDateKey,
  LEGACY_CATEGORY_MAP,
  type Category,
} from "../src/lib/labels";
import { DATA_DIR, DB_PATH } from "../src/lib/paths";
import { estimateCost } from "./lib/cost";
import { readCategoryGuide } from "./lib/enrich";
import { envFlag, envNonNegativeInt, envNonNegativeNumber, envString } from "./lib/env";
import { LlmRunner, parseStructured, type LlmRequest } from "./lib/llm";

export const DEFAULT_CACHE_PATH = path.join(DATA_DIR, "reclassify-cache.json");
/** 요청 1건에 묶는 기사 수. 입력이 제목·요약뿐이라 가공(10건)보다 크게 잡는다. */
export const DEFAULT_CHUNK_SIZE = 20;
/** 기사 1건 요약 입력 상한(글자). 실측 평균 약 115자. */
const MAX_SUMMARY_CHARS = 400;
/** 기사 1건당 출력 토큰 상한·추정치(`{"id":1234,"category":"industry"}` ≈ 15토큰). */
const MAX_OUTPUT_TOKENS_PER_ARTICLE = 40;
const EST_OUTPUT_TOKENS_PER_ARTICLE = 20;

/** 재분류 대상 기사 1건(게재된 기사만). */
export interface ReclassifyRow {
  id: number;
  title_ko: string;
  summary_ko: string;
  /** 현재 DB 값(구 값 또는 키). */
  category: string | null;
  /** 정렬된 태그 이름. */
  tags: string[];
  sourceName: string;
}

/** LLM 이 돌려준 판정 1건(검증 전). */
export interface Verdict {
  id: number;
  category: string;
}

/** 미분류 기사 묶음 → 판정 목록. 테스트는 가짜를 주입한다. */
export type Classifier = (rows: ReclassifyRow[]) => Promise<Verdict[]>;

/** 최종 분야를 정한 근거. cache 는 이전 실행의 LLM 결과. */
export type DecisionSource = "llm" | "cache" | "rule";

export interface Decision {
  row: ReclassifyRow;
  /** 규칙 매핑 값(폴백). 구 값·키가 아니면 null. */
  rule: Category | null;
  /** 최종 값. LLM·규칙 모두 없으면 현재 값을 그대로 둔다(null 이면 손대지 않음). */
  next: Category | null;
  source: DecisionSource;
}

/** LLM 결과 캐시 파일. entries 는 기사 id → 입력 해시·분야. */
export interface ReclassifyCache {
  version: 1;
  entries: Record<string, { hash: string; category: Category }>;
}

export const emptyCache = (): ReclassifyCache => ({ version: 1, entries: {} });

// ── 순수 로직 ────────────────────────────────────────────────────────────

/** 규칙 매핑: 구 값은 LEGACY_CATEGORY_MAP, 이미 키면 그대로, 그 외(null·미정의)는 null. */
export function ruleCategory(value: string | null | undefined): Category | null {
  if (!value) return null;
  if (isCategory(value)) return value;
  return Object.hasOwn(LEGACY_CATEGORY_MAP, value) ? LEGACY_CATEGORY_MAP[value] : null;
}

/**
 * 캐시 키용 입력 해시. LLM 에 보내는 내용(제목·요약·태그·매체)과 salt(모델·분야 정의)를 묶는다.
 * 기사를 다시 가공했거나 분야 정의를 고쳤으면 해시가 달라져 캐시를 쓰지 않는다.
 */
export function inputHash(row: ReclassifyRow, salt = ""): string {
  return createHash("sha256")
    .update(JSON.stringify([salt, row.title_ko, row.summary_ko, row.tags, row.sourceName]))
    .digest("hex")
    .slice(0, 16);
}

function articleLine(row: ReclassifyRow): string {
  const summary = row.summary_ko.slice(0, MAX_SUMMARY_CHARS);
  const tags = row.tags.length ? ` | 태그: ${row.tags.join(", ")}` : "";
  return `id=${row.id} | ${row.sourceName} | ${row.title_ko} | ${summary}${tags}`;
}

export const reclassifySchema = z.object({
  articles: z.array(z.object({ id: z.number().int(), category: z.enum(CATEGORIES) })),
});

export const reclassifyFormat = zodOutputFormat(reclassifySchema);

/** 시스템 프롬프트: 짧은 지시 + 분야 정의(가공과 같은 파일). */
export function buildSystemPrompt(guide: string = readCategoryGuide()): string {
  return (
    "AI/IT 뉴스 큐레이션 서비스의 기사 분야를 분류합니다. 각 기사의 제목·요약·태그·매체를 보고 " +
    "아래 분야 정의와 경계 규칙에 따라 가장 알맞은 분야 하나를 고르세요. " +
    "기존 분류는 주어지지 않으며, 기사 내용만으로 판단합니다.\n\n" +
    `## 분야 정의\n\n${guide}`
  );
}

/** 분류 요청 1건과 그 요청에 실린 기사 id. */
export interface ReclassifyChunk {
  request: LlmRequest;
  ids: number[];
}

/** 기사 → chunkSize 건씩 묶은 요청들(입력 순서 유지). */
export function buildRequests(
  rows: ReclassifyRow[],
  chunkSize: number,
  { model = "claude-haiku-4-5", system = buildSystemPrompt() } = {},
): ReclassifyChunk[] {
  const chunks: ReclassifyChunk[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    chunks.push({
      ids: chunk.map((r) => r.id),
      request: {
        id: `reclassify-${i / chunkSize}`,
        params: {
          model,
          max_tokens: 100 + chunk.length * MAX_OUTPUT_TOKENS_PER_ARTICLE,
          system,
          messages: [
            {
              role: "user",
              content:
                `기사 ${chunk.length}건의 분야를 고르세요. articles 배열에 기사마다 하나씩, 입력의 id 를 그대로 담으세요.\n` +
                "형식: id | 매체 | 제목 | 요약 | 태그\n\n" +
                chunk.map(articleLine).join("\n"),
            },
          ],
          output_config: { format: reclassifyFormat },
        },
      },
    });
  }
  return chunks;
}

/**
 * 비용 가드용 추정(USD). 입력은 한글 위주라 1글자 ≈ 1토큰으로 넉넉하게 잡는다
 * (cost.ts 의 approxTokens 는 영문 본문 기준이라 한글 입력을 과소 추정한다).
 */
export function estimateRequestsCost(
  chunks: ReclassifyChunk[],
  model: string,
  batch: boolean,
): number {
  let input = 0;
  let output = 0;
  for (const { request, ids } of chunks) {
    const system = typeof request.params.system === "string" ? request.params.system : "";
    const user = request.params.messages.map((m) => m.content).join("");
    input += system.length + user.length;
    output += ids.length * EST_OUTPUT_TOKENS_PER_ARTICLE;
  }
  return estimateCost(input, output, model, { batch });
}

/** LLM 판정 → 결정. 요청에 없던 id·중복·분야 키가 아닌 값은 버리고, 빠진 기사는 규칙 폴백. */
export function mergeResults(
  rows: ReclassifyRow[],
  verdicts: Verdict[],
): { decisions: Decision[]; invalid: number; missing: number } {
  const wanted = new Set(rows.map((r) => r.id));
  const byId = new Map<number, Category>();
  let invalid = 0;
  for (const { id, category } of verdicts) {
    if (!wanted.has(id) || byId.has(id) || !isCategory(category)) {
      invalid += 1;
      continue;
    }
    byId.set(id, category);
  }
  let missing = 0;
  const decisions = rows.map((row): Decision => {
    const rule = ruleCategory(row.category);
    const llm = byId.get(row.id);
    if (llm) return { row, rule, next: llm, source: "llm" };
    missing += 1;
    return { row, rule, next: rule, source: "rule" };
  });
  return { decisions, invalid, missing };
}

export interface ReclassifySummary {
  total: number;
  bySource: Record<DecisionSource, number>;
  /** 현재 DB 값과 달라 UPDATE 할 행. */
  toUpdate: number;
  /** LLM(캐시 포함) 값이 규칙 매핑과 다른 행. */
  changedFromRule: number;
  /** 최종 값을 정하지 못한 행(구 값도 키도 아니고 LLM 결과도 없음). DB 는 그대로 둔다. */
  unresolved: number;
  before: Record<string, number>;
  after: Record<string, number>;
  /** 현재 값 → 최종 값 건수. */
  transitions: Record<string, Record<string, number>>;
  /** 규칙 매핑으로는 physical 이 아니었는데 physical 로 옮겨진 기사. */
  toPhysical: { id: number; title: string; from: string }[];
}

const NULL_LABEL = "(없음)";

/** 결정 목록 → 보고용 집계. */
export function summarize(decisions: Decision[]): ReclassifySummary {
  const s: ReclassifySummary = {
    total: decisions.length,
    bySource: { llm: 0, cache: 0, rule: 0 },
    toUpdate: 0,
    changedFromRule: 0,
    unresolved: 0,
    before: {},
    after: {},
    transitions: {},
    toPhysical: [],
  };
  for (const { row, rule, next, source } of decisions) {
    const from = row.category ?? NULL_LABEL;
    const to = next ?? from;
    s.bySource[source] += 1;
    s.before[from] = (s.before[from] ?? 0) + 1;
    s.after[to] = (s.after[to] ?? 0) + 1;
    (s.transitions[from] ??= {})[to] = (s.transitions[from][to] ?? 0) + 1;
    if (next === null) s.unresolved += 1;
    if (next !== null && next !== row.category) s.toUpdate += 1;
    if (source !== "rule" && next !== rule) s.changedFromRule += 1;
    if (next === "physical" && rule !== "physical") {
      s.toPhysical.push({ id: row.id, title: row.title_ko, from });
    }
  }
  return s;
}

/** 터미널 표시 폭(한글 등 전각 문자는 2칸). 한글이 섞인 표를 맞추려고 쓴다. */
function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text)
    w += /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 2 : 1;
  return w;
}

const padDisplay = (text: string, width: number) =>
  text + " ".repeat(Math.max(0, width - displayWidth(text)));

/** 집계 → 터미널 보고문. */
export function formatReport(s: ReclassifySummary, { samples = 10 } = {}): string {
  const pct = (n: number) => (s.total ? `${((n / s.total) * 100).toFixed(1)}%` : "-");
  const lines: string[] = [];
  lines.push(
    `대상 ${s.total}건 — LLM ${s.bySource.llm} · 캐시 ${s.bySource.cache} · 규칙 폴백 ${s.bySource.rule}`,
  );
  lines.push(
    `UPDATE 대상 ${s.toUpdate}건 · 규칙 매핑과 다른 분류 ${s.changedFromRule}건 · Physical AI 로 이동 ${s.toPhysical.length}건` +
      (s.unresolved ? ` · 미해결(그대로 둠) ${s.unresolved}건` : ""),
  );

  lines.push("", "분포 (전 → 후)");
  const afterKeys = [...CATEGORIES, ...Object.keys(s.after).filter((k) => !isCategory(k))];
  const afterLabel = (k: string) => (isCategory(k) ? `${k} (${CATEGORY_LABELS[k]})` : k);
  const width = Math.max(
    ...Object.keys(s.before).map(displayWidth),
    ...afterKeys.map((k) => displayWidth(afterLabel(k))),
  );
  for (const [k, n] of Object.entries(s.before).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${padDisplay(k, width)} ${String(n).padStart(5)}  ${pct(n)}`);
  }
  lines.push("  →");
  for (const k of afterKeys) {
    const n = s.after[k] ?? 0;
    lines.push(`  ${padDisplay(afterLabel(k), width)} ${String(n).padStart(5)}  ${pct(n)}`);
  }

  lines.push("", "전이표 (현재 값 → 최종 값)");
  for (const [from, tos] of Object.entries(s.transitions).sort()) {
    const cells = Object.entries(tos)
      .sort((a, b) => b[1] - a[1])
      .map(([to, n]) => `${to} ${n}`)
      .join(" · ");
    lines.push(`  ${padDisplay(from, width)} → ${cells}`);
  }

  if (s.toPhysical.length) {
    lines.push("", `Physical AI 로 이동 (표본 ${Math.min(samples, s.toPhysical.length)}건)`);
    for (const p of s.toPhysical.slice(0, samples)) {
      lines.push(`  #${p.id} [${p.from}] ${p.title}`);
    }
  }
  return lines.join("\n");
}

// ── DB ──────────────────────────────────────────────────────────────────

export interface SelectOptions {
  onlyLegacy?: boolean;
  limit?: number;
}

/** 게재된 기사(summary_ko 있음)를 id 순으로 읽는다. onlyLegacy 면 6개 키가 아닌 행만. */
export function selectRows(db: DatabaseType, { onlyLegacy = false, limit }: SelectOptions = {}) {
  const where = ["a.summary_ko IS NOT NULL"];
  if (onlyLegacy) {
    where.push(
      `(a.category IS NULL OR a.category NOT IN (${CATEGORIES.map(() => "?").join(", ")}))`,
    );
  }
  const sql = `
    SELECT a.id, a.title_ko, a.summary_ko, a.category, COALESCE(s.name, a.source_id) AS sourceName,
           (SELECT group_concat(t.name, char(31)) FROM article_tags at
              JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id) AS tags
    FROM articles a LEFT JOIN sources s ON s.id = a.source_id
    WHERE ${where.join(" AND ")}
    ORDER BY a.id
    ${limit ? "LIMIT ?" : ""}`;
  const params: (string | number)[] = onlyLegacy ? [...CATEGORIES] : [];
  if (limit) params.push(limit);
  const raw = db.prepare(sql).all(...params) as (Omit<ReclassifyRow, "tags"> & {
    tags: string | null;
  })[];
  return raw.map(
    (r): ReclassifyRow => ({
      ...r,
      title_ko: r.title_ko ?? "",
      tags: r.tags ? r.tags.split("\u001f").sort() : [],
    }),
  );
}

/** 최종 값이 현재 값과 다른 행만 한 트랜잭션으로 UPDATE 하고 FTS 를 재색인한다. 바뀐 행 수를 돌려준다. */
export function applyDecisions(db: DatabaseType, decisions: Decision[]): number {
  const update = db.prepare("UPDATE articles SET category = ? WHERE id = ?");
  const changed = decisions.filter((d) => d.next !== null && d.next !== d.row.category);
  db.transaction(() => {
    for (const d of changed) update.run(d.next, d.row.id);
    if (changed.length) db.exec("INSERT INTO articles_fts(articles_fts) VALUES('rebuild')");
  })();
  return changed.length;
}

export interface ReclassifyOptions extends SelectOptions {
  /** 미지정이면 규칙 매핑만(캐시는 사용). */
  classify?: Classifier;
  /** 읽고 갱신한다(LLM 성공분만 기록). */
  cache?: ReclassifyCache;
  /** inputHash 의 salt(모델·분야 정의). */
  cacheSalt?: string;
}

export interface ReclassifyPlan {
  decisions: Decision[];
  /** LLM 에 보낸 기사 수(캐시 미적중분). */
  requested: number;
  /** LLM 판정 중 버린 것(요청에 없던 id·중복·잘못된 분야). */
  invalid: number;
  /** LLM 결과가 없어 규칙으로 폴백한 기사 수. */
  missing: number;
}

/** 대상 선택 → 캐시 적용 → 나머지 LLM 분류 → 결정. DB 는 쓰지 않는다. */
export async function planReclassify(
  db: DatabaseType,
  { classify, cache, cacheSalt = "", ...select }: ReclassifyOptions = {},
): Promise<ReclassifyPlan> {
  const rows = selectRows(db, select);
  const hashes = new Map(rows.map((r) => [r.id, inputHash(r, cacheSalt)]));

  const cached = new Map<number, Category>();
  for (const r of rows) {
    const entry = cache?.entries[String(r.id)];
    if (entry && entry.hash === hashes.get(r.id) && isCategory(entry.category)) {
      cached.set(r.id, entry.category);
    }
  }
  const pending = rows.filter((r) => !cached.has(r.id));

  let verdicts: Verdict[] = [];
  if (classify && pending.length) verdicts = await classify(pending);
  const merged = mergeResults(pending, verdicts);

  if (cache) {
    for (const d of merged.decisions) {
      if (d.source === "llm" && d.next) {
        cache.entries[String(d.row.id)] = { hash: hashes.get(d.row.id)!, category: d.next };
      }
    }
  }

  const byId = new Map(merged.decisions.map((d) => [d.row.id, d]));
  const decisions = rows.map(
    (row): Decision =>
      cached.has(row.id)
        ? { row, rule: ruleCategory(row.category), next: cached.get(row.id)!, source: "cache" }
        : byId.get(row.id)!,
  );
  return {
    decisions,
    requested: classify ? pending.length : 0,
    invalid: merged.invalid,
    missing: classify ? merged.missing : 0,
  };
}

/** planReclassify + (apply 면) applyDecisions. */
export async function reclassify(
  db: DatabaseType,
  opts: ReclassifyOptions & { apply?: boolean } = {},
): Promise<ReclassifyPlan & { written: number; summary: ReclassifySummary }> {
  const plan = await planReclassify(db, opts);
  const written = opts.apply ? applyDecisions(db, plan.decisions) : 0;
  return { ...plan, written, summary: summarize(plan.decisions) };
}

// ── LLM 분류기 ──────────────────────────────────────────────────────────

export interface LlmClassifierOptions {
  runner: Pick<LlmRunner, "run">;
  model: string;
  chunkSize: number;
  /** 예상 비용이 이 값을 넘으면 호출하지 않고 throw. */
  maxCostUsd: number;
  batch: boolean;
  system?: string;
  /** true 면 호출 전에 ANTHROPIC_API_KEY 를 확인한다(CLI). 테스트는 가짜 runner 라 끈다. */
  requireApiKey?: boolean;
  log?: (msg: string) => void;
}

/** LlmRunner 로 모든 묶음을 한 번에(배치 1개) 보내는 분류기. */
export function createLlmClassifier(opts: LlmClassifierOptions): Classifier {
  const log = opts.log ?? ((msg: string) => console.log(`[reclassify] ${msg}`));
  return async (rows) => {
    // 전부 캐시에 있으면 여기까지 오지 않으므로, 키는 실제로 물을 기사가 있을 때만 요구한다.
    if (opts.requireApiKey && !process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new Error(
        `ANTHROPIC_API_KEY 미설정 — 캐시에 없는 ${rows.length}건을 분류할 수 없습니다`,
      );
    }
    const chunks = buildRequests(rows, opts.chunkSize, { model: opts.model, system: opts.system });
    const est = estimateRequestsCost(chunks, opts.model, opts.batch);
    log(`LLM 요청 ${chunks.length}건(기사 ${rows.length}건), 예상 비용 ≈ $${est.toFixed(4)}`);
    if (est > opts.maxCostUsd) {
      throw new Error(
        `예상 비용 $${est.toFixed(4)} 이 상한 $${opts.maxCostUsd} 을 넘습니다 — --max-cost 로 올리거나 --limit 로 줄이세요`,
      );
    }
    const results = await opts.runner.run(chunks.map((c) => c.request));
    const verdicts: Verdict[] = [];
    for (const { request, ids } of chunks) {
      const parsed = parseStructured(results.get(request.id)?.message ?? null, reclassifyFormat);
      if (!parsed) {
        log(`${request.id} 실패(${results.get(request.id)?.error ?? "파싱 실패"}) — 규칙 폴백`);
        continue;
      }
      // 다른 묶음의 id 를 끌어오지 않도록 이 요청에 실린 id 만 받는다.
      const wanted = new Set(ids);
      verdicts.push(...parsed.articles.filter((a) => wanted.has(a.id)));
    }
    return verdicts;
  };
}

// ── 파일 I/O ────────────────────────────────────────────────────────────

export function loadCache(file: string): ReclassifyCache {
  if (!existsSync(file)) return emptyCache();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as ReclassifyCache;
    return parsed?.version === 1 && parsed.entries ? parsed : emptyCache();
  } catch {
    return emptyCache();
  }
}

export function saveCache(file: string, cache: ReclassifyCache): void {
  writeFileSync(file, `${JSON.stringify(cache, null, 2)}\n`);
}

/** 백업 경로: <db>.bak-YYYYMMDD(KST). 같은 날 백업이 있으면 -2, -3 … 을 붙인다. */
export function backupPath(dbPath: string, now: Date = new Date()): string {
  const base = `${dbPath}.bak-${kstDateKey(now).replaceAll("-", "")}`;
  if (!existsSync(base)) return base;
  for (let i = 2; ; i += 1) {
    if (!existsSync(`${base}-${i}`)) return `${base}-${i}`;
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────

export interface CliArgs {
  apply: boolean;
  onlyLegacy: boolean;
  rulesOnly: boolean;
  limit?: number;
  db: string;
  cache: string;
  chunk: number;
  maxCost: number;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    onlyLegacy: false,
    rulesOnly: false,
    db: DB_PATH,
    cache: DEFAULT_CACHE_PATH,
    chunk: DEFAULT_CHUNK_SIZE,
    maxCost: envNonNegativeNumber("RECLASSIFY_MAX_COST_USD", 0.5),
  };
  let dryRun = false;
  const positiveInt = (flag: string, v: string | undefined) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} 는 양의 정수여야 합니다: ${v}`);
    return n;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} 에 값이 필요합니다`);
      return v;
    };
    switch (flag) {
      case "--apply":
        args.apply = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--only-legacy":
        args.onlyLegacy = true;
        break;
      case "--rules-only":
        args.rulesOnly = true;
        break;
      case "--limit":
        args.limit = positiveInt(flag, value());
        break;
      case "--chunk":
        args.chunk = positiveInt(flag, value());
        break;
      case "--db":
        args.db = path.resolve(value());
        break;
      case "--cache":
        args.cache = path.resolve(value());
        break;
      case "--max-cost": {
        const v = value();
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0)
          throw new Error(`--max-cost 는 0 이상 숫자여야 합니다: ${v}`);
        args.maxCost = n;
        break;
      }
      default:
        throw new Error(`알 수 없는 옵션: ${flag}`);
    }
  }
  if (args.apply && dryRun) throw new Error("--apply 와 --dry-run 은 함께 쓸 수 없습니다");
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const model = envString("LLM_MODEL", "claude-haiku-4-5");
  const useBatch = envFlag("LLM_USE_BATCH", true);
  const system = buildSystemPrompt();
  const cacheSalt = createHash("sha256").update(`${model}\n${system}`).digest("hex").slice(0, 16);

  const runner = new LlmRunner({
    useBatch,
    batchTimeoutMs: envNonNegativeInt("BATCH_TIMEOUT_MIN", 25) * 60_000,
  });
  const classify = args.rulesOnly
    ? undefined
    : createLlmClassifier({
        runner,
        model,
        chunkSize: args.chunk,
        maxCostUsd: args.maxCost,
        batch: useBatch,
        system,
        requireApiKey: true,
      });

  console.log(
    `[reclassify] ${args.apply ? "APPLY" : "DRY-RUN"} db=${args.db}` +
      (args.onlyLegacy ? " --only-legacy" : "") +
      (args.limit ? ` --limit ${args.limit}` : "") +
      (args.rulesOnly ? " --rules-only" : ` model=${model} batch=${useBatch}`),
  );

  const db = new Database(args.db, { fileMustExist: true });
  try {
    const cache = loadCache(args.cache);
    const plan = await planReclassify(db, {
      onlyLegacy: args.onlyLegacy,
      limit: args.limit,
      classify,
      cache,
      cacheSalt,
    });
    // 비싼 LLM 결과부터 남긴다(이후 단계가 실패해도 다시 과금하지 않도록).
    if (classify && plan.requested) saveCache(args.cache, cache);

    const summary = summarize(plan.decisions);
    console.log(`\n${formatReport(summary)}\n`);
    if (classify) {
      const { calls, inputTokens, outputTokens, costUsd } = runner.usage;
      console.log(
        `[reclassify] LLM 요청 기사 ${plan.requested}건 · 버린 판정 ${plan.invalid} · 규칙 폴백 ${plan.missing}` +
          ` · 호출 ${calls}회 · tokens ${inputTokens}/${outputTokens} · $${costUsd.toFixed(4)}`,
      );
    }

    if (!args.apply) {
      console.log("[reclassify] dry-run — DB 는 바꾸지 않았습니다. 반영하려면 --apply");
      return;
    }
    if (summary.toUpdate === 0) {
      console.log("[reclassify] 바꿀 행이 없습니다.");
      return;
    }
    const backup = backupPath(args.db);
    await db.backup(backup);
    console.log(`[reclassify] 백업 ${backup}`);
    const written = applyDecisions(db, plan.decisions);
    console.log(`[reclassify] ${written}건 UPDATE · FTS 재색인 완료`);
  } finally {
    db.close();
  }
}

// tsx 로 직접 실행될 때만 동작. SDK 소켓이 이벤트 루프를 붙잡지 않도록 명시적으로 종료한다.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit())
    .catch((err) => {
      console.error(`[reclassify] ${(err as Error).message}`);
      process.exit(1);
    });
}
