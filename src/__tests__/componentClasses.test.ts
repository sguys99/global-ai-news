import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPONENT_CLASS, GLOBALS_CSS, applyOf } from "./componentCss";

/**
 * 컴포넌트 클래스(globals.css `@layer components`, english-version-plan Phase 4-1)와 그 사용처가 어긋나지 않는지 —
 * 이름 오타는 클래스가 조용히 사라져 화면만 깨지므로(빌드·타입 검사가 못 잡는다) 여기서 잡는다.
 */
const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

/** 소스의 문자열 리터럴 안에서 컴포넌트 클래스 이름 규칙에 맞는 낱말. */
function usedClasses(): Map<string, string> {
  const used = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    for (const lit of text.match(/"[^"\n]*"|`[^`]*`/g) ?? [])
      for (const word of lit.slice(1, -1).split(/[\s"`${}]+/))
        if (COMPONENT_CLASS.test(word) && !word.endsWith("-"))
          used.set(word, path.relative(SRC, file));
  }
  return used;
}

/** globals.css 컴포넌트 층에 정의된 클래스(선택자 머리의 `.이름`). */
function definedClasses(): Set<string> {
  const layer = GLOBALS_CSS.slice(GLOBALS_CSS.indexOf("@layer components"));
  return new Set(
    [...layer.matchAll(/\.([a-z]{2}-[a-z0-9-]+)/g)]
      .map((m) => m[1])
      .filter((c) => COMPONENT_CLASS.test(c)),
  );
}

describe("컴포넌트 클래스 — globals.css 정의와 사용처", () => {
  it("소스가 쓰는 컴포넌트 클래스는 모두 globals.css 에 정의돼 있다", () => {
    const defined = definedClasses();
    const missing = [...usedClasses()]
      .filter(([c]) => !defined.has(c))
      .map(([c, f]) => `${c} (${f})`);
    expect(missing).toEqual([]);
  });

  it("정의만 있고 쓰이지 않는 컴포넌트 클래스가 없다", () => {
    const used = usedClasses();
    expect([...definedClasses()].filter((c) => !used.has(c))).toEqual([]);
  });

  it("컴포넌트 클래스는 @layer components 안에 있다(@utility 금지 — 호출부 유틸리티 덮어쓰기가 이겨야 한다)", () => {
    expect(GLOBALS_CSS).toMatch(/@layer components \{/);
    expect(GLOBALS_CSS).not.toMatch(/@utility (sg|st|ed|ar|fb|sh|ui)-/);
    // 이름 규칙 확인용 표본 — 정의를 읽을 수 있어야 한다.
    expect(applyOf("sg-kick")).toContain("text-brand");
  });
});
