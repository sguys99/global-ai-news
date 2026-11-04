import { defineMessages } from "@/lib/i18n";

/**
 * 세 줄 요약 띠(src/components/IssueBrief.tsx) 문구. 줄 자체(brief_json)는 데이터라 여기 두지 않는다.
 * 머리는 줄 수를 그대로 말한다 — 2줄만 남은 호에 "세 줄"이라 쓰면 틀린 말이 된다.
 */
const KO_COUNT_WORDS = ["", "한", "두", "세"] as const;
const EN_COUNT_WORDS = ["", "One thing", "Two things", "Three things"] as const;

export const issueBriefMessages = defineMessages({
  ko: {
    /** 줄 수 → 머리("세 줄 요약"). 범위 밖은 "세". */
    heading: (count: number) => `${KO_COUNT_WORDS[count] ?? "세"} 줄 요약`,
    subtitle: "이번 호 핵심",
  },
  en: {
    heading: (count: number) => `${EN_COUNT_WORDS[count] ?? "Three things"} to know`,
    subtitle: "This issue at a glance",
  },
});
