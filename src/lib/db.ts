import Database, { type Database as DatabaseType } from "better-sqlite3";
import { DB_PATH } from "@/lib/paths";
import type { ArticleCard } from "@/lib/types";

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

/**
 * 피드용 기사 목록. 태그·소스 필터와 정렬을 지원한다(PRD §3.5).
 * 기본 정렬은 트렌딩 점수 내림차순(동점 시 최신순),
 * sort=latest 는 게시 최신순, sort=importance 는 중요도 우선.
 */
export function getFeed(opts: FeedOptions = {}, conn: DatabaseType = getDb()): ArticleCard[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (opts.source) {
    where.push("a.source_id = ?");
    params.push(opts.source);
  }
  if (opts.tag) {
    where.push(
      `EXISTS (SELECT 1 FROM article_tags at
                 JOIN tags t ON t.id = at.tag_id
                WHERE at.article_id = a.id AND t.name = ?)`,
    );
    params.push(opts.tag);
  }

  const orderBy =
    opts.sort === "latest"
      ? "a.published_at DESC"
      : opts.sort === "importance"
        ? "a.importance DESC, a.trending_score DESC"
        : "a.trending_score DESC, a.published_at DESC";

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = conn
    .prepare(`${ARTICLE_SELECT} ${whereSql} ORDER BY ${orderBy}`)
    .all(...params) as ArticleRow[];
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

/** 단건 상세 조회. 없으면 null. */
export function getArticle(id: number): ArticleCard | null {
  const row = getDb().prepare(`${ARTICLE_SELECT} WHERE a.id = ?`).get(id) as ArticleRow | undefined;
  return row ? toArticleCard(row) : null;
}
