/**
 * 도메인 타입. PRD §5.
 * - RawItem: 수집 어댑터 출력(원본). collect.ts 가 소비.
 * - ArticleCard: 피드/검색/상세에서 쓰는 렌더 DTO.
 */

/** 소스 종류. configs/sources.json 의 kind 와 동일. */
export type SourceKind = "rss" | "web" | "hn" | "github" | "hf" | "reddit";

/**
 * 소스 정의 한 건. configs/sources.json 한 항목과 동일.
 * (scripts/lib/collect/rss.ts 의 SourceConfig 와 같은 형태 — 웹 레이어 공용 타입)
 */
export interface SourceConfig {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  enabled: number; // 1=활성, 0=비활성
}

/** collection_runs 한 행(배치 실행 이력). 대시보드에서 사용. */
export interface RunRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  items_collected: number;
  items_new: number;
  llm_calls: number;
  input_tokens: number;
  output_tokens: number;
  est_cost_usd: number;
  status: string; // 'success' | 'partial' | 'failed'
  notes: string | null;
}

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
  contentRaw?: string; // 원문 발췌 (상세 페이지에서 사용)
  category: string; // CATEGORIES 중 하나
  tags: string[];
  trendingScore: number; // 0~100
  importance: number; // 1~5
  publishedAt: string; // ISO8601
}
