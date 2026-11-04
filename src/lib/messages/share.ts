import { defineMessages } from "@/lib/i18n";

/**
 * 호 공유 버튼(src/components/ShareButton.tsx) 문구. 공유 주소·공유 제목은 부르는 쪽(Masthead)이 언어판에 맞춰 넘긴다.
 */
export const shareMessages = defineMessages({
  ko: {
    /** 버튼 title 툴팁. */
    hint: "이 호의 고정 링크 공유",
    share: "공유",
    copied: "링크 복사됨",
    /** 스크린리더 상태 알림(sr-only). */
    copiedStatus: "이 호의 링크를 복사했습니다",
    /** 클립보드가 막혔을 때 window.prompt 안내. */
    copyPrompt: "이 링크를 복사해 공유하세요",
  },
  en: {
    hint: "Share a permanent link to this issue",
    share: "Share",
    copied: "Link copied",
    copiedStatus: "Link to this issue copied",
    copyPrompt: "Copy this link to share",
  },
});
