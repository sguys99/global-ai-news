import { defineMessages, plural } from "@/lib/i18n";

/**
 * 공유 썸네일(src/lib/ogImage.tsx, og:image PNG) 문구. 마스트헤드·1면·상세와 같은 말은 그 이름공간을 쓴다
 * (common `publishedDaily`, frontPage `front`, article `signals.importance`). ko 값은 지금 PNG 의 글자 그대로다
 * (한국어 썸네일 무변화 — 호수 "제 143호"는 폴리오 표기와 달리 띄어 쓴 채 둔다).
 */
export const ogMessages = defineMessages({
  ko: {
    /** 호 썸네일 데이트라인의 호수. */
    issueNo: (n: number) => `제 ${n}호`,
    /** 호 썸네일 키커 줄 오른쪽 — 마스트헤드 귀와 같은 호 기사 수. */
    issueCount: (n: number) => `이번 호 ${n}건`,
    /** 분야가 비어 있는 기사 썸네일의 키커. */
    fallbackKicker: "AI 뉴스",
  },
  en: {
    issueNo: (n: number) => `No. ${n}`,
    issueCount: (n: number) => `${n} ${plural(n, "story", "stories")}`,
    fallbackKicker: "AI news",
  },
});
