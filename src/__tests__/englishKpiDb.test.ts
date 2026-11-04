// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { getEnglishKpi } from "@/lib/db";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

function freshDb(): DatabaseType {
  const db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  const src = db.prepare(
    "INSERT INTO sources (id, name, kind, url, enabled, region) VALUES (?,?,?,?,1,?)",
  );
  src.run("aitimes", "AI타임스", "rss", "https://kr", "kr");
  src.run("techcrunch_ai", "TechCrunch AI", "rss", "https://us", null);
  return db;
}

let seq = 0;
/** 게재 기사. en = 영어 보유, published=false 면 가공 전(summary_ko NULL). */
function seedArticle(
  db: DatabaseType,
  opts: { source: string; createdAt: string; en: boolean; published?: boolean },
): void {
  seq += 1;
  db.prepare(
    `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, trending_score,
                           title_ko, summary_ko, title_en, summary_en, created_at)
     VALUES (?, ?, ?, 'T', '2026-11-01T00:00:00Z', 0, ?, ?, ?, ?, ?)`,
  ).run(
    `k${seq}`,
    opts.source,
    `https://a/${seq}`,
    "제목",
    opts.published === false ? null : "요약",
    opts.en ? "An English title for the article" : null,
    opts.en ? "An English summary of the article for readers." : null,
    opts.createdAt,
  );
}

function seedRun(
  db: DatabaseType,
  id: number,
  startedAt: string,
  notes: string,
  status = "success",
) {
  db.prepare(
    `INSERT INTO collection_runs (id, started_at, finished_at, status, notes) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, startedAt, startedAt, status, notes);
}

describe("getEnglishKpi", () => {
  let db: DatabaseType;
  beforeEach(() => {
    db = freshDb();
  });

  it("영어판 이전: 영어 회차·영어 기사가 없으면 since null, 커버리지 0/0(0%로 보이지 않게)", () => {
    seedRun(db, 1, "2026-11-02T21:00:00.000Z", "선정 2건");
    seedArticle(db, { source: "aitimes", createdAt: "2026-11-02 21:05:00", en: false });
    seedArticle(db, { source: "techcrunch_ai", createdAt: "2026-11-02 21:05:00", en: false });
    const k = getEnglishKpi(7, db);
    expect(k.hasColumns).toBe(true);
    expect(k.since).toBeNull();
    expect(k.allPublished).toBe(2);
    expect(k.overall).toEqual({ published: 0, english: 0 });
    expect(k.runs).toEqual([]);
    expect(k.checks.runs).toBe(0);
  });

  it("영어 컬럼이 없는 옛 DB 는 hasColumns=false·영어판 이전", () => {
    db.exec(
      "ALTER TABLE articles DROP COLUMN title_en; ALTER TABLE articles DROP COLUMN summary_en",
    );
    db.exec("ALTER TABLE sources DROP COLUMN region");
    db.prepare(
      `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, summary_ko)
       VALUES ('x', 'aitimes', 'https://x', 'T', '2026-11-01T00:00:00Z', '요약')`,
    ).run();
    const k = getEnglishKpi(7, db);
    expect(k.hasColumns).toBe(false);
    expect(k.since).toBeNull();
    expect(k.allPublished).toBe(1);
  });

  it("첫 영어 회차부터 누적: 이전 게재는 분모에서 빼고, 한국 매체·해외를 나눈다", () => {
    // 영어판 이전 회차
    seedRun(db, 1, "2026-11-03T21:00:00.000Z", "선정 2건");
    seedArticle(db, { source: "aitimes", createdAt: "2026-11-03 21:07:00", en: false });
    seedArticle(db, { source: "techcrunch_ai", createdAt: "2026-11-03 21:07:00", en: false });
    // 영어 회차 2회
    seedRun(
      db,
      2,
      "2026-11-04T21:00:00.000Z",
      "선정 3건; 영어 가공 2/3건; 영어 기각 1건(한글 0·숫자 1·길이 0); 한국어 숫자 불일치 1건(900억 달러)",
    );
    seedArticle(db, { source: "aitimes", createdAt: "2026-11-04 21:07:00", en: false });
    seedArticle(db, { source: "techcrunch_ai", createdAt: "2026-11-04 21:07:00", en: true });
    seedArticle(db, { source: "techcrunch_ai", createdAt: "2026-11-04 21:07:00", en: true });
    seedArticle(db, {
      source: "techcrunch_ai",
      createdAt: "2026-11-04 21:07:00",
      en: false,
      published: false,
    });
    seedRun(db, 3, "2026-11-05T21:00:00.000Z", "선정 2건; 영어 가공 2/2건", "partial");
    seedArticle(db, { source: "aitimes", createdAt: "2026-11-05 21:07:00", en: true });
    seedArticle(db, { source: "techcrunch_ai", createdAt: "2026-11-05 21:07:00", en: true });

    const k = getEnglishKpi(7, db);
    expect(k.since).toBe("2026-11-04T21:00:00Z");
    expect(k.allPublished).toBe(7);
    expect(k.overall).toEqual({ published: 5, english: 4 });
    expect(k.korea).toEqual({ published: 2, english: 1 });
    expect(k.overseas).toEqual({ published: 3, english: 3 });
    expect(k.checks).toEqual({
      runs: 2,
      checked: 5,
      passed: 4,
      rejected: { hangul: 0, number: 1, length: 0 },
      koreanMismatch: 1,
    });

    // 최근 회차 — 최신 순, 게재 기사는 그 회차 시작 ~ 다음 회차 시작
    expect(k.runs.map((r) => r.id)).toEqual([3, 2]);
    expect(k.runs[0]).toMatchObject({
      status: "partial",
      notes: { checked: 2, passed: 2 },
      coverage: { published: 2, english: 2 },
    });
    expect(k.runs[1].coverage).toEqual({ published: 3, english: 2 });
    expect(getEnglishKpi(1, db).runs.map((r) => r.id)).toEqual([3]);
    expect(getEnglishKpi(0, db).runs).toEqual([]);
  });

  it("백필로 지난 기사에 영어가 생기면 시작이 앞당겨져 전체 게재가 분모가 된다", () => {
    seedRun(db, 1, "2026-10-01T21:00:00.000Z", "선정 2건");
    seedArticle(db, { source: "aitimes", createdAt: "2026-10-01 21:07:00", en: true });
    seedArticle(db, { source: "techcrunch_ai", createdAt: "2026-10-01 21:07:00", en: false });
    seedRun(db, 2, "2026-11-04T21:00:00.000Z", "영어 가공 1/1건");
    seedArticle(db, { source: "techcrunch_ai", createdAt: "2026-11-04 21:07:00", en: true });

    const k = getEnglishKpi(7, db);
    expect(k.since).toBe("2026-10-01T21:07:00Z");
    expect(k.overall).toEqual({ published: 3, english: 2 });
    expect(k.checks.runs).toBe(1);
    // 시작(백필 기사 created_at)이 든 창의 회차부터 — 1번 회차도 포함, 영어 줄은 없다
    expect(k.runs.map((r) => r.id)).toEqual([2, 1]);
    expect(k.runs[1]).toMatchObject({ notes: null, coverage: { published: 2, english: 1 } });
  });
});
