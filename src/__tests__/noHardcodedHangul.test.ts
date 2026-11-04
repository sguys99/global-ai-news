import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 화면 문구 하드코딩 방지(영어판 Phase 3-3). 컴포넌트·뷰의 UI 문구는 `src/lib/messages/<영역>.ts` 사전에만 둔다 —
 * 컴포넌트에 한글을 직접 쓰면 영어판에 그대로 샌다. 주석을 지운 코드에 한글이 남으면 실패한다.
 *
 * 대상: `src/components/**`·`src/views/**`·`src/app/*.tsx`(셸·404)의 `.tsx`.
 * 제외: admin(로컬 운영 콘솔, 한국어 전용)·ui(shadcn 프리미티브)·`(ko)` 라우트 파일(메타데이터는 Phase 6에서 언어별로 옮긴다).
 */
const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["components", "views"];
const EXCLUDED_DIRS = new Set(["admin", "ui"]);
const HANGUL = /[가-힣]/;

function listTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return EXCLUDED_DIRS.has(e.name) ? [] : listTsx(full);
    return e.name.endsWith(".tsx") ? [full] : [];
  });
}

/** 블록·JSX·줄 주석을 지운다. 문자열 안의 `//`(URL)는 줄 주석으로 잘려도 놓치는 쪽이라 오탐은 없다. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function hangulLines(file: string): string[] {
  return stripComments(readFileSync(file, "utf8"))
    .split("\n")
    .filter((line) => HANGUL.test(line))
    .map((line) => `${path.relative(ROOT, file)}: ${line.trim()}`);
}

describe("하드코딩 한글 방지", () => {
  const files = [
    ...SCAN_DIRS.flatMap((d) => listTsx(path.join(ROOT, d))),
    ...listTsx(path.join(ROOT, "app")).filter((f) => path.dirname(f) === path.join(ROOT, "app")),
  ];

  it("검사 대상이 있다", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("컴포넌트·뷰 코드(주석 제외)에 한글이 없다 — 문구는 src/lib/messages 사전으로", () => {
    expect(files.flatMap(hangulLines)).toEqual([]);
  });

  it("주석만 지운다", () => {
    expect(stripComments('/* 설명 */ const a = "x"; // 메모\n{/* 표시 */}<b>y</b>')).not.toMatch(
      HANGUL,
    );
    expect(stripComments('<span>{"건"}</span>')).toMatch(HANGUL);
  });
});
