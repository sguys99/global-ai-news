import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditionPager } from "@/components/EditionPager";
import { FeedView } from "@/components/FeedView";
import { FilterBar } from "@/components/FilterBar";
import { LocaleProvider } from "@/components/LocaleProvider";
import { SearchClient } from "@/components/SearchClient";
import { SearchInput } from "@/components/SearchInput";
import { ShareButton } from "@/components/ShareButton";
import { IndexLoadStatus, StoryIndex } from "@/components/StoryIndex";
import { FilterSheet } from "@/components/mobile/FilterSheet";
import { buildFeedIndex } from "@/lib/feedIndex";
import { groupSources } from "@/lib/feedFilter";
import type { ArticleCard } from "@/lib/types";

/**
 * 영어판(Phase 3-3 C단계) — 피드·색인·필터·검색·호 이동·공유 컴포넌트가 en 에서 한글 없이 그려지는지,
 * 내부 링크가 `/en` 접두어를 지키는지. 기사 카드(StoryEntry, Story.tsx)는 다른 영역이라 이 파일이 소유한 요소만 검사한다.
 */

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

/**
 * jsdom 의 next/link 는 trailingSlash 설정 없이 끝 슬래시를 떼므로(빌드는 trailingSlash: true 로 남긴다)
 * 경로 끝 슬래시는 있어도 없어도 받는다. 검사 핵심은 `/en` 접두어와 쿼리·앵커 보존이다.
 */
const hrefOf = (el: HTMLElement) => (el.getAttribute("href") ?? "").replace(/\/(?=$|[?#])/, "");

const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useSearchParams: () => params.current,
  usePathname: () => "/en/",
  useRouter: () => ({ push }),
}));

const en = ({ children }: { children: ReactNode }) => (
  <LocaleProvider locale="en">{children}</LocaleProvider>
);

function card(id: number): ArticleCard {
  return {
    id,
    source: { id: "hn", name: "Hacker News" },
    url: `https://x/${id}`,
    titleKo: `Story ${id}`,
    summaryKo: "Summary",
    titleOriginal: `T${id}`,
    category: "agent",
    format: "news",
    tags: ["agents"],
    trendingScore: 100 - id,
    importance: 3,
    publishedAt: "2026-10-25T00:00:00Z",
  };
}

const sources = [
  { id: "techcrunch_ai", name: "TechCrunch AI", count: 10 },
  { id: "hf_models", name: "HuggingFace 트렌딩 모델", count: 6 },
  { id: "aitimes", name: "AI타임스", nameEn: "AI Times", count: 5 },
];

