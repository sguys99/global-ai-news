// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSearchIndex, writeSearchIndex } from "../../scripts/export-search-index";
import { decodeRow, type IndexManifest } from "@/lib/indexShards";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/**
 * getFeed.test 패턴 재사용: 소스/기사/태그 + 원문 본문(content_raw) 시드.
 * 게재 시각(created_at, UTC)은 KST 호 경계 양옆 — 1은 1월 31일 23:59 KST(1월 호), 2는 2월 1일 00:00 KST(2월 호).
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
        trending_score, title_ko, summary_ko, category, importance, related_json, engagement_json, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const related = JSON.stringify([{ source: "Reuters", url: "https://r", title: "R" }]);
  ins.run(
    "k1",
    "hackernews",
    "https://a",
    "A",
    "본문 전문 매우 긴 내용",
    "2026-01-03T00:00:00Z",
    90,
    "에이",
    "요약",
    "agent",
    4,
    related,
    '{"stars":10}',
    "2026-01-31 14:59:59",
  );
  ins.run(
    "k2",
    "hackernews",
    "https://b",
    "B",
    "또 다른 본문",
    "2026-01-01T00:00:00Z",
    50,
    "비",
    "요약2",
    "oss",
    2,
    null,
    null,
    "2026-01-31 15:00:00",
  );
  db.prepare("INSERT INTO tags (id, name) VALUES (1,'llm'),(2,'agent')").run();
  db.prepare("INSERT INTO article_tags (article_id, tag_id) VALUES (1,1),(1,2),(2,1)").run();
  return db;
}

let db: DatabaseType;
let dir: string;
beforeEach(() => {
  db = seed();
  dir = mkdtempSync(path.join(tmpdir(), "search-index-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const cardsOf = (built: ReturnType<typeof buildSearchIndex>) =>
  built.shards.flatMap((s) => s.rows.map((r) => decodeRow(r, built.manifest)));

describe("buildSearchIndex — 호 월별 조각", () => {
  it("전 기사를 호 월(created_at KST)로 나눈다 — KST 자정 경계 양옆이 다른 달", () => {
    const built = buildSearchIndex(db);
    expect(built.manifest.total).toBe(2);
    expect(built.manifest.months.map((m) => [m.month, m.count])).toEqual([
      ["2026-02", 1],
      ["2026-01", 1],
    ]);
    expect(built.shards.map((s) => [s.month, s.rows.map((r) => r[0])])).toEqual([
      ["2026-02", [2]],
      ["2026-01", [1]],
    ]);
  });

  it("행을 되돌리면 검색 카드(색인 카드 + 원제) — 본문·URL·묶음 목록·메트릭은 없다", () => {
    const entry = cardsOf(buildSearchIndex(db)).find((e) => e.id === 1)!;
    expect(entry).toEqual({
      id: 1,
      source: { id: "hackernews", name: "Hacker News" },
      titleKo: "에이",
      summaryKo: "요약",
      titleOriginal: "A",
      category: "agent",
      format: "news",
      tags: ["llm", "agent"],
      trendingScore: 90,
      importance: 4,
      publishedAt: "2026-01-03T00:00:00Z",
      relatedCount: 1,
    });
    const json = JSON.stringify(buildSearchIndex(db));
    expect(json).not.toContain("본문 전문");
    expect(json).not.toContain("https://");
    expect(json).not.toContain("Reuters");
    expect(json).not.toContain("stars");
  });

  it("영어판 필드(영어 제목·요약, 매체 영문명·지역)는 한국어 색인에 싣지 않는다", () => {
    db.prepare(
      "UPDATE articles SET title_en = 'English title', summary_en = 'English summary.'",
    ).run();
    db.prepare("UPDATE sources SET region = 'kr', name_en = 'HN English'").run();
    const built = buildSearchIndex(db);
    const entry = cardsOf(built).find((e) => e.id === 1)!;
    expect("titleEn" in entry).toBe(false);
    expect(entry.source).toEqual({ id: "hackernews", name: "Hacker News" });
    const json = JSON.stringify(built);
    expect(json).not.toContain("English");
    expect(json).not.toContain('"region"');
  });
});

describe("buildSearchIndex en — 영어 색인(영어판 Phase 5-2)", () => {
  const HANGUL = /[\uac00-\ud7af]/;

  /** 기사 1 = 한국 매체(한국어 원제·한글 태그 포함)의 영어 기사, 기사 2 = 영어 없음. */
  function englishSeed() {
    db.prepare(
      "UPDATE sources SET name = 'AI타임스', name_en = 'AI Times', region = 'kr' WHERE id = 'hackernews'",
    ).run();
    db.prepare(
      "UPDATE articles SET title_en = 'English A', summary_en = 'English summary A.', title_original = '한국어 원제' WHERE id = 1",
    ).run();
    db.prepare("INSERT INTO tags (id, name) VALUES (3, '에이전트')").run();
    db.prepare("INSERT INTO article_tags (article_id, tag_id) VALUES (1, 3)").run();
  }

  it("영어 본문이 있는 기사만, 제목·요약은 영어, 태그는 라틴 문자만, 한국어 원제는 비운다", () => {
    englishSeed();
    const built = buildSearchIndex(db, "en");
    expect(built.manifest).toMatchObject({ locale: "en", total: 1 });
    expect(cardsOf(built)).toEqual([
      {
        id: 1,
        source: { id: "hackernews", name: "AI Times", region: "kr" },
        titleKo: "",
        summaryKo: "",
        titleEn: "English A",
        summaryEn: "English summary A.",
        titleOriginal: "",
        category: "agent",
        format: "news",
        tags: ["llm", "agent"],
        trendingScore: 90,
        importance: 4,
        publishedAt: "2026-01-03T00:00:00Z",
        relatedCount: 1,
      },
    ]);
    // 조각 행에도 목록(매체 표)에도 한글이 없다 — 매체 name 이 영문명이다(english-version-plan 5-4).
    expect(HANGUL.test(JSON.stringify(built.shards))).toBe(false);
    expect(HANGUL.test(JSON.stringify(built.manifest))).toBe(false);
  });

  it("writeSearchIndex 는 <dir>/en/ 에 영어 색인을, <dir>/ko/ 에는 영어 없는 한국어 색인을 쓴다", () => {
    englishSeed();
    expect(writeSearchIndex(dir, db)).toEqual({ ko: 2, en: 1 });
    const en = JSON.parse(
      readFileSync(path.join(dir, "en", "manifest.json"), "utf-8"),
    ) as IndexManifest;
    expect(en.sources.hackernews).toEqual({ name: "AI Times", format: "news", region: "kr" });
    expect(readdirSync(path.join(dir, "en")).sort()).toEqual(["2026-01.json", "manifest.json"]);
    const ko = readdirSync(path.join(dir, "ko"))
      .map((f) => readFileSync(path.join(dir, "ko", f), "utf-8"))
      .join("\n");
    for (const s of ["AI Times", "English", "region"]) expect(ko).not.toContain(s);
  });
});

describe("writeSearchIndex — 파일 배치", () => {
  it("<dir>/ko/ 에 목록과 월별 조각을 쓰고, 지난 빌드의 다른 달 조각은 남기지 않는다", () => {
    expect(writeSearchIndex(dir, db)).toEqual({ ko: 2, en: 0 });
    expect(readdirSync(path.join(dir, "ko")).sort()).toEqual([
      "2026-01.json",
      "2026-02.json",
      "manifest.json",
    ]);
    const manifest = JSON.parse(
      readFileSync(path.join(dir, "ko", "manifest.json"), "utf-8"),
    ) as IndexManifest;
    expect(manifest).toMatchObject({ schema: 1, kind: "search-index", locale: "ko", total: 2 });
    expect(manifest.head).toBeUndefined();

    // 1월 기사를 지우고 다시 쓰면 1월 조각이 사라진다.
    db.prepare("DELETE FROM article_tags WHERE article_id = 1").run();
    db.prepare("DELETE FROM articles WHERE id = 1").run();
    writeSearchIndex(dir, db);
    expect(readdirSync(path.join(dir, "ko")).sort()).toEqual(["2026-02.json", "manifest.json"]);
  });
});
