import { defineMessages, plural } from "@/lib/i18n";

const stories = (n: number) => `${n} ${plural(n, "story", "stories")}`;
const days = (n: number) => `${n} ${plural(n, "day", "days")}`;

/**
 * 상세 사건 타임라인(src/components/FollowUpThread.tsx) 문구 — 머리·관계 표지·현재 기사 표지·호 날짜 툴팁·날짜 차.
 */
export const followUpMessages = defineMessages({
  ko: {
    /** 머리 — 연결된 쪽에 따라 하나. 건수는 2건 이상일 때만 붙인다(사건 흐름은 늘 붙인다). */
    heading: {
      flow: (n: number) => `사건 흐름 · ${n}건`,
      earlier: "이전 보도",
      earlierCount: (n: number) => `이전 보도 · ${n}건`,
      later: "후속 보도",
      laterCount: (n: number) => `후속 보도 · ${n}건`,
    },
    /** 줄마다 붙는 관계 표지. */
    relation: {
      earlier: "이전 보도",
      later: "후속 보도",
    },
    /** 보고 있는 기사 줄. */
    current: "지금 보는 기사",
    /** 호 날짜 툴팁 — 인자는 formatDate 결과. */
    issueTitle: (date: string) => `${date} 호`,
    /** 보고 있는 기사의 호 날짜와의 차(KST 달력 기준). */
    gap: {
      sameDay: "같은 날",
      before: (n: number) => `${n}일 전`,
      after: (n: number) => `${n}일 뒤`,
    },
  },
  en: {
    heading: {
      flow: (n: number) => `Story timeline · ${stories(n)}`,
      earlier: "Earlier coverage",
      earlierCount: (n: number) => `Earlier coverage · ${stories(n)}`,
      later: "Follow-up coverage",
      laterCount: (n: number) => `Follow-up coverage · ${stories(n)}`,
    },
    relation: {
      earlier: "Earlier",
      later: "Follow-up",
    },
    current: "This story",
    issueTitle: (date: string) => `${date} issue`,
    gap: {
      sameDay: "Same day",
      before: (n: number) => `${days(n)} earlier`,
      after: (n: number) => `${days(n)} later`,
    },
  },
});
