/**
 * 콘텐츠·1면 개편 기준선 지표(docs/contents-upgrade-plan.md Phase 0 · Phase 7 "목표 지표").
 * 실행: npm run kpi -- baseline [days=14]  (출력은 scripts/kpi.ts)
 *
 * 최신 호 날짜에서 거슬러 `days`일(KST 달력일) 동안의 호를 대상으로 한다. "호 날짜"는
 * articles.created_at(UTC)의 KST 날짜, 공개 기사(summary_ko IS NOT NULL)만 센다.
 * 순수 집계 모듈 — 커넥션을 받아 조회만 하고 쓰지 않는다(개편 후 Phase 7에서 같은 측정을 반복).
 *
 * - 형식 비율: format 컬럼은 Phase 2에서 생기므로 지금은 소스 id/kind로 임시 판정(provisionalFormat)
 * - 1면 오늘 호 비율: /edition/[date] 과 똑같이 getEditionRefs → getArticlesUntil(cutoff) → buildEdition
 * - 이틀 연속 중복 후보: 인접 호 기사 쌍의 제목 토큰 Jaccard·공유 URL — 휴리스틱(확정 아님)
 */
import type { Database as DatabaseType } from "better-sqlite3";
import { getArticlesUntil, getEditionRefs } from "../../src/lib/db";
import { buildEdition } from "../../src/lib/edition";
import { kstDateKey, normalizeCategory } from "../../src/lib/labels";

export type Format = "news" | "oss" | "model" | "paper";
export const FORMATS: Format[] = ["news", "oss", "model", "paper"];
export const FORMAT_LABELS: Record<Format, string> = {
  news: "뉴스",
  oss: "오픈소스",
  model: "모델",
  paper: "논문",
};

/**
 * 소스 → 형식 임시 매핑(계획서 §2-2와 같은 규칙). Phase 2에서 sources.format 컬럼이 생기면
 * 이 함수 대신 그 값을 쓴다 — 기준선과 비교할 때 규칙이 같아야 하므로 여기 한 곳에만 둔다.
 * - GitHub(`github_*`, kind=github) → oss
 * - HF 모델(`hf_models*`, kind=hf_models) → model  (기준선 시점엔 소스가 없어 0건)
 * - HF Daily Papers·arXiv·Takara → paper  (`hf_blog`는 블로그라 news)
 * - 나머지 → news
 */
export function provisionalFormat(sourceId: string, kind?: string | null): Format {
  if (kind === "github" || sourceId.startsWith("github_")) return "oss";
  if (kind === "hf_models" || sourceId.startsWith("hf_models")) return "model";
  if (
    sourceId === "hf_daily_papers" ||
    kind === "arxiv" ||
    sourceId.startsWith("arxiv_") ||
    sourceId.startsWith("takara_")
  ) {
    return "paper";
  }
  return "news";
}

/**
 * Physical AI 키워드(제목·원제·요약·태그 대상, 대소문자 무시). 카테고리에 로보틱스가 없어
 * 분류 대신 키워드로 센다. `robots.txt` 같은 웹 용어는 제외한다.
 */
export const PHYSICAL_AI_PATTERN = new RegExp(
  [
    String.raw`\bro(?:bot|bots|botic|botics|botaxi|botaxis)\b(?!\.txt)`,
    String.raw`\bcobots?\b`,
    String.raw`\bhumanoids?\b`,
    String.raw`\bVLAs?\b`,
    String.raw`vision[- ]language[- ]action`,
    String.raw`\bembodied\b`,
    String.raw`\bself[- ]driving\b`,
    String.raw`\bautonomous (?:driving|vehicles?|cars?|trucks?)\b`,
    String.raw`\bdriverless\b`,
    String.raw`\bwaymo\b`,
    String.raw`\bdrones?\b`,
    String.raw`\bphysical (?:ai|intelligence)\b`,
    String.raw`\bgr00t\b`,
    String.raw`\bquadrupeds?\b`,
    String.raw`\bexoskeletons?\b`,
    "로봇",
    "로보틱스",
    "로보택시",
    "휴머노이드",
    "임바디드",
    "자율주행",
    "드론",
    String.raw`피지컬\s*AI`,
    String.raw`물리\s*AI`,
    "사족보행",
  ].join("|"),
  "i",
);

