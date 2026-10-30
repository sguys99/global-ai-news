// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { getActiveTags, getFeed, getSourcesWithCounts } from "@/lib/db";

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
    "agent",
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
    "oss",
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
    "research",
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
    expect(getFeed({ category: "research" }, db).map((a) => a.titleOriginal)).toEqual(["C"]);
  });

  it("category + source 동시 필터 (불일치면 0건)", () => {
    expect(getFeed({ category: "oss", source: "hackernews" }, db)).toEqual([]);
  });

  it("마이그레이션 전 구 분야 값 행도 새 키로 읽고 같은 분야로 조회한다", () => {
    db.prepare(
      `INSERT INTO articles
         (dedup_key, source_id, url, title_original, published_at,
          trending_score, title_ko, summary_ko, category, importance)
       VALUES ('k4','hackernews','https://d','D','2026-01-04T00:00:00Z',10,'디','요약','MLOps',1)`,
    ).run();
    const oss = getFeed({ category: "oss" }, db);
    expect(oss.map((a) => a.titleOriginal)).toEqual(["B", "D"]);
    expect(oss.every((a) => a.category === "oss")).toBe(true);
    // 구 값으로 물어도 같은 분야
    expect(getFeed({ category: "Dev Tools" }, db).map((a) => a.titleOriginal)).toEqual(["B", "D"]);
  });

  it("형식은 소스 속성(sources.format)을 JOIN 으로 읽는다 — 바꾸면 지난 기사에도 소급, 미정의 값은 news", () => {
    expect(getFeed({}, db).every((a) => a.format === "news")).toBe(true); // 컬럼 기본값
    db.prepare("UPDATE sources SET format = 'paper' WHERE id = 'hackernews'").run();
    db.prepare("UPDATE sources SET format = 'blog' WHERE id = 'techcrunch_ai'").run();
    const bySource = Object.fromEntries(getFeed({}, db).map((a) => [a.source.id, a.format]));
    expect(bySource).toEqual({ hackernews: "paper", techcrunch_ai: "news" });
  });

  it("engagement_json 을 카드 engagement 로 싣는다 — 없거나 손상·비객체 값은 키를 두지 않는다", () => {
    const set = db.prepare("UPDATE articles SET engagement_json = ? WHERE title_original = ?");
    set.run('{"stars":48836,"stars_today":1203,"language":"Python"}', "A");
    set.run("{not json", "B");
    set.run("[1,2]", "C");
    const byTitle = Object.fromEntries(getFeed({}, db).map((a) => [a.titleOriginal, a]));
    expect(byTitle.A.engagement).toEqual({ stars: 48836, stars_today: 1203, language: "Python" });
    expect(byTitle.B).not.toHaveProperty("engagement");
    expect(byTitle.C).not.toHaveProperty("engagement");
    db.prepare("UPDATE articles SET engagement_json = NULL").run();
    expect(getFeed({}, db).some((a) => "engagement" in a)).toBe(false);
  });

  it("format 컬럼이 없는 예전 DB(읽기 전용이라 추가 불가)도 조회가 깨지지 않고 news 로 읽는다", () => {
    db.exec("ALTER TABLE sources DROP COLUMN format");
    const feed = getFeed({}, db);
    expect(feed).toHaveLength(3);
    expect(feed.every((a) => a.format === "news")).toBe(true);
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

describe("공개 조건 · 관련 보도", () => {
  /** 가공 실패(미가공) 행 1건 + 관련 보도가 묶인 기사 1건을 추가한다. */
  function addRows(): void {
    db.prepare(
      `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, trending_score)
       VALUES ('k4', 'hackernews', 'https://d', 'D', '2026-01-04T00:00:00Z', 99)`,
    ).run();
    db.prepare("UPDATE articles SET related_json = ? WHERE dedup_key = 'k1'").run(
      JSON.stringify([{ source: "The Verge", url: "https://v", title: "V" }]),
    );
  }

  it("가공 전(summary_ko 없음) 기사는 피드·소스 집계에 나오지 않는다", () => {
    addRows();
    expect(getFeed({}, db).map((a) => a.titleOriginal)).not.toContain("D");
    expect(getSourcesWithCounts(db)[0]).toMatchObject({ id: "hackernews", count: 2 });
  });

  it("related_json 을 관련 보도 목록으로 매핑, 없으면 빈 목록", () => {
    addRows();
    const byTitle = new Map(getFeed({}, db).map((a) => [a.titleOriginal, a]));
    expect(byTitle.get("A")?.related).toEqual([
      { source: "The Verge", url: "https://v", title: "V" },
    ]);
    expect(byTitle.get("B")?.related).toEqual([]);
  });
});
