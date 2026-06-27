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

// SQLite 데이터베이스 파일 경로 (수집 배치가 생성, 빌드/런타임은 readonly 조회)
export const DB_PATH = path.join(DATA_DIR, "app.db");

// 클라이언트 검색 인덱스 (export-search-index 가 빌드 직전 생성, /search 가 fetch)
export const SEARCH_INDEX_PATH = path.join(PUBLIC_DIR, "search-index.json");
