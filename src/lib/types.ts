/**
 * 도메인 타입. PRD §5.
 * - RawItem: 수집 어댑터 출력(원본). collect.ts 가 소비.
 * - ArticleCard: 피드/검색/상세에서 쓰는 렌더 DTO.
 */
import type { Category, Format, Region } from "@/lib/labels";

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
  region?: Region; // 지역 — "kr" 만, 생략 = 해외 (sources.region 으로 동기화, src/lib/labels.ts REGIONS)
  nameEn?: string; // 영문 매체명 — name 에 한글이 있을 때만, 생략 시 영어판은 name (sources.name_en)
  topic?: Category; // 주력 분야 힌트(현재 physical 만) — 선별 풀 할당용. 설정 전용(DB 컬럼 없음)
  keywordFilter?: string; // 키워드 사전 필터 목록 이름(configs/keyword-filters.json) — 설정 전용
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
  source: ArticleSource;
  url: string;
  titleKo: string;
  summaryKo: string;
  titleOriginal: string;
  /**
   * 영어 제목·요약(articles.title_en·summary_en, 영어판 Phase 1~). DB 조회 결과에는 항상 있다 — 영어가 없으면 빈 문자열
   * (가공 전 기사·영어 품질 검사 기각). 한국어 지면의 목록용 카드(toListCards)와 공개 JSON 에서는 키째 뺀다(용량).
   */
  titleEn?: string;
  summaryEn?: string;
  contentRaw?: string; // 원문 발췌 (상세 페이지에서 사용)
  category: string; // 분야 키(CATEGORIES 중 하나, src/lib/labels.ts)
  format: Format; // 형식(news|oss|model|paper) — 소스 속성(sources.format JOIN)
  tags: string[];
  trendingScore: number; // 0~100
  importance: number; // 1~5
  publishedAt: string; // ISO8601
  /** 같은 사건을 다룬 다른 매체 기사(선별 단계에서 묶음). DB 조회 결과에는 항상 채워진다. */
  related?: RelatedCoverage[];
  /**
   * 수집 시점 메트릭(articles.engagement_json). 메트릭이 없거나 손상된 기사는 키가 없다.
   * 레이더 메타 줄(★ 스타·♥ likes·▲ upvotes 등)은 src/lib/radarMeta.ts 가 여기서 만든다.
   */
  engagement?: Engagement;
}

/**
 * 카드의 매체. 영문명·지역은 소스 속성(sources.name_en·region JOIN)이라 지난 기사에도 소급된다.
 * 값이 없으면 키를 두지 않는다(해외 매체 대부분) — 목록용 카드·공개 JSON 은 id·name 만 싣는다.
 */
export interface ArticleSource {
  id: string;
  /** 매체 표시명(sources.name, 한국어판). */
  name: string;
  /** 영문 매체명 — 한글 이름 매체만 있다. 영어판은 없으면 name 을 쓴다. */
  nameEn?: string;
  /** "kr" = 한국 매체(Korea Desk·KOREA 표시). 없으면 해외. */
  region?: Region;
}

/** 대표 기사에 묶인 다른 매체 보도. */
export interface RelatedCoverage {
  source: string; // 매체 표시명
  url: string;
  title: string; // 원제
}

/**
 * 상세 페이지 사건 타임라인 한 줄(`getFollowUpThread`). 후속 보도 연결(articles.follow_up_of)로 이어진 같은 사건의
 * 공개 기사들이고, 보고 있는 기사(relation = "current")도 한 줄로 들어간다. 호 날짜 순(오래된 것 먼저).
 */
export interface FollowUpEntry {
  id: number;
  titleKo: string;
  titleOriginal: string;
  /** 매체 표시명(sources.name) — 화면은 shortSourceName 으로 줄인다. */
  sourceName: string;
  /** 게재 시각(created_at, UTC ISO) — 이 시각의 KST 날짜가 호 날짜다. */
  issuedAt: string;
  /** 보고 있는 기사 기준: 앞선 보도 / 이 기사 / 뒤이은 보도. */
  relation: "earlier" | "current" | "later";
}

