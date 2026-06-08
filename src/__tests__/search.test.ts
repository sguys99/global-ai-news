// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { searchArticles } from "@/lib/db";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/**
 * 스키마(FTS 트리거 포함)를 올린 in-memory DB 에 시드.
 * articles INSERT 시 articles_ai 트리거가 articles_fts 를 자동 채운다.
 */
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
  ins.run(
    "k1",
    "hackernews",
    "https://a",
    "Agent Framework Released",
    "details about agents and tools",
    "2026-01-03T00:00:00Z",
    90,
    "에이전트 프레임워크 출시",
    "새로운 LLM 에이전트",
    "Agents",
    4,
  );
  ins.run(
    "k2",
    "hackernews",
    "https://b",
    "Database Optimization Tips",
    "indexing strategies",
    "2026-01-02T00:00:00Z",
    70,
    "데이터베이스 최적화",
    "쿼리 성능 개선",
    "Dev Tools",
    3,
  );
  ins.run(
    "k3",
    "hackernews",
    "https://c",
    "Rust Memory Safety",
    "ownership model details",
    "2026-01-01T00:00:00Z",
    50,
    "",
    "",
    "",
    null,
  );

  // 태그: agent,llm → 1 / database → 2
  db.prepare("INSERT INTO tags (id, name) VALUES (1,'agent'),(2,'llm'),(3,'database')").run();
  db.prepare(
    "INSERT INTO article_tags (article_id, tag_id) VALUES (1,1),(1,2),(2,3)",
  ).run();
  return db;
}

let db: DatabaseType;
beforeEach(() => {
  db = seed();
});

describe("searchArticles", () => {
  it("영문 토큰을 원문 제목에서 매칭", () => {
    const rows = searchArticles({ q: "Agent" }, db);
    expect(rows.map((r) => r.titleOriginal)).toEqual(["Agent Framework Released"]);
  });

  it("한국어 토큰을 title_ko/summary_ko 에서 매칭", () => {
    const rows = searchArticles({ q: "에이전트" }, db);
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it("원문 본문(content_raw)만 가진 기사도 매칭", () => {
    const rows = searchArticles({ q: "ownership" }, db);
    expect(rows.map((r) => r.titleOriginal)).toEqual(["Rust Memory Safety"]);
  });

  it("태그명으로 매칭", () => {
    const rows = searchArticles({ q: "database" }, db);
    expect(rows.map((r) => r.id)).toContain(2);
  });

  it("빈 q 는 빈 배열", () => {
    expect(searchArticles({ q: "" }, db)).toEqual([]);
    expect(searchArticles({ q: "   " }, db)).toEqual([]);
  });

  it("매칭 없으면 빈 배열", () => {
    expect(searchArticles({ q: "존재하지않는키워드xyz" }, db)).toEqual([]);
  });

  it("FTS prefix 로 못 잡는 한국어 부분 문자열은 LIKE 폴백으로 매칭", () => {
    // '레임' 은 '프레임워크' 토큰의 prefix 가 아니므로 FTS 0건 → LIKE %레임% 폴백
    const rows = searchArticles({ q: "레임" }, db);
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it("q + source/tag 필터 결합", () => {
    // '에이전트' 매칭(1) 중 tag=llm 보유한 것만
    const withTag = searchArticles({ q: "에이전트", tag: "llm" }, db);
    expect(withTag.map((r) => r.id)).toEqual([1]);
    // tag=database 는 매칭 결과(1)에 없으므로 빈 결과
    const withOtherTag = searchArticles({ q: "에이전트", tag: "database" }, db);
    expect(withOtherTag).toEqual([]);
  });

  it("여러 건 매칭 시 정렬 옵션(latest) 적용", () => {
    // 'agent' → 기사1, 'database' → 기사2. 게시 최신순이면 [1, 2]
    const rows = searchArticles({ q: "agent database", sort: "latest" }, db);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});
