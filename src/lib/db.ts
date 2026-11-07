import Database, { type Database as DatabaseType } from "better-sqlite3";
import { hasEnglish } from "@/lib/articleText";
import type { Locale } from "@/lib/i18n";
import {
  categoryAliases,
  categoryLabel,
  englishSource,
  hasHangul,
  isRegion,
  kstDateKey,
  localeTags,
  normalizeCategory,
  toFormat,
} from "@/lib/labels";
import {
  parseEnglishNotes,
  sumEnglishNotes,
  sumEnglishRunCost,
  type EnglishCoverage,
  type EnglishKpi,
} from "@/lib/englishKpi";
import { planArchive, type ArchivePlan } from "@/lib/archive";
import { DB_PATH } from "@/lib/paths";
import {
  assessSourceHealth,
  SOURCE_HEALTH_RULES,
  type HealthSourceInput,
  type SourceHealthReport,
} from "@/lib/sourceHealth";
import type {
  ArticleCard,
  ArticleSource,
  Engagement,
  FollowUpEntry,
  LatestFeedEntry,
  ListCard,
  RelatedCoverage,
  RunRow,
  SearchIndexEntry,
} from "@/lib/types";
import { weekWindow, type WeeklyCandidate } from "@/lib/weeklyRadar";

/**
 * 읽기 전용 SQLite 커넥션 싱글톤.
 * 수집 배치(scripts/collect.ts)가 data/app.db 를 생성·갱신하고,
 * 웹(빌드/런타임)은 이 커넥션으로 조회만 한다. 서버 전용 모듈이다.
 */
let db: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (db) return db;
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  return db;
}

/** articles + sources JOIN 조회 결과 한 행. */
interface ArticleRow {
  id: number;
  source_id: string;
  source_name: string;
  source_format: string | null; // sources.format — 미정의 값은 news 로 본다
  source_name_en: string | null; // sources.name_en — 영문 매체명(한글 이름 매체만)
  source_region: string | null; // sources.region — 'kr' 외 값은 해외로 본다
  url: string;
  title_original: string;
  content_raw: string | null;
  published_at: string;
  trending_score: number;
  title_ko: string | null;
  summary_ko: string | null;
  title_en: string | null; // 영어판 — 가공 전·영어 품질 검사 기각이면 NULL
  summary_en: string | null;
  category: string | null;
  importance: number | null;
  related_json: string | null;
  engagement_json: string | null;
  tags: string | null; // GROUP_CONCAT 결과 (',' 구분), 태그 없으면 null
  collected_at: string; // 수집 시각(ISO8601 UTC) — 렌더 DTO 에는 싣지 않는다(latest.json 전용)
}

/** related_json → 관련 보도 목록. 손상된 값은 빈 목록으로 본다. */
function parseRelated(json: string | null): RelatedCoverage[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as RelatedCoverage[]) : [];
  } catch {
    return [];
  }
}

/**
 * engagement_json → 메트릭 객체. 비었거나 손상됐거나 객체가 아니면 undefined.
 * 필드 값의 형은 여기서 거르지 않는다 — 표시 쪽(src/lib/radarMeta.ts)이 숫자·문자열을 확인한다.
 */
export function parseEngagement(json: string | null): Engagement | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Engagement)
      : undefined;
  } catch {
    return undefined;
  }
}

/** 행 → 카드 매체. 영문명·지역은 값이 있을 때만 키를 둔다(해외 매체 대부분은 id·name 뿐). */
function toArticleSource(row: ArticleRow): ArticleSource {
  const source: ArticleSource = { id: row.source_id, name: row.source_name };
  if (row.source_name_en) source.nameEn = row.source_name_en;
  if (isRegion(row.source_region)) source.region = row.source_region;
  return source;
}

/**
 * DB 행 → 렌더 DTO. LLM 미가공(null) 필드는 빈 값으로 채운다(영어 제목·요약도 없으면 빈 문자열).
 * 분야는 새 키로 정규화한다 — 마이그레이션 전 구 값 행도 섹션·필터에 같은 분야로 잡힌다.
 * 형식·영문 매체명·지역은 소스 속성(sources.format·name_en·region)이라 지난 기사에도 그대로 소급된다.
 */
function toArticleCard(row: ArticleRow): ArticleCard {
  const card: ArticleCard = {
    id: row.id,
    source: toArticleSource(row),
    url: row.url,
    titleKo: row.title_ko ?? "",
    summaryKo: row.summary_ko ?? "",
    titleOriginal: row.title_original,
    titleEn: row.title_en ?? "",
    summaryEn: row.summary_en ?? "",
    contentRaw: row.content_raw ?? undefined,
    category: normalizeCategory(row.category ?? ""),
    format: toFormat(row.source_format),
    tags: row.tags ? row.tags.split(",") : [],
    trendingScore: row.trending_score,
    importance: row.importance ?? 0,
    publishedAt: row.published_at,
    related: parseRelated(row.related_json),
  };
  // 메트릭이 없는 기사(RSS 뉴스 대부분)는 키 자체를 두지 않는다 — 지면 HTML·JSON 에 빈 키가 실리지 않게.
  const engagement = parseEngagement(row.engagement_json);
  if (engagement) card.engagement = engagement;
  return card;
}

/**
 * sources.format 컬럼 유무. 컬럼은 ensureSchema(수집·db:init·prebuild)가 추가하지만, 웹은 DB 를 읽기 전용으로
 * 열어 직접 추가할 수 없다 — 그 전의 DB(마이그레이션 전 배포 브랜치 등)에서도 조회가 깨지지 않게 확인한다.
 */
export function hasSourceFormat(conn: DatabaseType): boolean {
  return tableColumns(conn, "sources").has("format");
}

/** 테이블의 컬럼 이름들(PRAGMA table_info). */
function tableColumns(conn: DatabaseType, table: "articles" | "sources"): Set<string> {
  const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(cols.map((c) => c.name));
}

