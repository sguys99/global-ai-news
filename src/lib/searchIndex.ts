/**
 * 클라이언트 검색 질의 헬퍼(순수 함수). SearchClient(UI)와 단위 테스트가 공유한다.
 *
 * 서버 FTS5 검색을 대체한다. FlexSearch `Document`(`tokenize:"full"`)는 한글 부분일치를
 * 지원해 기존 FTS5(prefix) + LIKE 폴백 동작을 근사한다. 색인 대상은 한국어 제목·요약·원문
 * 제목·태그(공백 조인 tagsText)이며, 원문 본문(content_raw)은 인덱스에서 제외된다(§10 수용).
 */
import FlexSearch from "flexsearch";
import type { SearchIndexEntry } from "@/lib/types";

/** 색인 대상 필드 + 태그 파생 필드(tagsText). */
const INDEX_FIELDS = ["titleKo", "summaryKo", "titleOriginal", "tagsText"] as const;

export type SearchDocument = FlexSearch.Document<SearchIndexEntry & { tagsText: string }, false>;

/** 검색 인덱스 항목으로 FlexSearch 문서 인덱스를 만든다. */
export function buildSearchDocument(entries: SearchIndexEntry[]): SearchDocument {
  const index = new FlexSearch.Document<SearchIndexEntry & { tagsText: string }, false>({
    tokenize: "full",
    document: { id: "id", index: [...INDEX_FIELDS] },
  });
  for (const e of entries) {
    index.add({ ...e, tagsText: e.tags.join(" ") });
  }
  return index;
}

/** 질의어로 매칭되는 기사 id 목록(필드 간 합집합, 중복 제거). 빈 질의는 빈 배열. */
export function queryMatchingIds(index: SearchDocument, q: string): number[] {
  const query = q.trim();
  if (!query) return [];
  const groups = index.search(query) as { field: string; result: number[] }[];
  const ids = new Set<number>();
  for (const g of groups) {
    for (const id of g.result) ids.add(id);
  }
  return [...ids];
}
