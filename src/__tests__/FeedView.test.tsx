import { act, cleanup } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedView } from "@/components/FeedView";
import type { ArticleCard } from "@/lib/types";

function card(id: number): ArticleCard {
  return {
    id,
    source: { id: "hn", name: "Hacker News" },
    url: `https://x/${id}`,
    titleKo: `기사${id}`,
    summaryKo: "요약",
    titleOriginal: `T${id}`,
    category: "agent",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-10-25T00:00:00Z",
  };
}

const base = {
  articles: [card(1), card(2)],
  sources: [{ id: "hn", name: "Hacker News" }],
  tags: [],
  options: {},
  editionInfo: { issueNo: 131, publishedAt: "2026-10-24T21:05:00Z" }, // 10/25 06:05 KST
};

beforeEach(() => {
  vi.useFakeTimers();
  // 서버 렌더(빌드) 시각 = 10/27 14:00 KST — 호(10/25)보다 이틀 뒤.
  vi.setSystemTime(new Date("2026-10-27T05:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FeedView — 이번 호가 비었을 때", () => {
  it("issueIds 가 비어도 깨지지 않고 1면 없이 전체 기사 색인만 그린다", () => {
    const html = renderToString(<FeedView {...base} issueIds={[]} />);
    expect(html).not.toContain('id="front"');
    expect(html).toContain("전체 기사");
    expect(html).not.toContain("지금 화제");
  });
});

describe("FeedView — 발행 지연 안내 초기 상태", () => {
  it("initialDelayGap 이 있으면 정적 HTML 에 안내가 이미 담긴다", () => {
    const html = renderToString(<FeedView {...base} issueIds={[1]} initialDelayGap={2} />);
    expect(html).toContain("최신 호");
    expect(html).toContain("새 호 지연 중");
  });

  it("initialDelayGap 이 없으면 안내가 없다", () => {
    const html = renderToString(<FeedView {...base} issueIds={[1]} />);
    expect(html).not.toContain("최신 호");
  });

  it("서버 HTML 을 하이드레이트해도 불일치 경고가 없다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = <FeedView {...base} issueIds={[1]} initialDelayGap={2} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(el);
    document.body.appendChild(container);
    await act(async () => {
      hydrateRoot(container, el);
    });
    expect(error).not.toHaveBeenCalled();
    expect(container.textContent).toContain("최신 호");
    container.remove();
  });
});
