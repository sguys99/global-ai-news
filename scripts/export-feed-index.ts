/**
 * 홈 전체 기사 색인 생성기.
 * 실행: npm run export-feed-index  (= tsx scripts/export-feed-index.ts)
 * `prebuild`에서 export-search-index 와 함께 자동 실행되어 최신 data/app.db 를 반영한다.
 *
 * 홈 정적 HTML 에는 이번 호 지면과 색인 첫 페이지만 싣고, 누적 전체는 public/feed-index/<언어>/ 에 호 월별 조각과
 * 목록(manifest.json — 색인 머리 FEED_HEAD_SIZE 건 포함)으로 내보낸다. 브라우저는 "더 보기"에 목록만, 그 너머·필터·정렬에
 * 모든 조각을 받는다(src/lib/feedIndex.ts·indexShards.ts). 순서는 기본 정렬(화제순)이고 홈 page 의 첫 페이지와 같은
 * 정렬(`buildFeedIndex` = filterAndSortFeed 기본 비교자)로 만든다.
 */
import { rmSync } from "node:fs";
import path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import { getDb, getFeed, getIssueDates } from "../src/lib/db";
import { filterAndSortFeed } from "../src/lib/feedFilter";
import { FEED_HEAD_SIZE, INDEX_PAGE_SIZE } from "../src/lib/feedIndex";
import type { Locale } from "../src/lib/i18n";
import type { ArticleCard } from "../src/lib/types";
import { FEED_INDEX_DIR, PUBLIC_DIR } from "../src/lib/paths";
import {
  INDEX_BUILD_LOCALES,
  buildIndexShards,
  indexArticlesFor,
  sourceTableOf,
  writeIndexShards,
  type BuiltIndex,
} from "./lib/indexShards";

/** 언어판 홈 색인(목록 + 월별 조각). 카드는 기본 정렬 순, 머리 = 첫 페이지 다음 FEED_HEAD_SIZE 건. */
export function buildFeedIndexFile(
  conn: DatabaseType = getDb(),
  locale: Locale = "ko",
): BuiltIndex {
  return feedIndexFromArticles(getFeed({}, conn), getIssueDates(conn), locale);
}

/** 누적 카드(getFeed) + 호 날짜 → 언어판 홈 색인(순수 — 테스트가 가짜 서버를 같은 함수로 만든다). */
export function feedIndexFromArticles(
  all: readonly ArticleCard[],
  issueDates: ReadonlyMap<number, string>,
  locale: Locale = "ko",
): BuiltIndex {
  const articles = indexArticlesFor(locale, all);
  // buildFeedIndex(=toIndexCard + 기본 정렬)와 같은 순서. 행은 원래 카드에서 만든다(영어 목록은 영어 필드가 필요하다).
  const cards = filterAndSortFeed(articles);
  return buildIndexShards({
    kind: "feed-index",
    locale,
    cards,
    issueDates,
    sources: sourceTableOf(articles),
    head: cards.slice(INDEX_PAGE_SIZE, INDEX_PAGE_SIZE + FEED_HEAD_SIZE),
  });
}

/** 언어마다 홈 색인을 쓴다. 언어별 기사 수를 돌려준다. */
export function writeFeedIndex(
  dir: string = FEED_INDEX_DIR,
  conn: DatabaseType = getDb(),
  locales: readonly Locale[] = INDEX_BUILD_LOCALES,
): Record<string, number> {
  // Phase 4-2 전 단일 파일이 로컬 public/ 에 남아 있으면 out/ 에 함께 실리므로 지운다.
  if (dir === FEED_INDEX_DIR) rmSync(path.join(PUBLIC_DIR, "feed-index.json"), { force: true });
  const counts: Record<string, number> = {};
  for (const locale of locales) {
    const built = buildFeedIndexFile(conn, locale);
    writeIndexShards(dir, built);
    counts[locale] = built.manifest.total;
  }
  return counts;
}

// tsx로 직접 실행될 때만 동작
if (import.meta.url === `file://${process.argv[1]}`) {
  const counts = writeFeedIndex();
  console.log(`Wrote feed index shards to ${FEED_INDEX_DIR} (${JSON.stringify(counts)})`);
}
