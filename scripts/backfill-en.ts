/**
 * 지난 기사 영어 백필(docs/english-version-plan.md Phase 2-1).
 * 실행: npm run db:backfill-en -- [--dry-run | --apply] [옵션]
 *
 * 영어판 이전에 게재된 기사(summary_ko 있음, title_en·summary_en 없음)에 영어 제목·요약을 만든다.
 *
 * 1. 대상: 게재된 기사 중 영어가 없는 것(기본). `--ids` 는 그 기사만, `--overwrite` 를 함께 주면 영어가 있어도 다시 만든다.
 * 2. 입력: 원문 제목·본문 발췌(가공과 같은 inputExcerpt — 영어 숫자 검사의 근거도 정확히 이것)와 게재된 한국어 제목·요약
 *    (참고용 — 어떤 관점으로 게재됐는지만, 사실·숫자 근거 아님). 규칙은 가공과 같은 english.md·용어집 고정 표
 *    (configs/prompts/backfill-en.system.md 의 {{ENGLISH}}), 용어집 나머지는 묶음마다 걸러 유저 메시지 `[용어집]` 블록으로.
 * 3. 호출: CHUNK 건씩 묶은 요청 전부를 Message Batch 1개로 보낸다. 배치가 시간 초과·실패해도 일반 호출(표준 단가)로
 *    다시 보내지 않는다(LlmRunner directFallback=false) — 받은 것만 쓰고 나머지는 missing 으로 남긴다(`--ids` 로 재시도).
 * 4. 검사: 결과는 전부 가공과 같은 resolveEnglish(영어 품질 검사의 단일 자리)를 거친다. 기각되면 영어는 NULL 로 남고,
 *    한국어 숫자 경고는 집계만 한다.
 * 5. 한국어 숫자 수정(`--ko-fixes`): 검토된 수정 목록을 정확한 부분 문자열 치환으로 적용한다. 영어 입력을 만들기 전에
 *    메모리에서 먼저 고쳐 모델이 고친 한국어를 보고, --apply 면 영어와 같은 트랜잭션으로 쓴다.
 * 6. --apply 는 DB 를 data/app.db.bak-YYYYMMDD(KST)로 백업하고 스키마를 맞춘 뒤(ensureSchema — 영어 컬럼) 한 트랜잭션으로
 *    UPDATE 한다(title_en·summary_en, 수정 목록의 title_ko·summary_ko 만). FTS 는 articles_au 트리거가 행마다 맞춘다.
 *
 * 옵션
 *   --dry-run          (기본) LLM 호출 없이(API 키 불필요) 대상 수(형식·지역별)·예상 토큰·비용·용어집 통계·한국어 수정 미리보기.
 *   --apply            백업 후 LLM 을 호출하고 DB 에 쓴다.
 *   --limit N          앞에서부터(id 순) N건만.
 *   --since YYYY-MM-DD 그 호(created_at 의 KST 날짜) 이후 기사만.
 *   --ids 1,2,3        그 기사만(재시도용). 게재되지 않았거나 영어가 이미 있으면 건너뛴다.
 *   --overwrite        --ids 와 함께: 영어가 있어도 다시 만든다(새 결과가 기각·누락되면 기존 영어를 그대로 둔다).
 *   --db PATH          대상 DB(기본 data/app.db).
 *   --chunk N          요청 1건에 묶는 기사 수(기본 DEFAULT_CHUNK_SIZE).
 *   --max-cost USD     예상 비용 상한(기본 1, 환경변수 BACKFILL_MAX_COST_USD). 넘으면 시작하지 않는다.
 *   --report PATH      JSON 보고서(기본 data/eval/backfill-en-<시각>.json, git 제외).
 *   --summary-md PATH  GitHub Markdown 요약(Actions `$GITHUB_STEP_SUMMARY` 용).
 *   --ko-fixes PATH    한국어 숫자 수정 목록(configs/backfill/ko-number-fixes.json 형식).
 *   --count-tokens     (dry-run) ANTHROPIC_API_KEY 가 있으면 무료 count_tokens 로 요청마다 입력 토큰을 잰다.
 * 환경변수 LLM_MODEL·LLM_USE_BATCH·BATCH_TIMEOUT_MIN 은 수집과 같은 뜻이다(BATCH_TIMEOUT_MIN 기본만 60분 — 요청이 많다).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { z } from "zod/v4";
import {
  FORMATS,
  FORMAT_LABELS,
  isCategory,
  isRegion,
  LEGACY_CATEGORY_MAP,
  REGION_BADGES,
  toFormat,
  type Category,
  type Format,
  type Region,
} from "../src/lib/labels";
import { DB_PATH, EVAL_DIR, PROMPTS_DIR } from "../src/lib/paths";
import type { RawItem } from "../src/lib/types";
import { approxTokens, estimateCost, outputFormatTokens } from "./lib/cost";
import type { EnglishRejectReason } from "./lib/englishCheck";
import {
  articleFields,
  enrichEvidence,
  readEnglishGuide,
  readFewShot,
  resolveEnglish,
  type EnglishCandidate,
  type EnglishFields,
} from "./lib/enrich";
import { envFlag, envNonNegativeInt, envNonNegativeNumber, envString } from "./lib/env";
import { glossaryBlock, readGlossary, selectGlossary, type Glossary } from "./lib/glossary";
import { ensureSchema } from "./lib/initDb";
import {
  LlmRunner,
  parseStructured,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
} from "./lib/llm";
import { loadSourcesConfig } from "./lib/syncSources";
import { backupPath } from "./reclassify";

/**
 * 요청 1건에 묶는 기사 수. 요청마다 시스템 프롬프트(english.md + 고정 표 + few-shot 6건)와 출력 스키마가 다시 붙는다 —
 * count_tokens 실측 5,818토큰(few-shot 2,560 포함, 2026-11-04). 게재 1,255건 기준 반복분은 10건 묶음이면 126요청 ×
 * 5.8k ≈ 73만 토큰(배치 $0.37), 20건이면 63요청 ≈ 37만(배치 $0.18), 30건이면 42요청 ≈ 24만($0.12)이다.
 * 기사 몫(원문 발췌 + 참고 한국어, 실측 평균 약 400토큰)은 묶음 크기와 무관하다. 출력은 영어 제목·요약뿐이라
 * (스모크 6건 실측 평균 92토큰) 20건 묶음 max_tokens 6,200 은 평균의 3배 넘게 남고, 한국 매체 발췌가 몰려도 입력은
 * 약 15k토큰이다. 30건으로 키우면 $0.06 줄지만 한 요청이 실패할 때 잃는 기사(재시도는 `--ids`)와 기사 섞임 위험이
 * 커져 20건에서 멈춘다.
 */
