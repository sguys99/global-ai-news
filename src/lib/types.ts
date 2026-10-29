/**
 * 도메인 타입. PRD §5.
 * - RawItem: 수집 어댑터 출력(원본). collect.ts 가 소비.
 * - ArticleCard: 피드/검색/상세에서 쓰는 렌더 DTO.
 */
import type { Format } from "@/lib/labels";

/** 소스 종류. configs/sources.json 의 kind 와 동일. */
export type SourceKind = "rss" | "web" | "hn" | "github" | "hf" | "hf_models" | "reddit" | "arxiv";

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
  maxItems?: number; // 1회 신규 후보 상한(scripts/collect.ts)
  format?: Format; // 형식 — 생략 시 news (sources.format 으로 동기화, src/lib/labels.ts FORMATS)
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
  stars?: number; // GitHub (누적 스타)
  stars_today?: number; // GitHub Trending (오늘 늘어난 스타 — Δstars, 트렌딩 페이지에만 있다)
  citations?: number; // arXiv (Semantic Scholar 총 인용수)
  influential?: number; // arXiv (Semantic Scholar 영향력 인용수)
  likes?: number; // HF 모델 (좋아요 누적)
  downloads?: number; // HF 모델 (최근 30일 다운로드)
  hf_trending?: number; // HF 모델 자체 trendingScore — 우리 trending_score(0~100)와 다른 지표
  // ↓ 순위 신호가 아닌 표시용 메타(Phase 6 레이더 메타 줄). 수집 시점에만 얻을 수 있어 함께 저장한다.
  pipeline_tag?: string; // HF 모델 태스크(예: text-generation)
  params?: number; // HF 모델 파라미터 수(safetensors/gguf total)
  language?: string; // GitHub 저장소 주 언어(예: Python)
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
  category: string; // 분야 키(CATEGORIES 중 하나, src/lib/labels.ts)
  format: Format; // 형식(news|oss|model|paper) — 소스 속성(sources.format JOIN)
  tags: string[];
  trendingScore: number; // 0~100
  importance: number; // 1~5
  publishedAt: string; // ISO8601
  /** 같은 사건을 다룬 다른 매체 기사(선별 단계에서 묶음). DB 조회 결과에는 항상 채워진다. */
  related?: RelatedCoverage[];
}

/** 대표 기사에 묶인 다른 매체 보도. */
export interface RelatedCoverage {
  source: string; // 매체 표시명
  url: string;
  title: string; // 원제
}

/**
 * 클라이언트 검색 인덱스(public/search-index.json) 한 항목.
 * 카드 렌더(titleOriginal 폴백·trendingScore 배지)와 정렬(importance)에 필요한 필드를
 * 모두 포함하되, 용량/비용의 주범인 원문 본문(contentRaw)만 제외한다.
 * ArticleCard 와 구조 호환 → ArticleCard 컴포넌트·filterAndSortFeed 를 캐스팅 없이 재사용.
 */
export type SearchIndexEntry = Omit<ArticleCard, "contentRaw">;

/**
 * 최근 수집분 피드(public/latest.json) 한 항목 — 외부 소비용(자랑터 AI 큐레이터 「한입뉴스」).
 * 검색 인덱스 항목에 분야 표시명과 수집 시각을 더한다. 게시 시각(publishedAt)은 GitHub Trending 처럼 오래된 값일 수 있다.
 * `category` 는 분야 키(예: "physical"), `categoryLabel` 은 그 표시명(예: "Physical AI") — 소비자가 표시명 맵을 따로 두지 않게 한다.
 * `format`(news|oss|model|paper)은 ArticleCard 에서 그대로 실린다(필드 추가뿐이라 version 1 유지).
 */
export type LatestFeedEntry = SearchIndexEntry & { categoryLabel: string; collectedAt: string };

/** public/latest.json 전체. `version` 은 모양이 바뀔 때만 올린다(소비자가 검사한다). */
export interface LatestFeed {
  version: 1;
  generatedAt: string; // ISO8601 UTC
  windowDays: number;
  items: LatestFeedEntry[];
}
