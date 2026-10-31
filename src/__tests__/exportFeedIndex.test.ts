// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFeedIndexFile, writeFeedIndex } from "../../scripts/export-feed-index";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/** 공개 2건(화제 50·90) + 가공 전 1건. 묶인 보도·메트릭·본문을 함께 시드한다. */
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
        trending_score, title_ko, summary_ko, category, importance, related_json, engagement_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const related = JSON.stringify([{ source: "Reuters", url: "https://r", title: "R" }]);
  ins.run(
    "k1",
    "hackernews",
    "https://b",
    "B",
    "본문 전문",
    "2026-01-01T00:00:00Z",
    50,
    "비",
    "요약2",
    "oss",
    2,
    null,
    null,
  );
  ins.run(
    "k2",
    "hackernews",
    "https://a",
    "A",
    "본문 전문",
    "2026-01-03T00:00:00Z",
    90,
    "에이",
    "요약",
    "agent",
    4,
    related,
    '{"stars":10}',
  );
  ins.run(
    "k3",
    "hackernews",
    "https://c",
    "C",
    "본문",
    "2026-01-04T00:00:00Z",
    99,
    null,
    null,
    null,
    null,
    null,
    null,
  );
  db.prepare("INSERT INTO tags (id, name) VALUES (1,'llm')").run();
  db.prepare("INSERT INTO article_tags (article_id, tag_id) VALUES (2,1)").run();
  return db;
}

let db: DatabaseType;
let dir: string;
beforeEach(() => {
  db = seed();
  dir = mkdtempSync(path.join(tmpdir(), "feed-index-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("export-feed-index", () => {
  it("공개 기사만, 기본 정렬(화제순)으로 싣는다", () => {
    expect(buildFeedIndexFile(db).map((e) => e.id)).toEqual([2, 1]);
  });

  it("색인 카드 필드만 — 원문 URL·원제·본문·묶음 목록·메트릭은 빠지고 묶음은 개수로", () => {
    const [top] = buildFeedIndexFile(db);
    expect(top).toEqual({
      id: 2,
      source: { id: "hackernews", name: "Hacker News" },
      titleKo: "에이",
      summaryKo: "요약",
      category: "agent",
      format: "news",
      tags: ["llm"],
      trendingScore: 90,
      importance: 4,
      publishedAt: "2026-01-03T00:00:00Z",
      relatedCount: 1,
    });
  });

  it("파일로 쓰면 배열 JSON 이고 본문·URL 이 새지 않는다", () => {
    const out = path.join(dir, "feed-index.json");
    expect(writeFeedIndex(out, db)).toBe(2);
    const raw = readFileSync(out, "utf-8");
    expect(Array.isArray(JSON.parse(raw))).toBe(true);
    expect(raw).not.toContain("본문");
    expect(raw).not.toContain("https://a");
  });
});