export const DEFAULT_CHUNK_SIZE = 20;
/** 기사 1건당 출력 토큰 상한(영어 제목 ~20 + 요약 40~60단어 ~90 + JSON). 넘으면 묶음 전체가 max_tokens 로 버려진다. */
const MAX_OUTPUT_TOKENS_PER_ARTICLE = 300;
/** 기사 1건당 출력 토큰 근사치(비용 가드 추정용). 스모크 6건 실측 평균 92토큰(2026-11-04)에 약 20% 여유. */
const EST_OUTPUT_TOKENS_PER_ARTICLE = 110;
/** 배치 대기 기본값(분). 수집(25분)보다 길게 — 요청 수가 많고, 시간 초과 시 일반 호출로 대신하지 않는다. */
export const DEFAULT_BATCH_TIMEOUT_MIN = 60;
/** 비용 상한 기본값(USD, BACKFILL_MAX_COST_USD). 1,255건 예상 약 $0.78(입력 count_tokens 실측 기준). */
export const DEFAULT_MAX_COST_USD = 1;

// ── 대상 ────────────────────────────────────────────────────────────────

/** 백필 대상 기사 1건(게재된 기사만). */
export interface BackfillRow {
  id: number;
  sourceId: string;
  /** 모델 입력 [출처] — 가공과 같은 sources.name. */
  sourceName: string;
  format: Format;
  /** 'kr' = 한국 매체(sources.json region), null = 해외. */
  region: Region | null;
  titleOriginal: string;
  contentRaw: string | null;
  titleKo: string;
  summaryKo: string;
  category: string | null;
  tags: string[];
  /** 지금 DB 의 영어(없으면 null). 컬럼이 없는 DB(영어판 이전)도 null. */
  titleEn: string | null;
  summaryEn: string | null;
  /** 수집 시각(UTC, sqlite datetime) — 호 날짜는 이것의 KST 날짜. */
  createdAt: string;
}

export interface SelectOptions {
  since?: string;
  limit?: number;
  ids?: number[];
  overwrite?: boolean;
  /** 소스 id → 지역(sources.json). 없는 소스는 DB sources.region(있으면)을 쓴다. */
  regionOf?: ReadonlyMap<string, Region | null>;
}

export interface TargetSelection {
  rows: BackfillRow[];
  /** --ids 중 대상이 아닌 것과 사유. */
  skippedIds: { id: number; reason: "not-found" | "unpublished" | "has-english" }[];
  /** 영어가 이미 있어 건너뛴 게재 기사 수(--ids 없는 실행). */
  alreadyEnglish: number;
}

const hasEnglish = (r: { titleEn: string | null; summaryEn: string | null }) =>
  Boolean(r.titleEn?.trim() && r.summaryEn?.trim());

function columns(db: DatabaseType, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

/** 'YYYY-MM-DD'(KST) → 그날 00:00 KST 의 UTC ISO. */
export function kstDayStart(dateKey: string): string {
  return new Date(Date.parse(`${dateKey}T00:00:00+09:00`)).toISOString();
}

interface RawRow {
  id: number;
  source_id: string;
  source_name: string;
  format: string | null;
  region: string | null;
  title_original: string;
  content_raw: string | null;
  title_ko: string | null;
  summary_ko: string | null;
  category: string | null;
  tags: string | null;
  title_en: string | null;
  summary_en: string | null;
  created_at: string;
}

/** 기사 행 읽기(게재 여부와 무관하게). 영어·지역 컬럼이 없는 DB 는 NULL 로 읽는다. */
function readRows(
  db: DatabaseType,
  where: string[],
  params: (string | number)[],
  regionOf?: ReadonlyMap<string, Region | null>,
): (BackfillRow & { published: boolean })[] {
  const art = columns(db, "articles");
  const src = columns(db, "sources");
  const sql = `
    SELECT a.id, a.source_id, COALESCE(s.name, a.source_id) AS source_name,
           ${src.has("format") ? "s.format" : "NULL"} AS format,
           ${src.has("region") ? "s.region" : "NULL"} AS region,
           a.title_original, a.content_raw, a.title_ko, a.summary_ko, a.category,
           ${art.has("title_en") ? "a.title_en" : "NULL"} AS title_en,
           ${art.has("summary_en") ? "a.summary_en" : "NULL"} AS summary_en,
           a.created_at,
           (SELECT group_concat(t.name, char(31)) FROM article_tags at
              JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id) AS tags
    FROM articles a LEFT JOIN sources s ON s.id = a.source_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY a.id`;
  const raw = db.prepare(sql).all(...params) as RawRow[];
  return raw.map((r) => {
    const region = regionOf?.has(r.source_id) ? regionOf.get(r.source_id)! : r.region;
    return {
      id: r.id,
      sourceId: r.source_id,
      sourceName: r.source_name,
      format: toFormat(r.format),
      region: isRegion(region) ? region : null,
      titleOriginal: r.title_original,
      contentRaw: r.content_raw,
      titleKo: r.title_ko ?? "",
      summaryKo: r.summary_ko ?? "",
      category: r.category,
      tags: r.tags ? r.tags.split("\u001f").sort() : [],
      titleEn: r.title_en,
      summaryEn: r.summary_en,
      createdAt: r.created_at,
      published: r.summary_ko !== null,
    };
  });
}

/**
 * 대상 선택(id 순). 게재된 기사(summary_ko 있음)만, 기본은 영어가 없는 것만.
 * - since: 호 날짜(created_at 의 KST 날짜) ≥ since.
 * - ids: 그 기사만. 없는 id·미게재·(overwrite 아니면) 영어 있음은 skippedIds 로.
 * - limit: 위 조건을 거친 뒤 앞에서 N건.
 */
export function selectTargets(db: DatabaseType, opts: SelectOptions = {}): TargetSelection {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.since) {
    where.push("julianday(a.created_at) >= julianday(?)");
    params.push(kstDayStart(opts.since));
  }
  const skippedIds: TargetSelection["skippedIds"] = [];
  let alreadyEnglish = 0;
  let rows: BackfillRow[];
  if (opts.ids?.length) {
    where.push(`a.id IN (${opts.ids.map(() => "?").join(", ")})`);
    params.push(...opts.ids);
    const found = new Map(readRows(db, where, params, opts.regionOf).map((r) => [r.id, r]));
    rows = [];
    for (const id of [...new Set(opts.ids)].sort((a, b) => a - b)) {
      const r = found.get(id);
      if (!r) skippedIds.push({ id, reason: "not-found" });
      else if (!r.published) skippedIds.push({ id, reason: "unpublished" });
      else if (hasEnglish(r) && !opts.overwrite) skippedIds.push({ id, reason: "has-english" });
      else rows.push(stripPublished(r));
    }
  } else {
    where.push("a.summary_ko IS NOT NULL");
    const all = readRows(db, where, params, opts.regionOf);
    rows = [];
    for (const r of all) {
      if (hasEnglish(r)) alreadyEnglish += 1;
      else rows.push(stripPublished(r));
    }
  }
  if (opts.limit) rows = rows.slice(0, opts.limit);
  return { rows, skippedIds, alreadyEnglish };
}

function stripPublished(r: BackfillRow & { published: boolean }): BackfillRow {
  const row: BackfillRow & { published?: boolean } = { ...r };
  delete row.published;
  return row;
}

/** sources.json → 소스 id → 지역. 파일이 없거나 깨졌으면 빈 맵(DB 값을 쓴다). */
export function loadRegionMap(): Map<string, Region | null> {
  try {
    return new Map(
      loadSourcesConfig().map((s) => [s.id, isRegion(s.region) ? s.region : null] as const),
    );
  } catch {
    return new Map();
  }
}

// ── 한국어 숫자 수정 ────────────────────────────────────────────────────

