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

-- 전문 검색 (FTS5, external content — articles와 연동).
-- 한국어 제목·요약 + 원문(제목·본문)을 인덱싱한다(Phase 4: 원문까지 검색).
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title_ko, summary_ko, title_original, content_raw,
  content='articles', content_rowid='id'
);

-- external content 동기화 트리거 (INSERT/DELETE/UPDATE).
-- collect.ts 의 INSERT OR IGNORE 가 실제로 행을 추가할 때만 articles_ai 가 동작한다.
CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title_ko, summary_ko, title_original, content_raw)
  VALUES (new.id, new.title_ko, new.summary_ko, new.title_original, new.content_raw);
END;
CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title_ko, summary_ko, title_original, content_raw)
  VALUES ('delete', old.id, old.title_ko, old.summary_ko, old.title_original, old.content_raw);
END;
CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title_ko, summary_ko, title_original, content_raw)
  VALUES ('delete', old.id, old.title_ko, old.summary_ko, old.title_original, old.content_raw);
  INSERT INTO articles_fts(rowid, title_ko, summary_ko, title_original, content_raw)
  VALUES (new.id, new.title_ko, new.summary_ko, new.title_original, new.content_raw);
END;

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
