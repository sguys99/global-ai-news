import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * globals.css `@theme` 의 커스텀 글자 크기 토큰(`--text-*`). 단일 출처는 globals.css — 토큰을 늘리면 여기도 추가한다.
 * twMerge 는 모르는 `text-*` 를 색상 클래스로 읽어, `cn("text-meta", "text-brand")` 처럼 색과 함께 넘기면
 * 크기를 지워 버린다(키커·바이라인이 13px 대신 상속 크기로 그려지던 버그 — contents-upgrade-plan Phase 6 ⑭).
 */
export const FONT_SIZE_TOKENS = [
  "nameplate",
  "display-xl",
  "display-lg",
  "display-md",
  "headline",
  "dek",
  "body",
  "title",
  "caption",
  "meta",
  "label",
  "badge",
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...FONT_SIZE_TOKENS] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