export const KO_FIX_FIELDS = ["title_ko", "summary_ko"] as const;
export type KoFixField = (typeof KO_FIX_FIELDS)[number];

/** 검토된 한국어 수정 1건 — configs/backfill/ko-number-fixes.json `fixes[]`. */
export interface KoFix {
  id: number;
  field: KoFixField;
  /** 지금 값에 정확히 한 번 나와야 하는 부분 문자열. */
  from: string;
  to: string;
  reason?: string;
}

const koFixFileSchema = z.object({
  version: z.literal(1),
  fixes: z.array(
    z.object({
      id: z.number().int().positive(),
      field: z.enum(KO_FIX_FIELDS),
      from: z.string().min(1),
      to: z.string(),
      reason: z.string().optional(),
    }),
  ),
});

/** 수정 목록 JSON → 항목. 형식이 틀리면 throw(일부만 적용하지 않는다 — 사람이 고칠 파일이다). */
export function parseKoFixes(json: unknown): KoFix[] {
  const parsed = koFixFileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `한국어 수정 목록 형식 오류: ${issue?.path.join(".") || "(최상위)"} — ${issue?.message ?? "알 수 없음"}`,
    );
  }
  return parsed.data.fixes;
}

export function loadKoFixes(file: string): KoFix[] {
  return parseKoFixes(JSON.parse(readFileSync(file, "utf-8")));
}

/**
 * 수정 1건의 결과.
 * - applied: `from` 이 정확히 한 번 나와 치환한다.
 * - already: `from` 은 없고 `to` 가 있다(이미 적용됨 — 재실행). 경고 아님.
 * - stale: `from` 이 없다(기사가 바뀌었거나 목록이 틀림). 건너뛴다.
 * - ambiguous: `from` 이 두 번 이상 나온다. 건너뛴다.
 * - missing-article: 기사가 없거나 게재되지 않았다.
 */
export type KoFixStatus = "applied" | "already" | "stale" | "ambiguous" | "missing-article";

export interface KoFixResult extends KoFix {
  status: KoFixStatus;
  /** 지금 값에서 `from` 이 나온 횟수. */
  occurrences: number;
  /** applied 일 때 치환 앞뒤 필드 값. */
  before?: string;
  after?: string;
}

export interface KoFixPlan {
  results: KoFixResult[];
  /** 기사 id → 고친 한국어(바뀐 기사만). 두 필드 모두 담는다. */
  updated: Map<number, { titleKo: string; summaryKo: string }>;
}

function countOccurrences(text: string, sub: string): number {
  let n = 0;
  for (let i = text.indexOf(sub); i >= 0; i = text.indexOf(sub, i + sub.length)) n += 1;
  return n;
}

/** 수정 목록을 지금 DB 값에 차례로 대어 본다(같은 필드의 여러 수정은 앞 수정이 반영된 값에). DB 는 쓰지 않는다. */
export function planKoFixes(db: DatabaseType, fixes: readonly KoFix[]): KoFixPlan {
  const ids = [...new Set(fixes.map((f) => f.id))];
  const current = new Map<number, { titleKo: string; summaryKo: string }>();
  if (ids.length) {
    const rows = db
      .prepare(
        `SELECT id, title_ko, summary_ko FROM articles
          WHERE summary_ko IS NOT NULL AND id IN (${ids.map(() => "?").join(", ")})`,
      )
      .all(...ids) as { id: number; title_ko: string | null; summary_ko: string }[];
    for (const r of rows) current.set(r.id, { titleKo: r.title_ko ?? "", summaryKo: r.summary_ko });
  }
  const updated = new Map<number, { titleKo: string; summaryKo: string }>();
  const results = fixes.map((fix): KoFixResult => {
    const base = updated.get(fix.id) ?? current.get(fix.id);
    if (!base) return { ...fix, status: "missing-article", occurrences: 0 };
    const key = fix.field === "title_ko" ? "titleKo" : "summaryKo";
    const value = base[key];
    const occurrences = countOccurrences(value, fix.from);
    if (occurrences === 1) {
      const after = value.replace(fix.from, () => fix.to);
      updated.set(fix.id, { ...base, [key]: after });
      return { ...fix, status: "applied", occurrences, before: value, after };
    }
    if (occurrences > 1) return { ...fix, status: "ambiguous", occurrences };
    const already = fix.to !== "" && value.includes(fix.to);
    return { ...fix, status: already ? "already" : "stale", occurrences };
  });
  return { results, updated };
}

/** 대상 행에 고친 한국어를 덧씌운다(모델 입력·한국어 숫자 경고가 고친 값을 보게). */
export function overlayKoFixes(rows: BackfillRow[], plan: KoFixPlan): BackfillRow[] {
  return rows.map((r) => {
    const fixed = plan.updated.get(r.id);
    return fixed ? { ...r, ...fixed } : r;
  });
}

// ── 요청 ────────────────────────────────────────────────────────────────

/** 모델에 보이는 출력 스키마: id·영어 제목·요약만. 길이·한글 제약은 두지 않는다(검사는 resolveEnglish 가 기사별로). */
export const backfillSchema = z.object({
  articles: z.array(
    z.object({
      id: z.number().int(),
      title_en: z
        .string()
        .describe("English headline from the original, sentence case, at most 100 characters"),
      summary_en: z
        .string()
        .describe("English summary from the original, 2-3 sentences (40-60 words), no Hangul"),
    }),
  ),
});

const backfillItemSchema = backfillSchema.shape.articles.element;
type BackfillItem = z.infer<typeof backfillItemSchema>;

/** 파싱 스키마: articles 배열의 형태만 본다 — 항목 하나가 틀려도 묶음 전체를 버리지 않게(항목은 resolveItems 가 거른다). */
const backfillParseSchema = z.object({ articles: z.array(z.unknown()) });

/** 구조화 출력 형식. 모델에는 backfillSchema, 파싱은 느슨하게(enrich 의 enrichFormat 과 같은 방식). */
export const backfillFormat = {
  ...zodOutputFormat(backfillSchema),
  parse: (text: string) => backfillParseSchema.parse(JSON.parse(text)),
};

const ENGLISH_PLACEHOLDER = "{{ENGLISH}}";

/** 백필 입력 1건 — 원문은 가공과 같은 articleFields, 한국어는 그 뒤에 참고용으로. */
export function articleInput(
  format: Format,
  source: string,
  title: string,
  content: string,
  titleKo: string,
  summaryKo: string,
): string {
  return (
    `${articleFields(format, source, title, content || "(본문 없음)")}\n` +
    `[게재 한국어 제목] ${titleKo} (참고용)\n` +
    `[게재 한국어 요약] ${summaryKo} (참고용 — 사실·숫자 근거 아님)`
  );
}

/**
 * 시스템 프롬프트: backfill-en.system.md + {{ENGLISH}}(english.md + 용어집 고정 표 — 가공과 같은 readEnglishGuide)
 * + few-shot(가공 예시 6건을 백필 입력 모양으로: 원문 + 게재 한국어 → 영어). 치환은 함수형으로($ 금액 보호).
 */
