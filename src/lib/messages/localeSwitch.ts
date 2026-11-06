import { defineMessages } from "@/lib/i18n";

/**
 * 언어 전환 문구(english-version-plan 5-3, DESIGN.md §9 "언어 전환") — **대상 언어로 쓴 대상 언어 이름**이라
 * 다른 이름공간과 달리 지금 페이지 언어가 아니라 **가려는 언어**로 고른다: `getMessages(localeSwitchMessages, target)`.
 * 한국어 페이지는 `en` 값(`EN`·`Read in English`·안내 줄), 영어 페이지는 `ko` 값(`한국어`)을 그린다 —
 * 그래서 영어 문구 사전에 한글이 없다는 규칙(i18n.test)과 영어 페이지의 `한국어` 링크가 함께 성립한다.
 * 링크·안내 줄 요소에는 `lang` 을 대상 언어로 단다(LocaleSwitch·EnglishNotice, 보관 지면 머리 띠).
 */
export const localeSwitchMessages = defineMessages({
  ko: {
    /** 영어 페이지 헤더·모바일 바·푸터의 전환 링크 글자. */
    label: "한국어",
    /** 링크 aria-label·title. */
    title: "한국어로 읽기",
    /** 대상 언어 안내 줄(지금은 한국어 페이지의 영어 안내 줄만 있다 — 짝을 맞추는 자리). */
    notice: "AI Daybook 한국어판 읽기",
    /** 안내 줄 닫기 버튼 aria-label. */
    dismiss: "닫기",
  },
  en: {
    label: "EN",
    title: "Read in English",
    notice: "Read AI Daybook in English",
    dismiss: "Dismiss",
  },
});
