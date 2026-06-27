/**
 * 클라이언트 검색 인덱스 생성기.
 * 실행: npm run export-search-index  (= tsx scripts/export-search-index.ts)
 * 또한 `prebuild`로 `npm run build` 직전 자동 실행되어 최신 data/app.db 를 반영한다.
 *
 * 정적 호스팅(GitHub Pages)에는 서버 FTS5 검색이 없으므로, 빌드 시 readonly DB를 1회
 * 조회해 public/search-index.json(본문 제외 카드 메타)을 만들고, 브라우저가 이를 fetch 후
 * FlexSearch 로 검색한다. 카드 매핑은 피드(getFeed)를 그대로 재사용해 데이터가 구조적으로 일치한다.
 */
import { writeFileSync } from "node:fs";
import type { Database as DatabaseType } from "better-sqlite3";
import { getDb, getFeed } from "../src/lib/db";
import { SEARCH_INDEX_PATH } from "../src/lib/paths";
import type { SearchIndexEntry } from "../src/lib/types";

/** 전 기사를 검색 인덱스 항목(본문 contentRaw 제외)으로 변환한다. */
export function buildSearchIndex(conn: DatabaseType = getDb()): SearchIndexEntry[] {
  // getFeed = 피드와 동일한 toArticleCard 매핑. 검색 인덱스는 본문만 떼어 재사용한다.
  return getFeed({}, conn).map(({ contentRaw: _contentRaw, ...entry }) => entry);
}

/** 검색 인덱스를 JSON 파일로 기록한다. */
export function writeSearchIndex(
  outPath: string = SEARCH_INDEX_PATH,
  conn: DatabaseType = getDb(),
): number {
  const entries = buildSearchIndex(conn);
  writeFileSync(outPath, JSON.stringify(entries), "utf-8");
  return entries.length;
}

// tsx로 직접 실행될 때만 동작
if (import.meta.url === `file://${process.argv[1]}`) {
  const count = writeSearchIndex();
  console.log(`Wrote search index to ${SEARCH_INDEX_PATH} (${count} entries)`);
}
