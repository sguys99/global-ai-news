import { defineMessages, plural } from "@/lib/i18n";
import { issueNoLabel } from "@/lib/labels";

/**
 * 보관 지면(english-version-plan Phase 4-3 — 90일 지난 기사·호의 가벼운 정적 페이지, src/lib/archivePage.ts) 문구.
 * 보관 지면에도 같은 말이 나오는 것(오늘의 지면·검색·한국어 요약·원문 기사 읽기·같은 소식 다른 매체·이번 호 N건·
 * 세 줄 요약·호 이동·중요도·"외 N곳"·1면)은 그 영역 이름공간(common·article·masthead·issueBrief·edition·pager·meta)을
 * 그대로 쓰고, 여기에는 보관 지면에만 있는 말만 둔다. 날짜·호수·분야·형식 표시명은 labels.ts 가 맡는다.
 * 시안: docs/design/mockups/archive-article.html · archive-edition.html.
 */
export const archiveMessages = defineMessages({
  ko: {
    /** 폴리오 첫 칸(잉크 굵은 글자). */
    label: "보관 지면",
    /** 푸터 안내 — 인자는 보관 창(ARCHIVE_WINDOW_DAYS). */
    footerNote: (days: number) => `${days}일이 지난 지면은 가벼운 보관판으로 싣습니다.`,
    /** 보관 기사 끝 "이 호로" 한 줄 — 위 칸(같은 호의 나머지 기사 수). */
    issueOthers: (n: number) => `이 호의 다른 기사 ${n}건`,
    /** 같은 줄 가운데 칸(세리프) — 그 호 지면으로. */
    toIssue: (issueNo: number) => `${issueNoLabel(issueNo, "ko")} 지면 →`,
    /** 같은 소식 다른 매체가 5곳을 넘을 때 나머지 셈. */
    moreOutlets: (n: number) => `외 ${n}곳`,
    /** 보관 호 "이 호의 기사" 머리 옆 — 건수 + 묶음 기준. */
    byCategory: (n: number) => `${n}건 · 분야별`,
  },
  en: {
    label: "From the archive",
    footerNote: (days: number) =>
      `Issues older than ${days} days are kept as a lightweight archive edition.`,
    issueOthers: (n: number) => `${n} more ${plural(n, "story", "stories")} in this issue`,
    toIssue: (issueNo: number) => `${issueNoLabel(issueNo, "en")} →`,
    moreOutlets: (n: number) => `+${n} more`,
    byCategory: (n: number) => `${n} ${plural(n, "story", "stories")} · by section`,
  },
});
