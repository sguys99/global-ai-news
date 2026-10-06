import Database, { type Database as DatabaseType } from "better-sqlite3";
import { kstDateKey } from "@/lib/labels";
import { DB_PATH } from "@/lib/paths";
import type { ArticleCard, RelatedCoverage, RunRow } from "@/lib/types";

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
  tags: string | null; // GROUP_CONCAT 결과 (',' 구분), 태그 없으면 null
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

/** DB 행 → 렌더 DTO. LLM 미가공(null) 필드는 빈 값으로 채운다. */
function toArticleCard(row: ArticleRow): ArticleCard {
  return {
    id: row.id,
    source: { id: row.source_id, name: row.source_name },
    url: row.url,
    titleKo: row.title_ko ?? "",
    summaryKo: row.summary_ko ?? "",
    titleOriginal: row.title_original,
    contentRaw: row.content_raw ?? undefined,
    category: row.category ?? "",
    tags: row.tags ? row.tags.split(",") : [],
    trendingScore: row.trending_score,
    importance: row.importance ?? 0,
    publishedAt: row.published_at,
    related: parseRelated(row.related_json),
  };
}

const ARTICLE_SELECT = `
  SELECT a.id, a.source_id, s.name AS source_name, a.url,
         a.title_original, a.content_raw, a.published_at, a.trending_score,
         a.title_ko, a.summary_ko, a.category, a.importance, a.related_json,
         (SELECT GROUP_CONCAT(t.name)
            FROM article_tags at
            JOIN tags t ON t.id = at.tag_id
           WHERE at.article_id = a.id) AS tags
  FROM articles a
  JOIN sources s ON s.id = a.source_id
`;

/**
 * 공개 조건: LLM 가공을 마친 기사만 노출한다. 가공 실패 행은 다음 수집에서 재시도되기 전까지
 * 영문 원제·중요도 없음 상태라 지면에 올리지 않는다(scripts/collect.ts 재심사).
 */
const PUBLISHED = "a.summary_ko IS NOT NULL";

/** 피드 필터/정렬 옵션 (URL 쿼리에서 파싱). */
export interface FeedOptions {
  tag?: string;
  source?: string;
  /** 카테고리 데이터 값(예: "Agents"). 홈 섹션의 "전체 보기" 링크가 사용한다. */
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
    clauses.push("a.category = ?");
    params.push(opts.category);
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
    .prepare(`${ARTICLE_SELECT} ${whereSql} ORDER BY ${orderByFor(opts.sort)}`)
    .all(...params) as ArticleRow[];
  return rows.map(toArticleCard);
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
          `${ARTICLE_SELECT}
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
      `${ARTICLE_SELECT}
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

export function getEditionInfo(conn: DatabaseType = getDb()): EditionInfo {
  const row = conn
    .prepare(
      `SELECT COUNT(*) AS n, MAX(started_at) AS last
         FROM collection_runs
        WHERE status != 'failed'`,
    )
    .get() as { n: number; last: string | null };
  return { issueNo: row.n, publishedAt: row.last };
}

/**
 * 호 고정 링크(`/edition/[date]`) 단위. getEditionInfo 와 같은 기준(실패 아닌 수집 실행 1회 = 1호)으로
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

/** 호 목록(오래된 순). 첫 공개 기사가 들어오기 전 날짜(빈 지면)는 뺀다. */
export function getEditionRefs(conn: DatabaseType = getDb()): EditionRef[] {
  const runs = conn
    .prepare(`SELECT started_at FROM collection_runs WHERE status != 'failed' ORDER BY started_at`)
    .all() as { started_at: string }[];
  const { first } = conn
    .prepare(
      `SELECT strftime('%Y-%m-%dT%H:%M:%SZ', MIN(a.created_at)) AS first
         FROM articles a WHERE ${PUBLISHED}`,
    )
    .get() as { first: string | null };
  if (!first) return [];

  const byDate = new Map<string, EditionRef>();
  runs.forEach((run, i) => {
    const date = kstDateKey(run.started_at);
    const cutoff = new Date(Date.parse(`${date}T00:00:00+09:00`) + DAY_MS).toISOString();
    byDate.set(date, { date, issueNo: i + 1, publishedAt: run.started_at, cutoff });
  });
  return [...byDate.values()].filter((e) => Date.parse(e.cutoff) > Date.parse(first));
}

/** 호 재구성용: cutoff(UTC ISO) 전에 수집된 공개 기사(getFeed 기본 정렬). */
export function getArticlesUntil(cutoff: string, conn: DatabaseType = getDb()): ArticleCard[] {
  const rows = conn
    .prepare(
      `${ARTICLE_SELECT} WHERE ${PUBLISHED} AND julianday(a.created_at) < julianday(?)
        ORDER BY ${orderByFor(undefined)}`,
    )
    .all(cutoff) as ArticleRow[];
  return rows.map(toArticleCard);
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
  const row = getDb().prepare(`${ARTICLE_SELECT} WHERE a.id = ? AND ${PUBLISHED}`).get(id) as
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
