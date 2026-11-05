/**
 * 클라이언트 검색 질의 헬퍼(순수 함수). SearchClient(UI)와 단위 테스트가 공유한다.
 *
 * 서버 FTS5 검색을 대체한다. FlexSearch `Document`(`tokenize:"full"`)는 한글 부분일치를
 * 지원해 기존 FTS5(prefix) + LIKE 폴백 동작을 근사한다. 색인 대상은 목록 언어의 제목·요약(ko 한국어, en 영어)·원문
 * 제목·태그(공백 조인 tagsText)이며, 원문 본문(content_raw)은 색인 조각에 없다(§10 수용).
 * 색인은 월별 조각을 받는 대로 `addToSearchDocument`로 더해 간다(src/lib/indexShards.ts).
 */
import FlexSearch from "flexsearch";
import type { Locale } from "@/lib/i18n";
import type { SearchCard } from "@/lib/indexShards";

/** 언어별 색인 대상 필드 + 태그 파생 필드(tagsText). */
const INDEX_FIELDS: Record<Locale, readonly string[]> = {
  ko: ["titleKo", "summaryKo", "titleOriginal", "tagsText"],
  en: ["titleEn", "summaryEn", "titleOriginal", "tagsText"],
};

type SearchDoc = SearchCard & { tagsText: string };

export type SearchDocument = FlexSearch.Document<SearchDoc, false>;

/** 검색 카드로 FlexSearch 문서 색인을 만든다. `locale` = 카드 목록의 언어(목록 manifest.locale). */
export function buildSearchDocument(
  entries: readonly SearchCard[],
  locale: Locale = "ko",
): SearchDocument {
  const index = new FlexSearch.Document<SearchDoc, false>({
    tokenize: "full",
    document: { id: "id", index: [...INDEX_FIELDS[locale]] },
  });
  addToSearchDocument(index, entries);
  return index;
}

/** 이미 만든 문서 색인에 카드를 더한다(지난 달 조각을 나중에 받았을 때). */
export function addToSearchDocument(index: SearchDocument, entries: readonly SearchCard[]): void {
  for (const e of entries) {
    index.add({ ...e, tagsText: e.tags.join(" ") });
  }
}

/**
 * 필드당 결과 상한. FlexSearch 기본값은 필드당 100건이라, 흔한 낱말("에이전트"·"모델")은 실제 일치(321·432건)를
 * 100건씩 잘라 합집합(186·205건)만 보였다 — 받은 달이 늘어도 결과가 늘지 않으므로 상한을 색인 크기보다 크게 둔다.
 */
export const SEARCH_RESULT_LIMIT = 100_000;

/** 질의어로 매칭되는 기사 id 목록(필드 간 합집합, 중복 제거, 상한 없음). 빈 질의는 빈 배열. */
export function queryMatchingIds(index: SearchDocument, q: string): number[] {
  const query = q.trim();
  if (!query) return [];
  const groups = index.search(query, SEARCH_RESULT_LIMIT) as { field: string; result: number[] }[];
  const ids = new Set<number>();
  for (const g of groups) {
    for (const id of g.result) ids.add(id);
  }
  return [...ids];
}
