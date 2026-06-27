// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { buildSearchIndex } from "../../scripts/export-search-index";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/** getFeed.test 패턴 재사용: 소스/기사/태그 + 원문 본문(content_raw) 시드. */
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
    `INSERT INTO articles
       (dedup_key, source_id, url, title_original, content_raw, published_at,
        trending_score, title_ko, summary_ko, category, importance)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  ins.run("k1", "hackernews", "https://a", "A", "본문 전문 매우 긴 내용", "2026-01-03T00:00:00Z", 90, "에이", "요약", "Agents", 4);
  ins.run("k2", "hackernews", "https://b", "B", "또 다른 본문", "2026-01-01T00:00:00Z", 50, "비", "요약2", "Dev Tools", 2);

  db.prepare("INSERT INTO tags (id, name) VALUES (1,'llm'),(2,'agent')").run();
  db.prepare("INSERT INTO article_tags (article_id, tag_id) VALUES (1,1),(1,2),(2,1)").run();
  return db;
}

let db: DatabaseType;
beforeEach(() => {
  db = seed();
});

describe("buildSearchIndex", () => {
  it("전 기사 항목을 반환한다", () => {
    expect(buildSearchIndex(db)).toHaveLength(2);
  });

  it("본문(contentRaw)은 제외하고 카드/정렬 필드는 보존한다", () => {
    const entry = buildSearchIndex(db).find((e) => e.id === 1)!;
    expect("contentRaw" in entry).toBe(false);
    expect(entry).toMatchObject({
      id: 1,
      source: { id: "hackernews", name: "Hacker News" },
      titleKo: "에이",
      summaryKo: "요약",
      titleOriginal: "A",
      category: "Agents",
      tags: ["llm", "agent"],
      trendingScore: 90,
      importance: 4,
      publishedAt: "2026-01-03T00:00:00Z",
    });
  });

  it("직렬화해도 본문이 새지 않는다", () => {
    const json = JSON.stringify(buildSearchIndex(db));
    expect(json).not.toContain("본문 전문");
  });
});
