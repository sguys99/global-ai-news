-- Daily AI Brief — SQLite 스키마 (PRD §5)
-- initDb.ts 가 이 파일을 읽어 db.exec() 한다.

PRAGMA foreign_keys = ON;

-- 소스 정의 (Admin이 configs/sources.json 으로 관리, 수집 시 동기화)
CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,            -- 'techcrunch_ai', 'hn', 'reddit_localllama'
  name        TEXT NOT NULL,               -- 표시명
  kind        TEXT NOT NULL,               -- 'rss' | 'web' | 'hn' | 'github' | 'hf' | 'reddit'
  url         TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1   -- 'web'은 MVP에서 0 (수집 Post-MVP)
);

-- 기사 (수집 원본 + LLM 가공 결과 통합)
CREATE TABLE IF NOT EXISTS articles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  dedup_key       TEXT NOT NULL UNIQUE,    -- sha256(normalize(url))
  source_id       TEXT NOT NULL REFERENCES sources(id),
  url             TEXT NOT NULL,
  -- 수집 원본
  title_original  TEXT NOT NULL,
  content_raw     TEXT,
  published_at    TEXT NOT NULL,           -- ISO8601 UTC
  -- engagement / 코드 점수
  engagement_json TEXT,                    -- '{"points":..,"ups":..,"num_comments":..,"stars":..}'
  trending_score  INTEGER NOT NULL DEFAULT 0,  -- 0~100 (코드 산출)
  -- LLM 가공 결과
  title_ko        TEXT,
  summary_ko      TEXT,
  category        TEXT,                    -- CATEGORIES enum
  importance      INTEGER,                 -- 1~5 (LLM 보조)
  -- 메타
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 태그
CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE
);

-- 기사-태그 연결
CREATE TABLE IF NOT EXISTS article_tags (
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

-- 전문 검색 (FTS5, external content — articles와 연동). 동기화 트리거는 Phase 4에서 추가.
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title_ko, summary_ko, content='articles', content_rowid='id'
);

-- 수집 실행 기록 (비용/통계)
CREATE TABLE IF NOT EXISTS collection_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at        TEXT NOT NULL,          -- ISO8601 UTC
  finished_at       TEXT,
  items_collected   INTEGER NOT NULL DEFAULT 0,
  items_new         INTEGER NOT NULL DEFAULT 0,
  llm_calls         INTEGER NOT NULL DEFAULT 0,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  est_cost_usd      REAL    NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL,        -- 'success' | 'partial' | 'failed'
  notes             TEXT                     -- 소스별 실패 요약 등
);
