import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_RECENT_MONTHS, SearchClient } from "@/components/SearchClient";
import { filterAndSortFeed } from "@/lib/feedFilter";
import { resetIndexCache } from "@/lib/indexShards";
import type { ArticleCard } from "@/lib/types";
import { indexServer } from "./helpers/indexServer";

const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => params.current,
  usePathname: () => "/search",
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * 호 월: 11월 1~10, 10월 11~20(최근 3개월 = 9~11월), 7월 21~25, 6월 26~30(지난 기사).
 * "에이전트"는 1~25, "로봇"은 6월 기사에만 있다.
 */
function card(id: number): ArticleCard {
  const robot = id > 25;
  return {
    id,
    source: { id: "hn", name: "Hacker News" },
    url: `https://x/${id}`,
    titleKo: robot ? `로봇 소식 ${id}` : `에이전트 소식 ${id}`,
    summaryKo: "요약",
    titleOriginal: `Story ${id}`,
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 100 - id,
    importance: 3,
    publishedAt: "2026-10-25T00:00:00Z",
  };
}
const MONTH_OF = (id: number) =>
  id <= 10 ? "2026-11-03" : id <= 20 ? "2026-10-20" : id <= 25 ? "2026-07-01" : "2026-06-15";
const cards = filterAndSortFeed(Array.from({ length: 30 }, (_, i) => card(i + 1)));

let server: ReturnType<typeof indexServer>;

beforeEach(() => {
  resetIndexCache();
  server = indexServer(cards, (a) => MONTH_OF(a.id));
  vi.stubGlobal("fetch", server.fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderSearch = (q: string) => {
  params.current = new URLSearchParams(`q=${encodeURIComponent(q)}`);
  return render(<SearchClient sources={[]} tags={[]} indexVersion="2026-11-03-30" />);
};
const header = () => screen.getByRole("region", { name: "검색 결과" }).querySelector("p")!;

describe("SearchClient — 최근 몇 달 먼저, 지난 기사는 필요할 때", () => {
  it("처음엔 목록과 최근 3개월 조각만 받고, 건수 옆에 범위를 밝힌다", async () => {
    expect(SEARCH_RECENT_MONTHS).toBe(3);
    renderSearch("에이전트");
    await waitFor(() => expect(header().textContent).toContain("20건"));
    expect(header().textContent).toBe("“에이전트” 검색 결과 20건 · 2026년 9월 이후 기사 중");
    expect([...server.requested].sort()).toEqual([
      "/search-index/ko/2026-10.json",
      "/search-index/ko/2026-11.json",
      "/search-index/ko/manifest.json",
    ]);
    expect(server.fetchMock).toHaveBeenCalledWith("/search-index/ko/manifest.json?v=2026-11-03-30");
    const older = screen.getByRole("button", { name: /지난 기사에서도 찾기/ });
    expect(older.textContent).toBe("지난 기사에서도 찾기·2026년 9월 이전 기사 10건");
  });

  it("지난 기사에서도 찾기 → 지난 달 조각을 받아 결과에 합치고 범위·버튼을 거둔다", async () => {
    renderSearch("에이전트");
    const older = await screen.findByRole("button", { name: /지난 기사에서도 찾기/ });
    await act(async () => {
      fireEvent.click(older);
    });
    await waitFor(() => expect(header().textContent).toBe("“에이전트” 검색 결과 25건"));
    expect(server.requested).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /지난 기사에서도 찾기/ })).toBeNull();
    // 결과 순서 = 기본 정렬(화제순) — 늦게 받은 달도 제자리에 들어간다.
    const region = screen.getByRole("region", { name: "검색 결과" });
    const titles = within(region)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(Array.from({ length: 25 }, (_, i) => `에이전트 소식 ${i + 1}`));

    // 다른 검색어로 바꿔도 다시 받지 않는다.
    cleanup();
    renderSearch("로봇");
    await waitFor(() => expect(header().textContent).toBe("“로봇” 검색 결과 5건"));
    expect(server.requested).toHaveLength(5);
  });

  it("받은 달에 결과가 없으면 지난 달을 곧바로 받는다", async () => {
    renderSearch("로봇");
    await waitFor(() => expect(header().textContent).toBe("“로봇” 검색 결과 5건"));
    expect(server.requested).toHaveLength(5);
  });

  it("전부 받아도 없으면 결과 없음", async () => {
    renderSearch("zzzz");
    await waitFor(() =>
      expect(screen.getByText(/“zzzz”에 대한 검색 결과가 없습니다/)).toBeTruthy(),
    );
    expect(server.requested).toHaveLength(5);
  });

  it("지난 달 받기 실패 → 안내·다시 시도", async () => {
    const realFetch = server.fetchMock.getMockImplementation()!;
    server.fetchMock.mockImplementation(async (input) =>
      String(input).includes("2026-06")
        ? Promise.reject(new TypeError("Failed to fetch"))
        : realFetch(input),
    );
    renderSearch("로봇");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    server.fetchMock.mockImplementation(realFetch);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    });
    await waitFor(() => expect(header().textContent).toBe("“로봇” 검색 결과 5건"));
  });

  it("흔한 낱말도 잘리지 않는다(FlexSearch 필드당 기본 100건 상한을 넘는 일치)", async () => {
    resetIndexCache();
    const many = filterAndSortFeed(Array.from({ length: 250 }, (_, i) => card(i + 1))).map((c) => ({
      ...c,
      titleKo: `에이전트 ${c.id}`,
    }));
    server = indexServer(many, () => "2026-11-03");
    vi.stubGlobal("fetch", server.fetchMock);
    renderSearch("에이전트");
    await waitFor(() => expect(header().textContent).toBe("“에이전트” 검색 결과 250건"));
  });
});
