import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnglishNotice } from "@/components/EnglishNotice";
import { LocaleProvider } from "@/components/LocaleProvider";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import {
  ENGLISH_NOTICE_DISMISS_KEY,
  alternateSelector,
  localeHomeHref,
  localeSwitchHref,
  otherLocale,
  shouldShowEnglishNotice,
} from "@/lib/localeSwitch";

/*
 * 언어 전환(english-version-plan 5-3): 링크 대상 규칙(같은 페이지의 다른 언어판 = 페이지 `<head>` 의 hreflang 짝,
 * 없으면 그 언어 홈), 셸 링크(EN / 한국어), 한국어 페이지 영어 안내 줄(브라우저 언어·닫기 기억).
 * 테스트 환경은 basePath "" · SITE_URL http://localhost:3000.
 */

const usePathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

/** 페이지 `<head>` 에 Next 가 그리는 hreflang 짝(절대 URL). */
function setAlternates(languages: Record<string, string> | null) {
  for (const el of Array.from(document.head.querySelectorAll('link[rel="alternate"]'))) el.remove();
  for (const [lang, href] of Object.entries(languages ?? {})) {
    const link = document.createElement("link");
    link.rel = "alternate";
    link.setAttribute("hreflang", lang);
    link.href = href;
    document.head.append(link);
  }
}

afterEach(() => {
  cleanup();
  setAlternates(null);
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  usePathname.mockReturnValue("/");
});

describe("localeSwitchHref — 순수 규칙", () => {
  it("대상 언어와 그 홈", () => {
    expect(otherLocale("ko")).toBe("en");
    expect(otherLocale("en")).toBe("ko");
    expect(localeHomeHref("en")).toBe("/en/");
    expect(localeHomeHref("ko")).toBe("/");
    expect(alternateSelector("en")).toBe('link[rel="alternate"][hreflang="en"]');
  });

  it("짝이 없으면(null·빈 값·읽을 수 없는 주소) 그 언어 홈", () => {
    expect(localeSwitchHref("en", null)).toBe("/en/");
    expect(localeSwitchHref("en", undefined)).toBe("/en/");
    expect(localeSwitchHref("ko", "")).toBe("/");
    expect(localeSwitchHref("en", "http://[bad")).toBe("/en/");
  });

  it("절대 URL(metadataBase)은 경로만 — 호스트·포트가 달라도 지금 사이트 안에서 이동", () => {
    expect(localeSwitchHref("en", "http://localhost:3000/en/article/12/")).toBe("/en/article/12/");
    expect(localeSwitchHref("ko", "https://sguys99.github.io/edition/2026-11-03/")).toBe(
      "/edition/2026-11-03/",
    );
    expect(localeSwitchHref("en", "/en/edition/2026-11-03/")).toBe("/en/edition/2026-11-03/");
  });

  it("검색 페이지끼리만 지금 쿼리를 잇는다", () => {
    expect(localeSwitchHref("en", "http://localhost:3000/en/search/", "?q=agent")).toBe(
      "/en/search/?q=agent",
    );
    expect(localeSwitchHref("ko", "http://localhost:3000/search/", "?q=robot&sort=hot")).toBe(
      "/search/?q=robot&sort=hot",
    );
    expect(localeSwitchHref("en", "http://localhost:3000/en/search/", "")).toBe("/en/search/");
    expect(localeSwitchHref("en", "http://localhost:3000/en/", "?category=agent")).toBe("/en/");
    expect(localeSwitchHref("en", "http://localhost:3000/en/article/1/", "?q=x")).toBe(
      "/en/article/1/",
    );
  });

  it("배포(basePath /global-ai-news): 홈에 basePath, 절대 URL 경로에는 이미 basePath 가 있다", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/global-ai-news");
    vi.resetModules();
    const mod = await import("@/lib/localeSwitch");
    expect(mod.localeHomeHref("en")).toBe("/global-ai-news/en/");
    expect(mod.localeHomeHref("ko")).toBe("/global-ai-news/");
    expect(mod.localeSwitchHref("en", null)).toBe("/global-ai-news/en/");
    expect(
      mod.localeSwitchHref("en", "https://sguys99.github.io/global-ai-news/en/article/7/"),
    ).toBe("/global-ai-news/en/article/7/");
    expect(
      mod.localeSwitchHref("ko", "https://sguys99.github.io/global-ai-news/search/", "?q=llm"),
    ).toBe("/global-ai-news/search/?q=llm");
  });
});

describe("shouldShowEnglishNotice — 브라우저 언어·닫기", () => {
  it("선호 언어에 ko 가 없을 때만", () => {
    expect(shouldShowEnglishNotice(["en-US", "en"], false)).toBe(true);
    expect(shouldShowEnglishNotice(["ja-JP"], false)).toBe(true);
    expect(shouldShowEnglishNotice(["en-US", "ko-KR"], false)).toBe(false);
    expect(shouldShowEnglishNotice(["ko"], false)).toBe(false);
    expect(shouldShowEnglishNotice(["KO-kr"], false)).toBe(false);
    // ko 로 시작하지만 다른 언어 코드(kok 콘칸어)는 한국어가 아니다
    expect(shouldShowEnglishNotice(["kok"], false)).toBe(true);
  });

  it("닫았으면, 또는 선호 언어를 모르면 띄우지 않는다", () => {
    expect(shouldShowEnglishNotice(["en-US"], true)).toBe(false);
    expect(shouldShowEnglishNotice([], false)).toBe(false);
    expect(shouldShowEnglishNotice(undefined, false)).toBe(false);
  });
});