/**
 * 기사 조회 공통 SELECT. 나중에 추가된 컬럼(sources.format·name_en·region, articles.title_en·summary_en)이
 * 없는 옛 DB 에서는 NULL 로 읽는다(→ news·해외·영어 없음) — hasSourceFormat 과 같은 이유.
 */
function articleSelect(conn: DatabaseType): string {
  const sourceCols = tableColumns(conn, "sources");
  const articleCols = tableColumns(conn, "articles");
  const s = (col: string) => (sourceCols.has(col) ? `s.${col}` : "NULL");
  const a = (col: string) => (articleCols.has(col) ? `a.${col}` : "NULL");
  return `
  SELECT a.id, a.source_id, s.name AS source_name, ${s("format")} AS source_format,
         ${s("name_en")} AS source_name_en, ${s("region")} AS source_region, a.url,
         a.title_original, a.content_raw, a.published_at, a.trending_score,
         a.title_ko, a.summary_ko, ${a("title_en")} AS title_en, ${a("summary_en")} AS summary_en,
         a.category, a.importance, a.related_json,
         a.engagement_json,
         strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) AS collected_at,
         (SELECT GROUP_CONCAT(t.name)
            FROM article_tags at
            JOIN tags t ON t.id = at.tag_id
           WHERE at.article_id = a.id) AS tags
  FROM articles a
  JOIN sources s ON s.id = a.source_id
`;
}

/**
 * 공개 조건: LLM 가공을 마친 기사만 노출한다. 가공 실패 행은 다음 수집에서 재시도되기 전까지
 * 영문 원제·중요도 없음 상태라 지면에 올리지 않는다(scripts/collect.ts 재심사).
 */
const PUBLISHED = "a.summary_ko IS NOT NULL";

/** 피드 필터/정렬 옵션 (URL 쿼리에서 파싱). */
export interface FeedOptions {
  tag?: string;
  source?: string;
  /** 분야 키(예: "agent"). 홈 섹션의 "전체 보기" 링크가 사용한다. */
  category?: string;
  sort?: "latest" | "importance";
}

/** 검색 옵션 = 피드 필터/정렬 + 키워드 q. */
export interface SearchOptions extends FeedOptions {
  q?: string;
}

/** 소스·태그·카테고리 필터를 WHERE 절 조각 + 바인딩 파라미터로 구성한다(getFeed/searchArticles 공유). */
function buildFilters(opts: FeedOptions): {
  clauses: string[];
  params: (string | number)[];
} {
  const clauses: string[] = [PUBLISHED];
  const params: (string | number)[] = [];

  if (opts.source) {
    clauses.push("a.source_id = ?");
    params.push(opts.source);
  }
  if (opts.tag) {
    clauses.push(
      `EXISTS (SELECT 1 FROM article_tags at
                 JOIN tags t ON t.id = at.tag_id
                WHERE at.article_id = a.id AND t.name = ?)`,
    );
    params.push(opts.tag);
  }
  if (opts.category) {
    // 키와 구 저장값을 함께 매칭(마이그레이션 전 행 호환).
    const values = categoryAliases(opts.category);
    clauses.push(`a.category IN (${values.map(() => "?").join(", ")})`);
    params.push(...values);
  }
  return { clauses, params };
}

/** 정렬 옵션 → ORDER BY 절(getFeed/searchArticles 공유). */
function orderByFor(sort: FeedOptions["sort"]): string {
  return sort === "latest"
    ? "a.published_at DESC"
    : sort === "importance"
      ? "a.importance DESC, a.trending_score DESC"
      : "a.trending_score DESC, a.published_at DESC, a.id ASC";
}

/**
 * 피드용 기사 목록. 태그·소스 필터와 정렬을 지원한다(PRD §3.5).
 * 기본 정렬은 트렌딩 점수 내림차순(동점 시 최신순, 그래도 같으면 id 순),
 * sort=latest 는 게시 최신순, sort=importance 는 중요도 우선.
 */
export function getFeed(opts: FeedOptions = {}, conn: DatabaseType = getDb()): ArticleCard[] {
  const { clauses, params } = buildFilters(opts);
  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = conn
    .prepare(`${articleSelect(conn)} ${whereSql} ORDER BY ${orderByFor(opts.sort)}`)
    .all(...params) as ArticleRow[];
  return rows.map(toArticleCard);
}

/**
 * 목록·지면용 카드 한 건(= 검색 인덱스·latest.json 항목): 상세 전용 원문 발췌(contentRaw)와 영어판 필드
 * (titleEn·summaryEn, 매체 nameEn·region)를 뺀다. 한국어 지면은 영어를 그리지 않는데, 홈·호 페이지는 카드 배열을
 * 클라이언트 컴포넌트에 넘겨 페이지 HTML·RSC 에 그대로 실린다 — 영어 요약까지 실으면 호 페이지가 카드 35건 × 2벌
 * (인라인 + .txt)로 수십 KB 커진다(영어판 Phase 4 용량 리스크). 키 순서는 원래 카드 그대로 둔다(산출물 비교가 쉽게).
 *
 * `locale = "en"`(영어판 Phase 5-2)은 거꾸로 영어 제목·요약과 매체 영문명·지역(KOREA 표시·Korea Desk)을 남기고
 * 한국어 가공 텍스트(titleKo·summaryKo)를 빈 문자열로 둔다. 영어 페이지 RSC 에 한국어가 실리지 않도록 한글이 든
 * 원제·태그·묶인 보도 제목/매체명도 비우거나 뺀다(목록은 원제를 그리지 않고, 묶인 보도는 개수만 쓴다).
 * 영어판에 실을 기사(`hasEnglish`)로 거르는 일은 부르는 쪽(views/data.ts `localeArticles`)이 먼저 한다.
 */
