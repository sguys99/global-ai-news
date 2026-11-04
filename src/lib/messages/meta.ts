import { defineMessages } from "@/lib/i18n";

/**
 * 기사 신호(src/components/ArticleMeta.tsx) 문구 — 중요도 미터 읽기 라벨·바이라인 화제 지수·"외 N곳".
 * 분야·형식·지역 표시명은 labels.ts(`categoryLabel`·`formatLabel`·`regionLabel`)가, 날짜는 `formatDate` 가 맡는다.
 */
export const metaMessages = defineMessages({
  ko: {
    /** ImportanceMeter `aria-label`. */
    importance: (value: number) => `중요도 ${value}/5`,
    /** Byline 화제 지수(showTrend). */
    trending: (score: number) => `화제 ${score}`,
    /** 매체명 뒤에 붙는 같은 사건 다른 매체 수 — 앞 공백 포함(매체명과 한 줄로 이어진다). */
    otherSources: (n: number) => ` 외 ${n}곳`,
  },
  en: {
    importance: (value: number) => `Importance ${value} of 5`,
    trending: (score: number) => `Trending ${score}`,
    otherSources: (n: number) => ` +${n} more`,
  },
});
