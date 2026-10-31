/**
 * 홈 전체 기사 색인 생성기.
 * 실행: npm run export-feed-index  (= tsx scripts/export-feed-index.ts)
 * `prebuild`에서 export-search-index 와 함께 자동 실행되어 최신 data/app.db 를 반영한다.
 *
 * 홈 정적 HTML 에는 이번 호 지면과 색인 첫 페이지만 싣고, 누적 전체는 이 파일(public/feed-index.json)로 내보내
 * 브라우저가 "더 보기"·필터·정렬 때 1회 받는다(src/lib/feedIndex.ts). 항목은 색인이 그리는 필드만 남긴
 * IndexCard 이고 기본 정렬(화제순) 순서다 — 홈 page.tsx 의 첫 페이지와 같은 `buildFeedIndex`로 만든다.
 */
import { writeFileSync } from "node:fs";
import type { Database as DatabaseType } from "better-sqlite3";
import { getDb, getFeed } from "../src/lib/db";
import { buildFeedIndex } from "../src/lib/feedIndex";
import { FEED_INDEX_PATH } from "../src/lib/paths";
import type { IndexCard } from "../src/lib/types";

/** 공개 기사 전체 → 색인 카드(기본 정렬 순). */
export function buildFeedIndexFile(conn: DatabaseType = getDb()): IndexCard[] {
  return buildFeedIndex(getFeed({}, conn));
}

/** 색인을 JSON 파일로 기록한다. */
export function writeFeedIndex(
  outPath: string = FEED_INDEX_PATH,
  conn: DatabaseType = getDb(),
): number {
  const items = buildFeedIndexFile(conn);
  writeFileSync(outPath, JSON.stringify(items), "utf-8");
  return items.length;
}

// tsx로 직접 실행될 때만 동작
if (import.meta.url === `file://${process.argv[1]}`) {
  const count = writeFeedIndex();
  console.log(`Wrote feed index to ${FEED_INDEX_PATH} (${count} entries)`);
}
