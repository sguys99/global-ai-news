import path from "node:path";

export const REPO_ROOT = process.cwd();

export const CONFIGS_DIR = path.join(REPO_ROOT, "configs");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const DOCS_DIR = path.join(REPO_ROOT, "docs");
export const IMG_DIR = path.join(REPO_ROOT, "img");
export const PUBLIC_DIR = path.join(REPO_ROOT, "public");

export const PROMPTS_DIR = path.join(CONFIGS_DIR, "prompts");

export const RAW_DATA_DIR = path.join(DATA_DIR, "raw");
export const INTERMEDIATE_DATA_DIR = path.join(DATA_DIR, "intermediate");
export const PROCESSED_DATA_DIR = path.join(DATA_DIR, "processed");
// DB 에 쓰지 않는 수집 실행(collect --no-save)의 스냅숏 — 개편 전후 선별 비교용(gitignore, 로컬 전용)
export const EVAL_DIR = path.join(DATA_DIR, "eval");
// HTML 회귀 비교(scripts/html-regress.ts)의 정적 export 산출물·기준선 스냅숏 — 용량이 커서 git·Docker 컨텍스트에서 뺀다
export const REGRESS_DIR = path.join(DATA_DIR, "regress");
// HTML 회귀 비교 대표 페이지 목록(기준선·후보가 같은 페이지를 보도록 고정, 커밋)
export const REGRESS_MANIFEST_PATH = path.join(CONFIGS_DIR, "html-regress-pages.json");

// SQLite 데이터베이스 파일 경로 (수집 배치가 생성, 빌드/런타임은 readonly 조회)
export const DB_PATH = path.join(DATA_DIR, "app.db");

// 클라이언트 검색 인덱스 (export-search-index 가 빌드 직전 생성, /search 가 fetch)
export const SEARCH_INDEX_PATH = path.join(PUBLIC_DIR, "search-index.json");

// 홈 전체 기사 색인 (export-feed-index 가 빌드 직전 생성, 홈이 "더 보기"·필터 때 fetch)
export const FEED_INDEX_PATH = path.join(PUBLIC_DIR, "feed-index.json");

// 최근 수집분 피드 (export-latest 가 빌드 직전 생성 — 외부 소비용, 자랑터 큐레이터가 fetch)
export const LATEST_FEED_PATH = path.join(PUBLIC_DIR, "latest.json");
