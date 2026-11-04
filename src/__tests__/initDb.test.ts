// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureSchema } from "../../scripts/lib/initDb";

const columns = (db: Database.Database, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe("ensureSchema", () => {
  it("related_json 이 없던 기존 DB 에 컬럼과 seen_items 를 추가한다(멱등)", () => {
    const db = new Database(":memory:");
    // 컬럼 추가 이전 형태의 articles
    db.exec(`CREATE TABLE articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, dedup_key TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL, url TEXT NOT NULL, title_original TEXT NOT NULL,
      content_raw TEXT, published_at TEXT NOT NULL, engagement_json TEXT,
      trending_score INTEGER NOT NULL DEFAULT 0, title_ko TEXT, summary_ko TEXT,
      category TEXT, importance INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);

    ensureSchema(db);
    ensureSchema(db);

    expect(columns(db, "articles")).toContain("related_json");
    expect(columns(db, "seen_items")).toEqual(["dedup_key", "seen_at"]);
  });

  it("format 이 없던 기존 sources 에 컬럼을 추가하고 기존 행은 news 로 채운다(멱등)", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE sources (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1)`);
    db.prepare("INSERT INTO sources VALUES ('hackernews','Hacker News','hn','https://hn',1)").run();

    ensureSchema(db);
    ensureSchema(db);

    expect(columns(db, "sources")).toContain("format");
    expect(db.prepare("SELECT format FROM sources").pluck().get()).toBe("news");
  });

  it("영어판 컬럼이 없던 기존 DB 에 articles.title_en·summary_en, sources.region·name_en 을 NULL 로 추가한다(멱등)", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE sources (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, format TEXT NOT NULL DEFAULT 'news')`);
    db.exec(`CREATE TABLE articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, dedup_key TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL, url TEXT NOT NULL, title_original TEXT NOT NULL,
      content_raw TEXT, published_at TEXT NOT NULL, engagement_json TEXT,
      trending_score INTEGER NOT NULL DEFAULT 0, title_ko TEXT, summary_ko TEXT,
      category TEXT, importance INTEGER, related_json TEXT, follow_up_of INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    db.prepare(
      "INSERT INTO sources (id, name, kind, url) VALUES ('aitimes','AI타임스','rss','https://a')",
    ).run();
    db.prepare(
      `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, title_ko)
       VALUES ('k1', 'aitimes', 'https://a/1', 'T', '2026-11-01T00:00:00Z', '제목')`,
    ).run();

    ensureSchema(db);
    ensureSchema(db);

    expect(columns(db, "articles")).toEqual(expect.arrayContaining(["title_en", "summary_en"]));
    expect(columns(db, "sources")).toEqual(expect.arrayContaining(["region", "name_en"]));
    expect(db.prepare("SELECT title_en, summary_en FROM articles").get()).toEqual({
      title_en: null,
      summary_en: null,
    });
    expect(db.prepare("SELECT region, name_en FROM sources").get()).toEqual({
      region: null,
      name_en: null,
    });
    // FTS 트리거는 그대로 동작한다 — 영어 필드는 색인하지 않아 갱신해도 검색어로 잡히지 않는다.
    db.prepare(
      `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, title_ko)
       VALUES ('k2', 'aitimes', 'https://a/2', 'T2', '2026-11-01T00:00:00Z', '에이전트')`,
    ).run();
    db.prepare("UPDATE articles SET title_en = 'Uniqueenglishword' WHERE dedup_key = 'k2'").run();
    const hits = (q: string) =>
      db.prepare("SELECT count(*) FROM articles_fts WHERE articles_fts MATCH ?").pluck().get(q);
    expect(hits("Uniqueenglishword")).toBe(0);
    expect(hits("에이전트")).toBe(1);
  });
});
