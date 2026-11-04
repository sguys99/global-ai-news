import { defineMessages } from "@/lib/i18n";

/**
 * 앱 전체 404(global-not-found.tsx · NotFoundNotice) 문구. 정적 호스팅은 404.html 한 장을 모든 언어 경로에 쓰므로
 * 두 언어를 한 화면에 함께 싣는다 — ko 가 앞, `/en/…` 에서는 en 이 앞(NotFoundNotice 의 `lang-en:` 변형).
 * 신문 지면의 '독자 안내' 말투: 제목은 마침표 없이, 설명은 한 문장 반.
 */
export const notFoundMessages = defineMessages({
  ko: {
    /** `<title>` 앞부분(두 언어를 이어 붙인다 — global-not-found metadata). */
    title: "페이지를 찾을 수 없습니다",
    /** 제호 자리 '귀' — 큰 404 옆 상태 줄. */
    status: "지면에 없는 페이지",
    kicker: "독자 안내",
    headline: "이 페이지는 지면에 실리지 않았습니다",
    body: "주소가 바뀌었거나 처음부터 없던 페이지입니다. 오늘의 지면으로 돌아가거나, 지난 기사는 검색에서 찾아보세요.",
    /** 바로 가기 목록 `<nav aria-label>`. */
    linksLabel: "바로 가기",
    links: {
      today: "오늘의 지면",
      search: "기사 검색",
    },
  },
  en: {
    title: "Page not found",
    status: "Page not found",
    kicker: "Reader notice",
    headline: "This page never went to print",
    body: "The link may be out of date, or the page never existed. Head back to today's issue, or search past stories.",
    linksLabel: "Go to",
    links: {
      today: "Today's issue",
      search: "Search past stories",
    },
  },
});