export function toListCard(article: ArticleCard, locale?: "ko"): SearchIndexEntry;
export function toListCard(article: ArticleCard, locale: Locale): ListCard;
export function toListCard(article: ArticleCard, locale: Locale = "ko"): ListCard {
  if (locale === "en") return toEnglishListCard(article);
  const card = { ...article, source: { id: article.source.id, name: article.source.name } };
  delete card.contentRaw;
  delete card.titleEn;
  delete card.summaryEn;
  return card;
}

/** 영어 목록 카드(toListCard en). 매체는 id·region 그대로, 한글 매체명은 영문명으로(englishSource). */
function toEnglishListCard(article: ArticleCard): ListCard {
  const card: ListCard & { contentRaw?: string } = {
    ...article,
    source: englishSource({ ...article.source }),
    titleKo: "",
    summaryKo: "",
    titleOriginal: hasHangul(article.titleOriginal) ? "" : article.titleOriginal,
    tags: localeTags(article.tags, "en"),
  };
  delete card.contentRaw;
  if (article.related) card.related = article.related.map(latinRelated);
  return card;
}

/** 묶인 보도 한 건에서 한글이 든 매체명·제목을 비운다(영어 목록 카드 — 개수만 쓴다). */
function latinRelated(r: RelatedCoverage): RelatedCoverage {
  return {
    source: hasHangul(r.source) ? "" : r.source,
    url: r.url,
    title: hasHangul(r.title) ? "" : r.title,
  };
}

/** 목록·지면용 카드 배열(toListCard). 홈·호 페이지가 클라이언트 컴포넌트에 넘기기 전에 쓴다. */
export function toListCards(articles: ArticleCard[], locale: Locale = "ko"): ListCard[] {
  return articles.map((a) => toListCard(a, locale));
}

/**
 * 공개 기사 id → 호 날짜('YYYY-MM-DD', created_at 의 KST 날짜 — `getEditionRefs` 와 같은 기준).
 * 클라이언트 색인을 호 월별 조각으로 나눌 때 쓴다(scripts/lib/indexShards.ts).
 */
export function getIssueDates(conn: DatabaseType = getDb()): Map<number, string> {
  const rows = conn
    .prepare(`SELECT a.id, date(a.created_at, '+9 hours') AS d FROM articles a WHERE ${PUBLISHED}`)
    .all() as { id: number; d: string }[];
  return new Map(rows.map((r) => [r.id, r.d]));
}

/** FTS5 MATCH 표현식 생성: 공백 토큰화 → 각 토큰 prefix("tok"*) → OR 결합. */
function ftsMatchExpr(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => `"${tok.replace(/"/g, '""')}"*`)
    .join(" OR ");
}

/**
 * 키워드 검색(PRD §3.6). 한국어 제목·요약 + 원문(제목·본문) FTS5 매칭 또는 태그명 일치.
 * 소스·태그 필터와 정렬을 함께 적용한다.
 * FTS 구문 오류나 결과 0건(공백 없는 한국어 부분일치 등) 시 LIKE 폴백.
 */
export function searchArticles(opts: SearchOptions, conn: DatabaseType = getDb()): ArticleCard[] {
  const q = (opts.q ?? "").trim();
  if (!q) return [];

  const { clauses, params } = buildFilters(opts);
  const filterSql = clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
  const orderBy = orderByFor(opts.sort);
  const like = `%${q}%`;

  // 1) FTS 경로: title/summary/원문 MATCH OR 태그명 LIKE
  try {
    const match = ftsMatchExpr(q);
    if (match) {
      const rows = conn
        .prepare(
          `${articleSelect(conn)}
            WHERE (a.id IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)
                   OR EXISTS (SELECT 1 FROM article_tags at
                                JOIN tags t ON t.id = at.tag_id
                               WHERE at.article_id = a.id AND t.name LIKE ?))
              ${filterSql}
            ORDER BY ${orderBy}`,
        )
        .all(match, like, ...params) as ArticleRow[];
      if (rows.length > 0) return rows.map(toArticleCard);
    }
  } catch {
    // MATCH 구문 오류 → LIKE 폴백
  }

  // 2) LIKE 폴백: 한국어/원문/태그 부분일치
  const rows = conn
    .prepare(
      `${articleSelect(conn)}
        WHERE (a.title_ko LIKE ? OR a.summary_ko LIKE ?
               OR a.title_original LIKE ? OR a.content_raw LIKE ?
               OR EXISTS (SELECT 1 FROM article_tags at
                            JOIN tags t ON t.id = at.tag_id
                           WHERE at.article_id = a.id AND t.name LIKE ?))
          ${filterSql}
        ORDER BY ${orderBy}`,
    )
    .all(like, like, like, like, like, ...params) as ArticleRow[];
  return rows.map(toArticleCard);
}

/** 기사가 있는 소스 목록(필터 칩 옵션용). 기사 수 내림차순. */
export function getSourcesWithCounts(
  conn: DatabaseType = getDb(),
): { id: string; name: string; count: number }[] {
  return conn
    .prepare(
      `SELECT s.id, s.name, COUNT(a.id) AS count
         FROM sources s
         JOIN articles a ON a.source_id = s.id
        WHERE ${PUBLISHED}
        GROUP BY s.id
        ORDER BY count DESC`,
    )
    .all() as { id: string; name: string; count: number }[];
}

/** 사용 빈도 상위 태그 목록(필터 칩 옵션용). */
export function getActiveTags(limit = 20, conn: DatabaseType = getDb()): string[] {
  const rows = conn
    .prepare(
      `SELECT t.name, COUNT(at.article_id) AS count
         FROM tags t
         JOIN article_tags at ON at.tag_id = t.id
        GROUP BY t.id
        ORDER BY count DESC
        LIMIT ?`,
    )
    .all(limit) as { name: string }[];
  return rows.map((r) => r.name);
}

