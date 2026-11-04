import { defineMessages, formatNumber } from "@/lib/i18n";

/**
 * 전체 기사 색인(src/components/StoryIndex.tsx) 문구 — "더 보기" 버튼과 색인 데이터 상태 줄(IndexLoadStatus).
 * 색인 머리("전체 기사"·"이 호의 기사")는 그 색인을 싣는 화면 이름공간(feed·edition) 몫이다.
 */
export const storyIndexMessages = defineMessages({
  ko: {
    more: "기사 더 보기",
    /**
     * "더 보기" 버튼 안 흐린 건수 `남은 <N>건` — 앞·수·뒤를 따로 그린다(정적 HTML 텍스트 경계 유지).
     * en 은 수가 앞이면 좋겠지만 앞 조각을 비울 수 없어(문구 사전은 빈 문자열을 번역 누락으로 본다) 괄호로 감싼다.
     */
    remaining: {
      before: "남은 ",
      num: (n: number) => `${n}`,
      after: "건",
    },
    loadError: "기사 목록을 불러오지 못했습니다.",
    retry: "다시 시도",
    loading: "기사 목록을 불러오는 중…",
  },
  en: {
    more: "More stories",
    remaining: {
      before: "(",
      num: (n: number) => formatNumber(n, "en"),
      after: " left)",
    },
    loadError: "Couldn't load the story list.",
    retry: "Try again",
    loading: "Loading stories…",
  },
});