export function isPhysicalAi(texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && PHYSICAL_AI_PATTERN.test(t));
}

/** 기준선 집계용 기사 한 건(공개 기사). */
export interface BaselineArticle {
  id: number;
  sourceId: string;
  /** KST 호 날짜 'YYYY-MM-DD' (created_at 기준). */
  issueDate: string;
  format: Format;
  category: string;
  titleKo: string;
  titleOriginal: string;
  summaryKo: string;
  url: string;
  tags: string[];
  /** related_json 의 다른 매체 보도 URL. */
  relatedUrls: string[];
  /** Physical AI 키워드 — 제목·원제·요약·태그 중 하나라도(넓은 기준, 기준선 수치). */
  physicalAi: boolean;
  /** Physical AI 키워드 — 제목·원제·태그만(좁은 기준; 요약 속 "로봇 청소기" 같은 곁가지 언급 제외). */
  physicalAiStrict: boolean;
}

interface ArticleQueryRow {
  id: number;
  source_id: string;
  kind: string | null;
  url: string;
  title_original: string;
  title_ko: string | null;
  summary_ko: string | null;
  category: string | null;
  related_json: string | null;
  collected_at: string;
  tags: string | null;
}

function relatedUrls(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .map((r) => (r as { url?: unknown }).url)
          .filter((u): u is string => typeof u === "string")
      : [];
  } catch {
    return [];
  }
}

/** 전체 공개 기사(호 날짜 부착). 창 필터는 호출자가 한다 — 1면 재구성이 창 밖 기사도 보기 때문. */
export function loadPublishedArticles(conn: DatabaseType): BaselineArticle[] {
  const rows = conn
    .prepare(
      `SELECT a.id, a.source_id, s.kind, a.url, a.title_original, a.title_ko, a.summary_ko,
              a.category, a.related_json,
              strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) AS collected_at,
              (SELECT GROUP_CONCAT(t.name)
                 FROM article_tags at JOIN tags t ON t.id = at.tag_id
                WHERE at.article_id = a.id) AS tags
         FROM articles a
         LEFT JOIN sources s ON s.id = a.source_id
        WHERE a.summary_ko IS NOT NULL
        ORDER BY a.id`,
    )
    .all() as ArticleQueryRow[];
  return rows.map((r) => {
    const tags = r.tags ? r.tags.split(",") : [];
    return {
      id: r.id,
      sourceId: r.source_id,
      issueDate: kstDateKey(r.collected_at),
      format: provisionalFormat(r.source_id, r.kind),
      // 분야 개편 전 구 값도 새 키로 센다 — 마이그레이션 전후 DB 어느 쪽이든 같은 분류로 비교한다.
      category: normalizeCategory(r.category ?? ""),
      titleKo: r.title_ko ?? "",
      titleOriginal: r.title_original,
      summaryKo: r.summary_ko ?? "",
      url: r.url,
      tags,
      relatedUrls: relatedUrls(r.related_json),
      physicalAi: isPhysicalAi([r.title_ko, r.title_original, r.summary_ko, ...tags]),
      physicalAiStrict: isPhysicalAi([r.title_ko, r.title_original, ...tags]),
    };
  });
}

// ── collection_runs.notes 파싱 ──────────────────────────────────────────────

export interface SourceNote {
  /** 가져온 항목 수(실패면 null). */
  fetched: number | null;
  /** 신규(dedup 통과) 수. */
  fresh: number;
  /** 소스별 신규 상한(maxItems) — 걸렸을 때만 기록됨. */
  cap: number | null;
  /** 실패 사유(성공이면 null). */
  error: string | null;
}

