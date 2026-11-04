import { defineMessages } from "@/lib/i18n";

/**
 * 필터·정렬 바(src/components/FilterBar.tsx)와 모바일 필터 바텀시트(src/components/mobile/FilterSheet.tsx) 문구.
 * 분야 칩 표시명은 labels.ts `categoryLabel`, 매체 칩은 `sourceDisplayName`(feedFilter `groupSources`)이 맡는다.
 */
export const filterMessages = defineMessages({
  ko: {
    /** 정렬 탭 묶음 `role="group"` aria-label. */
    sortLabel: "정렬",
    /** 정렬 탭 — 화제순이 기본(sort 쿼리 없음). */
    sort: {
      trending: "화제순",
      latest: "최신순",
      importance: "중요도순",
    },
    /** 칩 행 라벨(왼쪽 열 `w-10` — 짧게). */
    rows: {
      category: "분야",
      source: "매체",
      tag: "태그",
    },
    sheet: {
      /** 트리거 버튼·시트 `role="dialog"` aria-label·시트 머리. */
      title: "필터",
      /** 배경 오버레이 버튼 aria-label. */
      dismiss: "필터 닫기",
      /** 시트 머리 X 버튼 aria-label. */
      close: "닫기",
      showResults: "결과 보기",
    },
  },
  en: {
    sortLabel: "Sort",
    sort: {
      trending: "Trending",
      latest: "Latest",
      importance: "Importance",
    },
    rows: {
      category: "Topic",
      source: "Outlet",
      tag: "Tag",
    },
    sheet: {
      title: "Filters",
      dismiss: "Close filters",
      close: "Close",
      showResults: "Show results",
    },
  },
});