describe("LocaleSwitch — 셸 링크", () => {
  it("한국어 페이지: `EN`(lang·hreflang=en, Read in English), 짝이 없으면 영어 홈", () => {
    render(<LocaleSwitch variant="header" />);
    const link = screen.getByRole("link", { name: "Read in English" });
    expect(link).toHaveTextContent("EN");
    expect(link).toHaveAttribute("lang", "en");
    expect(link).toHaveAttribute("hreflang", "en");
    expect(link).toHaveAttribute("title", "Read in English");
    expect(link).toHaveAttribute("href", "/en/");
    expect(link).toHaveClass("sh-lsw");
  });

  it("마운트 뒤 `<head>` 의 en 짝으로 바뀐다 — 같은 기사 영어판", () => {
    setAlternates({
      ko: "http://localhost:3000/article/3/",
      en: "http://localhost:3000/en/article/3/",
    });
    usePathname.mockReturnValue("/article/3/");
    render(<LocaleSwitch variant="mobile" />);
    expect(screen.getByRole("link", { name: "Read in English" })).toHaveAttribute(
      "href",
      "/en/article/3/",
    );
  });

  it("영어 페이지: `한국어`(lang=ko) — 같은 호 한국어판", () => {
    setAlternates({
      ko: "http://localhost:3000/edition/2026-11-03/",
      en: "http://localhost:3000/en/edition/2026-11-03/",
    });
    usePathname.mockReturnValue("/en/edition/2026-11-03/");
    render(
      <LocaleProvider locale="en">
        <LocaleSwitch variant="footer" />
      </LocaleProvider>,
    );
    const link = screen.getByRole("link", { name: "한국어로 읽기" });
    expect(link).toHaveTextContent("한국어");
    expect(link).toHaveAttribute("lang", "ko");
    expect(link).toHaveAttribute("hreflang", "ko");
    expect(link).toHaveAttribute("href", "/edition/2026-11-03/");
    expect(link).toHaveClass("sh-fl");
  });

  it("클라이언트 이동으로 경로·`<head>` 가 바뀌면 다시 읽고, 클릭 순간에도 그때 값을 쓴다", () => {
    usePathname.mockReturnValue("/");
    const { rerender } = render(<LocaleSwitch variant="header" />);
    const link = () => screen.getByRole("link", { name: "Read in English" });
    expect(link()).toHaveAttribute("href", "/en/");

    // 짝 없는 기사로 이동 → 영어 홈 그대로
    usePathname.mockReturnValue("/article/4/");
    rerender(<LocaleSwitch variant="header" />);
    expect(link()).toHaveAttribute("href", "/en/");

    // 검색으로 이동(짝 있음) + 쿼리 — 효과보다 먼저 눌러도 클릭 순간 값
    setAlternates({ ko: "http://localhost:3000/search/", en: "http://localhost:3000/en/search/" });
    window.history.replaceState(null, "", "/search/?q=agent");
    // jsdom 은 링크 이동을 구현하지 않는다 — React 처리(루트) 뒤 window 에서 기본 동작만 막는다.
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener("click", stop);
    fireEvent.click(link());
    window.removeEventListener("click", stop);
    expect(link()).toHaveAttribute("href", "/en/search/?q=agent");
  });
});

describe("EnglishNotice — 한국어 페이지 영어 안내 줄", () => {
  const stubLanguages = (languages: string[]) =>
    vi.stubGlobal("navigator", { ...window.navigator, languages, language: languages[0] ?? "" });

  beforeEach(() => window.localStorage.clear());

  it("브라우저 언어가 영어면 마운트 뒤 보인다 — lang=en, 링크는 영어 짝(없으면 영어 홈), 화살표는 읽지 않는다", () => {
    stubLanguages(["en-US", "en"]);
    setAlternates({ ko: "http://localhost:3000/", en: "http://localhost:3000/en/" });
    const { container } = render(<EnglishNotice />);
    const link = screen.getByRole("link", { name: "Read AI Daybook in English" });
    expect(link).toHaveAttribute("href", "/en/");
    expect(link).toHaveAttribute("hreflang", "en");
    expect(container.querySelector(".sh-rie")).toHaveAttribute("lang", "en");
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent("→");
  });

  it("브라우저 언어에 ko 가 있으면 그리지 않는다", () => {
    stubLanguages(["ko-KR", "en-US"]);
    const { container } = render(<EnglishNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("닫으면 사라지고 localStorage 에 기억 — 다음 마운트에서도 안 보인다", () => {
    stubLanguages(["en-GB"]);
    const first = render(<EnglishNotice />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    });
    expect(first.container).toBeEmptyDOMElement();
    expect(window.localStorage.getItem(ENGLISH_NOTICE_DISMISS_KEY)).toBe("1");
    first.unmount();
    const second = render(<EnglishNotice />);
    expect(second.container).toBeEmptyDOMElement();
  });

  it("저장소를 못 쓰면(접근 오류) 닫은 적 없음으로 보고, 닫기는 이번 화면에서만", () => {
    stubLanguages(["en-US"]);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const own = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { value: throwing, configurable: true });
    try {
      const { container } = render(<EnglishNotice />);
      expect(screen.getByRole("link", { name: "Read AI Daybook in English" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(container).toBeEmptyDOMElement();
    } finally {
      if (own) Object.defineProperty(window, "localStorage", own);
      else delete (window as { localStorage?: Storage }).localStorage;
    }
  });
});
