/**
 * 최근 수집분 피드 생성기 — 외부 소비용(자랑터 AI 큐레이터 「한입뉴스」가 매일 07:00 KST 에 fetch).
 * 실행: npm run export-latest  (= tsx scripts/export-latest.ts)
 * `prebuild`에서 export-search-index 와 함께 자동 실행되어 최신 data/app.db 를 반영한다.
 *
 * search-index.json 은 전 기사(하루 ~20KB씩 늘고 정렬 없음)라 외부에서 매일 받기엔 크다.
 * 최근 LATEST_WINDOW_DAYS 일 동안 **수집된** 공개 기사만 중요도 순으로 담는다(본문 contentRaw 제외).
 * 창은 빌드 시각 기준이다 — 빌드는 수집 커밋 직후에 돈다(deploy.yml).
 * `brief` 는 최신 호 세 줄 요약(지면 마스트헤드 아래 띠와 같은 줄·같은 순서)이다. 줄이 가리키는 기사가 items 에
 * 없으면 그 줄을 빼고, 2줄 미만이면 null 이다(docs/notices/latest-json-2026-10.md 추가 공지).
 */
import { writeFileSync } from "node:fs";
import type { Database as DatabaseType } from "better-sqlite3";
import {
  getArticlesCollectedSince,
  getDb,
  getIssueArticles,
  getIssueBriefs,
  getLatestEditionRef,
} from "../src/lib/db";
import { buildEdition, ISSUE_BRIEF_LIMITS, selectIssueBrief } from "../src/lib/edition";
import { LATEST_FEED_PATH } from "../src/lib/paths";
import type { LatestFeed, LatestFeedBrief, LatestFeedEntry } from "../src/lib/types";

export const LATEST_WINDOW_DAYS = 3;

const DAY_MS = 24 * 3600 * 1000;

/**
 * 최신 호 세 줄 요약 — 지면과 같은 선택·순서(selectIssueBrief). items 에 없는 기사를 가리키는 줄은 뺀다.
 * 요약은 부가 정보라 무엇이 잘못돼도 null 로 두고 피드는 그대로 낸다.
 */
export function latestBrief(items: LatestFeedEntry[], conn: DatabaseType): LatestFeedBrief | null {
  try {
    const ref = getLatestEditionRef(conn);
    if (!ref) return null;
    const inFeed = new Set(items.map((a) => a.id));
    const lines = selectIssueBrief(
      buildEdition(getIssueArticles(ref.date, conn)),
      getIssueBriefs(ref.date, conn),
    ).filter((line) => inFeed.has(line.id));
    return lines.length >= ISSUE_BRIEF_LIMITS.min
      ? { date: ref.date, issueNo: ref.issueNo, lines }
      : null;
  } catch {
    return null;
  }
}

/** now 기준 최근 LATEST_WINDOW_DAYS 일 수집분 피드를 만든다. */
export function buildLatestFeed(now: Date = new Date(), conn: DatabaseType = getDb()): LatestFeed {
  const since = new Date(now.getTime() - LATEST_WINDOW_DAYS * DAY_MS).toISOString();
  const items = getArticlesCollectedSince(since, conn);
  return {
    version: 1,
    generatedAt: now.toISOString(),
    windowDays: LATEST_WINDOW_DAYS,
    items,
    brief: latestBrief(items, conn),
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
