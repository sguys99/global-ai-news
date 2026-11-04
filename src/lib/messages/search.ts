import { defineMessages } from "@/lib/i18n";

/**
 * 검색 페이지 머리(src/views/SearchView.tsx) 문구. 검색창·필터·결과 문구는 SearchClient 이름공간 몫이다(Phase 3-3 C단계).
 * `<title>`·공유 메타는 라우트 metadata 가 맡는다(영어는 Phase 6).
 */
export const searchMessages = defineMessages({
  ko: {
    kicker: "검색",
    title: "기사 찾기",
  },
  en: {
    kicker: "Search",
    title: "Find stories",
  },
});
