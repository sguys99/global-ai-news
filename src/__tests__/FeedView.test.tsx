import { act, cleanup } from "@testing-library/react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedView } from "@/components/FeedView";
import { buildFeedIndex } from "@/lib/feedIndex";
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

/** 색인 = 누적 전체(받은 뒤 상태). 이번 호는 issueArticles 로 따로 넘긴다. */
const base = {
  index: buildFeedIndex([card(1), card(2)]),
  indexTotal: 2,
  issueArticles: [] as ArticleCard[],
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
  it("이번 호 기사가 없어도 깨지지 않고 1면 없이 전체 기사 색인만 그린다", () => {
    const html = renderToString(<FeedView {...base} />);
    expect(html).not.toContain('id="front"');
    expect(html).toContain("전체 기사");
    expect(html).not.toContain("지금 화제");
  });
});

describe("FeedView — 발행 지연 안내 초기 상태", () => {
  it("initialDelayGap 이 있으면 정적 HTML 에 안내가 이미 담긴다", () => {
    const html = renderToString(
      <FeedView {...base} issueArticles={[card(1)]} initialDelayGap={2} />,
    );
    expect(html).toContain("발행 지연");
    expect(html).toContain("새 호 지연 · 2일째");
  });

  it("initialDelayGap 이 없으면 안내가 없다", () => {
    const html = renderToString(<FeedView {...base} issueArticles={[card(1)]} />);
    expect(html).not.toContain("발행 지연");
    expect(html).not.toContain("발행 전");
  });

  it("서버 HTML 을 하이드레이트해도 불일치 경고가 없다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = <FeedView {...base} issueArticles={[card(1)]} initialDelayGap={2} />;
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
  const all = [card(1), front, { ...card(3), source: { id: "tc", name: "TechCrunch AI" } }];
  const multi = {
    ...base,
    index: buildFeedIndex(all),
    indexTotal: all.length,
    sources: [
      { id: "hn", name: "Hacker News", count: 1 },
      { id: "hn_front", name: "Hacker News Front Page", count: 1 },
      { id: "tc", name: "TechCrunch AI", count: 1 },
    ],
  };

  it("전체 기사 머리의 누적 매체 수는 축약명 단위로 센다", () => {
    const html = renderToString(<FeedView {...multi} />);
    expect(html).toContain("누적 3건 · 매체 2곳");
  });

  it("옛 링크의 비대표 id 로 걸러도 결과 머리는 매체명, 결과는 묶음 전체다", () => {
    const html = renderToString(<FeedView {...multi} options={{ source: "hn_front" }} />);
    expect(html).toMatch(/<h1[^>]*>Hacker News<\/h1>/);
    expect(html).toContain("기사1");
    expect(html).toContain("기사2");
    expect(html).not.toContain("기사3");
  });
});

describe("FeedView — 색인 첫 페이지만 있을 때(누적 전체는 아직 받지 않음)", () => {
  const all = Array.from({ length: 45 }, (_, i) => ({ ...card(i + 1), trendingScore: 100 - i }));
  const index = buildFeedIndex(all);
  const head = { ...base, index: index.slice(0, 30), indexTotal: 45 };

  it("기본 지면: 머리는 누적 건수, 더 보기는 남은 건수를 누적 기준으로 센다", () => {
    const html = renderToString(<FeedView {...head} />);
    expect(html).toContain("누적 45건 · 매체 1곳");
    expect(html).toContain("남은 <!-- -->15<!-- -->건");
    expect(html).toContain("기사30<");
    expect(html).not.toContain("기사31<");
  });

  it("필터가 걸리면 앞부분으로 결과를 세지 않고 불러오는 중 상태 줄을 둔다", () => {
    const html = renderToString(<FeedView {...head} options={{ category: "agent" }} />);
    expect(html).toContain("기사 목록을 불러오는 중");
    expect(html).not.toContain("기사1<");
    expect(html).not.toContain("조건에 맞는 기사가 없습니다");
  });

  it("정렬만 바꿔도 전체가 필요하다 — 지면은 그대로, 색인 자리만 상태 줄", () => {
    const html = renderToString(
      <FeedView {...head} issueArticles={[card(1)]} options={{ sort: "latest" }} />,
    );
    expect(html).toContain('id="front"');
    expect(html).toContain("기사 목록을 불러오는 중");
  });

  it("받기에 실패하면 안내와 다시 시도 버튼(누르면 onLoadIndex)", async () => {
    const onLoadIndex = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <FeedView
          {...head}
          options={{ tag: "x" }}
          indexLoadState="error"
          onLoadIndex={onLoadIndex}
        />,
      );
    });
    expect(container.textContent).toContain("기사 목록을 불러오지 못했습니다");
    const retry = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("다시 시도"),
    );
    await act(async () => retry?.click());
    expect(onLoadIndex).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });

  it("전체를 받은 뒤의 필터 결과 = 누적 전체를 그대로 거른 결과", () => {
    const html = renderToString(
      <FeedView {...base} index={index} indexTotal={45} options={{ category: "agent" }} />,
    );
    expect(html).toContain("45<!-- -->건");
    expect(html).toContain("남은 <!-- -->15<!-- -->건"); // 결과 45건 중 첫 30건 + 나머지는 받은 데이터로 펼친다
    expect(html).not.toContain("불러오는 중");
  });
});
