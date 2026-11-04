import { defineMessages, plural } from "@/lib/i18n";

/**
 * 호 고정 링크 지면 본문(src/views/EditionView.tsx) 문구 — 지난 호 안내 줄·이 호의 기사 색인 머리.
 * 마스트헤드·1면·호 이동(EditionPager) 안의 문구는 그 컴포넌트 이름공간 몫이다(Phase 3-3 C단계).
 */
export const editionMessages = defineMessages({
  ko: {
    /** 색인 머리·`<section aria-label>`·마스트헤드 섹션 내비 마지막 항목(#all). */
    index: "이 호의 기사",
    /** 지난 호(다음 호가 있는 호)에서만 마스트헤드 아래 한 줄. */
    pastIssue: "지난 호 지면입니다.",
    toToday: "오늘의 지면 보기 →",
    /** 색인 머리 옆 건수. */
    count: (n: number) => `${n}건`,
  },
  en: {
    index: "Stories in this issue",
    pastIssue: "You're reading a past issue.",
    toToday: "See today's issue →",
    count: (n: number) => `${n} ${plural(n, "story", "stories")}`,
  },
});