/** 최근 배치 실행 이력(대시보드용). 최신 실행순. */
export function getRecentRuns(limit = 20, conn: DatabaseType = getDb()): RunRow[] {
  return conn
    .prepare(`SELECT * FROM collection_runs ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as RunRow[];
}

/**
 * PRD §9 KPI 집계(최근 `days`일). collection_runs/articles 에서 자동 산출 가능한
 * 지표만 다룬다. LCP·한국어 품질은 수동 측정(README 참조).
 * - successRate: status ∈ {success, partial} 비율 (partial 도 카드를 생산하므로 성공으로 집계)
 * - totalCost/maxDailyCost: 기간 합계 / 단일 UTC일 최대 비용(일 ≤ $0.30 점검)
 * - avgDailyNew: 실행이 있던 UTC일 평균 신규 카드 수(≥ 30 점검)
 * - duplicateKeys: 중복 dedup_key 개수(UNIQUE 제약상 항상 0이어야 함)
 */
export interface KpiSummary {
  days: number;
  runs: number;
  successRate: number; // 0~1, 실행 0건이면 0
  totalCost: number;
  maxDailyCost: number;
  avgDailyNew: number;
  duplicateKeys: number;
}

export function getKpiSummary(days = 30, conn: DatabaseType = getDb()): KpiSummary {
  // SQLite datetime 비교용 경계(ISO8601 문자열 사전식 비교와 호환).
  const since = `-${days} days`;

  const agg = conn
    .prepare(
      `SELECT
         COUNT(*)                                                   AS runs,
         SUM(CASE WHEN status IN ('success','partial') THEN 1 ELSE 0 END) AS ok,
         COALESCE(SUM(est_cost_usd), 0)                             AS total_cost
       FROM collection_runs
       WHERE started_at >= datetime('now', ?)`,
    )
    .get(since) as { runs: number; ok: number | null; total_cost: number };

  // UTC 일자별 비용/신규 — 최대 일비용, 일평균 신규.
  const daily = conn
    .prepare(
      `SELECT date(started_at)         AS day,
              SUM(est_cost_usd)         AS cost,
              SUM(items_new)            AS new_cards
         FROM collection_runs
        WHERE started_at >= datetime('now', ?)
        GROUP BY day`,
    )
    .all(since) as { day: string; cost: number; new_cards: number }[];

  const maxDailyCost = daily.reduce((m, d) => Math.max(m, d.cost ?? 0), 0);
  const avgDailyNew = daily.length
    ? daily.reduce((s, d) => s + (d.new_cards ?? 0), 0) / daily.length
    : 0;

  const dup = conn
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT dedup_key FROM articles GROUP BY dedup_key HAVING COUNT(*) > 1
       )`,
    )
    .get() as { n: number };

  return {
    days,
    runs: agg.runs,
    successRate: agg.runs ? (agg.ok ?? 0) / agg.runs : 0,
    totalCost: agg.total_cost,
    maxDailyCost,
    avgDailyNew,
    duplicateKeys: dup.n,
  };
}

/** 영어판 KPI 의 최근 회차 줄 수(admin 패널·`npm run kpi`). */
export const ENGLISH_KPI_RECENT_RUNS = 7;

/** SQLite datetime() 키('YYYY-MM-DD HH:MM:SS', UTC) → ISO8601 UTC. */
const sqliteKeyToIso = (key: string) => `${key.replace(" ", "T")}Z`;

/**
 * 영어판 KPI(docs/english-version-plan.md Phase 1-4) — 게재 대비 영어 보유 비율(전체·한국 매체·해외)과 회차 notes 의
 * 기각 사유·한국어 숫자 경고. 정의·"영어판 이전" 규칙은 src/lib/englishKpi.ts 머리 주석.
 * - 커버리지는 지금 DB 상태다(백필이 채우면 오른다). 회차 notes 값은 그 회차 당시 검사 결과다.
 * - 회차의 게재 기사 = created_at 이 그 회차 시작 이상·다음 회차 시작 미만(재심사 게재도 created_at 을 옮긴다).
 * - 영어 컬럼이 없는 옛 DB(마이그레이션 전)는 hasColumns=false·영어판 이전으로 돌려준다. 시각 비교는 datetime() 으로
 *   형식(`…T…Z` vs `YYYY-MM-DD HH:MM:SS`)을 맞춘다.
 */
