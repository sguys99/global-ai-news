// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFeedIndexFile, writeFeedIndex } from "../../scripts/export-feed-index";
import { getFeed } from "@/lib/db";
import { FEED_HEAD_SIZE, INDEX_PAGE_SIZE, buildFeedIndex } from "@/lib/feedIndex";
import { decodeRow, manifestHead, mergeByDefaultOrder } from "@/lib/indexShards";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/** 공개 2건(화제 50·90) + 가공 전 1건. 묶인 보도·메트릭·본문을 함께 시드한다. 1은 1월 호, 2는 2월 호. */
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
        trending_score, title_ko, summary_ko, category, importance, related_json, engagement_json, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
    "2026-01-10 00:00:00",
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
    "2026-02-01 00:00:00",
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
    "2026-02-01 00:00:00",
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
  it("공개 기사만, 호 월별로 나누고 기본 정렬(화제순)으로 합치면 예전 단일 색인과 같다", () => {
    const built = buildFeedIndexFile(db);
    expect(built.manifest.total).toBe(2);
    expect(built.manifest.months.map((m) => m.month)).toEqual(["2026-02", "2026-01"]);
    const merged = mergeByDefaultOrder(
      built.shards.map((s) => s.rows.map((r) => decodeRow(r, built.manifest))),
    );
    expect(merged).toEqual(buildFeedIndex(getFeed({}, db)));
  });

  it("색인 카드 필드만 — 원문 URL·원제·본문·묶음 목록·메트릭은 빠지고 묶음은 개수로", () => {
    const built = buildFeedIndexFile(db);
    const top = decodeRow(built.shards[0].rows[0], built.manifest);
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
    expect(built.shards[0].rows[0]).toHaveLength(10); // 원제 칸 없음(검색 색인만)
  });

  it("색인 머리 = 기본 정렬 첫 페이지 다음 FEED_HEAD_SIZE 건(목록에 싣는다)", () => {
    const ins = db.prepare(
      `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, trending_score,
         title_ko, summary_ko, category, importance, created_at)
       VALUES (?, 'hackernews', ?, 'T', '2026-01-05T00:00:00Z', ?, '제목', '요약', 'llm', 3, '2026-01-20 00:00:00')`,
    );
    for (let i = 0; i < 200; i++) ins.run(`m${i}`, `https://m/${i}`, i % 7);
    const built = buildFeedIndexFile(db);
    const all = buildFeedIndex(getFeed({}, db));
    expect(manifestHead(built.manifest)).toEqual(
      all.slice(INDEX_PAGE_SIZE, INDEX_PAGE_SIZE + FEED_HEAD_SIZE),
    );
  });

  it("파일로 쓰면 <dir>/ko/ 목록·조각이고 본문·URL 이 새지 않는다", () => {
    expect(writeFeedIndex(dir, db)).toEqual({ ko: 2, en: 0 });
    expect(readdirSync(path.join(dir, "ko")).sort()).toEqual([
      "2026-01.json",
      "2026-02.json",
      "manifest.json",
    ]);
    const raw = readdirSync(path.join(dir, "ko"))
      .map((f) => readFileSync(path.join(dir, "ko", f), "utf-8"))
      .join("\n");
    expect(raw).not.toContain("본문");
    expect(raw).not.toContain("https://");
    const manifest = JSON.parse(readFileSync(path.join(dir, "ko", "manifest.json"), "utf-8"));
    expect(manifest).toMatchObject({ schema: 1, kind: "feed-index", locale: "ko", head: [] });
  });
});
