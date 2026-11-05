/**
 * 테스트 도우미 — globals.css 컴포넌트 층(`@layer components`)의 클래스 정의를 읽는다(english-version-plan Phase 4-1).
 * 긴 Tailwind 묶음을 짧은 컴포넌트 클래스(`sg-kick` 등)로 바꾼 뒤에도, 렌더 테스트가 "그 요소가 어떤 유틸리티를 갖는가"를
 * 확인할 수 있게 `.이름 { @apply …; }` 의 유틸리티 목록을 돌려준다.
 */
import fs from "node:fs";
import path from "node:path";

export const GLOBALS_CSS = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

/** `.name { @apply a b c; }` → ["a", "b", "c"]. 정의가 없으면 던진다(이름 오타를 테스트가 잡게). */
export function applyOf(name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = GLOBALS_CSS.match(
    new RegExp(`\\.${escaped}\\s*\\{\\s*(?:/\\*[\\s\\S]*?\\*/\\s*)?@apply\\s+([^;]+);`),
  );
  if (!m) throw new Error(`globals.css 에 .${name} { @apply …; } 정의가 없다`);
  return m[1].trim().split(/\s+/);
}

/** 요소의 클래스 중 컴포넌트 클래스는 그 @apply 목록으로 펼친 유틸리티 집합(유틸리티는 그대로). */
export function expandedClasses(el: Element): string[] {
  return [...el.classList].flatMap((c) => (COMPONENT_CLASS.test(c) ? applyOf(c) : [c]));
}

/** 컴포넌트 클래스 이름 규칙 — `<영역 2글자>-<부분>`(globals.css 머리 주석). */
export const COMPONENT_CLASS = /^(sg|st|ed|ar|fb|sh|ui)-[a-z0-9-]+$/;