beforeEach(() => {
  params.current = new URLSearchParams();
  push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("groupSources — 언어별 칩 표시명", () => {
  it("ko 는 축약명 그대로, en 은 라틴 축약명 → nameEn → name 순. 묶음 기준은 언어와 무관하다", () => {
    expect(groupSources(sources).map((g) => g.label)).toEqual([
      "TechCrunch",
      "Hugging Face",
      "AI타임스",
    ]);
    const enGroups = groupSources(sources, "en");
    expect(enGroups.map((g) => g.label)).toEqual(["TechCrunch", "Hugging Face", "AI Times"]);
    expect(enGroups.map((g) => g.ids)).toEqual(groupSources(sources).map((g) => g.ids));
  });
});

describe("FilterBar — en", () => {
  it("정렬·행 라벨·분야·매체 칩에 한글이 없고, 링크는 /en 접두어를 붙인다", () => {
    const { container } = render(
      <FilterBar current={{}} sources={sources} tags={["agents"]} anchor="#all" locale="en" />,
    );
    expect(HANGUL.test(container.textContent ?? "")).toBe(false);
    expect(screen.getByRole("group", { name: "Sort" })).toBeInTheDocument();
    expect(hrefOf(screen.getByRole("link", { name: "Trending" }))).toBe("/en#all");
    expect(hrefOf(screen.getByRole("link", { name: "Latest" }))).toBe("/en?sort=latest#all");
    const topics = screen.getByRole("group", { name: "Topic" });
    expect(hrefOf(within(topics).getByRole("link", { name: "Physical AI" }))).toBe(
      "/en?category=physical#all",
    );
    const outlets = screen.getByRole("group", { name: "Outlet" });
    expect(hrefOf(within(outlets).getByRole("link", { name: "AI Times" }))).toBe(
      "/en?source=aitimes#all",
    );
  });

  it("검색 경로는 /en/search 로 만들고 검색어를 보존한다", () => {
    render(
      <FilterBar
        current={{ q: "robot" }}
        sources={sources}
        tags={[]}
        basePath="/search"
        locale="en"
      />,
    );
    expect(screen.getByRole("link", { name: "Importance" })).toHaveAttribute(
      "href",
      "/en/search?q=robot&sort=importance",
    );
  });
});

describe("FilterSheet — en(컨텍스트)", () => {
  it("트리거·시트 문구에 한글이 없고, 안의 FilterBar 도 영어·/en 링크다", () => {
    render(<FilterSheet current={{ category: "llm" }} sources={sources} tags={[]} />, {
      wrapper: en,
    });
    const trigger = screen.getByRole("button", { name: /Filters/ });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(HANGUL.test(document.body.textContent ?? "")).toBe(false);
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close filters" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Show results" })).toBeInTheDocument();
    expect(hrefOf(within(dialog).getByRole("link", { name: "LLM" }))).toBe("/en");
  });
});

describe("StoryIndex·IndexLoadStatus — en(컨텍스트)", () => {
  it("더 보기 버튼은 영어 문구·남은 건수(천 단위 구분)다", () => {
    const articles = buildFeedIndex(Array.from({ length: 30 }, (_, i) => card(i + 1)));
    render(<StoryIndex articles={articles} total={1255} onLoadMore={() => {}} />, {
      wrapper: en,
    });
    const more = screen.getByRole("button", { name: /More stories/ });
    expect(more.textContent).toBe("More stories(1,225 left)");
  });

  it("받는 중·실패 상태 줄에 한글이 없다", () => {
    const { container, rerender } = render(<IndexLoadStatus state="loading" />, { wrapper: en });
    expect(container.textContent).toBe("Loading stories…");
    rerender(<IndexLoadStatus state="error" onRetry={() => {}} />);
    expect(HANGUL.test(container.textContent ?? "")).toBe(false);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("FeedView — en 필터 결과", () => {
  const base = {
    index: buildFeedIndex([card(1), card(2)]),
    indexTotal: 2,
    issueArticles: [] as ArticleCard[],
    sources: [{ id: "hn", name: "Hacker News", count: 2 }],
    tags: [],
    editionInfo: { issueNo: 131, publishedAt: "2026-10-24T21:05:00Z" },
  };

  it("결과 머리(키커·분야·건수·해제 링크)와 빈 결과 안내가 영어이고, 해제 링크는 /en/ 이다", () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <FeedView {...base} options={{ category: "agent" }} locale="en" />
      </LocaleProvider>,
    );
    const header = container.querySelector("header")!;
    expect(HANGUL.test(header.textContent ?? "")).toBe(false);
    expect(header.textContent).toContain("Filtered");
    expect(header.textContent).toContain("Agents");
    expect(header.textContent).toContain("2 stories");
    expect(hrefOf(within(header).getByRole("link", { name: "Clear all filters" }))).toBe("/en");
    expect(screen.getByRole("region", { name: "Filtered stories" })).toBeInTheDocument();

    cleanup();
    render(
      <LocaleProvider locale="en">
        <FeedView {...base} options={{ category: "physical" }} locale="en" />
      </LocaleProvider>,
    );
    expect(screen.getByText("No stories match these filters. Try clearing them.")).toBeVisible();
  });
});

describe("EditionPager — en", () => {
  it("호수·날짜·방향 문구가 영어이고 링크는 /en/edition/… 이다", () => {
    const { container } = render(
      <EditionPager
        prev={{
          date: "2026-11-02",
          issueNo: 139,
          publishedAt: "2026-11-01T21:05:00Z",
          cutoff: "2026-11-02T15:00:00Z",
        }}
        next={{
          date: "2026-11-04",
          issueNo: 141,
          publishedAt: "2026-11-03T21:05:00Z",
          cutoff: "2026-11-04T15:00:00Z",
        }}
        locale="en"
      />,
    );
    expect(HANGUL.test(container.textContent ?? "")).toBe(false);
    expect(screen.getByRole("navigation", { name: "Issue navigation" })).toBeInTheDocument();
    const prev = screen.getByRole("link", { name: /Previous issue/ });
    expect(hrefOf(prev)).toBe("/en/edition/2026-11-02");
    expect(prev.textContent).toContain("No. 139");
    expect(hrefOf(screen.getByRole("link", { name: /Next issue/ }))).toBe("/en/edition/2026-11-04");
  });
});

describe("ShareButton — en(컨텍스트)", () => {
  it("버튼·툴팁·복사 완료 문구가 영어다", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (q: string) => ({ matches: false, media: q }),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ShareButton url="https://example.com/en/edition/2026-11-03/" title="AI Daybook" />, {
      wrapper: en,
    });
    const button = screen.getByRole("button", { name: "Share" });
    expect(button).toHaveAttribute("title", "Share a permanent link to this issue");
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: "Link copied" })).toBeVisible());
    expect(screen.getByRole("status").textContent).toBe("Link to this issue copied");
  });
});

