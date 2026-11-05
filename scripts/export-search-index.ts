/**
 * 클라이언트 검색 색인 생성기.
 * 실행: npm run export-search-index  (= tsx scripts/export-search-index.ts)
 * 또한 `prebuild`로 `npm run build` 직전 자동 실행되어 최신 data/app.db 를 반영한다.
 *
 * 정적 호스팅(GitHub Pages)에는 서버 FTS5 검색이 없으므로, 빌드 시 readonly DB를 1회 조회해
 * public/search-index/<언어>/ 에 호 월별 조각(<YYYY-MM>.json)과 목록(manifest.json)을 만들고, 브라우저가
 * 최근 몇 달 조각을 먼저 받아 FlexSearch 로 검색한다(나머지 달은 필요할 때 — src/lib/indexShards.ts, SearchClient).
 * 행은 검색 결과 색인이 그리고 거르는 필드 + 원제(검색 대상)만 싣는다(본문·원문 URL·묶인 보도 목록·메트릭 제외).
 * 카드는 피드(getFeed)를 그대로 재사용해 데이터가 구조적으로 일치한다.
 */
import { rmSync } from "node:fs";
import path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import { getDb, getFeed, getIssueDates } from "../src/lib/db";
import type { Locale } from "../src/lib/i18n";
import type { ArticleCard } from "../src/lib/types";
import { PUBLIC_DIR, SEARCH_INDEX_DIR } from "../src/lib/paths";
import {
  INDEX_BUILD_LOCALES,
  buildIndexShards,
  indexArticlesFor,
  sourceTableOf,
  writeIndexShards,
  type BuiltIndex,
} from "./lib/indexShards";

/** 언어판 검색 색인(목록 + 월별 조각). 카드 순서 = getFeed 기본 정렬. */
export function buildSearchIndex(conn: DatabaseType = getDb(), locale: Locale = "ko"): BuiltIndex {
  return searchIndexFromArticles(getFeed({}, conn), getIssueDates(conn), locale);
}

/** 누적 카드(getFeed, 기본 정렬 순) + 호 날짜 → 언어판 검색 색인(순수 — 테스트가 가짜 서버를 같은 함수로 만든다). */
export function searchIndexFromArticles(
  all: readonly ArticleCard[],
  issueDates: ReadonlyMap<number, string>,
  locale: Locale = "ko",
): BuiltIndex {
  const articles = indexArticlesFor(locale, all);
  return buildIndexShards({
    kind: "search-index",
    locale,
    cards: articles,
    issueDates,
    sources: sourceTableOf(articles),
  });
}

/** 언어마다 검색 색인을 쓴다. 언어별 기사 수를 돌려준다. */
export function writeSearchIndex(
  dir: string = SEARCH_INDEX_DIR,
  conn: DatabaseType = getDb(),
  locales: readonly Locale[] = INDEX_BUILD_LOCALES,
): Record<string, number> {
  // Phase 4-2 전 단일 파일이 로컬 public/ 에 남아 있으면 out/ 에 함께 실리므로 지운다.
  if (dir === SEARCH_INDEX_DIR) rmSync(path.join(PUBLIC_DIR, "search-index.json"), { force: true });
  const counts: Record<string, number> = {};
  for (const locale of locales) {
    const built = buildSearchIndex(conn, locale);
    writeIndexShards(dir, built);
    counts[locale] = built.manifest.total;
  }
  return counts;
}

// tsx로 직접 실행될 때만 동작
if (import.meta.url === `file://${process.argv[1]}`) {
  const counts = writeSearchIndex();
  console.log(`Wrote search index shards to ${SEARCH_INDEX_DIR} (${JSON.stringify(counts)})`);
}