export interface ParsedNotes {
  sources: Record<string, SourceNote>;
  /** "선별 풀: 후보 X건 중 Y건" */
  poolCandidates: number | null;
  poolSize: number | null;
  /** "선정 N건(같은 사건으로 묶인 기사 M건)" */
  picks: number | null;
  grouped: number | null;
}

/**
 * collect.ts 가 남기는 notes 문자열을 파싱한다. 형식:
 * `id: 20건(신규 6); id: 50건(신규 40, 상한 10); id: 실패 Status code 403; 선별 풀: 후보 126건 중 126건; 선정 28건(같은 사건으로 묶인 기사 8건); ...`
 */
export function parseRunNotes(notes: string | null): ParsedNotes {
  const out: ParsedNotes = {
    sources: {},
    poolCandidates: null,
    poolSize: null,
    picks: null,
    grouped: null,
  };
  if (!notes) return out;
  for (const raw of notes.split(";")) {
    const part = raw.trim();
    const ok = /^([a-z0-9_]+): (\d+)건\(신규 (\d+)(?:, 상한 (\d+))?\)$/.exec(part);
    if (ok) {
      out.sources[ok[1]] = {
        fetched: Number(ok[2]),
        fresh: Number(ok[3]),
        cap: ok[4] ? Number(ok[4]) : null,
        error: null,
      };
      continue;
    }
    const fail = /^([a-z0-9_]+): 실패 (.*)$/.exec(part);
    if (fail) {
      out.sources[fail[1]] = { fetched: null, fresh: 0, cap: null, error: fail[2] };
      continue;
    }
    const pool = /후보 (\d+)건 중 (\d+)건/.exec(part);
    if (pool) {
      out.poolCandidates = Number(pool[1]);
      out.poolSize = Number(pool[2]);
      continue;
    }
    const picks = /^선정 (\d+)건(?:\(같은 사건으로 묶인 기사 (\d+)건\))?/.exec(part);
    if (picks) {
      out.picks = Number(picks[1]);
      out.grouped = picks[2] ? Number(picks[2]) : 0;
    }
  }
  return out;
}

/** 소스의 신규 후보 수(상한 적용 후) — 선별 풀에 들어간 몫. */
function capped(note: SourceNote): number {
  return note.cap !== null ? Math.min(note.fresh, note.cap) : note.fresh;
}

// ── 이틀 연속 같은 사건 후보(휴리스틱) ───────────────────────────────────────

const STOPWORDS = new Set(
  (
    "the a an and or of to in for on with is are its it at by from as new how why what " +
    "this that be into about your you we our their after over now just more than vs via " +
    "says said launches launch releases release announces announced introduces"
  ).split(" "),
);
const KO_PARTICLE = /(으로|에서|에게|부터|까지|은|는|이|가|을|를|의|에|로|와|과|도|만)$/;

/** 제목 → 비교용 토큰 집합(소문자, 기호 제거, 불용어·1글자 제거, 한글 조사 절단). */
export function titleTokens(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣.]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .map((t) => (/[가-힣]/.test(t) && t.length >= 3 ? t.replace(KO_PARTICLE, "") : t))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

const normUrl = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();

export interface DuplicatePair {
  prevDate: string;
  date: string;
  prev: { id: number; title: string };
  next: { id: number; title: string };
  /** 원제·한국어 제목 Jaccard 중 큰 값. */
  similarity: number;
  /** 두 기사가 함께 가진 희귀 토큰(창 안 기사 RARE_DOC_FREQ 건 이하에만 등장 — 고유명사·버전명 근사). */
  sharedRare: string[];
  sharedUrl: boolean;
}

/** 판정 기준(휴리스틱): Jaccard ≥ 0.5, 또는 희귀 토큰 3개 이상 공유, 또는 URL(관련 보도 포함) 공유. */
export const DUPLICATE_JACCARD = 0.5;
export const RARE_DOC_FREQ = 3;
export const MIN_SHARED_RARE = 3;