export function buildSystemPrompt(): string {
  const system = readFileSync(path.join(PROMPTS_DIR, "backfill-en.system.md"), "utf-8").replace(
    ENGLISH_PLACEHOLDER,
    () => readEnglishGuide(),
  );
  const examples = readFewShot()
    .map((ex, i) => {
      const input = articleInput(
        ex.input.format,
        ex.input.source,
        ex.input.title,
        ex.input.content,
        ex.output.title_ko,
        ex.output.summary_ko,
      );
      const output = { title_en: ex.output.title_en, summary_en: ex.output.summary_en };
      return `### 예시 ${i + 1}\n입력:\n${input}\n출력:\n${JSON.stringify(output)}`;
    })
    .join("\n\n");
  return `${system.trim()}\n\n## 예시 (기사 1건 기준)\n\n${examples}`;
}

/** 행 → 가공 입력과 같은 RawItem(발췌·근거를 enrich 함수로 만들려고). */
const rawItem = (r: BackfillRow): RawItem => ({
  sourceId: r.sourceId,
  url: "",
  title: r.titleOriginal,
  contentRaw: r.contentRaw ?? undefined,
  publishedAt: "",
});

/** 영어 숫자 검사의 근거 = 모델에 준 원문 제목 + 발췌(enrichEvidence 그대로). */
export const evidenceOf = (r: BackfillRow) => enrichEvidence(rawItem(r));

export interface BackfillChunk {
  request: LlmRequest;
  ids: number[];
  /** 유저 메시지 `[용어집]` 블록 항목 수(0 = 블록 없음). */
  glossaryEntries: number;
  /** 기사 id → 영어 숫자 검사 근거(이 요청에서 모델이 본 원문 제목 + 발췌). */
  evidence: Map<number, { title: string; content: string }>;
}

export interface BuildOptions {
  model?: string;
  system?: string;
  glossary?: Glossary;
}

/** 대상 → chunkSize 건씩 묶은 요청들(입력 순서 유지). */
export function buildRequests(
  rows: BackfillRow[],
  chunkSize: number,
  {
    model = "claude-haiku-4-5",
    system = buildSystemPrompt(),
    glossary = readGlossary(),
  }: BuildOptions = {},
): BackfillChunk[] {
  const chunks: BackfillChunk[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const evidence = new Map(chunk.map((r) => [r.id, evidenceOf(r)] as const));
    const blocks = chunk
      .map((r) => {
        const ev = evidence.get(r.id)!;
        return `### id=${r.id}\n${articleInput(r.format, r.sourceName, ev.title, ev.content, r.titleKo, r.summaryKo)}`;
      })
      .join("\n\n");
    // 용어집은 가공과 같이 원문 제목·발췌에 키가 나온 항목만(출처 줄·참고용 한국어는 대조에서 뺀다).
    const entries = selectGlossary(
      glossary,
      chunk.map((r) => `${evidence.get(r.id)!.title}\n${evidence.get(r.id)!.content}`).join("\n"),
    );
    const block = glossaryBlock(entries);
    chunks.push({
      ids: chunk.map((r) => r.id),
      glossaryEntries: entries.length,
      evidence,
      request: {
        id: `backfill-en-${i / chunkSize}`,
        params: {
          model,
          max_tokens: 200 + chunk.length * MAX_OUTPUT_TOKENS_PER_ARTICLE,
          system,
          messages: [
            {
              role: "user",
              content:
                `기사 ${chunk.length}건의 영어 제목·요약을 각각 쓰세요. articles 배열에 기사마다 하나씩, 입력의 id 를 그대로 담으세요.\n\n` +
                blocks +
                (block ? `\n\n### ${block}` : ""),
            },
          ],
          output_config: { format: backfillFormat },
        },
      },
    });
  }
  return chunks;
}

/** 요청 1건의 비용 가드용 토큰 추정(가공의 estimateEnrichTokens 와 같은 근사 — 구조화 출력 스키마 몫 포함). */
export function estimateChunkTokens({ request, ids }: BackfillChunk) {
  const system = typeof request.params.system === "string" ? request.params.system : "";
  const user = request.params.messages.map((m) => m.content).join("");
  return {
    input: approxTokens(system + user) + outputFormatTokens(backfillFormat),
    output: ids.length * EST_OUTPUT_TOKENS_PER_ARTICLE,
  };
}

export interface CostEstimate {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  /** 입력 토큰을 count_tokens 로 잰 값인지(아니면 approxTokens 근사). */
  measured: boolean;
}

/** 요청들 → 예상 비용. measuredInput(요청 id → 입력 토큰)이 있으면 그 값을 쓴다. */
export function estimateRequestsCost(
  chunks: BackfillChunk[],
  model: string,
  batch: boolean,
  measuredInput?: ReadonlyMap<string, number>,
): CostEstimate {
  let inputTokens = 0;
  let outputTokens = 0;
  let measured = chunks.length > 0;
  for (const c of chunks) {
    const est = estimateChunkTokens(c);
    const m = measuredInput?.get(c.request.id);
    if (m === undefined) measured = false;
    inputTokens += m ?? est.input;
    outputTokens += est.output;
  }
  return {
    requests: chunks.length,
    inputTokens,
    outputTokens,
    usd: estimateCost(inputTokens, outputTokens, model, { batch }),
    measured,
  };
}

/** 예상 비용이 상한을 넘으면 throw(호출 전에 멈춘다). */
export function assertWithinBudget(estimate: CostEstimate, maxCostUsd: number): void {
  if (estimate.usd > maxCostUsd) {
    throw new Error(
      `예상 비용 $${estimate.usd.toFixed(4)} 이 상한 $${maxCostUsd} 을 넘습니다 — 시작하지 않습니다` +
        ` (--max-cost·BACKFILL_MAX_COST_USD 로 올리거나 --limit·--since 로 줄이세요)`,
    );
  }
}

// ── 결과 ────────────────────────────────────────────────────────────────

export type ArticleStatus = "written" | "rejected" | "missing";
export type RejectReason = EnglishRejectReason | "check-failed";

export interface ArticleOutcome {
  id: number;
  source: string;
  region: Region | null;
  format: Format;
  status: ArticleStatus;
  /** rejected: 영어 검사 사유, missing: 결과가 없던 사유(배치 실패·파싱 실패·항목 없음). */
  reason?: RejectReason | string;
  detail?: string[];
  titleEn?: string;
  summaryEn?: string;
}

export interface MergedOutputs {
  /** 기사 id → 모델 출력(검사 전). */
  outputs: Map<number, { title_en: string; summary_en: string }>;
  /** 결과가 없던 기사와 사유. */
  missing: Map<number, string>;
  /** 버린 출력 항목(형태 오류·요청에 없던 id·중복). */
  invalidItems: number;
  /** 실패한 요청(통째로 결과 없음). */
  failedRequests: { id: string; ids: number[]; error: string }[];
}