export function getEnglishKpi(
  recentRuns = ENGLISH_KPI_RECENT_RUNS,
  conn: DatabaseType = getDb(),
): EnglishKpi {
  const articleCols = tableColumns(conn, "articles");
  const hasColumns = articleCols.has("title_en") && articleCols.has("summary_en");
  const region = tableColumns(conn, "sources").has("region") ? "s.region" : "NULL";
  const hasEnglish = `COALESCE(a.title_en, '') <> '' AND COALESCE(a.summary_en, '') <> ''`;

  const { n: allPublished } = conn
    .prepare(`SELECT COUNT(*) AS n FROM articles a WHERE ${PUBLISHED}`)
    .get() as { n: number };

  const runs = (
    conn
      .prepare(
        `SELECT id, started_at AS startedAt, datetime(started_at) AS startedKey, status, notes,
                est_cost_usd AS costUsd, llm_calls AS llmCalls
           FROM collection_runs ORDER BY datetime(started_at) ASC, id ASC`,
      )
      .all() as {
      id: number;
      startedAt: string;
      startedKey: string | null;
      status: string;
      notes: string | null;
      costUsd: number;
      llmCalls: number;
    }[]
  ).map((r) => ({ ...r, english: parseEnglishNotes(r.notes) }));

  const empty = (): EnglishCoverage => ({ published: 0, english: 0 });
  const firstRunKey = runs.find((r) => r.english && r.startedKey)?.startedKey ?? null;
  const firstArticleKey = hasColumns
    ? ((
        conn
          .prepare(
            `SELECT MIN(datetime(a.created_at)) AS k FROM articles a WHERE ${PUBLISHED} AND ${hasEnglish}`,
          )
          .get() as { k: string | null }
      ).k ?? null)
    : null;
  const keys = [firstRunKey, firstArticleKey].filter((k): k is string => k !== null).sort();
  const sinceKey = keys[0] ?? null;

  if (sinceKey === null) {
    return {
      hasColumns,
      since: null,
      allPublished,
      overall: empty(),
      korea: empty(),
      overseas: empty(),
      checks: sumEnglishNotes([]),
      runs: [],
      cost: sumEnglishRunCost([]),
    };
  }

  const articles = conn
    .prepare(
      `SELECT datetime(a.created_at) AS createdKey, ${region} AS region,
              ${hasColumns ? `CASE WHEN ${hasEnglish} THEN 1 ELSE 0 END` : "0"} AS en
         FROM articles a JOIN sources s ON s.id = a.source_id
        WHERE ${PUBLISHED} AND datetime(a.created_at) >= ?`,
    )
    .all(sinceKey) as { createdKey: string; region: string | null; en: number }[];

  const overall = empty();
  const korea = empty();
  const overseas = empty();
  for (const a of articles) {
    for (const c of [overall, a.region === "kr" ? korea : overseas]) {
      c.published += 1;
      c.english += a.en;
    }
  }

  // 회차 창 = 시작 ~ 다음 회차 시작. 시작 시각이 든 창의 회차부터 영어판 회차로 친다(백필 기사가 시작을 정해도 그 회차 포함).
  const timed = runs.filter((r): r is typeof r & { startedKey: string } => r.startedKey !== null);
  const windows = timed.map((r, i) => ({ ...r, to: timed[i + 1]?.startedKey ?? null }));
  const eraRuns = windows.filter((r) => r.to === null || r.to > sinceKey);
  const recent = recentRuns > 0 ? eraRuns.slice(-recentRuns).reverse() : [];

  return {
    hasColumns,
    since: sqliteKeyToIso(sinceKey),
    allPublished,
    overall,
    korea,
    overseas,
    checks: sumEnglishNotes(eraRuns.map((r) => r.english)),
    cost: sumEnglishRunCost(eraRuns.map((r) => ({ notes: r.english, costUsd: r.costUsd }))),
    runs: recent.map((r) => {
      const coverage = empty();
      for (const a of articles) {
        if (a.createdKey < r.startedKey || (r.to !== null && a.createdKey >= r.to)) continue;
        coverage.published += 1;
        coverage.english += a.en;
      }
      return {
        id: r.id,
        startedAt: r.startedAt,
        status: r.status,
        notes: r.english,
        coverage,
        costUsd: r.costUsd,
        llmCalls: r.llmCalls,
      };
    }),
  };
}

/**
 * 소스 헬스(src/lib/sourceHealth.ts): 최근 회차 notes 의 소스별 결과로 연속 실패·연속 0건을 판정한다.
 * `sources` 는 판정 대상 목록(sources.json — 비활성 포함, 비활성은 개수만 센다).
 * 창을 넘긴 연속("30+회")을 알 수 있게 한 회차 더 읽는다. 실패 회차도 수집 단계 줄이 있으면 포함한다.
 */
export function getSourceHealth(
  sources: HealthSourceInput[],
  conn: DatabaseType = getDb(),
): SourceHealthReport {
  const runs = conn
    .prepare(
      `SELECT id, started_at AS startedAt, notes FROM collection_runs
        ORDER BY started_at DESC LIMIT ?`,
    )
    .all(SOURCE_HEALTH_RULES.windowRuns + 1) as {
    id: number;
    startedAt: string;
    notes: string | null;
  }[];
  return assessSourceHealth(sources, runs);
}

/** 마스트헤드 발행 정보: 호수 = 실패를 제외한 배치 실행 수, 발행 시각 = 마지막 실행 시작 시각. */
export interface EditionInfo {
  issueNo: number;
  publishedAt: string | null;
}

/**
 * 호 고정 링크(`/edition/[date]`) 단위. 실패 아닌 수집 실행 1회 = 1호로
 * KST 날짜마다 그날 마지막 호를 그 날짜의 지면으로 삼는다.
 */
export interface EditionRef extends EditionInfo {
  /** KST 날짜 'YYYY-MM-DD' — 경로 키. */
  date: string;
  publishedAt: string;
  /** 지면 마감 = 다음 날 00:00 KST(UTC ISO). 이 시각 전에 수집된 기사로 그날 지면을 재구성한다. */
  cutoff: string;
}

const DAY_MS = 24 * 3600 * 1000;

/** KST 날짜 'YYYY-MM-DD' → 그날의 [00:00 KST, 다음 날 00:00 KST) 경계(UTC ISO). */
function kstDayBounds(dateKey: string): { start: string; end: string } {
  const start = Date.parse(`${dateKey}T00:00:00+09:00`);
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + DAY_MS).toISOString(),
  };
}

/**
 * 호 목록(오래된 순). 공개 기사가 1건 이상 있는 KST 날짜만 담는다 — 가공 없이 수집만 한 날의
 * 빈 호는 지면·OG·이전/다음 이동에서 숨긴다. 호수는 숨긴 호까지 센 전체 실행 순번을 그대로 쓴다(번호 건너뜀 허용).
 *
 * 호 날짜·발행 시각은 실행이 기사를 저장한 시각(finished_at, 없으면 started_at)으로 정한다.
 * 23:50 KST 에 시작해 00:10 에 저장을 마친 수동 실행도 기사 created_at 과 같은 날로 묶이게 하기 위해서다.
 */
