import Database, { type Database as DatabaseType } from "better-sqlite3";
import {
  categoryAliases,
  categoryLabel,
  kstDateKey,
  normalizeCategory,
  toFormat,
} from "@/lib/labels";
import { DB_PATH } from "@/lib/paths";
import type {
  ArticleCard,
  Engagement,
  LatestFeedEntry,
  RelatedCoverage,
  RunRow,
} from "@/lib/types";

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
  url: string;
  title_original: string;
  content_raw: string | null;
  published_at: string;
  trending_score: number;
  title_ko: string | null;
  summary_ko: string | null;
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

/**
 * DB 행 → 렌더 DTO. LLM 미가공(null) 필드는 빈 값으로 채운다.
 * 분야는 새 키로 정규화한다 — 마이그레이션 전 구 값 행도 섹션·필터에 같은 분야로 잡힌다.
 * 형식은 소스 속성(sources.format)이라 지난 기사에도 그대로 소급된다.
 */
function toArticleCard(row: ArticleRow): ArticleCard {
  const card: ArticleCard = {
    id: row.id,
    source: { id: row.source_id, name: row.source_name },
    url: row.url,
    titleKo: row.title_ko ?? "",
    summaryKo: row.summary_ko ?? "",
    titleOriginal: row.title_original,
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
  const cols = conn.prepare("PRAGMA table_info(sources)").all() as { name: string }[];
  return cols.some((c) => c.name === "format");
}

/** 기사 조회 공통 SELECT. format 컬럼이 없으면 NULL(→ news)로 읽는다. */
function articleSelect(conn: DatabaseType): string {
  const format = hasSourceFormat(conn) ? "s.format" : "NULL";
  return `
  SELECT a.id, a.source_id, s.name AS source_name, ${format} AS source_format, a.url,
         a.title_original, a.content_raw, a.published_at, a.trending_score,
         a.title_ko, a.summary_ko, a.category, a.importance, a.related_json,
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
      : "a.trending_score DESC, a.published_at DESC";
}

/**
 * 피드용 기사 목록. 태그·소스 필터와 정렬을 지원한다(PRD §3.5).
 * 기본 정렬은 트렌딩 점수 내림차순(동점 시 최신순),
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
 * 목록·지면용 카드: 상세 전용 원문 발췌(contentRaw)를 뺀다. 홈·호 페이지는 카드 배열을
 * 클라이언트 컴포넌트에 넘겨 페이지 HTML 에 그대로 실리므로, 빼지 않으면 페이지가 수백 KB
 * 커지고 링크 미리보기 스크랩(카카오톡 등)이 실패할 위험도 커진다.
 */
export function toListCards(articles: ArticleCard[]): ArticleCard[] {
  return articles.map((article) => {
    const card = { ...article };
    delete card.contentRaw;
    return card;
  });
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
 * 최근 수집분(public/latest.json): since(UTC ISO) 이후 **수집된** 공개 기사, 중요도 순.
 * 게시 시각이 아니라 수집 시각으로 자른다 — GitHub Trending 처럼 게시 시각이 오래된 항목도 그날 수집분이다.
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
    const { contentRaw: _contentRaw, ...entry } = toArticleCard(row);
    return {
      ...entry,
      categoryLabel: categoryLabel(entry.category),
      collectedAt: row.collected_at,
    };
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
 * 전 기사 id 열거(readonly). 정적 export의 `generateStaticParams`에서
 * 상세 페이지 전수 사전 생성용으로만 쓴다(정렬 불필요).
 */
export function getAllArticleIds(conn: DatabaseType = getDb()): number[] {
  const rows = conn.prepare(`SELECT id FROM articles a WHERE ${PUBLISHED}`).all() as {
    id: number;
  }[];
  return rows.map((r) => r.id);
}