/** 요청별 결과 → 기사별 출력. 다른 요청의 id·중복·형태가 틀린 항목은 버리고, 빠진 기사는 missing 으로. */
export function mergeOutputs(
  chunks: BackfillChunk[],
  results: ReadonlyMap<string, LlmResult>,
): MergedOutputs {
  const outputs = new Map<number, { title_en: string; summary_en: string }>();
  const missing = new Map<number, string>();
  const failedRequests: MergedOutputs["failedRequests"] = [];
  let invalidItems = 0;
  for (const { request, ids } of chunks) {
    const result = results.get(request.id);
    const parsed = parseStructured(result?.message ?? null, backfillFormat);
    if (!parsed) {
      const error =
        result?.error ??
        (result?.message?.stop_reason === "max_tokens"
          ? "max_tokens"
          : result?.message
            ? "파싱 실패"
            : "결과 없음");
      failedRequests.push({ id: request.id, ids, error });
      for (const id of ids) missing.set(id, error);
      continue;
    }
    const wanted = new Set(ids);
    for (const raw of parsed.articles) {
      const item = backfillItemSchema.safeParse(raw);
      if (!item.success || !wanted.has(item.data.id) || outputs.has(item.data.id)) {
        invalidItems += 1;
        continue;
      }
      const { id, title_en, summary_en } = item.data as BackfillItem;
      outputs.set(id, { title_en, summary_en });
    }
    for (const id of ids) if (!outputs.has(id)) missing.set(id, "출력에 항목 없음");
  }
  return { outputs, missing, invalidItems, failedRequests };
}

const asCategory = (value: string | null): Category => {
  if (value && isCategory(value)) return value;
  if (value && Object.hasOwn(LEGACY_CATEGORY_MAP, value)) return LEGACY_CATEGORY_MAP[value];
  return "industry";
};

export interface CheckedBackfill {
  outcomes: ArticleOutcome[];
  /** 기사 id → 쓸 영어(written 만). */
  english: Map<number, EnglishFields>;
  /** 한국어 숫자 경고(고친 한국어 기준) — id → 근거에 없는 숫자. */
  koreanWarnings: { id: number; numbers: string[] }[];
  /** resolveEnglish notes(`영어 가공 N/M건`…). */
  notes: string[];
}

/**
 * 모델 출력 → resolveEnglish(가공과 같은 영어 품질 검사) → 기사별 결과. 근거는 그 요청에서 모델이 본 원문 제목 + 발췌다.
 * 출력이 없는 기사는 검사하지 않고 missing(DB 그대로).
 */
export function checkOutputs(
  rows: BackfillRow[],
  chunks: BackfillChunk[],
  merged: MergedOutputs,
): CheckedBackfill {
  const evidence = new Map<number, { title: string; content: string }>();
  for (const c of chunks) for (const [id, ev] of c.evidence) evidence.set(id, ev);
  const candidates: EnglishCandidate[] = [];
  for (const r of rows) {
    const out = merged.outputs.get(r.id);
    if (!out) continue;
    candidates.push({
      id: r.id,
      enrichment: {
        title_ko: r.titleKo,
        summary_ko: r.summaryKo,
        category: asCategory(r.category),
        tags: r.tags,
        title_en: out.title_en,
        summary_en: out.summary_en,
      },
      evidence: evidence.get(r.id) ?? evidenceOf(r),
    });
  }
  const resolution = resolveEnglish(candidates);
  const english = new Map<number, EnglishFields>();
  const koreanWarnings: CheckedBackfill["koreanWarnings"] = [];
  const outcomes = rows.map((r): ArticleOutcome => {
    const base = { id: r.id, source: r.sourceName, region: r.region, format: r.format };
    const out = merged.outputs.get(r.id);
    if (!out) {
      return { ...base, status: "missing", reason: merged.missing.get(r.id) ?? "결과 없음" };
    }
    const fields = resolution.fields.get(r.id);
    const check = resolution.checks.get(r.id);
    if (check && check.koreanNumbers.length > 0) {
      koreanWarnings.push({ id: r.id, numbers: check.koreanNumbers });
    }
    if (fields?.titleEn && fields.summaryEn) {
      english.set(r.id, fields);
      return { ...base, status: "written", titleEn: fields.titleEn, summaryEn: fields.summaryEn };
    }
    const failed = check?.english;
    return {
      ...base,
      status: "rejected",
      reason: failed && !failed.ok ? failed.reason : "check-failed",
      detail: failed && !failed.ok ? failed.detail : resolution.notes,
      titleEn: out.title_en,
      summaryEn: out.summary_en,
    };
  });
  return { outcomes, english, koreanWarnings, notes: resolution.notes };
}

// ── DB 쓰기 ─────────────────────────────────────────────────────────────

export interface ApplyInput {
  /** 기사 id → 쓸 영어(검사 통과분). */
  english: ReadonlyMap<number, EnglishFields>;
  /** 기사 id → 고친 한국어(planKoFixes.updated). */
  koFixes?: ReadonlyMap<number, { titleKo: string; summaryKo: string }>;
}

/**
 * 한 트랜잭션으로 영어(title_en·summary_en)와 한국어 수정(title_ko·summary_ko)만 UPDATE 한다. 다른 컬럼은 건드리지 않는다.
 * 쓴 행 수(영어·한국어)를 돌려준다. 영어 컬럼이 없는 DB 는 먼저 ensureSchema 해야 한다.
 */
export function applyBackfill(
  db: DatabaseType,
  { english, koFixes = new Map() }: ApplyInput,
): { english: number; korean: number } {
  const setEn = db.prepare("UPDATE articles SET title_en = ?, summary_en = ? WHERE id = ?");
  const setKo = db.prepare("UPDATE articles SET title_ko = ?, summary_ko = ? WHERE id = ?");
  let en = 0;
  let ko = 0;
  db.transaction(() => {
    for (const [id, f] of koFixes) ko += setKo.run(f.titleKo, f.summaryKo, id).changes;
    for (const [id, f] of english) {
      if (!f.titleEn || !f.summaryEn) continue;
      en += setEn.run(f.titleEn, f.summaryEn, id).changes;
    }
  })();
  return { english: en, korean: ko };
}

/** 게재 기사 영어 보유율(한국 매체 / 해외). 영어 컬럼이 없으면 0. */
export function englishCoverage(
  db: DatabaseType,
  regionOf?: ReadonlyMap<string, Region | null>,
): { kr: Coverage; other: Coverage } {
  const rows = readRows(db, ["a.summary_ko IS NOT NULL"], [], regionOf);
  const kr = { total: 0, withEnglish: 0 };
  const other = { total: 0, withEnglish: 0 };
  for (const r of rows) {
    const bucket = r.region === "kr" ? kr : other;
    bucket.total += 1;
    if (hasEnglish(r)) bucket.withEnglish += 1;
  }
  return { kr, other };
}

export interface Coverage {
  total: number;
  withEnglish: number;
}

// ── 보고 ────────────────────────────────────────────────────────────────

export interface BackfillReport {
  version: 1;
  mode: "dry-run" | "apply";
  createdAt: string;
  db: string;
  model: string;
  batch: boolean;
  options: {
    since?: string;
    limit?: number;
    ids?: number[];
    overwrite: boolean;
    chunk: number;
    maxCostUsd: number;
    koFixes?: string;
  };
  targets: {
    total: number;
    byFormat: Record<string, number>;
    byRegion: { kr: number; other: number };
    alreadyEnglish: number;
    skippedIds: TargetSelection["skippedIds"];
  };
  glossary: { requests: number; withBlock: number; entries: number; maxEntries: number };
  estimate: CostEstimate;
  totals?: {
    written: number;
    rejected: Record<RejectReason, number>;
    missing: number;
    invalidItems: number;
    failedRequests: number;
  };
  articles: ArticleOutcome[];
  koreanWarnings: { id: number; numbers: string[] }[];
  koFixes: KoFixResult[];
  coverage: { kr: Coverage; other: Coverage };
  usage?: LlmUsage;
  notes: string[];
}

