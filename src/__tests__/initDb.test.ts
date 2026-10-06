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
});
