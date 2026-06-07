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
}

/** DB 행 → 렌더 DTO. LLM 미가공(null) 필드는 빈 값으로 채운다(Phase 1). */
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
    tags: [], // Phase 1 은 article_tags 미사용
    trendingScore: row.trending_score,
    importance: row.importance ?? 0,
    publishedAt: row.published_at,
  };
}

const ARTICLE_SELECT = `
  SELECT a.id, a.source_id, s.name AS source_name, a.url,
         a.title_original, a.content_raw, a.published_at, a.trending_score,
         a.title_ko, a.summary_ko, a.category, a.importance
  FROM articles a
  JOIN sources s ON s.id = a.source_id
`;

/** 피드용 기사 목록. 트렌딩 점수 내림차순, 동점 시 최신순. */
export function getFeed(): ArticleCard[] {
  const rows = getDb()
    .prepare(
      `${ARTICLE_SELECT} ORDER BY a.trending_score DESC, a.published_at DESC`,
    )
    .all() as ArticleRow[];
  return rows.map(toArticleCard);
}

/** 단건 상세 조회. 없으면 null. */
export function getArticle(id: number): ArticleCard | null {
  const row = getDb()
    .prepare(`${ARTICLE_SELECT} WHERE a.id = ?`)
    .get(id) as ArticleRow | undefined;
  return row ? toArticleCard(row) : null;
}
