import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleLink, articleHref } from "@/components/ArticleLink";

/**
 * 기사 링크(Phase 4-1, 분석 순위 9): 기사 페이지의 RSC(index.txt)는 빌드 후 지우므로(scripts/postbuild.ts)
 * 기사로 가는 링크는 prefetch 없는 일반 `<a>` 여야 한다 — next/link 가 남으면 없는 .txt 를 미리 받다 404 를 헛받는다.
 */
describe("ArticleLink", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("일반 <a> — 끝 슬래시 경로, 언어 접두어, 나머지 속성은 그대로", () => {
    render(
      <>
        <ArticleLink articleId={12} className="story-link st-lead" aria-current="page">
          ko
        </ArticleLink>
        <ArticleLink articleId={7} locale="en">
          en
        </ArticleLink>
      </>,
    );
    const ko = screen.getByRole("link", { name: "ko" });
    expect(ko.tagName).toBe("A");
    expect(ko).toHaveAttribute("href", "/article/12/");
    expect(ko).toHaveAttribute("class", "story-link st-lead");
    expect(ko).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "en" })).toHaveAttribute("href", "/en/article/7/");
  });

  it("프로덕션 basePath 를 붙인다 — next/link 가 그리던 href 와 같다", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/global-ai-news");
    vi.resetModules();
    const mod = await import("@/components/ArticleLink");
    expect(mod.articleHref(1286)).toBe("/global-ai-news/article/1286/");
    expect(mod.articleHref(1286, "en")).toBe("/global-ai-news/en/article/1286/");
  });

  it("dev·테스트(basePath 없음)", () => {
    expect(articleHref(3)).toBe("/article/3/");
  });
});

describe("기사 링크는 ArticleLink 로만", () => {
  const ROOT = path.resolve(__dirname, "..");
  const list = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "admin" ? [] : list(full);
      return /\.tsx?$/.test(e.name) && !e.name.includes(".local.") ? [full] : [];
    });
  const files = ["components", "views", "app"].flatMap((d) => list(path.join(ROOT, d)));

  it("컴포넌트·뷰·라우트가 `/article/…` 내부 경로를 직접 만들지 않는다(next/link·router 로 기사에 가지 않게)", () => {
    const offenders = files.flatMap((f) =>
      readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .split("\n")
        .filter((line) => /[`"']\/article\//.test(line))
        .map((line) => `${path.relative(ROOT, f)}: ${line.trim()}`),
    );
    // 허용: ArticleLink 자신(articleHref)과 기사 라우트의 canonical 경로 메타(링크가 아니다).
    expect(
      offenders.filter(
        (l) => !l.startsWith("components/ArticleLink.tsx") && !l.includes("path: `/article/"),
      ),
    ).toEqual([]);
  });
});
