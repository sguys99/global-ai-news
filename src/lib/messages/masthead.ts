import { defineMessages, plural } from "@/lib/i18n";
import { issueNoLabel } from "@/lib/labels";

/**
 * 마스트헤드(src/components/Masthead.tsx) 문구 — 폴리오·공유 제목·제호 '귀'(이번 호 통계)·섹션 내비.
 * 폴리오 오른쪽 "매일 06:00 KST 발행"은 셸과 같은 말이라 common 의 `publishedDaily` 를 쓴다.
 * 날짜·호수·분야·형식 표시명은 labels.ts(locale 인자)가 맡는다.
 */
export const mastheadMessages = defineMessages({
  ko: {
    /** 발행일 링크 title — 그 호의 고정 링크(`/edition/[date]/`). */
    permalinkTitle: "이 호의 고정 링크",
    /** 공유 시트 제목: 사이트명 + 긴 날짜 + 호수(0 = 생략). */
    shareTitle: (site: string, date: string, issueNo: number) =>
      `${site} ${date}${issueNo > 0 ? ` ${issueNoLabel(issueNo, "ko")}` : ""}`,
    /** 섹션 내비 `<nav aria-label>`. */
    sectionsLabel: "지면 섹션",
    nav: {
      front: "1면",
      weekly: "주간 레이더",
      /** 마지막 항목(#all) 기본값 — 호 고정 링크 지면은 edition 의 `index`("이 호의 기사")를 넘긴다. */
      all: "전체 기사",
    },
    ear: {
      /** md 이상 세로 칸 머리. */
      heading: "이번 호",
      /** 모바일 한 줄 앞머리(끝 공백 포함). */
      prefix: "이번 호 ",
      /** 큰 숫자 바로 뒤 단위(숫자와 다른 서체 칸이라 따로 둔다 — en 은 앞 공백 포함). */
      unit: { one: "건", other: "건" },
      /** 단위 다음 칸: 서로 다른 매체 수. */
      outlets: (n: number) => `· 매체 ${n}곳`,
    },
  },
  en: {
    permalinkTitle: "Permalink to this issue",
    shareTitle: (site: string, date: string, issueNo: number) =>
      `${site} — ${date}${issueNo > 0 ? ` · ${issueNoLabel(issueNo, "en")}` : ""}`,
    sectionsLabel: "Sections",
    nav: {
      front: "Front page",
      weekly: "Weekly radar",
      all: "All stories",
    },
    ear: {
      heading: "This issue",
      prefix: "This issue ",
      unit: { one: " story", other: " stories" },
      outlets: (n: number) => `· ${n} ${plural(n, "outlet", "outlets")}`,
    },
  },
});