describe("SearchInput·SearchClient — en(컨텍스트)", () => {
  it("검색창 문구가 영어이고, 입력은 /en/search 로 이동한다", () => {
    vi.useFakeTimers();
    render(<SearchInput />, { wrapper: en });
    const input = screen.getByRole("searchbox", { name: "Search stories" });
    expect(input).toHaveAttribute(
      "placeholder",
      "Search by keyword — titles, summaries, source text, tags",
    );
    fireEvent.change(input, { target: { value: "robot" } });
    act(() => vi.advanceTimersByTime(300));
    expect(push).toHaveBeenCalledWith("/en/search?q=robot");
  });

  it("검색어가 없으면 추천 주제(영어 머리·/en 링크), 있으면 결과 머리·빈 결과 문구가 영어다", async () => {
    const entries = buildFeedIndex([card(1), card(2)]).map((c) => ({ ...c, contentRaw: "" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(entries))),
    );
    const { container, unmount } = render(<SearchClient sources={sources} tags={["agents"]} />, {
      wrapper: en,
    });
    const suggest = screen.getByRole("heading", { name: "Popular topics" }).parentElement!;
    expect(hrefOf(within(suggest).getByRole("link", { name: "agents" }))).toBe(
      "/en/search?q=agents",
    );
    expect(HANGUL.test(container.textContent ?? "")).toBe(false);
    unmount();

    params.current = new URLSearchParams("q=zzzz");
    const r = render(<SearchClient sources={sources} tags={[]} />, { wrapper: en });
    await waitFor(() =>
      expect(
        screen.getByText("No results for “zzzz”. Try another keyword or filter."),
      ).toBeVisible(),
    );
    expect(HANGUL.test(r.container.textContent ?? "")).toBe(false);
    r.unmount();

    // 결과 머리: 검색어·건수는 굵은 span, 단위는 단·복수.
    params.current = new URLSearchParams("q=Story");
    render(<SearchClient sources={sources} tags={[]} />, { wrapper: en });
    const results = await screen.findByRole("region", { name: "Search results" });
    expect(results.querySelector("p")?.textContent).toBe("“Story” · 2 results");
  });
});
