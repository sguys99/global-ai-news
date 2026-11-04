import { defineMessages, formatNumber, plural } from "@/lib/i18n";

/**
 * 공용 문구 — 헤더·모바일 바·하단 탭 바·푸터·테마 토글처럼 여러 셸 컴포넌트가 함께 쓰는 것.
 * ko 값은 지금 컴포넌트에 하드코딩된 문자열과 글자 하나까지 같아야 한다(영어판 Phase 3 한국어 HTML 무변화).
 * 컴포넌트 한 곳만 쓰는 문구는 여기 두지 말고 그 영역의 이름공간 파일(`src/lib/messages/<영역>.ts`)에 둔다.
 */
export const commonMessages = defineMessages({
  ko: {
    nav: {
      /** HeaderNav·Footer — 홈(최신 호). */
      today: "오늘의 지면",
      /** BottomTabBar 홈 탭. */
      feed: "피드",
      /** HeaderNav·Footer·BottomTabBar 탭, MobileTopBar 검색 버튼 aria-label. */
      search: "검색",
      /** BottomTabBar 관리자 변형(로컬 전용). */
      console: "콘솔",
    },
    /** HeaderNav `<nav aria-label>`. */
    mainNavLabel: "주 메뉴",
    /** BottomTabBar `<nav aria-label>`. */
    mobileNavLabel: "모바일 내비게이션",
    /** HeaderWordmark 링크 aria-label. */
    homeLabel: "AI Daybook 홈",
    /** Masthead 폴리오 오른쪽. */
    publishedDaily: "매일 06:00 KST 발행",
    theme: {
      /** ThemeToggle — 마운트 전(테마 미상). */
      toggle: "테마 전환",
      toLight: "라이트 모드로 전환",
      toDark: "다크 모드로 전환",
    },
    /** VisitorCount 푸터 줄. */
    visits: (n: number) => `누적 방문 ${formatNumber(n, "ko")}회`,
  },
  en: {
    nav: {
      today: "Today's issue",
      feed: "Today",
      search: "Search",
      console: "Console",
    },
    mainNavLabel: "Main menu",
    mobileNavLabel: "Mobile navigation",
    homeLabel: "AI Daybook home",
    publishedDaily: "Published daily at 06:00 KST",
    theme: {
      toggle: "Toggle theme",
      toLight: "Switch to light mode",
      toDark: "Switch to dark mode",
    },
    visits: (n: number) => `${formatNumber(n, "en")} ${plural(n, "visit", "visits")}`,
  },
});
