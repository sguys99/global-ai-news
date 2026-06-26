// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { getAllArticleIds } from "@/lib/db";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/** 스키마를 올린 in-memory DB 에 소스/기사 3건 시드(getFeed.test 패턴 재사용). */
function seed(): DatabaseType {
  const db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  db.prepare("INSERT INTO sources (id, name, kind, url, enabled) VALUES (?,?,?,?,1)").run(
    "hackernews",
    "Hacker News",
    "hn",
    "https://hn",
  );
  const ins = db.prepare(
    `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, trending_score)
     VALUES (?,?,?,?,?,?)`,
  );
  ins.run("k1", "hackernews", "https://a", "A", "2026-01-03T00:00:00Z", 90);
  ins.run("k2", "hackernews", "https://b", "B", "2026-01-01T00:00:00Z", 50);
  ins.run("k3", "hackernews", "https://c", "C", "2026-01-02T00:00:00Z", 70);
  return db;
}

let db: DatabaseType;
beforeEach(() => {
  db = seed();
});

describe("getAllArticleIds", () => {
  it("전 기사 id 를 반환한다", () => {
    expect(getAllArticleIds(db).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("기사가 없으면 빈 배열", () => {
    const empty = new Database(":memory:");
    empty.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    expect(getAllArticleIds(empty)).toEqual([]);
  });
});
