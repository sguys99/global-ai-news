import { defineMessages } from "@/lib/i18n";

/**
 * 전역 푸터(src/components/Footer.tsx) 문구 — 콜로폰. 태그라인은 기본 공유 썸네일과 함께 쓰므로 site.ts
 * (`siteTagline`)가, 내비 링크는 common 의 `nav` 가 맡는다. 저작권 줄은 두 언어 같은 영문이라 컴포넌트에 둔다.
 */
export const footerMessages = defineMessages({
  ko: {
    colophon: "매일 06:00 KST에 글로벌·한국 소스를 수집하고 LLM이 요약·분류합니다.",
  },
  en: {
    colophon:
      "Collected from global and Korean sources every day at 06:00 KST, then summarized and classified by an LLM.",
  },
});