/** 기사 제목(원제 ∪ 한국어) 토큰 집합. */
function allTitleTokens(a: BaselineArticle): Set<string> {
  return new Set([...titleTokens(a.titleOriginal), ...titleTokens(a.titleKo)]);
}

/** 토큰별 등장 기사 수(희귀 토큰 판정용). */
export function titleDocFreq(articles: BaselineArticle[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const a of articles) for (const t of allTitleTokens(a)) df.set(t, (df.get(t) ?? 0) + 1);
  return df;
}

/**
 * 인접 호(prev → next) 기사 쌍 중 같은 사건 후보. `docFreq` 를 주지 않으면 두 호만으로 계산한다
 * (창 전체 기준이 더 정확 — computeBaseline 은 창 전체로 넘긴다).
 */
export function findDuplicatePairs(
  prev: BaselineArticle[],
  next: BaselineArticle[],
  docFreq: Map<string, number> = titleDocFreq([...prev, ...next]),
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const tok = (a: BaselineArticle) => ({
    orig: titleTokens(a.titleOriginal),
    ko: titleTokens(a.titleKo),
    rare: new Set([...allTitleTokens(a)].filter((t) => (docFreq.get(t) ?? 0) <= RARE_DOC_FREQ)),
    urls: new Set([a.url, ...a.relatedUrls].map(normUrl)),
  });
  const prevT = prev.map((a) => ({ a, t: tok(a) }));
  for (const n of next) {
    const nt = tok(n);
    for (const { a: p, t: pt } of prevT) {
      const similarity = Math.max(jaccard(pt.orig, nt.orig), jaccard(pt.ko, nt.ko));
      const sharedRare = [...nt.rare].filter((t) => pt.rare.has(t));
      const sharedUrl = [...nt.urls].some((u) => pt.urls.has(u));
      if (similarity >= DUPLICATE_JACCARD || sharedRare.length >= MIN_SHARED_RARE || sharedUrl) {
        pairs.push({
          prevDate: p.issueDate,
          date: n.issueDate,
          prev: { id: p.id, title: p.titleKo || p.titleOriginal },
          next: { id: n.id, title: n.titleKo || n.titleOriginal },
          similarity,
          sharedRare,
          sharedUrl,
        });
      }
    }
  }
  return pairs;
}

// ── 리포트 ────────────────────────────────────────────────────────────────

export interface RunBaseline {
  id: number;
  startedAt: string;
  /** KST 날짜 — 호 날짜와 같은 기준. */
  date: string;
  status: string;
  costUsd: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  itemsCollected: number;
  itemsNew: number;
  notes: ParsedNotes;
  /** notes 기준 형식별 신규 후보(상한 적용 후). */
  candidatesByFormat: Record<Format, number>;
}

export interface Ratio {
  today: number;
  size: number;
}

export interface IssueBaseline {
  date: string;
  issueNo: number;
  published: number;
  formats: Record<Format, number>;
  categories: Record<string, number>;
  physicalAi: number;
  physicalAiStrict: number;
  /** 1면 본문(리드 + 서브) 중 그날 호 기사 수. */
  front: Ratio;
  /** "지금 화제" 중 그날 호 기사 수. */
  trending: Ratio;
  /** 1면에 오른 지난 호 기사(호 날짜와 함께). */
  staleFront: { id: number; issueDate: string; title: string }[];
  costUsd: number;
}

export interface SourceYield {
  id: string;
  name: string;
  format: Format;
  published: number;
  /** 창 안 회차 notes 의 신규 후보 합(상한 적용 후). */
  candidates: number;
  /** 창 안 회차 중 실패 횟수와 마지막 사유. */
  failures: number;
  lastError: string | null;
}

