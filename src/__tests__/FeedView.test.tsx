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
    format: "news",
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
    expect(html).toContain("발행 지연");
    expect(html).toContain("새 호 지연 · 2일째");
  });

  it("initialDelayGap 이 없으면 안내가 없다", () => {
    const html = renderToString(<FeedView {...base} issueIds={[1]} />);
    expect(html).not.toContain("발행 지연");
    expect(html).not.toContain("발행 전");
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
    expect(container.textContent).toContain("발행 지연");
    container.remove();
  });
});

describe("FeedView — 같은 매체의 여러 피드", () => {
  const front = { ...card(2), source: { id: "hn_front", name: "Hacker News Front Page" } };
  const multi = {
    ...base,
    articles: [card(1), front, { ...card(3), source: { id: "tc", name: "TechCrunch AI" } }],
    sources: [
      { id: "hn", name: "Hacker News", count: 1 },
      { id: "hn_front", name: "Hacker News Front Page", count: 1 },
      { id: "tc", name: "TechCrunch AI", count: 1 },
    ],
  };

  it("전체 기사 머리의 누적 매체 수는 축약명 단위로 센다", () => {
    const html = renderToString(<FeedView {...multi} issueIds={[]} />);
    expect(html).toContain("누적 3건 · 매체 2곳");
  });

  it("옛 링크의 비대표 id 로 걸러도 결과 머리는 매체명, 결과는 묶음 전체다", () => {
    const html = renderToString(
      <FeedView {...multi} issueIds={[]} options={{ source: "hn_front" }} />,
    );
    expect(html).toMatch(/<h1[^>]*>Hacker News<\/h1>/);
    expect(html).toContain("기사1");
    expect(html).toContain("기사2");
    expect(html).not.toContain("기사3");
  });
});