export function getEditionRefs(conn: DatabaseType = getDb()): EditionRef[] {
  const runs = conn
    .prepare(
      `SELECT COALESCE(finished_at, started_at) AS saved_at FROM collection_runs
        WHERE status != 'failed' ORDER BY started_at`,
    )
    .all() as { saved_at: string }[];
  const withArticles = new Set(
    (
      conn
        .prepare(
          `SELECT date(a.created_at, '+9 hours') AS d FROM articles a
            WHERE ${PUBLISHED} GROUP BY d`,
        )
        .all() as { d: string }[]
    ).map((r) => r.d),
  );

  const byDate = new Map<string, EditionRef>();
  runs.forEach((run, i) => {
    const date = kstDateKey(run.saved_at);
    if (!withArticles.has(date)) return;
    const cutoff = kstDayBounds(date).end;
    byDate.set(date, { date, issueNo: i + 1, publishedAt: run.saved_at, cutoff });
  });
  return [...byDate.values()];
}

/** 홈 1면의 "최신 호" = 호 목록의 마지막 값(기사가 있는 호만 목록에 있다). 호가 없으면 null. */
export function getLatestEditionRef(conn: DatabaseType = getDb()): EditionRef | null {
  return getEditionRefs(conn).at(-1) ?? null;
}

/** 세 줄 요약 저장값 한 줄(collection_runs.brief_json 원소) — id 는 articles.id. 쓰는 쪽은 scripts/lib/brief.ts. */
export interface StoredBriefLine {
  id: number;
  text: string;
}

/** brief_json → 줄 목록. 손상됐거나 모양이 다른 원소는 버린다(빈 배열 = 요약 없음). */
export function parseBriefJson(json: string | null): StoredBriefLine[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((line: unknown) => {
      const { id, text } = (line ?? {}) as { id?: unknown; text?: unknown };
      return Number.isInteger(id) && typeof text === "string" && text.trim()
        ? [{ id: id as number, text: text.trim() }]
        : [];
    });
  } catch {
    return [];
  }
}

/**
 * 호의 세 줄 요약 후보: 그 KST 날짜에 저장을 마친(getEditionRefs 와 같은 saved_at 기준) 실패 아닌 실행의
 * brief_json, **최신 실행 먼저**. 같은 날 재수집이 있으면 후보가 여럿이다 — 고르는 일은 edition.ts selectIssueBrief.
 * brief_json 컬럼은 ensureSchema(수집·prebuild)가 더한다. 그 전 DB 이거나 읽기에 실패하면 빈 배열(요약 없이 렌더).
 */
