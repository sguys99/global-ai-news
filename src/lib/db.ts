import Database, { type Database as DatabaseType } from "better-sqlite3";
import { DB_PATH } from "@/lib/paths";
import type { ArticleCard, RunRow } from "@/lib/types";

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
  tags: string | null; // GROUP_CONCAT 결과 (',' 구분), 태그 없으면 null
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
  };
}

const ARTICLE_SELECT = `
  SELECT a.id, a.source_id, s.name AS source_name, a.url,
         a.title_original, a.content_raw, a.published_at, a.trending_score,
         a.title_ko, a.summary_ko, a.category, a.importance,
         (SELECT GROUP_CONCAT(t.name)
            FROM article_tags at
            JOIN tags t ON t.id = at.tag_id
           WHERE at.article_id = a.id) AS tags
  FROM articles a
  JOIN sources s ON s.id = a.source_id
`;

/** 피드 필터/정렬 옵션 (URL 쿼리에서 파싱). */
export interface FeedOptions {
  tag?: string;
  source?: string;
  sort?: "latest" | "importance";
}

/** 검색 옵션 = 피드 필터/정렬 + 키워드 q. */
export interface SearchOptions extends FeedOptions {
  q?: string;
}

/** 소스·태그 필터를 WHERE 절 조각 + 바인딩 파라미터로 구성한다(getFeed/searchArticles 공유). */
function buildFilters(opts: FeedOptions): {
  clauses: string[];
  params: (string | number)[];
} {
  const clauses: string[] = [];
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
export function searchArticles(
  opts: SearchOptions,
  conn: DatabaseType = getDb(),
): ArticleCard[] {
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

/** 단건 상세 조회. 없으면 null. */
export function getArticle(id: number): ArticleCard | null {
  const row = getDb().prepare(`${ARTICLE_SELECT} WHERE a.id = ?`).get(id) as ArticleRow | undefined;
  return row ? toArticleCard(row) : null;
}
