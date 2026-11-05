import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedClient } from "@/components/FeedClient";
import { FEED_HEAD_SIZE, INDEX_PAGE_SIZE, buildFeedIndex } from "@/lib/feedIndex";
import { resetIndexCache } from "@/lib/indexShards";
import type { ArticleCard } from "@/lib/types";
import { indexServer } from "./helpers/indexServer";

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
    trendingScore: 300 - id,
    importance: 3,
    publishedAt: "2026-10-25T00:00:00Z",
  };
}

// 누적 170건(기본 정렬 = id 순): 홀수는 physical·10월 호, 짝수는 agent·11월 호 — 두 달 조각이 순서 안에서 번갈아 섞인다.
const TOTAL = 170;
const cards = Array.from({ length: TOTAL }, (_, i) =>
  card(i + 1, (i + 1) % 2 ? "physical" : "agent"),
);
const issueDate = (a: ArticleCard) => (a.id % 2 ? "2026-10-15" : "2026-11-02");
const all = buildFeedIndex(cards);
const props = {
  issueArticles: [cards[0]],
  indexHead: all.slice(0, INDEX_PAGE_SIZE),
  indexTotal: TOTAL,
  indexVersion: "2026-11-02-170",
  sources: [{ id: "hn", name: "Hacker News", count: TOTAL }],
  tags: [],
  editionInfo: { issueNo: 1, publishedAt: "2026-11-01T21:05:00Z" },
};

let server: ReturnType<typeof indexServer>;

beforeEach(() => {
  resetIndexCache();
  params.current = new URLSearchParams();
  server = indexServer(cards, issueDate);
  vi.stubGlobal("fetch", server.fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 전체 기사 색인 칸의 제목 순서. */
function indexTitles(): string[] {
  const section = document.getElementById("all")!;
  return within(section)
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent ?? "");
}
const titles = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `기사${from + i}`);
const moreButton = () => screen.getByRole("button", { name: /기사 더 보기/ });

describe("FeedClient — 색인 머리·월별 조각 받기", () => {
  it("기본 지면은 받지 않고, 남은 건수는 빌드 시점 누적 건수 기준이다", () => {
    render(<FeedClient {...props} />);
    expect(screen.getByText(/누적 170건/)).toBeTruthy();
    expect(moreButton().textContent).toContain("남은 140건");
    expect(server.fetchMock).not.toHaveBeenCalled();
    expect(indexTitles()).toEqual(titles(1, 30));
  });

  it("더 보기: 목록(머리)만 받아 다음 페이지들을 펼치고, 머리를 넘길 때 모든 달 조각을 받는다 — 순서는 기존과 같다", async () => {
    render(<FeedClient {...props} />);
    fireEvent.click(moreButton());
    expect(within(document.getElementById("all")!).getByRole("status").textContent).toContain(
      "불러오는 중",
    );
    await waitFor(() => expect(indexTitles()).toEqual(titles(1, 60)));
    expect(server.requested).toEqual(["/feed-index/ko/manifest.json"]);
    expect(server.fetchMock).toHaveBeenCalledWith("/feed-index/ko/manifest.json?v=2026-11-02-170");
    expect(moreButton().textContent).toContain("남은 110건");

    // 머리(첫 페이지 다음 FEED_HEAD_SIZE 건) 안에서는 더 받지 않는다.
    const headEnd = INDEX_PAGE_SIZE + FEED_HEAD_SIZE;
    for (let shown = 90; shown <= headEnd; shown += INDEX_PAGE_SIZE) {
      fireEvent.click(moreButton());
      expect(indexTitles()).toEqual(titles(1, shown));
    }
    expect(server.requested).toHaveLength(1);
    expect(moreButton().textContent).toContain(`남은 ${TOTAL - headEnd}건`);

    // 머리 너머: 두 달 조각을 받아 기본 정렬 순으로 합친다(달 경계를 넘어 번갈아 섞인 순서 그대로).
    fireEvent.click(moreButton());
    await waitFor(() => expect(indexTitles()).toEqual(titles(1, TOTAL)));
    expect([...server.requested].sort()).toEqual([
      "/feed-index/ko/2026-10.json",
      "/feed-index/ko/2026-11.json",
      "/feed-index/ko/manifest.json",
    ]);
    expect(screen.queryByRole("button", { name: /기사 더 보기/ })).toBeNull();
    expect(indexTitles()).toEqual(titles(1, TOTAL));
    expect(server.requested).toHaveLength(3);
  }, 20_000);

  it("필터 URL 로 들어오면 곧바로 모든 달을 받아 누적 전체에서 거른다(건수 = 전체 기준)", async () => {
    params.current = new URLSearchParams("category=physical");
    render(<FeedClient {...props} />);
    expect(screen.getByRole("status").textContent).toContain("불러오는 중");
    await waitFor(() => expect(screen.getByText("85건")).toBeTruthy());
    expect(server.requested).toHaveLength(3);
    expect(indexTitles().slice(0, 3)).toEqual(["기사1", "기사3", "기사5"]);
  });

  it("받기 실패 → 안내·다시 시도 → 성공하면 결과", async () => {
    server.fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    params.current = new URLSearchParams("tag=x&sort=latest");
    render(<FeedClient {...props} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    });
    await waitFor(() => expect(screen.getByText(/조건에 맞는 기사가 없습니다/)).toBeTruthy());
    // 실패 1 + 목록 1 + 조각 2.
    expect(server.fetchMock).toHaveBeenCalledTimes(4);
  });
});
