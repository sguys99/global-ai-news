import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { LocaleProvider } from "@/components/LocaleProvider";
import { BottomTabBar } from "@/components/mobile/BottomTabBar";
import { MobileTopBar } from "@/components/mobile/MobileTopBar";
import { ShellChrome } from "@/components/ShellChrome";
import { hasHangul } from "@/lib/labels";
import { SITE_TAGLINE, SITE_TAGLINE_EN, siteTagline } from "@/lib/site";

/*
 * 영어판 Phase 3-3 C단계 — 사이트 셸(헤더·모바일 상단 바·하단 탭 바·푸터)의 영어 화면에 한글이 없는지,
 * 링크가 /en 접두어를 쓰는지, 활성 판정이 /en 경로에서도 맞는지. 한국어 셸은 기존 테스트(BottomTabBar 등)가 지킨다.
 */

const usePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

// 방문 집계 스크립트(next/script)는 셸 문구와 무관하다.
vi.mock("@/components/Analytics", () => ({ Analytics: () => null }));

afterEach(() => {
  document.documentElement.lang = "";
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/**
 * 화면 글자 + 읽기 라벨·툴팁(aria-label·title). `lang="ko"` 요소(언어 전환 링크 `한국어` — 대상 언어 이름을 그 언어로,
 * english-version-plan 5-3)는 뺀다: 영어 페이지에 허용된 한국어는 언어를 밝힌 요소뿐이다(5-4 허용 목록과 같은 규칙).
 */
function uiText(root: Element): string {
  const copy = root.cloneNode(true) as Element;
  for (const el of Array.from(copy.querySelectorAll('[lang="ko"]'))) el.remove();
  const attrs = Array.from(copy.querySelectorAll("*")).flatMap((el) =>
    ["aria-label", "title"].map((a) => el.getAttribute(a) ?? ""),
  );
  return [copy.textContent ?? "", ...attrs].join(" ");
}

/** 영어 홈 링크 — Next Link 가 테스트 환경(trailingSlash 미적용)에서 끝 슬래시를 떼므로 둘 다 받는다. */
const EN_HOME = expect.stringMatching(/^\/en\/?$/);

const en = (ui: React.ReactNode) => render(<LocaleProvider locale="en">{ui}</LocaleProvider>);

describe("태그라인", () => {
  it("영어판은 0-5 확정 문구, 한국어판은 그대로", () => {
    expect(siteTagline("en")).toBe(SITE_TAGLINE_EN);
    expect(SITE_TAGLINE_EN).toBe(
      "The world's AI news, and Korea's, edited every morning in Seoul.",
    );
    expect(siteTagline()).toBe(SITE_TAGLINE);
  });
});

describe("Header·MobileTopBar — 영어판", () => {
  it("헤더: 주 메뉴·워드마크 링크가 영어·/en 접두어, /en/search 에서 검색이 활성", () => {
    usePathname.mockReturnValue("/en/search");
    const { container } = en(<Header />);
    expect(screen.getByRole("navigation", { name: "Main menu" })).toBeInTheDocument();
    const today = screen.getByRole("link", { name: "Today's issue" });
    const search = screen.getByRole("link", { name: "Search" });
    expect(today).toHaveAttribute("href", EN_HOME);
    expect(search).toHaveAttribute("href", "/en/search");
    expect(search).toHaveAttribute("aria-current", "page");
    expect(today).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "AI Daybook home" })).toHaveAttribute("href", EN_HOME);
    // 테마 토글(마운트 후 라벨)
    expect(screen.getByRole("button", { name: /Switch to|Toggle theme/ })).toBeInTheDocument();
    expect(hasHangul(uiText(container))).toBe(false);
  });

  it("영어 홈(/en/)에서 '오늘의 지면'이 활성이다", () => {
    usePathname.mockReturnValue("/en/");
    en(<Header />);
    expect(screen.getByRole("link", { name: "Today's issue" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("모바일 상단 바: 검색 버튼 라벨·링크", () => {
    usePathname.mockReturnValue("/en/");
    const { container } = en(<MobileTopBar />);
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/en/search");
    expect(hasHangul(uiText(container))).toBe(false);
  });

  it("한국어 모바일 상단 바는 그대로다", () => {
    // 홈은 제호가 보이는 동안 워드마크를 숨기므로(aria-hidden) 검색 화면에서 본다
    usePathname.mockReturnValue("/search");
    render(<MobileTopBar />);
    expect(screen.getByRole("link", { name: "검색" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "AI Daybook 홈" })).toHaveAttribute("href", "/");
  });
});

describe("BottomTabBar — 영어판", () => {
  it("탭 이름·링크가 영어·/en 접두어, /en/ 에서 홈 탭 활성", () => {
    usePathname.mockReturnValue("/en/");
    const { container } = en(<BottomTabBar />);
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    const feed = screen.getByRole("link", { name: "Today" });
    expect(feed).toHaveAttribute("href", EN_HOME);
    expect(feed).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/en/search");
    expect(hasHangul(uiText(container))).toBe(false);
  });

  it("영어 상세(/en/article/1)에서는 렌더하지 않는다", () => {
    usePathname.mockReturnValue("/en/article/1");
    const { container } = en(<BottomTabBar />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Footer — 영어판", () => {
  it("태그라인·콜로폰·내비·방문 줄이 영어이고 링크는 /en 접두어", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ count: "12,345" }) })),
    );
    const { container } = en(<Footer />);
    expect(screen.getByText(SITE_TAGLINE_EN)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today's issue" })).toHaveAttribute("href", EN_HOME);
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/en/search");
    await waitFor(() => expect(screen.getByText("12,345 visits")).toBeInTheDocument());
    expect(hasHangul(uiText(container))).toBe(false);
  });

  it("한국어 푸터는 그대로다", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    render(<Footer />);
    expect(screen.getByText(SITE_TAGLINE)).toBeInTheDocument();
    expect(
      screen.getByText("매일 06:00 KST에 글로벌·한국 소스를 수집하고 LLM이 요약·분류합니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "오늘의 지면" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "검색" })).toHaveAttribute("href", "/search");
  });
});

describe("ShellChrome — 404 의 셸 언어(localeFromDocument)", () => {
  /** 방문 수 조회는 실패로, next-themes 가 읽는 matchMedia 는 라이트로. */
  const offline = () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      })),
    );
  };

  it("/en 아래 404(head 스크립트가 lang=en)면 헤더·모바일 바·푸터·탭이 영어·/en 링크", () => {
    offline();
    usePathname.mockReturnValue("/en/missing");
    document.documentElement.lang = "en";
    const { container } = render(
      <ShellChrome locale="ko" year={2026} localeFromDocument>
        <p>body</p>
      </ShellChrome>,
    );
    expect(screen.getByRole("navigation", { name: "Main menu" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    expect(screen.getByText(SITE_TAGLINE_EN)).toBeInTheDocument();
    for (const a of screen.getAllByRole("link", { name: "Search" }))
      expect(a).toHaveAttribute("href", "/en/search");
    expect(hasHangul(uiText(container))).toBe(false);
    // 언어 전환(5-3): 404 에는 hreflang 짝이 없어 한국어 홈으로, 영어 셸이라 안내 줄 없음
    const switches = screen.getAllByRole("link", { name: "한국어로 읽기" });
    expect(switches).toHaveLength(3);
    for (const a of switches) expect(a).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Read AI Daybook in English" })).toBeNull();
  });

  it("언어 전환(5-3): 한국어 셸은 `EN` 세 곳(헤더·모바일 바·푸터) + 브라우저가 영어면 안내 줄, 영어 셸은 `한국어` 세 곳만", () => {
    offline();
    vi.stubGlobal("navigator", { ...window.navigator, languages: ["en-US"], language: "en-US" });
    usePathname.mockReturnValue("/");
    const ko = render(
      <ShellChrome locale="ko" year={2026}>
        <p>body</p>
      </ShellChrome>,
    );
    const toEnglish = screen.getAllByRole("link", { name: "Read in English" });
    expect(toEnglish.map((a) => a.className)).toEqual(["sh-lsw", "sh-mlsw", "sh-fl"]);
    for (const a of toEnglish) expect(a).toHaveAttribute("href", "/en/");
    expect(screen.getByRole("link", { name: "Read AI Daybook in English" })).toBeInTheDocument();
    ko.unmount();

    usePathname.mockReturnValue("/en/");
    render(
      <ShellChrome locale="en" year={2026}>
        <p>body</p>
      </ShellChrome>,
    );
    expect(screen.getAllByRole("link", { name: "한국어로 읽기" })).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "Read AI Daybook in English" })).toBeNull();
  });

  it("한국어 경로의 404(lang=ko)는 한국어 셸 그대로", () => {
    offline();
    usePathname.mockReturnValue("/missing");
    document.documentElement.lang = "ko";
    render(
      <ShellChrome locale="ko" year={2026} localeFromDocument>
        <p>body</p>
      </ShellChrome>,
    );
    expect(screen.getByRole("navigation", { name: "주 메뉴" })).toBeInTheDocument();
    expect(screen.getByText(SITE_TAGLINE)).toBeInTheDocument();
  });

  it("다른 페이지(플래그 없음)는 문서 lang 과 상관없이 레이아웃 언어를 쓴다", () => {
    offline();
    usePathname.mockReturnValue("/search");
    document.documentElement.lang = "en";
    render(
      <ShellChrome locale="ko" year={2026}>
        <p>body</p>
      </ShellChrome>,
    );
    expect(screen.getByRole("navigation", { name: "주 메뉴" })).toBeInTheDocument();
  });
});
