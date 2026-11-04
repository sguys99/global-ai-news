import { defineMessages } from "@/lib/i18n";

/**
 * 검색 페이지 문구 — 머리(src/views/SearchView.tsx)와 검색창·추천 주제·결과(SearchClient·SearchInput).
 * 필터 바 문구는 filter, 결과 색인 "더 보기"는 storyIndex 이름공간 몫이다.
 * `<title>`·공유 메타는 라우트 metadata 가 맡는다(영어는 Phase 6).
 */
export const searchMessages = defineMessages({
  ko: {
    kicker: "검색",
    title: "기사 찾기",
    /** SearchInput. */
    input: {
      placeholder: "키워드로 검색 — 제목·요약·원문·태그",
      label: "기사 검색",
    },
    /** 검색어가 없을 때 인기 태그 머리. */
    suggested: "많이 다뤄진 주제",
    loading: "검색 인덱스를 불러오는 중…",
    noResults: (q: string) =>
      `“${q}”에 대한 검색 결과가 없습니다. 다른 키워드나 필터를 시도해 보세요.`,
    /** 결과 `<section aria-label>`. */
    resultsLabel: "검색 결과",
    /**
     * 결과 머리 `“<검색어>” 검색 결과 <N>건` — 검색어·건수는 굵은 span 이라 앞뒤 조각만 둔다.
     * 건수 단위는 수에 따라 고른다(ko 는 같은 말, en 은 단·복수 — 앞 공백 포함).
     */
    results: {
      open: "“",
      close: "” 검색 결과",
      unit: { one: "건", other: "건" },
    },
  },
  en: {
    kicker: "Search",
    title: "Find stories",
    input: {
      placeholder: "Search by keyword — titles, summaries, source text, tags",
      label: "Search stories",
    },
    suggested: "Popular topics",
    loading: "Loading the search index…",
    noResults: (q: string) => `No results for “${q}”. Try another keyword or filter.`,
    resultsLabel: "Search results",
    results: {
      open: "“",
      close: "” ·",
      unit: { one: " result", other: " results" },
    },
  },
});
