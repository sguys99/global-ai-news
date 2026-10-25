/**
 * 최근 수집분 피드 생성기 — 외부 소비용(자랑터 AI 큐레이터 「한입뉴스」가 매일 07:00 KST 에 fetch).
 * 실행: npm run export-latest  (= tsx scripts/export-latest.ts)
 * `prebuild`에서 export-search-index 와 함께 자동 실행되어 최신 data/app.db 를 반영한다.
 *
 * search-index.json 은 전 기사(하루 ~20KB씩 늘고 정렬 없음)라 외부에서 매일 받기엔 크다.
 * 최근 LATEST_WINDOW_DAYS 일 동안 **수집된** 공개 기사만 중요도 순으로 담는다(본문 contentRaw 제외).
 * 창은 빌드 시각 기준이다 — 빌드는 수집 커밋 직후에 돈다(deploy.yml).
 */
import { writeFileSync } from "node:fs";
import type { Database as DatabaseType } from "better-sqlite3";
import { getArticlesCollectedSince, getDb } from "../src/lib/db";
import { LATEST_FEED_PATH } from "../src/lib/paths";
import type { LatestFeed } from "../src/lib/types";

export const LATEST_WINDOW_DAYS = 3;

const DAY_MS = 24 * 3600 * 1000;

/** now 기준 최근 LATEST_WINDOW_DAYS 일 수집분 피드를 만든다. */
export function buildLatestFeed(now: Date = new Date(), conn: DatabaseType = getDb()): LatestFeed {
  const since = new Date(now.getTime() - LATEST_WINDOW_DAYS * DAY_MS).toISOString();
  return {
    version: 1,
    generatedAt: now.toISOString(),
    windowDays: LATEST_WINDOW_DAYS,
    items: getArticlesCollectedSince(since, conn),
  };
}

/** 최근 수집분 피드를 JSON 파일로 기록한다. 담은 항목 수를 돌려준다. */
export function writeLatestFeed(
  outPath: string = LATEST_FEED_PATH,
  now: Date = new Date(),
  conn: DatabaseType = getDb(),
): number {
  const feed = buildLatestFeed(now, conn);
  writeFileSync(outPath, JSON.stringify(feed), "utf-8");
  return feed.items.length;
}

// tsx로 직접 실행될 때만 동작
if (import.meta.url === `file://${process.argv[1]}`) {
  const count = writeLatestFeed();
  console.log(`Wrote latest feed to ${LATEST_FEED_PATH} (${count} entries)`);
}