/**
 * 목록·지면용 카드 한 건(이름은 옛 검색 인덱스 항목에서 왔다) — 홈·호 페이지 카드와 public/latest.json 항목의 바탕.
 * 용량/비용의 주범인 원문 본문(contentRaw)과 영어 제목·요약을 뺀 ArticleCard 다(engagement 는 남긴다).
 * ArticleCard 와 구조 호환 → ArticleCard 컴포넌트·filterAndSortFeed 를 캐스팅 없이 재사용.
 * 만드는 곳은 src/lib/db.ts toListCard 하나다(매체도 id·name 만).
 * 클라이언트 검색 색인은 Phase 4-2 부터 이 모양이 아니라 월별 조각의 행이다(src/lib/indexShards.ts SearchCard).
 */
export type SearchIndexEntry = Omit<ArticleCard, "contentRaw" | "titleEn" | "summaryEn">;

/**
 * 전체 기사 색인(StoryEntry)·피드 필터/정렬에 필요한 필드만 남긴 카드 — 홈 색인의 첫 페이지(정적 HTML)와
 * public/feed-index/ 월별 조각(나머지, "더 보기"·필터 때 fetch — 행으로 줄여 싣고 src/lib/indexShards.ts 가 되돌린다) 한 항목.
 * 원문 URL·원제·묶인 보도 목록·메트릭은 색인이 그리지 않아 뺀다. 원제 폴백은 만들 때 titleKo 에 미리 넣고,
 * 묶인 보도는 바이라인 "외 N곳"에 쓰는 개수(relatedCount, 0 이면 키 생략)만 남긴다.
 * ArticleCard·SearchIndexEntry 도 구조상 이 타입을 만족한다(색인 컴포넌트·필터가 셋을 모두 받는다).
 */
export type IndexCard = Pick<
  ArticleCard,
  | "id"
  | "source"
  | "titleKo"
  | "summaryKo"
  | "category"
  | "format"
  | "tags"
  | "trendingScore"
  | "importance"
  | "publishedAt"
> & {
  /** 같은 사건을 다룬 다른 매체 수(related.length). */
  relatedCount?: number;
};

/**
 * 최근 수집분 피드(public/latest.json) 한 항목 — 외부 소비용(자랑터 AI 큐레이터 「한입뉴스」).
 * 검색 인덱스 항목에 분야 표시명과 수집 시각을 더한다. 게시 시각(publishedAt)은 GitHub Trending 처럼 오래된 값일 수 있다.
 * `category` 는 분야 키(예: "physical"), `categoryLabel` 은 그 표시명(예: "Physical AI") — 소비자가 표시명 맵을 따로 두지 않게 한다.
 * `format`(news|oss|model|paper)·`engagement`(수집 시점 메트릭, 없으면 키 생략)는 ArticleCard 에서 그대로 실린다
 * (선택 필드 추가뿐이라 version 1 유지).
 */
export type LatestFeedEntry = SearchIndexEntry & { categoryLabel: string; collectedAt: string };

/**
 * latest.json 의 세 줄 요약 — 최신 호(그 호 1면 위계 순). lines[].id 는 늘 items[].id 중 하나다.
 * 요약이 없는 호(이 기능 전 지난 호·요약 생략 회차)이거나 최신 호 기사가 창 밖이면 피드의 brief 는 null.
 */
export interface LatestFeedBrief {
  /** 호 날짜(KST 'YYYY-MM-DD'). */
  date: string;
  issueNo: number;
  lines: { id: number; text: string }[];
}

/** public/latest.json 전체. `version` 은 모양이 바뀔 때만 올린다(소비자가 검사한다 — 필드 추가는 1 그대로). */
export interface LatestFeed {
  version: 1;
  generatedAt: string; // ISO8601 UTC
  windowDays: number;
  items: LatestFeedEntry[];
  /** 최신 호 세 줄 요약(2026-11 추가). 없으면 null — 키는 늘 있다. */
  brief: LatestFeedBrief | null;
}