export function emptyRejects(): Record<RejectReason, number> {
  return { hangul: 0, length: 0, number: 0, "check-failed": 0 };
}

export function tallyOutcomes(outcomes: ArticleOutcome[]) {
  const rejected = emptyRejects();
  let written = 0;
  let missing = 0;
  for (const o of outcomes) {
    if (o.status === "written") written += 1;
    else if (o.status === "missing") missing += 1;
    else rejected[(o.reason as RejectReason) ?? "check-failed"] += 1;
  }
  return { written, rejected, missing };
}

export function targetStats(sel: TargetSelection): BackfillReport["targets"] {
  const byFormat: Record<string, number> = Object.fromEntries(FORMATS.map((f) => [f, 0]));
  const byRegion = { kr: 0, other: 0 };
  for (const r of sel.rows) {
    byFormat[r.format] = (byFormat[r.format] ?? 0) + 1;
    if (r.region === "kr") byRegion.kr += 1;
    else byRegion.other += 1;
  }
  return {
    total: sel.rows.length,
    byFormat,
    byRegion,
    alreadyEnglish: sel.alreadyEnglish,
    skippedIds: sel.skippedIds,
  };
}

export function glossaryStats(chunks: BackfillChunk[]): BackfillReport["glossary"] {
  return {
    requests: chunks.length,
    withBlock: chunks.filter((c) => c.glossaryEntries > 0).length,
    entries: chunks.reduce((n, c) => n + c.glossaryEntries, 0),
    maxEntries: Math.max(0, ...chunks.map((c) => c.glossaryEntries)),
  };
}

/** 터미널 표시 폭(한글 등 전각 문자는 2칸). */
function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1;
  return w;
}

const padDisplay = (text: string, width: number) =>
  text + " ".repeat(Math.max(0, width - displayWidth(text)));

const REJECT_LABELS: Record<RejectReason, string> = {
  hangul: "한글",
  length: "길이",
  number: "숫자",
  "check-failed": "검사 실패",
};

const KO_FIX_LABELS: Record<KoFixStatus, string> = {
  applied: "적용",
  already: "이미 적용",
  stale: "건너뜀(원문 없음)",
  ambiguous: "건너뜀(여러 번 나옴)",
  "missing-article": "건너뜀(기사 없음)",
};

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "-");
const usd = (n: number) => `$${n.toFixed(4)}`;
const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 보고서 → 터미널 보고문(reclassify 의 정렬 표 문법). */
export function formatConsoleReport(r: BackfillReport): string {
  const lines: string[] = [];
  const t = r.targets;
  const row = (label: string, value: string) => lines.push(`  ${padDisplay(label, 18)} ${value}`);

  lines.push("대상");
  row("게재 기사 대상", `${t.total}건 (영어 있음 건너뜀 ${t.alreadyEnglish}건)`);
  row("형식", FORMATS.map((f) => `${FORMAT_LABELS[f]} ${t.byFormat[f] ?? 0}`).join(" · "));
  row("지역", `${REGION_BADGES.kr} ${t.byRegion.kr} · 해외 ${t.byRegion.other}`);
  if (t.skippedIds.length) {
    row("--ids 건너뜀", t.skippedIds.map((s) => `#${s.id}(${s.reason})`).join(" "));
  }

  lines.push("", "요청·비용");
  const e = r.estimate;
  row("요청", `${e.requests}건 (묶음 ${r.options.chunk}건, ${r.batch ? "배치 50%" : "일반 호출"})`);
  row(
    "예상 토큰",
    `입력 ${e.inputTokens.toLocaleString()}${e.measured ? "(count_tokens)" : "(근사)"} · 출력 ${e.outputTokens.toLocaleString()}`,
  );
  row("예상 비용", `${usd(e.usd)} (상한 $${r.options.maxCostUsd})`);
  const g = r.glossary;
  row(
    "용어집",
    `블록 ${g.withBlock}/${g.requests}요청 · 항목 ${g.entries}개(요청당 최대 ${g.maxEntries})`,
  );

  if (r.koFixes.length) {
    lines.push("", `한국어 수정 (${r.koFixes.length}건)`);
    for (const f of r.koFixes) {
      lines.push(
        `  #${f.id} ${f.field} ${KO_FIX_LABELS[f.status]}: «${f.from}» → «${f.to}»` +
          (f.reason ? ` — ${f.reason}` : ""),
      );
    }
  }

  if (r.totals) {
    const x = r.totals;
    const k = Object.values(x.rejected).reduce((a, b) => a + b, 0);
    lines.push("", "결과");
    row("영어 저장", `${x.written}/${t.total}건 (${pct(x.written, t.total)})`);
    row(
      "기각",
      `${k}건` +
        (k
          ? ` (${(Object.keys(x.rejected) as RejectReason[])
              .filter((reason) => x.rejected[reason] > 0)
              .map((reason) => `${REJECT_LABELS[reason]} ${x.rejected[reason]}`)
              .join(" · ")})`
          : ""),
    );
    row("누락", `${x.missing}건 (실패 요청 ${x.failedRequests}건 · 버린 항목 ${x.invalidItems}개)`);
    for (const o of r.articles.filter((a) => a.status === "rejected")) {
      lines.push(
        `    ✗ #${o.id} ${REJECT_LABELS[o.reason as RejectReason] ?? o.reason}: ${(o.detail ?? []).join(", ")}`,
      );
    }
    const missing = r.articles.filter((a) => a.status === "missing");
    if (missing.length) {
      lines.push(`    재시도: --ids ${missing.map((o) => o.id).join(",")}`);
    }
  }

  if (r.koreanWarnings.length) {
    lines.push("", `한국어 숫자 경고 ${r.koreanWarnings.length}건 (게재 그대로, 검토용)`);
    for (const w of r.koreanWarnings.slice(0, 30)) {
      lines.push(`  #${w.id} ${w.numbers.join(" · ")}`);
    }
    if (r.koreanWarnings.length > 30)
      lines.push(`  … 외 ${r.koreanWarnings.length - 30}건 (보고서 참고)`);
  }

  const c = r.coverage;
  lines.push("", "영어 보유율 (게재 기사)");
  row(REGION_BADGES.kr, `${c.kr.withEnglish}/${c.kr.total} (${pct(c.kr.withEnglish, c.kr.total)})`);
  row(
    "해외",
    `${c.other.withEnglish}/${c.other.total} (${pct(c.other.withEnglish, c.other.total)})`,
  );

  if (r.usage) {
    const u = r.usage;
    lines.push("", "실제 사용량");
    row(
      "호출",
      `${u.calls}회 · tokens ${u.inputTokens.toLocaleString()}/${u.outputTokens.toLocaleString()}`,
    );
    row("비용", usd(u.costUsd));
  }
  return lines.join("\n");
}

