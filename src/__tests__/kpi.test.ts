// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { getKpiSummary } from "@/lib/db";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/** 스키마를 올린 in-memory DB. */
function freshDb(): DatabaseType {
  const db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  db.prepare("INSERT INTO sources (id, name, kind, url, enabled) VALUES (?,?,?,?,1)").run(
    "s1",
    "Source 1",
    "rss",
    "https://s1",
  );
  return db;
}

/** collection_runs 한 행 시드. started_at 은 "now" 기준 상대 offset(일). */
function seedRun(
  db: DatabaseType,
  opts: {
    daysAgo: number;
    status: string;
    cost?: number;
    itemsNew?: number;
  },
): void {
  db.prepare(
    `INSERT INTO collection_runs
       (started_at, finished_at, items_collected, items_new,
        llm_calls, input_tokens, output_tokens, est_cost_usd, status, notes)
     VALUES (datetime('now', ?), datetime('now', ?), 0, ?, 0, 0, 0, ?, ?, NULL)`,
  ).run(
    `-${opts.daysAgo} days`,
    `-${opts.daysAgo} days`,
    opts.itemsNew ?? 0,
    opts.cost ?? 0,
    opts.status,
  );
}

function seedArticle(db: DatabaseType, dedupKey: string, url: string): void {
  db.prepare(
    `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, trending_score)
     VALUES (?, 's1', ?, 'T', '2026-01-01T00:00:00Z', 0)`,
  ).run(dedupKey, url);
}

describe("getKpiSummary", () => {
  let db: DatabaseType;
  beforeEach(() => {
    db = freshDb();
  });

  it("실행 0건이면 successRate 0, 모든 합계 0", () => {
    const k = getKpiSummary(30, db);
    expect(k.runs).toBe(0);
    expect(k.successRate).toBe(0);
    expect(k.totalCost).toBe(0);
    expect(k.avgDailyNew).toBe(0);
    expect(k.duplicateKeys).toBe(0);
  });

  it("partial 은 성공으로 집계한다", () => {
    seedRun(db, { daysAgo: 1, status: "success" });
    seedRun(db, { daysAgo: 2, status: "partial" });
    seedRun(db, { daysAgo: 3, status: "failed" });
    const k = getKpiSummary(30, db);
    expect(k.runs).toBe(3);
    expect(k.successRate).toBeCloseTo(2 / 3, 5);
  });

  it("기간(days) 밖 실행은 제외한다", () => {
    seedRun(db, { daysAgo: 1, status: "success", cost: 0.1 });
    seedRun(db, { daysAgo: 40, status: "success", cost: 9.9 }); // 30일 밖
    const k = getKpiSummary(30, db);
    expect(k.runs).toBe(1);
    expect(k.totalCost).toBeCloseTo(0.1, 5);
  });

  it("maxDailyCost 는 동일 UTC일 비용을 합산한 뒤 일별 최대를 취한다", () => {
    // 같은 날 2회(0.2+0.2=0.4), 다른 날 1회(0.25)
    seedRun(db, { daysAgo: 1, status: "success", cost: 0.2 });
    seedRun(db, { daysAgo: 1, status: "success", cost: 0.2 });
    seedRun(db, { daysAgo: 3, status: "success", cost: 0.25 });
    const k = getKpiSummary(30, db);
    expect(k.maxDailyCost).toBeCloseTo(0.4, 5);
    expect(k.totalCost).toBeCloseTo(0.65, 5);
  });

  it("avgDailyNew 는 실행이 있던 UTC일 평균 신규 카드 수", () => {
    // day A: 20+20=40, day B: 20 → 평균 (40+20)/2 = 30
    seedRun(db, { daysAgo: 1, status: "success", itemsNew: 20 });
    seedRun(db, { daysAgo: 1, status: "success", itemsNew: 20 });
    seedRun(db, { daysAgo: 2, status: "success", itemsNew: 20 });
    const k = getKpiSummary(30, db);
    expect(k.avgDailyNew).toBeCloseTo(30, 5);
  });

  it("중복 dedup_key 는 UNIQUE 제약으로 항상 0", () => {
    seedArticle(db, "k1", "https://a");
    seedArticle(db, "k2", "https://b");
    // 같은 dedup_key 재삽입 시도는 제약 위반으로 실패해야 한다.
    expect(() => seedArticle(db, "k1", "https://c")).toThrow();
    const k = getKpiSummary(30, db);
    expect(k.duplicateKeys).toBe(0);
  });
});
