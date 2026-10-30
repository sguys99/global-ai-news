import { describe, expect, it } from "vitest";
import { FONT_SIZE_TOKENS, cn } from "@/lib/utils";

describe("cn — 커스텀 글자 크기 토큰(globals.css @theme)", () => {
  it("크기 토큰과 색상 클래스를 함께 넘기면 둘 다 남는다", () => {
    expect(cn("text-meta", "text-brand")).toBe("text-meta text-brand");
    expect(cn("text-meta text-muted-foreground", "font-bold")).toBe(
      "text-meta text-muted-foreground font-bold",
    );
    expect(cn("text-badge text-foreground")).toBe("text-badge text-foreground");
  });

  it.each(FONT_SIZE_TOKENS)("text-%s 는 색이 아니라 글자 크기 그룹이다", (token) => {
    expect(cn(`text-${token}`, "text-foreground-soft")).toBe(`text-${token} text-foreground-soft`);
  });

  it("크기끼리는 뒤의 것이 이긴다 — 키커 className='text-label' 이 13px 를 12px 로 바꾸고 코발트는 유지", () => {
    expect(cn("text-meta text-brand font-bold", "text-label")).toBe(
      "text-brand font-bold text-label",
    );
    expect(cn("text-meta", "text-[15px]")).toBe("text-[15px]");
    expect(cn("text-sm", "text-caption")).toBe("text-caption");
  });

  it("색끼리는 여전히 뒤의 것이 이긴다", () => {
    expect(cn("text-meta text-brand", "text-foreground")).toBe("text-meta text-foreground");
  });

  it("globals.css 의 --text-* 토큰을 모두 등록했다", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/app/globals.css", "utf8");
    const declared = [...css.matchAll(/^\s*--text-([a-z0-9-]+):/gm)]
      .map((m) => m[1])
      .filter((name) => !name.includes("--"));
    expect([...declared].sort()).toEqual([...FONT_SIZE_TOKENS].sort());
  });
});
