// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { buildLatestFeed, LATEST_WINDOW_DAYS } from "../../scripts/export-latest";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");
const NOW = new Date("2026-10-25T00:00:00Z");

/** exportSearchIndex.test 패턴 재사용 + 수집 시각(created_at)을 창 안·밖으로 나눠 시드. */
function seed(): DatabaseType {
  const db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  db.prepare("INSERT INTO sources (id, name, kind, url, enabled) VALUES (?,?,?,?,1)").run(
    "github_trending",
    "GitHub Trending",
    "rss",
    "https://trending",
  );
  const ins = db.prepare(
    `INSERT INTO articles
       (dedup_key, source_id, url, title_original, content_raw, published_at,
        trending_score, title_ko, summary_ko, category, importance, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  // 게시 시각은 오래됐지만 어제 수집된 저장소 — 창 안
  ins.run(
    "k1",
    "github_trending",
    "https://github.com/a/a",
    "A",
    "본문 전문 매우 긴 내용",
    "2025-01-01T00:00:00Z",
    0,
    "에이",
    "요약",
    "Dev Tools",
    2,
    "2026-10-24 21:10:00",
  );
  // 중요도가 더 높은 창 안 기사 — 앞에 와야 한다
  ins.run(
    "k2",
    "github_trending",
    "https://b",
    "B",
    "또 다른 본문",
    "2026-10-23T00:00:00Z",
    0,
    "비",
    "요약2",
    "Agents",
    5,
    "2026-10-23 21:05:00",
  );
  // 창 밖(4일 전 수집)
  ins.run(
    "k3",
    "github_trending",
    "https://c",
    "C",
    null,
    "2026-10-20T00:00:00Z",
    0,
    "씨",
    "요약3",
    "Agents",
    5,
    "2026-10-20 21:00:00",
  );
  // 가공 실패(요약 없음) — 공개 조건 밖
  ins.run(
    "k4",
    "github_trending",
    "https://d",
    "D",
    null,
    "2026-10-24T00:00:00Z",
    0,
    null,
    null,
    null,
    null,
    "2026-10-24 21:00:00",
  );
  return db;
}

let db: DatabaseType;
beforeEach(() => {
  db = seed();
});

describe("buildLatestFeed", () => {
  it("수집 시각 기준 최근 창 안의 공개 기사만 담는다", () => {
    const feed = buildLatestFeed(NOW, db);
    expect(feed.items.map((e) => e.id)).toEqual([2, 1]);
  });

  it("중요도 순으로 정렬하고 수집 시각을 ISO 로 싣는다", () => {
    const [first, second] = buildLatestFeed(NOW, db).items;
    expect(first).toMatchObject({ id: 2, importance: 5, collectedAt: "2026-10-23T21:05:00Z" });
    expect(second).toMatchObject({
      id: 1,
      url: "https://github.com/a/a",
      source: { id: "github_trending", name: "GitHub Trending" },
      publishedAt: "2025-01-01T00:00:00Z",
      collectedAt: "2026-10-24T21:10:00Z",
    });
  });

  it("봉투에 버전·생성 시각·창을 싣고 본문은 내보내지 않는다", () => {
    const feed = buildLatestFeed(NOW, db);
    expect(feed).toMatchObject({
      version: 1,
      generatedAt: NOW.toISOString(),
      windowDays: LATEST_WINDOW_DAYS,
    });
    const json = JSON.stringify(feed);
    expect(json).not.toContain("본문 전문");
    expect(json).not.toContain("contentRaw");
  });
});
