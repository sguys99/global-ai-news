import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  NOT_FOUND_EN_LINK_LOCALE,
  NotFoundNotice,
  notFoundLangScript,
} from "@/components/NotFoundNotice";
import { localePath } from "@/lib/i18n";
import { notFoundMessages } from "@/lib/messages/notFound";

const { ko, en } = notFoundMessages;

describe("NotFoundNotice — 앱 전체 404 본문", () => {
  it("한국어 단이 h1, 영어 단이 lang=en h2", () => {
    render(<NotFoundNotice />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(ko.headline);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.textContent).toBe(en.headline);
    expect(h2.closest("section")?.getAttribute("lang")).toBe("en");
    expect(h1.closest("section")?.getAttribute("lang")).toBe("ko");
  });

  it("두 언어 상태 줄과 설명을 함께 싣는다", () => {
    render(<NotFoundNotice />);
    const status = screen.getByTestId("not-found-status");
    expect(status.textContent).toContain(ko.status);
    expect(status.textContent).toContain(en.status);
    expect(screen.getByText(ko.body)).toBeTruthy();
    expect(screen.getByText(en.body)).toBeTruthy();
  });

  it("바로 가기: 한국어는 오늘의 지면·검색, 영어는 영어판 홈·검색(Phase 5-2)", () => {
    render(<NotFoundNotice />);
    const koNav = screen.getByRole("navigation", { name: ko.linksLabel });
    const koLinks = within(koNav).getAllByRole("link");
    expect(koLinks.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [ko.links.today, "/"],
      [ko.links.search, "/search"],
    ]);
    const enNav = screen.getByRole("navigation", { name: en.linksLabel });
    expect(
      within(enNav)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual([
      // Next Link 는 테스트 환경(trailingSlash 미적용)에서 끝 슬래시를 뗀다.
      expect.stringMatching(/^\/en\/?$/),
      localePath(NOT_FOUND_EN_LINK_LOCALE, "/search"),
    ]);
    expect(NOT_FOUND_EN_LINK_LOCALE).toBe("en");
  });
});

describe("notFoundLangScript — /en 아래면 lang=en", () => {
  /** 스크립트를 가짜 location·document 로 돌려 바뀐 lang 을 돌려준다. */
  function langAfter(basePath: string, pathname: string): string {
    const doc = { documentElement: { lang: "ko" } };
    new Function("location", "document", notFoundLangScript(basePath))({ pathname }, doc);
    return doc.documentElement.lang;
  }

  it("basePath 아래 /en·/en/… 은 en", () => {
    expect(langAfter("/global-ai-news", "/global-ai-news/en")).toBe("en");
    expect(langAfter("/global-ai-news", "/global-ai-news/en/")).toBe("en");
    expect(langAfter("/global-ai-news", "/global-ai-news/en/article/1/")).toBe("en");
    expect(langAfter("", "/en/nope")).toBe("en");
  });

  it("그 밖은 ko 그대로(접두어가 아닌 /english 포함)", () => {
    expect(langAfter("/global-ai-news", "/global-ai-news/nope/")).toBe("ko");
    expect(langAfter("/global-ai-news", "/global-ai-news/english/")).toBe("ko");
    expect(langAfter("/global-ai-news", "/en/")).toBe("ko");
    expect(langAfter("", "/article/9999")).toBe("ko");
  });
});