export interface BaselineReport {
  days: number;
  from: string;
  to: string;
  issues: IssueBaseline[];
  runs: RunBaseline[];
  totals: {
    published: number;
    formats: Record<Format, number>;
    categories: Record<string, number>;
    physicalAi: number;
    physicalAiStrict: number;
    physicalAiByCategory: Record<string, number>;
    physicalAiArticles: {
      id: number;
      date: string;
      category: string;
      title: string;
      strict: boolean;
    }[];
    front: Ratio;
    trending: Ratio;
    candidatesByFormat: Record<Format, number>;
    cost: { runs: number; total: number; avg: number; min: number; max: number };
    llmCalls: number;
    inputTokens: number;
    outputTokens: number;
    runsByStatus: Record<string, number>;
  };
  duplicates: DuplicatePair[];
  sources: SourceYield[];
  zeroYield: SourceYield[];
}

/** 기준선 소스 정의(configs/sources.json 의 부분 형태). */
export interface BaselineSource {
  id: string;
  name: string;
  kind: string;
  enabled: number;
}

const DAY_MS = 24 * 3600 * 1000;

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const emptyFormats = (): Record<Format, number> => ({ news: 0, oss: 0, model: 0, paper: 0 });

function inc(map: Record<string, number>, key: string, by = 1): void {
  map[key] = (map[key] ?? 0) + by;
}

/**
 * 최신 호 날짜 기준 최근 `days`일 기준선. 호가 하나도 없으면 빈 리포트(from/to 빈 문자열).
 * `sources` 는 활성 소스 판정(0건 소스)용 — configs/sources.json.
 */
