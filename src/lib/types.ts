/**
 * 도메인 타입. PRD §5.
 * - RawItem: 수집 어댑터 출력(원본). collect.ts 가 소비.
 * - ArticleCard: 피드/검색/상세에서 쓰는 렌더 DTO.
 */

/** 소스 종류. configs/sources.json 의 kind 와 동일. */
export type SourceKind = "rss" | "web" | "hn" | "github" | "hf" | "reddit";

/** engagement 메트릭(소스마다 일부만 채워짐). articles.engagement_json 으로 직렬화. */
export interface Engagement {
  points?: number; // HN
  ups?: number; // Reddit
  num_comments?: number; // Reddit/HN
  stars?: number; // GitHub
}

/** 수집 원본 한 건 (LLM 가공 전). */
export interface RawItem {
  sourceId: string;
  url: string;
  title: string;
  contentRaw?: string;
  publishedAt: string; // ISO8601 UTC
  engagement?: Engagement;
}

/** 렌더용 기사 카드 DTO. */
export interface ArticleCard {
  id: number;
  source: { id: string; name: string };
  url: string;
  titleKo: string;
  summaryKo: string;
  titleOriginal: string;
  category: string; // CATEGORIES 중 하나
  tags: string[];
  trendingScore: number; // 0~100
  importance: number; // 1~5
  publishedAt: string; // ISO8601
}
