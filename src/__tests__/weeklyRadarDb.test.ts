// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { getWeekRadarCandidates } from "@/lib/db";
import { buildWeeklyRadar } from "@/lib/weeklyRadar";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

let db: DatabaseType;
let seq = 0;

/** 기사 1건 시드. createdAt 은 SQLite datetime('now') 형식(UTC). */
function article(sourceId: string, createdAt: string, published = true) {
  seq += 1;
  db.prepare(
    `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at,
                           title_ko, summary_ko, category, importance, created_at)
     VALUES (?, ?, ?, ?, '2026-10-01T00:00:00Z', ?, ?, 'research', 3, ?)`,
  ).run(
    `k${seq}`,
    sourceId,
    `https://huggingface.co/papers/2610.${10000 + seq}`,
    `Paper title number ${seq}`,
    `논문${seq}`,
    published ? "요약" : null,
    createdAt,
  );
  return seq;
}

beforeEach(() => {
  seq = 0;
  db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  const src = db.prepare(
    "INSERT INTO sources (id, name, kind, url, enabled, format) VALUES (?, ?, 'api', 'https://x', 1, ?)",
  );
  src.run("hn", "Hacker News", "news");
  src.run("hf_daily_papers", "HuggingFace Papers", "paper");
  src.run("github_trending", "GitHub Trending", "oss");
});

describe("getWeekRadarCandidates — KST 월~일 수집분", () => {
  it("월 00:00 KST 부터 일 24:00 KST 전까지, 호 날짜는 수집 시각의 KST 날짜", () => {
    const before = article("hf_daily_papers", "2026-10-18 14:59:59"); // 10-18(일) 23:59:59 KST — 지난주
    const monStart = article("hf_daily_papers", "2026-10-18 15:00:00"); // 10-19(월) 00:00 KST
    const sunEnd = article("github_trending", "2026-10-25 14:59:59"); // 10-25(일) 23:59:59 KST
    const after = article("hf_daily_papers", "2026-10-25 15:00:00"); // 10-26(월) 00:00 KST — 다음 주
    const got = getWeekRadarCandidates("2026-10-25", db);
    expect(got.map((c) => c.article.id)).toEqual([monStart, sunEnd]);
    expect(got.map((c) => c.issueDate)).toEqual(["2026-10-19", "2026-10-25"]);
    expect(got.map((c) => c.article.format)).toEqual(["paper", "oss"]);
    expect([before, after].some((id) => got.some((c) => c.article.id === id))).toBe(false);
  });

  it("뉴스·미가공 기사는 빼고, 일요일이 아니면 빈 목록", () => {
    article("hn", "2026-10-20 00:00:00");
    article("hf_daily_papers", "2026-10-20 00:00:00", false);
    const ok = article("hf_daily_papers", "2026-10-21 00:00:00");
    expect(getWeekRadarCandidates("2026-10-25", db).map((c) => c.article.id)).toEqual([ok]);
    expect(getWeekRadarCandidates("2026-10-24", db)).toEqual([]);
  });

  it("sources.format 컬럼이 없는 옛 DB 면 빈 목록(전부 뉴스로 읽힌다)", () => {
    const old = new Database(":memory:");
    old.exec(
      `CREATE TABLE sources (id TEXT PRIMARY KEY, name TEXT, kind TEXT, url TEXT, enabled INTEGER);
       CREATE TABLE articles (id INTEGER PRIMARY KEY, source_id TEXT, created_at TEXT, summary_ko TEXT);`,
    );
    expect(getWeekRadarCandidates("2026-10-25", old)).toEqual([]);
  });

  it("DB 후보 → buildWeeklyRadar 까지(호 2개 이상·4건 이상이면 밴드)", () => {
    ["2026-10-19 01:00:00", "2026-10-20 01:00:00", "2026-10-22 01:00:00"].forEach((t) =>
      article("hf_daily_papers", t),
    );
    article("github_trending", "2026-10-24 22:00:00"); // 10-25(일) 07:00 KST
    const w = buildWeeklyRadar(getWeekRadarCandidates("2026-10-25", db), "2026-10-25");
    expect(w?.items).toHaveLength(4);
    expect(w?.items.map((i) => i.issueDate).sort()).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-22",
      "2026-10-25",
    ]);
  });
});