export function computeBaseline(
  conn: DatabaseType,
  days = 14,
  sources: BaselineSource[] = [],
): BaselineReport {
  const refs = getEditionRefs(conn);
  const to = refs.at(-1)?.date ?? "";
  const from = to ? shiftDate(to, -(days - 1)) : "";
  const inWindow = (d: string) => !!to && d >= from && d <= to;
  const windowRefs = refs.filter((r) => inWindow(r.date));

  const all = loadPublishedArticles(conn);
  const issueDateById = new Map(all.map((a) => [a.id, a.issueDate]));
  const articles = all.filter((a) => inWindow(a.issueDate));
  const byDate = new Map<string, BaselineArticle[]>();
  for (const a of articles) byDate.set(a.issueDate, [...(byDate.get(a.issueDate) ?? []), a]);

  // 회차(실패 포함) — 비용·notes.
  const runRows = conn.prepare(`SELECT * FROM collection_runs ORDER BY started_at`).all() as {
    id: number;
    started_at: string;
    status: string;
    est_cost_usd: number;
    llm_calls: number;
    input_tokens: number;
    output_tokens: number;
    items_collected: number;
    items_new: number;
    notes: string | null;
  }[];
  const runs: RunBaseline[] = runRows
    .map((r) => {
      const notes = parseRunNotes(r.notes);
      const candidatesByFormat = emptyFormats();
      for (const [id, note] of Object.entries(notes.sources)) {
        const kind = sources.find((s) => s.id === id)?.kind;
        candidatesByFormat[provisionalFormat(id, kind)] += capped(note);
      }
      return {
        id: r.id,
        startedAt: r.started_at,
        date: kstDateKey(r.started_at),
        status: r.status,
        costUsd: r.est_cost_usd,
        llmCalls: r.llm_calls,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        itemsCollected: r.items_collected,
        itemsNew: r.items_new,
        notes,
        candidatesByFormat,
      };
    })
    .filter((r) => inWindow(r.date));

  const issues: IssueBaseline[] = windowRefs.map((ref) => {
    const list = byDate.get(ref.date) ?? [];
    const formats = emptyFormats();
    const categories: Record<string, number> = {};
    for (const a of list) {
      formats[a.format] += 1;
      inc(categories, a.category);
    }
    // /edition/[date] 과 같은 재구성(그날 마감 전 수집분 → buildEdition).
    const edition = buildEdition(getArticlesUntil(ref.cutoff, conn));
    const front = [edition.lead, ...edition.seconds].filter((a) => a !== null);
    const isToday = (id: number) => issueDateById.get(id) === ref.date;
    return {
      date: ref.date,
      issueNo: ref.issueNo,
      published: list.length,
      formats,
      categories,
      physicalAi: list.filter((a) => a.physicalAi).length,
      physicalAiStrict: list.filter((a) => a.physicalAiStrict).length,
      front: { today: front.filter((a) => isToday(a.id)).length, size: front.length },
      trending: {
        today: edition.trending.filter((a) => isToday(a.id)).length,
        size: edition.trending.length,
      },
      staleFront: front
        .filter((a) => !isToday(a.id))
        .map((a) => ({ id: a.id, issueDate: issueDateById.get(a.id) ?? "", title: a.titleKo })),
      costUsd: runs.filter((r) => r.date === ref.date).reduce((s, r) => s + r.costUsd, 0),
    };
  });

  // 합계
  const formats = emptyFormats();
  const categories: Record<string, number> = {};
  const physicalAiByCategory: Record<string, number> = {};
  for (const a of articles) {
    formats[a.format] += 1;
    inc(categories, a.category);
    if (a.physicalAi) inc(physicalAiByCategory, a.category);
  }
  const candidatesByFormat = emptyFormats();
  const runsByStatus: Record<string, number> = {};
  for (const r of runs) {
    for (const f of FORMATS) candidatesByFormat[f] += r.candidatesByFormat[f];
    inc(runsByStatus, r.status);
  }
  const costs = runs.map((r) => r.costUsd);
  const totalCost = costs.reduce((s, c) => s + c, 0);
  const sum = (pick: (i: IssueBaseline) => Ratio): Ratio => ({
    today: issues.reduce((s, i) => s + pick(i).today, 0),
    size: issues.reduce((s, i) => s + pick(i).size, 0),
  });

  // 이틀 연속(인접 호) 중복 후보
  const duplicates: DuplicatePair[] = [];
  const docFreq = titleDocFreq(articles);
  for (let i = 1; i < windowRefs.length; i += 1) {
    duplicates.push(
      ...findDuplicatePairs(
        byDate.get(windowRefs[i - 1].date) ?? [],
        byDate.get(windowRefs[i].date) ?? [],
        docFreq,
      ),
    );
  }

  // 활성 소스별 수확
  const sourceYields: SourceYield[] = sources
    .filter((s) => s.enabled === 1)
    .map((s) => {
      let candidates = 0;
      let failures = 0;
      let lastError: string | null = null;
      for (const r of runs) {
        const note = r.notes.sources[s.id];
        if (!note) continue;
        candidates += capped(note);
        if (note.error) {
          failures += 1;
          lastError = note.error;
        }
      }
      return {
        id: s.id,
        name: s.name,
        format: provisionalFormat(s.id, s.kind),
        published: articles.filter((a) => a.sourceId === s.id).length,
        candidates,
        failures,
        lastError,
      };
    });

  return {
    days,
    from,
    to,
    issues,
    runs,
    totals: {
      published: articles.length,
      formats,
      categories,
      physicalAi: articles.filter((a) => a.physicalAi).length,
      physicalAiStrict: articles.filter((a) => a.physicalAiStrict).length,
      physicalAiByCategory,
      physicalAiArticles: articles
        .filter((a) => a.physicalAi)
        .map((a) => ({
          id: a.id,
          date: a.issueDate,
          category: a.category,
          title: a.titleKo || a.titleOriginal,
          strict: a.physicalAiStrict,
        })),
      front: sum((i) => i.front),
      trending: sum((i) => i.trending),
      candidatesByFormat,
      cost: {
        runs: runs.length,
        total: totalCost,
        avg: runs.length ? totalCost / runs.length : 0,
        min: costs.length ? Math.min(...costs) : 0,
        max: costs.length ? Math.max(...costs) : 0,
      },
      llmCalls: runs.reduce((s, r) => s + r.llmCalls, 0),
      inputTokens: runs.reduce((s, r) => s + r.inputTokens, 0),
      outputTokens: runs.reduce((s, r) => s + r.outputTokens, 0),
      runsByStatus,
    },
    duplicates,
    sources: sourceYields,
    zeroYield: sourceYields.filter((s) => s.published === 0),
  };
}
