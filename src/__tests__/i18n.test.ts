import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  defineMessages,
  formatNumber,
  getMessages,
  isLocale,
  isMessageNamespace,
  LOCALES,
  localePath,
  messageShapeErrors,
  plural,
  splitLocalePath,
  type MessageNamespace,
  type MessageTree,
} from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";

describe("i18n — 언어 키", () => {
  it("ko 가 기본 언어이고 en 이 있다", () => {
    expect(LOCALES).toEqual(["ko", "en"]);
    expect(DEFAULT_LOCALE).toBe("ko");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ko")).toBe(true);
    expect(isLocale("ja")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("i18n — localePath", () => {
  it("ko 는 입력을 그대로 돌려준다(한국어 HTML 무변화)", () => {
    for (const p of [
      "/",
      "/search",
      "/article/12",
      "/edition/2026-11-03/",
      "/?category=physical&sort=hot",
      "#front",
      "?tag=mcp",
      "https://example.com/a",
      "",
    ]) {
      expect(localePath("ko", p)).toBe(p);
    }
  });

  it("en 은 루트 상대 경로 앞에 /en 을 붙인다", () => {
    expect(localePath("en", "/")).toBe("/en/");
    expect(localePath("en", "/search")).toBe("/en/search");
    expect(localePath("en", "/article/12")).toBe("/en/article/12");
    expect(localePath("en", "/edition/2026-11-03/")).toBe("/en/edition/2026-11-03/");
    expect(localePath("en", "/?category=physical")).toBe("/en/?category=physical");
    expect(localePath("en", "/search?q=mcp")).toBe("/en/search?q=mcp");
    expect(localePath("en", "/#all")).toBe("/en/#all");
  });

  it("en: 이미 /en 이면 두 번 붙이지 않는다", () => {
    expect(localePath("en", "/en")).toBe("/en");
    expect(localePath("en", "/en/")).toBe("/en/");
    expect(localePath("en", "/en/article/1")).toBe("/en/article/1");
    expect(localePath("en", "/en?x=1")).toBe("/en?x=1");
    // 접두어가 아닌 경로는 붙인다.
    expect(localePath("en", "/english")).toBe("/en/english");
  });

  it("en: 해시·쿼리만인 경로와 외부 URL 은 그대로 둔다", () => {
    expect(localePath("en", "#front")).toBe("#front");
    expect(localePath("en", "?tag=mcp")).toBe("?tag=mcp");
    expect(localePath("en", "https://techcrunch.com/x")).toBe("https://techcrunch.com/x");
    expect(localePath("en", "//cdn.example.com/a.js")).toBe("//cdn.example.com/a.js");
    expect(localePath("en", "")).toBe("");
  });

  it("splitLocalePath: 언어와 접두어 뗀 경로", () => {
    expect(splitLocalePath("/")).toEqual({ locale: "ko", path: "/" });
    expect(splitLocalePath("/article/1/")).toEqual({ locale: "ko", path: "/article/1/" });
    expect(splitLocalePath("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocalePath("/en/")).toEqual({ locale: "en", path: "/" });
    expect(splitLocalePath("/en/article/1/")).toEqual({ locale: "en", path: "/article/1/" });
    expect(splitLocalePath("/en?x=1")).toEqual({ locale: "en", path: "/?x=1" });
    expect(splitLocalePath("/english")).toEqual({ locale: "ko", path: "/english" });
  });

  it("localePath ↔ splitLocalePath 왕복", () => {
    for (const p of ["/", "/search", "/article/12/", "/edition/2026-11-03/", "/?sort=hot"]) {
      expect(splitLocalePath(localePath("en", p))).toEqual({ locale: "en", path: p });
      expect(splitLocalePath(localePath("ko", p))).toEqual({ locale: "ko", path: p });
    }
  });
});

describe("i18n — 문구 도우미", () => {
  it("plural 은 1 만 단수", () => {
    expect(plural(1, "story", "stories")).toBe("story");
    expect(plural(0, "story", "stories")).toBe("stories");
    expect(plural(31, "story", "stories")).toBe("stories");
  });

  it("formatNumber 는 천 단위 쉼표", () => {
    expect(formatNumber(1234, "ko")).toBe("1,234");
    expect(formatNumber(1234, "en")).toBe("1,234");
  });

  it("defineMessages 결과는 언어별 문구이고 식별 표시는 열거되지 않는다", () => {
    const ns = defineMessages({
      ko: { a: "가", n: (n: number) => `${n}건` },
      en: { a: "A", n: (n: number) => `${n}` },
    });
    expect(isMessageNamespace(ns)).toBe(true);
    expect(isMessageNamespace({ ko: {}, en: {} })).toBe(false);
    expect(Object.keys(ns)).toEqual(["ko", "en"]);
    expect(getMessages(ns, "ko").a).toBe("가");
    expect(getMessages(ns, "en").n(3)).toBe("3");
  });

  it("타입: en 은 ko 와 키·값 종류가 같아야 한다", () => {
    // 아래 @ts-expect-error 가 쓸모없어지면(=오류가 안 나면) typecheck 가 실패한다.
    // @ts-expect-error en 키 누락
    defineMessages({ ko: { a: "가", b: "나" }, en: { a: "A" } });
    // @ts-expect-error en 에만 있는 키
    defineMessages({ ko: { a: "가" }, en: { a: "A", extra: "X" } });
    // @ts-expect-error 문자열 자리에 함수
    defineMessages({ ko: { a: "가" }, en: { a: () => "A" } });
    // @ts-expect-error 함수 인자 형 불일치
    defineMessages({ ko: { n: (n: number) => `${n}` }, en: { n: (s: string) => s } });
    // @ts-expect-error 중첩 키 누락
    defineMessages({ ko: { nav: { a: "가", b: "나" } }, en: { nav: { a: "A" } } });
    // ko 리터럴과 다른 영어 문자열은 당연히 허용된다.
    defineMessages({ ko: { a: "가" }, en: { a: "A" } });
  });

  it("messageShapeErrors: 누락·남는 키·종류 불일치·한쪽만 빈 값", () => {
    expect(messageShapeErrors({ a: "가", t: { b: "나" } }, { a: "A", t: { b: "B" } })).toEqual([]);
    expect(
      messageShapeErrors(
        { a: "가", b: "나", f: () => "", t: { x: "x" }, e: "이" },
        { a: "A", c: "C", f: "F", t: {}, e: "" },
      ),
    ).toEqual([
      "b: en 에 없음",
      "f: 값 종류 다름(ko function, en string)",
      "t.x: en 에 없음",
      "e: 한쪽만 빈 문자열",
      "c: ko 에 없음(en 에만 있음)",
    ]);
  });
});

/**
 * src/lib/messages/ 의 모든 파일을 읽어 내보낸 이름공간을 전부 검사한다 — 새 이름공간 파일을 더해도 등록 없이 검사된다.
 */
const MESSAGES_DIR = path.join(__dirname, "../lib/messages");

async function loadNamespaces(): Promise<
  { file: string; name: string; ns: MessageNamespace<MessageTree> }[]
> {
  const files = readdirSync(MESSAGES_DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
  const out: { file: string; name: string; ns: MessageNamespace<MessageTree> }[] = [];
  for (const file of files) {
    const mod = (await import(path.join(MESSAGES_DIR, file))) as Record<string, unknown>;
    const found = Object.entries(mod).filter(([, v]) => isMessageNamespace(v));
    // 이름공간 파일은 defineMessages 결과를 하나 이상 내보내야 한다(빈 파일·다른 용도 파일 방지).
    expect(found.length, `${file}: defineMessages 결과를 내보내지 않음`).toBeGreaterThan(0);
    for (const [name, ns] of found)
      out.push({ file, name, ns: ns as MessageNamespace<MessageTree> });
  }
  return out;
}

/** 문구 트리의 함수 값을 모두 찾아 대표 인자로 불러 본다(문자열을 돌려주는지). */
function callableLeaves(tree: unknown, prefix = ""): [string, (...a: unknown[]) => unknown][] {
  const out: [string, (...a: unknown[]) => unknown][] = [];
  for (const [k, v] of Object.entries(tree as Record<string, unknown>)) {
    const at = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "function") out.push([at, v as (...a: unknown[]) => unknown]);
    else if (v && typeof v === "object") out.push(...callableLeaves(v, at));
  }
  return out;
}

describe("문구 사전 — 모든 이름공간", () => {
  it("이름공간이 하나 이상 있고 common 이 포함된다", async () => {
    const all = await loadNamespaces();
    expect(all.map((x) => x.name)).toContain("commonMessages");
  });

  it("en 은 ko 의 모든 키를 같은 값 종류로 갖는다(깊이 비교)", async () => {
    for (const { file, name, ns } of await loadNamespaces()) {
      expect(messageShapeErrors(ns.ko, ns.en), `${file} ${name}`).toEqual([]);
    }
  });

  it("함수 문구는 두 언어 모두 문자열을 돌려주고, en 문구에는 한글이 없다", async () => {
    const hangul = /[ᄀ-ᇿ㄰-㆏가-힯]/;
    for (const { file, name, ns } of await loadNamespaces()) {
      for (const [at, fn] of callableLeaves(ns.ko)) {
        // 대표 인자 — 숫자 인자를 받는 보간·복수형이 대부분이다. 다른 인자 형이면 문자열만 확인한다.
        expect(typeof fn(2), `${file} ${name} ko.${at}`).toBe("string");
      }
      for (const [at, fn] of callableLeaves(ns.en)) {
        for (const n of [0, 1, 2]) {
          const text = fn(n);
          expect(typeof text, `${file} ${name} en.${at}`).toBe("string");
          expect(hangul.test(String(text)), `${file} ${name} en.${at}(${n}) = ${text}`).toBe(false);
        }
      }
      const strings = JSON.stringify(ns.en);
      expect(hangul.test(strings), `${file} ${name} en 문자열에 한글`).toBe(false);
    }
  });
});

describe("common 문구", () => {
  it("ko 는 지금 컴포넌트의 하드코딩 문자열과 같다", () => {
    const t = commonMessages.ko;
    expect(t.nav.today).toBe("오늘의 지면");
    expect(t.nav.search).toBe("검색");
    expect(t.nav.feed).toBe("피드");
    expect(t.visits(1234)).toBe("누적 방문 1,234회");
  });

  it("en 은 복수형을 맞춘다", () => {
    expect(commonMessages.en.visits(1)).toBe("1 visit");
    expect(commonMessages.en.visits(1234)).toBe("1,234 visits");
  });
});
