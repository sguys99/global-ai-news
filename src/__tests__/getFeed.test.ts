// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { getActiveTags, getEditionInfo, getFeed, getSourcesWithCounts } from "@/lib/db";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/** 스키마를 올린 in-memory DB 에 소스/기사/태그 시드. */
function seed(): DatabaseType {
  const db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));

  db.prepare("INSERT INTO sources (id, name, kind, url, enabled) VALUES (?,?,?,?,1)").run(
    "hackernews",
    "Hacker News",
    "hn",
    "https://hn",
  );
  db.prepare("INSERT INTO sources (id, name, kind, url, enabled) VALUES (?,?,?,?,1)").run(
    "techcrunch_ai",
    "TechCrunch AI",
    "rss",
    "https://tc",
  );

  const ins = db.prepare(
    `INSERT INTO articles
       (dedup_key, source_id, url, title_original, published_at,
        trending_score, title_ko, summary_ko, category, importance)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  // [key, source, url, title, published_at, trending, title_ko, summary, cat, importance]
  ins.run(
    "k1",
    "hackernews",
    "https://a",
    "A",
    "2026-01-03T00:00:00Z",
    90,
    "에이",
    "요약",
    "Agents",
    2,
  );
  ins.run(
    "k2",
    "techcrunch_ai",
    "https://b",
    "B",
    "2026-01-01T00:00:00Z",
    50,
    "비",
    "요약",
    "Dev Tools",
    5,
  );
  ins.run(
    "k3",
    "hackernews",
    "https://c",
    "C",
    "2026-01-02T00:00:00Z",
    70,
    "씨",
    "요약",
    "MLOps",
    3,
  );

  // 태그: llm → A,B / agent → A
  db.prepare("INSERT INTO tags (id, name) VALUES (1,'llm'),(2,'agent')").run();
  db.prepare("INSERT INTO article_tags (article_id, tag_id) VALUES (1,1),(1,2),(2,1)").run();
  return db;
}

let db: DatabaseType;
beforeEach(() => {
  db = seed();
});

describe("getFeed", () => {
  it("기본 정렬은 trending_score 내림차순", () => {
    const ids = getFeed({}, db).map((a) => a.titleOriginal);
    expect(ids).toEqual(["A", "C", "B"]); // 90, 70, 50
  });

  it("sort=latest 는 게시 최신순", () => {
    const ids = getFeed({ sort: "latest" }, db).map((a) => a.titleOriginal);
    expect(ids).toEqual(["A", "C", "B"]); // 01-03, 01-02, 01-01
  });

  it("sort=importance 는 중요도 우선", () => {
    const ids = getFeed({ sort: "importance" }, db).map((a) => a.titleOriginal);
    expect(ids).toEqual(["B", "C", "A"]); // 5, 3, 2
  });

  it("source 필터", () => {
    const rows = getFeed({ source: "hackernews" }, db);
    expect(rows.map((a) => a.titleOriginal).sort()).toEqual(["A", "C"]);
  });

  it("tag 필터", () => {
    const rows = getFeed({ tag: "agent" }, db);
    expect(rows.map((a) => a.titleOriginal)).toEqual(["A"]);
  });

  it("source + tag 동시 필터", () => {
    const rows = getFeed({ source: "techcrunch_ai", tag: "llm" }, db);
    expect(rows.map((a) => a.titleOriginal)).toEqual(["B"]);
  });

  it("category 필터", () => {
    expect(getFeed({ category: "MLOps" }, db).map((a) => a.titleOriginal)).toEqual(["C"]);
  });

  it("category + source 동시 필터 (불일치면 0건)", () => {
    expect(getFeed({ category: "Dev Tools", source: "hackernews" }, db)).toEqual([]);
  });
});

describe("getEditionInfo", () => {
  it("실행 이력이 없으면 호수 0, 발행 시각 null", () => {
    expect(getEditionInfo(db)).toEqual({ issueNo: 0, publishedAt: null });
  });

  it("실패를 제외한 실행 수가 호수, 마지막 실행 시작 시각이 발행 시각", () => {
    const ins = db.prepare("INSERT INTO collection_runs (started_at, status) VALUES (?, ?)");
    ins.run("2026-10-01T21:00:00Z", "success");
    ins.run("2026-10-02T21:00:00Z", "partial");
    ins.run("2026-10-03T21:00:00Z", "failed");
    expect(getEditionInfo(db)).toEqual({ issueNo: 2, publishedAt: "2026-10-02T21:00:00Z" });
  });
});

describe("getSourcesWithCounts / getActiveTags", () => {
  it("기사 수 내림차순 소스", () => {
    const rows = getSourcesWithCounts(db);
    expect(rows[0]).toMatchObject({ id: "hackernews", count: 2 });
  });

  it("빈도 상위 태그", () => {
    expect(getActiveTags(20, db)).toEqual(["llm", "agent"]); // llm 2, agent 1
  });
});