export function getIssueBriefs(dateKey: string, conn: DatabaseType = getDb()): StoredBriefLine[][] {
  try {
    const cols = conn.prepare("PRAGMA table_info(collection_runs)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "brief_json")) return [];
    const rows = conn
      .prepare(
        `SELECT COALESCE(finished_at, started_at) AS saved_at, brief_json FROM collection_runs
          WHERE status != 'failed' AND brief_json IS NOT NULL ORDER BY started_at DESC, id DESC`,
      )
      .all() as { saved_at: string; brief_json: string }[];
    return rows
      .filter((r) => kstDateKey(r.saved_at) === dateKey)
      .map((r) => parseBriefJson(r.brief_json))
      .filter((lines) => lines.length > 0);
  } catch (err) {
    console.warn(`[db] 세 줄 요약 읽기 실패(${dateKey}) — 요약 없이 렌더:`, err);
    return [];
  }
}

/**
 * 호 기사: dateKey(KST 'YYYY-MM-DD') 하루 [00:00 KST, 다음 날 00:00 KST) 안에 **수집된** 공개 기사,
 * 중요도 순(동점 시 화제·최신 게시순). 게시 시각(published_at)이 아니라 수집 시각(created_at)으로 자른다.
 */
export function getIssueArticles(dateKey: string, conn: DatabaseType = getDb()): ArticleCard[] {
  const { start, end } = kstDayBounds(dateKey);
  const rows = conn
    .prepare(
      `${articleSelect(conn)} WHERE ${PUBLISHED}
          AND julianday(a.created_at) >= julianday(?) AND julianday(a.created_at) < julianday(?)
        ORDER BY a.importance DESC, a.trending_score DESC, a.published_at DESC`,
    )
    .all(start, end) as ArticleRow[];
  return rows.map(toArticleCard);
}

/**
 * 주간 레이더 후보(src/lib/weeklyRadar.ts): 일요일 dateKey 로 끝나는 KST 월~일 7일 동안 **수집된** 공개 비뉴스
 * (저장소·모델·논문)와 각 기사의 호 날짜(created_at 의 KST 날짜). 형식은 sources.format 이라
 * 컬럼이 없는 옛 DB(전부 뉴스로 읽힌다)에서는 빈 목록이다. 일요일이 아니면 빈 목록.
 * 순서는 고정만 해 둔다 — 선정·정렬은 buildWeeklyRadar 몫.
 */
export function getWeekRadarCandidates(
  sundayKey: string,
  conn: DatabaseType = getDb(),
): WeeklyCandidate[] {
  const week = weekWindow(sundayKey);
  if (!week || !hasSourceFormat(conn)) return [];
  const start = kstDayBounds(week.start).start;
  const end = kstDayBounds(week.end).end;
  const rows = conn
    .prepare(
      `${articleSelect(conn)} WHERE ${PUBLISHED} AND s.format IN ('oss', 'model', 'paper')
          AND julianday(a.created_at) >= julianday(?) AND julianday(a.created_at) < julianday(?)
        ORDER BY a.id`,
    )
    .all(start, end) as ArticleRow[];
  return rows.map((row) => ({
    article: toArticleCard(row),
    // 호 날짜 = 수집 시각의 KST 날짜(getEditionRefs·getIssueArticles 와 같은 기준).
    issueDate: kstDateKey(row.collected_at),
  }));
}

/** 호 재구성용: cutoff(UTC ISO) 전에 수집된 공개 기사(getFeed 기본 정렬). */
export function getArticlesUntil(cutoff: string, conn: DatabaseType = getDb()): ArticleCard[] {
  const rows = conn
    .prepare(
      `${articleSelect(conn)} WHERE ${PUBLISHED} AND julianday(a.created_at) < julianday(?)
        ORDER BY ${orderByFor(undefined)}`,
    )
    .all(cutoff) as ArticleRow[];
  return rows.map(toArticleCard);
}

/**
 * 최근 수집분(public/latest.json·한국어 RSS): since(UTC ISO) 이후 **수집된** 공개 기사, 중요도 순.
 * 게시 시각이 아니라 수집 시각으로 자른다 — GitHub Trending 처럼 게시 시각이 오래된 항목도 그날 수집분이다.
 * 영어 제목·요약은 영어판에 실린 기사(`hasEnglish`)에만 싣고, 없으면 키를 두지 않는다(`engagement` 와 같은 규칙).
 */
export function getArticlesCollectedSince(
  since: string,
  conn: DatabaseType = getDb(),
): LatestFeedEntry[] {
  const rows = conn
    .prepare(
      `${articleSelect(conn)} WHERE ${PUBLISHED} AND julianday(a.created_at) >= julianday(?)
        ORDER BY ${orderByFor("importance")}`,
    )
    .all(since) as ArticleRow[];
  return rows.map((row) => {
    const card = toArticleCard(row);
    const entry = toListCard(card);
    return {
      ...entry,
      ...(hasEnglish(card) ? { titleEn: card.titleEn, summaryEn: card.summaryEn } : {}),
      categoryLabel: categoryLabel(entry.category),
      collectedAt: row.collected_at,
    };
  });
}

/**
 * 영어판 RSS(/en/feed.xml)용 최근 수집분 — `getArticlesCollectedSince` 와 같은 창·순서에서 영어판에 실을 기사(`hasEnglish`)만,
 * 영어 목록 카드(`toListCard(…, "en")` — 한국어 가공 텍스트·한글 태그·한글 매체명을 뗀다) + 수집 시각.
 */
export function getEnglishArticlesCollectedSince(
  since: string,
  conn: DatabaseType = getDb(),
): (ListCard & { collectedAt: string })[] {
  const rows = conn
    .prepare(
      `${articleSelect(conn)} WHERE ${PUBLISHED} AND julianday(a.created_at) >= julianday(?)
        ORDER BY ${orderByFor("importance")}`,
    )
    .all(since) as ArticleRow[];
  return rows.flatMap((row) => {
    const card = toArticleCard(row);
    return hasEnglish(card) ? [{ ...toListCard(card, "en"), collectedAt: row.collected_at }] : [];
  });
}

/** 공개 기사 중 최신 게시 시각(기사 썸네일 생성 기간의 기준). 기사가 없으면 null. */
export function getLatestPublishedAt(conn: DatabaseType = getDb()): string | null {
  const row = conn
    .prepare(`SELECT MAX(a.published_at) AS latest FROM articles a WHERE ${PUBLISHED}`)
    .get() as {
    latest: string | null;
  };
  return row.latest;
}

/** 단건 상세 조회. 없으면 null. */
export function getArticle(id: number): ArticleCard | null {
  const conn = getDb();
  const row = conn.prepare(`${articleSelect(conn)} WHERE a.id = ? AND ${PUBLISHED}`).get(id) as
    | ArticleRow
    | undefined;
  return row ? toArticleCard(row) : null;
}

/**
 * articles.follow_up_of 컬럼 유무. ensureSchema(수집·prebuild)가 추가하지만, 그 전의 DB 에서도 상세 페이지가
 * 깨지지 않게 확인한다(hasSourceFormat 과 같은 이유) — 없으면 타임라인이 비어 섹션이 그려지지 않는다.
 */
function hasFollowUpColumn(conn: DatabaseType): boolean {
  const cols = conn.prepare("PRAGMA table_info(articles)").all() as { name: string }[];
  return cols.some((c) => c.name === "follow_up_of");
}

/** 사건 타임라인에 담는 최대 기사 수(보고 있는 기사 포함). 가까운 연결부터 담는다. */
export const FOLLOW_UP_THREAD_LIMIT = 6;

/**
 * 상세 페이지 사건 타임라인: 후속 보도 연결(follow_up_of)로 이어진 같은 사건의 공개 기사들 + 보고 있는 기사.
 * 연결을 양방향으로 따라간다 — 이전 보도(이 기사의 follow_up_of, 그 이전 보도의 이전 보도 …)와 후속 보도(이 기사를
 * follow_up_of 로 가리키는 기사들, 그 후속 …), 같은 이전 보도를 가리키는 다른 후속 보도까지. 가까운 연결부터
 * 넓혀 가며 `limit` 건에서 멈추고(방문 집합이라 순환해도 끝난다), 호 날짜(created_at) 순으로 돌려준다.
 * 비공개(summary_ko NULL) 기사는 건너뛰고 그 너머로도 넘어가지 않는다. 연결이 없으면 빈 배열.
 */
export function getFollowUpThread(
  id: number,
  limit = FOLLOW_UP_THREAD_LIMIT,
  conn: DatabaseType = getDb(),
): FollowUpEntry[] {
  if (!hasFollowUpColumn(conn)) return [];
  const node = conn.prepare(
    `SELECT a.id, a.follow_up_of AS prev FROM articles a WHERE a.id = ? AND ${PUBLISHED}`,
  );
  const children = conn.prepare(
    `SELECT a.id FROM articles a WHERE a.follow_up_of = ? AND ${PUBLISHED} ORDER BY a.created_at, a.id`,
  );
  const start = node.get(id) as { id: number; prev: number | null } | undefined;
  if (!start) return [];

  const seen = new Set<number>([id]);
  const queue: { id: number; prev: number | null }[] = [start];
  while (queue.length > 0 && seen.size < limit) {
    const cur = queue.shift()!;
    const next = [
      ...(cur.prev !== null ? [cur.prev] : []),
      ...(children.all(cur.id) as { id: number }[]).map((r) => r.id),
    ];
    for (const n of next) {
      if (seen.size >= limit) break;
      if (seen.has(n)) continue;
      const row = node.get(n) as { id: number; prev: number | null } | undefined;
      if (!row) continue; // 비공개·없는 기사 — 그 너머로 가지 않는다
      seen.add(n);
      queue.push(row);
    }
  }
  if (seen.size < 2) return [];

  const ids = [...seen];
  // 영어판 필드(영어 제목·요약, 매체 영문명)는 나중에 추가된 컬럼 — 옛 DB 에서는 NULL 로 읽는다(articleSelect 와 같은 이유).
  const articleCols = tableColumns(conn, "articles");
  const a = (col: string) => (articleCols.has(col) ? `a.${col}` : "NULL");
  const nameEn = tableColumns(conn, "sources").has("name_en") ? "s.name_en" : "NULL";
  const rows = conn
    .prepare(
      `SELECT a.id, a.title_ko, a.title_original, s.name AS source_name,
              ${a("title_en")} AS title_en, ${a("summary_en")} AS summary_en, ${nameEn} AS source_name_en,
              strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) AS issued_at
         FROM articles a JOIN sources s ON s.id = a.source_id
        WHERE a.id IN (${ids.map(() => "?").join(", ")})
        ORDER BY a.created_at, a.id`,
    )
    .all(...ids) as {
    id: number;
    title_ko: string | null;
    title_original: string;
    source_name: string;
    title_en: string | null;
    summary_en: string | null;
    source_name_en: string | null;
    issued_at: string;
  }[];
  const at = rows.findIndex((r) => r.id === id);
  return rows.map((r, i) => {
    const entry: FollowUpEntry = {
      id: r.id,
      titleKo: r.title_ko ?? "",
      titleOriginal: r.title_original,
      sourceName: r.source_name,
      issuedAt: r.issued_at,
      relation: i < at ? "earlier" : i > at ? "later" : "current",
    };
    // 영어 제목은 그 기사가 영어판에 실릴 때(hasEnglish — 영어 제목·요약 둘 다)만 — 영어 타임라인이 이 키로 거른다.
    const en = { titleEn: r.title_en ?? "", summaryEn: r.summary_en ?? "" };
    if (hasEnglish(en)) entry.titleEn = en.titleEn;
    if (r.source_name_en) entry.sourceNameEn = r.source_name_en;
    return entry;
  });
}

/**
 * 매체 표시명 → 영문 매체명(sources.name → name_en, 영문명이 있는 매체만). 묶인 보도(related_json)는 매체를 저장 당시
 * 표시명 문자열로만 갖고 있어서, 영어판 상세가 이름으로 영문명을 찾는다(views/data.ts `loadArticlePage`).
 */
export function getSourceNameEnMap(conn: DatabaseType = getDb()): Map<string, string> {
  if (!tableColumns(conn, "sources").has("name_en")) return new Map();
  const rows = conn
    .prepare(`SELECT name, name_en FROM sources WHERE name_en IS NOT NULL AND name_en != ''`)
    .all() as { name: string; name_en: string }[];
  return new Map(rows.map((r) => [r.name, r.name_en]));
}

/** 사이트맵 항목: 공개 기사 id + 수집 시각(ISO8601 UTC — 우리 페이지가 생긴 시각, 사이트맵 lastmod). */
export function getSitemapArticles(
  conn: DatabaseType = getDb(),
): { id: number; collectedAt: string }[] {
  return conn
    .prepare(
      `SELECT a.id, strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) AS collectedAt
         FROM articles a WHERE ${PUBLISHED} ORDER BY a.id`,
    )
    .all() as { id: number; collectedAt: string }[];
}

/**
 * 전 기사 id 열거(readonly). 정적 export의 `generateStaticParams`에서
 * 상세 페이지 전수 사전 생성용으로만 쓴다(정렬 불필요).
 */
export function getAllArticleIds(conn: DatabaseType = getDb()): number[] {
  const rows = conn.prepare(`SELECT id FROM articles a WHERE ${PUBLISHED}`).all() as {
    id: number;
  }[];
  return rows.map((r) => r.id);
}

/**
 * 영어판에 실을 공개 기사 id(오름차순) — 판정은 `hasEnglish`(영어 제목·요약 둘 다, src/lib/articleText.ts) 하나다.
 * 영어판 경로 목록·호 목록(views/data.ts)이 기사 카드 전체를 읽지 않고 쓴다. 영어 컬럼이 없는 옛 DB 는 빈 배열.
 */
export function getEnglishArticleIds(conn: DatabaseType = getDb()): number[] {
  const cols = tableColumns(conn, "articles");
  if (!cols.has("title_en") || !cols.has("summary_en")) return [];
  const rows = conn
    .prepare(
      `SELECT a.id, a.title_en AS titleEn, a.summary_en AS summaryEn FROM articles a
        WHERE ${PUBLISHED} AND a.title_en IS NOT NULL AND a.summary_en IS NOT NULL ORDER BY a.id`,
    )
    .all() as { id: number; titleEn: string; summaryEn: string }[];
  return rows.filter(hasEnglish).map((r) => r.id);
}

/**
 * 보관 계획(english-version-plan Phase 4-3, 규칙은 src/lib/archive.ts): 전체 페이지로 낼 기사·호와 보관 지면으로 낼 기사·호.
 * 기준은 DB 최신 호(getLatestEditionRef 와 같은 값). 상세·호 라우트의 generateStaticParams 와 빌드 후처리
 * (scripts/lib/archive.ts)가 이 함수 하나를 써서 둘이 어긋나지 않는다.
 */
export function getArchivePlan(conn: DatabaseType = getDb()): ArchivePlan {
  const refs = getEditionRefs(conn);
  return planArchive({
    latestEditionDate: refs.at(-1)?.date ?? null,
    articleIds: getAllArticleIds(conn),
    articleIssueDates: getIssueDates(conn),
    editionDates: refs.map((r) => r.date),
  });
}
