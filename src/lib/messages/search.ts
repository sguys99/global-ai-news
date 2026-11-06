import { defineMessages, formatNumber, plural } from "@/lib/i18n";
import { EN_MONTHS_SHORT } from "@/lib/labels";

/** 'YYYY-MM' → [연, 월]. */
function ym(month: string): [number, number] {
  const [y, m] = String(month).split("-").map(Number);
  return [y, m];
}

/** 'YYYY-MM' → 'Sep 2026'. */
function enMonth(month: string): string {
  const [y, m] = ym(month);
  return `${EN_MONTHS_SHORT[m - 1] ?? ""} ${y}`.trim();
}

/** 'YYYY-MM' → '2026년 9월'. */
function koMonth(month: string): string {
  const [y, m] = ym(month);
  return `${y}년 ${m}월`;
}

/**
 * 검색 페이지 문구 — 머리(src/views/SearchView.tsx)와 검색창·추천 주제·결과(SearchClient·SearchInput).
 * 필터 바 문구는 filter, 결과 색인 "더 보기"·색인 받기 상태 줄은 storyIndex 이름공간 몫이다.
 * 검색 색인은 최근 몇 달만 먼저 받는다(src/lib/indexShards.ts) — 범위(scope)·지난 기사(older) 문구가 그 상태를 말한다.
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
    /** 결과 머리 뒤 흐린 범위 — 최근 몇 달만 받았을 때(건수가 그 범위 기준임을 밝힌다). 인자 = 범위 첫 달 'YYYY-MM'. */
    scope: (since: string) => ` · ${koMonth(since)} 이후 기사 중`,
    /** 결과 끝 "지난 기사에서도 찾기" — 받지 않은 지난 달 조각을 받아 결과에 합친다. detail(지난 기사 수, 범위 첫 달). */
    older: {
      action: "지난 기사에서도 찾기",
      detail: (n: number, since: string) =>
        `${koMonth(since)} 이전 기사 ${formatNumber(n, "ko")}건`,
    },
    /** 받은 달에 결과가 없어 지난 달을 자동으로 받는 동안. */
    searchingOlder: "지난 기사에서 찾는 중…",
  },
  en: {
    kicker: "Search",
    title: "Find stories",
    input: {
      // 영어는 같은 뜻이 약 1.6배 길어 360px 검색창에서 잘린다 — 짧게(무엇을 찾는지는 aria-label·결과가 말한다).
      placeholder: "Search by keyword",
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
    scope: (since: string) => ` · from stories since ${enMonth(since)}`,
    older: {
      action: "Search older stories too",
      detail: (n: number, since: string) =>
        `${formatNumber(n, "en")} ${plural(n, "story", "stories")} before ${enMonth(since)}`,
    },
    searchingOlder: "Searching older stories…",
  },
});