/** id 목록을 Markdown 으로 — 길면 접는다. */
function idList(title: string, items: string[], open = 10): string[] {
  if (items.length === 0) return [];
  const body = items.map((s) => `- ${s}`);
  if (items.length <= open) return [`**${title}**`, "", ...body, ""];
  return [
    `<details><summary><b>${title}</b> (${items.length}건)</summary>`,
    "",
    ...body,
    "",
    "</details>",
    "",
  ];
}

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** 보고서 → GitHub Markdown 요약(`$GITHUB_STEP_SUMMARY`). */
export function formatMarkdownSummary(r: BackfillReport): string {
  const t = r.targets;
  const lines: string[] = [];
  const title = r.mode === "apply" ? "영어 백필 결과" : "영어 백필 미리보기 (dry-run)";
  lines.push(`## ${title}`, "");

  const cost = r.usage
    ? `실제 **${usd(r.usage.costUsd)}** · 예상 ${usd(r.estimate.usd)}`
    : `예상 **${usd(r.estimate.usd)}**`;
  if (r.totals) {
    const x = r.totals;
    const k = Object.values(x.rejected).reduce((a, b) => a + b, 0);
    lines.push(
      `> **${x.written}** / ${t.total}건 영어 저장 (${pct(x.written, t.total)}) · 기각 **${k}** · 누락 **${x.missing}** · ${cost} (상한 $${r.options.maxCostUsd})`,
    );
  } else {
    lines.push(
      `> 대상 **${t.total}**건 · 요청 ${r.estimate.requests}건 · ${cost} (상한 $${r.options.maxCostUsd}) · LLM 호출 없음`,
    );
  }
  lines.push("");

  lines.push("| | 대상 | 영어 저장 | 보유율(게재 기사 전체) |", "|---|---:|---:|---:|");
  const byRegion = (kr: boolean) =>
    r.articles.filter((a) => (a.region === "kr") === kr && a.status === "written").length;
  const c = r.coverage;
  const covRow = (label: string, n: number, w: number | string, cov: Coverage) =>
    lines.push(
      `| ${label} | ${n} | ${w} | ${cov.withEnglish}/${cov.total} (${pct(cov.withEnglish, cov.total)}) |`,
    );
  covRow(`\`${REGION_BADGES.kr}\` 한국 매체`, t.byRegion.kr, r.totals ? byRegion(true) : "—", c.kr);
  covRow("해외 매체", t.byRegion.other, r.totals ? byRegion(false) : "—", c.other);
  lines.push("");

  if (r.totals) {
    const x = r.totals;
    lines.push("| 기각 사유 | 건수 |", "|---|---:|");
    for (const reason of Object.keys(x.rejected) as RejectReason[]) {
      if (reason === "check-failed" && x.rejected[reason] === 0) continue;
      lines.push(`| ${REJECT_LABELS[reason]} | ${x.rejected[reason]} |`);
    }
    lines.push(`| 누락(결과 없음) | ${x.missing} |`, "");
  }

  lines.push(
    `형식 ${FORMATS.map((f) => `${FORMAT_LABELS[f]} ${t.byFormat[f] ?? 0}`).join(" · ")} · 용어집 블록 ${r.glossary.withBlock}/${r.glossary.requests}요청 · 모델 \`${r.model}\`${r.batch ? " (Batches)" : ""}`,
    "",
  );

  lines.push(
    ...idList(
      "기각",
      r.articles
        .filter((a) => a.status === "rejected")
        .map(
          (a) =>
            `#${a.id} ${REJECT_LABELS[a.reason as RejectReason] ?? a.reason}: ${mdCell((a.detail ?? []).join(", "))} — ${mdCell(short(a.titleEn ?? ""))}`,
        ),
    ),
  );
  const missing = r.articles.filter((a) => a.status === "missing");
  lines.push(
    ...idList(
      "누락",
      missing.map((a) => `#${a.id} ${mdCell(a.reason ?? "")}`),
    ),
  );
  if (missing.length) {
    lines.push(
      "재시도:",
      "",
      "```",
      `npm run db:backfill-en -- --apply --ids ${missing.map((a) => a.id).join(",")}`,
      "```",
      "",
    );
  }
  if (r.koFixes.length) {
    lines.push(
      ...idList(
        `한국어 수정 ${r.koFixes.filter((f) => f.status === "applied").length}/${r.koFixes.length}건 적용`,
        r.koFixes.map(
          (f) =>
            `#${f.id} \`${f.field}\` ${KO_FIX_LABELS[f.status]}: «${mdCell(f.from)}» → «${mdCell(f.to)}»`,
        ),
      ),
    );
  }
  if (r.koreanWarnings.length) {
    lines.push(
      ...idList(
        `한국어 숫자 경고 ${r.koreanWarnings.length}건`,
        r.koreanWarnings.map((w) => `#${w.id} ${mdCell(w.numbers.join(" · "))}`),
        0,
      ),
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** data/eval/backfill-en-<시각>.json. */
export function defaultReportPath(createdAt: string): string {
  return path.join(EVAL_DIR, `backfill-en-${createdAt.replace(/[:.]/g, "-")}.json`);
}

function writeText(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

// ── CLI ─────────────────────────────────────────────────────────────────

export interface CliArgs {
  apply: boolean;
  since?: string;
  limit?: number;
  ids?: number[];
  overwrite: boolean;
  db: string;
  chunk: number;
  maxCost: number;
  report?: string;
  summaryMd?: string;
  koFixes?: string;
  countTokens: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    overwrite: false,
    db: DB_PATH,
    chunk: DEFAULT_CHUNK_SIZE,
    maxCost: envNonNegativeNumber("BACKFILL_MAX_COST_USD", DEFAULT_MAX_COST_USD),
    countTokens: false,
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
      case "--overwrite":
        args.overwrite = true;
        break;
      case "--count-tokens":
        args.countTokens = true;
        break;
      case "--limit":
        args.limit = positiveInt(flag, value());
        break;
      case "--chunk":
        args.chunk = positiveInt(flag, value());
        break;
      case "--since": {
        const v = value();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00+09:00`)))
          throw new Error(`--since 는 YYYY-MM-DD 여야 합니다: ${v}`);
        args.since = v;
        break;
      }
      case "--ids": {
        const v = value();
        args.ids = v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => positiveInt("--ids", s));
        if (args.ids.length === 0) throw new Error("--ids 에 id 가 없습니다");
        break;
      }
      case "--db":
        args.db = path.resolve(value());
        break;
      case "--report":
        args.report = path.resolve(value());
        break;
      case "--summary-md":
        args.summaryMd = path.resolve(value());
        break;
      case "--ko-fixes":
        args.koFixes = path.resolve(value());
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
  if (args.overwrite && !args.ids) throw new Error("--overwrite 는 --ids 와 함께만 씁니다");
  return args;
}

/** count_tokens(무료)로 요청마다 입력 토큰을 잰다. 실패하면 그 요청은 근사치를 쓴다. */
async function countRequestTokens(
  chunks: BackfillChunk[],
  log: (msg: string) => void,
): Promise<Map<string, number>> {
  const client = new Anthropic();
  const out = new Map<string, number>();
  for (const { request } of chunks) {
    const { model, system, messages, output_config } = request.params;
    try {
      const res = await client.messages.countTokens({ model, system, messages, output_config });
      out.set(request.id, res.input_tokens);
    } catch (err) {
      log(`count_tokens ${request.id} 실패(${(err as Error).message}) — 근사치 사용`);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const model = envString("LLM_MODEL", "claude-haiku-4-5");
  const useBatch = envFlag("LLM_USE_BATCH", true);
  const log = (msg: string) => console.log(`[backfill-en] ${msg}`);
  const createdAt = new Date().toISOString();
  const regionOf = loadRegionMap();

  log(
    `${args.apply ? "APPLY" : "DRY-RUN"} db=${args.db} model=${model} batch=${useBatch} chunk=${args.chunk}` +
      (args.since ? ` --since ${args.since}` : "") +
      (args.limit ? ` --limit ${args.limit}` : "") +
      (args.ids ? ` --ids ${args.ids.join(",")}` : "") +
      (args.overwrite ? " --overwrite" : "") +
      (args.koFixes ? ` --ko-fixes ${args.koFixes}` : ""),
  );

  const db = new Database(args.db, { fileMustExist: true, readonly: !args.apply });
  try {
    const fixes = args.koFixes ? loadKoFixes(args.koFixes) : [];
    const fixPlan = planKoFixes(db, fixes);
    const selection = selectTargets(db, {
      since: args.since,
      limit: args.limit,
      ids: args.ids,
      overwrite: args.overwrite,
      regionOf,
    });
    // 고친 한국어를 모델이 보게(입력·한국어 숫자 경고 모두) 요청을 만들기 전에 덧씌운다.
    const rows = overlayKoFixes(selection.rows, fixPlan);
    const chunks = buildRequests(rows, args.chunk, { model });

    let measured: Map<string, number> | undefined;
    if (args.countTokens && !args.apply) {
      if (process.env.ANTHROPIC_API_KEY?.trim()) {
        log(`count_tokens 로 ${chunks.length}요청 입력 토큰 측정 중…`);
        measured = await countRequestTokens(chunks, log);
      } else log("ANTHROPIC_API_KEY 가 없어 count_tokens 를 건너뜁니다(근사치)");
    }
    const estimate = estimateRequestsCost(chunks, model, useBatch, measured);

    const report: BackfillReport = {
      version: 1,
      mode: args.apply ? "apply" : "dry-run",
      createdAt,
      db: args.db,
      model,
      batch: useBatch,
      options: {
        since: args.since,
        limit: args.limit,
        ids: args.ids,
        overwrite: args.overwrite,
        chunk: args.chunk,
        maxCostUsd: args.maxCost,
        koFixes: args.koFixes,
      },
      targets: targetStats(selection),
      glossary: glossaryStats(chunks),
      estimate,
      articles: [],
      koreanWarnings: [],
      koFixes: fixPlan.results,
      coverage: englishCoverage(db, regionOf),
      notes: [],
    };

    const finish = () => {
      console.log(`\n${formatConsoleReport(report)}\n`);
      const reportFile = args.report ?? defaultReportPath(createdAt);
      writeText(reportFile, `${JSON.stringify(report, null, 2)}\n`);
      log(`보고서 ${reportFile}`);
      if (args.summaryMd) {
        writeText(args.summaryMd, formatMarkdownSummary(report));
        log(`Markdown 요약 ${args.summaryMd}`);
      }
    };

    if (!args.apply) {
      // dry-run 의 한국어 숫자 경고: 고친 한국어 기준(영어 없이 같은 대조만).
      report.koreanWarnings = koreanWarningsOf(rows);
      const over = estimate.usd > args.maxCost;
      report.notes.push(
        over
          ? `예상 비용 ${usd(estimate.usd)} > 상한 $${args.maxCost} — --apply 는 시작하지 않습니다`
          : `예상 비용 ${usd(estimate.usd)} ≤ 상한 $${args.maxCost}`,
      );
      finish();
      log(`dry-run — LLM 호출·DB 쓰기 없음. ${report.notes[0]}. 반영하려면 --apply`);
      return;
    }

    if (rows.length === 0 && fixPlan.updated.size === 0) {
      finish();
      log("쓸 것이 없습니다(대상 0건·적용할 한국어 수정 0건).");
      return;
    }
    if (rows.length > 0) {
      if (!process.env.ANTHROPIC_API_KEY?.trim()) {
        throw new Error(`ANTHROPIC_API_KEY 미설정 — ${rows.length}건을 만들 수 없습니다`);
      }
      assertWithinBudget(estimate, args.maxCost);
    }

    const runner = new LlmRunner({
      useBatch,
      batchTimeoutMs: envNonNegativeInt("BATCH_TIMEOUT_MIN", DEFAULT_BATCH_TIMEOUT_MIN) * 60_000,
      // 시간 초과·실패분을 표준 단가로 다시 보내지 않는다 — 받은 것만 쓰고 나머지는 --ids 로 재시도.
      directFallback: false,
    });
    log(`LLM 요청 ${chunks.length}건(기사 ${rows.length}건), 예상 비용 ≈ ${usd(estimate.usd)}`);
    const results = rows.length ? await runner.run(chunks.map((c) => c.request)) : new Map();
    const merged = mergeOutputs(chunks, results);
    const checked = checkOutputs(rows, chunks, merged);
    const tally = tallyOutcomes(checked.outcomes);
    report.articles = checked.outcomes;
    report.koreanWarnings = checked.koreanWarnings;
    report.usage = { ...runner.usage };
    report.notes.push(...checked.notes);
    report.totals = {
      ...tally,
      invalidItems: merged.invalidItems,
      failedRequests: merged.failedRequests.length,
    };
    for (const f of merged.failedRequests) {
      log(`${f.id} 실패(${f.error}) — 기사 ${f.ids.length}건 누락`);
    }

    const backup = backupPath(args.db);
    await db.backup(backup);
    log(`백업 ${backup}`);
    ensureSchema(db);
    const written = applyBackfill(db, { english: checked.english, koFixes: fixPlan.updated });
    log(`영어 ${written.english}건 · 한국어 수정 ${written.korean}건 UPDATE`);
    report.coverage = englishCoverage(db, regionOf);
    finish();
  } finally {
    db.close();
  }
}

/** 대상 행의 한국어 숫자 경고(영어 없이 — dry-run 용). resolveEnglish 와 같은 근거·같은 대조. */
export function koreanWarningsOf(rows: BackfillRow[]): { id: number; numbers: string[] }[] {
  const resolution = resolveEnglish(
    rows.map((r) => ({
      id: r.id,
      enrichment: {
        title_ko: r.titleKo,
        summary_ko: r.summaryKo,
        category: asCategory(r.category),
        tags: r.tags,
        title_en: "",
        summary_en: "",
      },
      evidence: evidenceOf(r),
    })),
  );
  const out: { id: number; numbers: string[] }[] = [];
  for (const [id, check] of resolution.checks) {
    if (check.koreanNumbers.length) out.push({ id, numbers: check.koreanNumbers });
  }
  return out;
}

// tsx 로 직접 실행될 때만 동작. SDK 소켓이 이벤트 루프를 붙잡지 않도록 명시적으로 종료한다.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit())
    .catch((err) => {
      console.error(`[backfill-en] ${(err as Error).message}`);
      process.exit(1);
    });
}
