import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedClient } from "@/components/FeedClient";
import { buildFeedIndex, resetFeedIndexCache } from "@/lib/feedIndex";
import type { ArticleCard } from "@/lib/types";

const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => params.current,
  usePathname: () => "/",
}));

function card(id: number, category = "agent"): ArticleCard {
  return {
    id,
    source: { id: "hn", name: "Hacker News" },
    url: `https://x/${id}`,
    titleKo: `기사${id}`,
    summaryKo: "요약",
    titleOriginal: `T${id}`,
    category,
    format: "news",
    tags: [],
    trendingScore: 200 - id,
    importance: 3,
    publishedAt: "2026-10-25T00:00:00Z",
  };
}

// 누적 50건: 홀수는 physical, 짝수는 agent. 첫 페이지 30건만 페이지에 싣는다.
const cards = Array.from({ length: 50 }, (_, i) => card(i + 1, i % 2 ? "agent" : "physical"));
const all = buildFeedIndex(cards);
const props = {
  issueArticles: [cards[0]],
  indexHead: all.slice(0, 30),
  indexTotal: 50,
  indexVersion: "2026-10-25-50",
  sources: [{ id: "hn", name: "Hacker News", count: 50 }],
  tags: [],
  editionInfo: { issueNo: 1, publishedAt: "2026-10-24T21:05:00Z" },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetFeedIndexCache();
  params.current = new URLSearchParams();
  fetchMock = vi.fn(async () => new Response(JSON.stringify(all)));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FeedClient — 누적 색인 받기", () => {
  it("기본 지면은 받지 않고, 더 보기로 첫 페이지를 넘길 때 1회 받는다", async () => {
    render(<FeedClient {...props} />);
    expect(screen.getByText(/누적 50건/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /기사 더 보기/ }));
    expect(fetchMock).toHaveBeenCalledWith("/feed-index.json?v=2026-10-25-50");
    await waitFor(() => expect(screen.getByText("기사50")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /기사 더 보기/ })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("필터 URL 로 들어오면 곧바로 받아 누적 전체에서 거른다(건수 = 전체 기준)", async () => {
    params.current = new URLSearchParams("category=physical");
    render(<FeedClient {...props} />);
    expect(screen.getByRole("status").textContent).toContain("불러오는 중");
    await waitFor(() => expect(screen.getByText("25건")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("받기 실패 → 안내·다시 시도 → 성공하면 결과", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    params.current = new URLSearchParams("tag=x&sort=latest");
    render(<FeedClient {...props} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    });
    await waitFor(() => expect(screen.getByText(/조건에 맞는 기사가 없습니다/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
