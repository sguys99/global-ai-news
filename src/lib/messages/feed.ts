import { defineMessages, formatNumber, plural } from "@/lib/i18n";

/**
 * 홈 피드 프레젠테이션(src/components/FeedView.tsx) 문구 — 빈 DB 안내·필터 결과 머리·전체 기사 색인 머리.
 * 필터 바·바텀시트는 filter, 색인 "더 보기"·불러오기 상태 줄은 storyIndex 이름공간 몫이다.
 */
export const feedMessages = defineMessages({
  ko: {
    /** 공개 기사가 하나도 없을 때(로컬 빈 DB). */
    empty: "아직 수집된 기사가 없습니다. `npm run collect` 실행 후 다시 빌드하세요.",
    /** 필터 결과 머리 키커. */
    filterResults: "필터 결과",
    /** 색인 머리 건수(누적 머리가 없을 때 — 한 텍스트). */
    count: (n: number) => `${n}건`,
    /**
     * 필터 결과 머리 건수 — 수와 단위를 따로 그린다(정적 HTML 텍스트 경계 유지). 단위는 `plural` 로 고른다(앞 공백 포함).
     */
    resultCount: {
      num: (n: number) => `${n}`,
      unit: { one: "건", other: "건" },
    },
    clearFilters: "필터 모두 해제",
    /** 홈 색인 머리·`<section aria-label>`. */
    allStories: "전체 기사",
    /** 필터 결과 목록 `<section aria-label>`(머리 없음). */
    filterResultsList: "필터 결과 목록",
    /** 홈 색인 머리 옆 — 누적 공개 기사·매체(축약명 묶음) 수. 두 칸을 " · " 로 잇는다. */
    cumulative: {
      articles: (n: number) => `누적 ${n}건`,
      sources: (n: number) => `매체 ${n}곳`,
    },
    noMatch: "조건에 맞는 기사가 없습니다. 필터를 해제해 보세요.",
  },
  en: {
    empty: "No stories collected yet. Run `npm run collect`, then rebuild.",
    filterResults: "Filtered",
    count: (n: number) => `${formatNumber(n, "en")} ${plural(n, "story", "stories")}`,
    resultCount: {
      num: (n: number) => formatNumber(n, "en"),
      unit: { one: " story", other: " stories" },
    },
    clearFilters: "Clear all filters",
    allStories: "All stories",
    filterResultsList: "Filtered stories",
    cumulative: {
      articles: (n: number) => `${formatNumber(n, "en")} ${plural(n, "story", "stories")} to date`,
      sources: (n: number) => `${formatNumber(n, "en")} ${plural(n, "outlet", "outlets")}`,
    },
    noMatch: "No stories match these filters. Try clearing them.",
  },
});
