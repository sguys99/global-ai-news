import { defineMessages } from "@/lib/i18n";

/**
 * 호 고정 링크 지면 하단 호 이동(src/components/EditionPager.tsx) 문구.
 * 호수·날짜 표기는 labels.ts `issueNoLabel`·`formatMonthDay` 가 언어별로 맡는다.
 */
export const pagerMessages = defineMessages({
  ko: {
    /** `<nav aria-label>`. */
    navLabel: "호 이동",
    prev: "← 이전 호",
    next: "다음 호 →",
  },
  en: {
    navLabel: "Issue navigation",
    prev: "← Previous issue",
    next: "Next issue →",
  },
});
