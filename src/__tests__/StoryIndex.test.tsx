import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryIndex } from "@/components/StoryIndex";
import type { IndexCard } from "@/lib/types";

function entry(id: number): IndexCard {
  return {
    id,
    source: { id: "hn", name: "Hacker News" },
    titleKo: `기사${id}`,
    summaryKo: "요약",
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-10-25T00:00:00Z",
  };
}

const list = (n: number, from = 1) => Array.from({ length: n }, (_, i) => entry(from + i));
const more = () => screen.getByRole("button", { name: /기사 더 보기/ });

afterEach(cleanup);

describe("StoryIndex — 받은 목록만으로 펼치기(기존 동작)", () => {
  it("30건씩 펼치고, 다 펼치면 버튼이 사라진다", () => {
    render(<StoryIndex articles={list(45)} />);
    expect(screen.getAllByRole("link")).toHaveLength(30);
    expect(more().textContent).toContain("남은 15건");
    fireEvent.click(more());
    expect(screen.getAllByRole("link")).toHaveLength(45);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("색인 카드의 relatedCount 를 바이라인 '외 N곳'으로 그린다", () => {
    render(<StoryIndex articles={[{ ...entry(1), relatedCount: 2 }]} />);
    expect(screen.getByText(/외 2곳/)).toBeTruthy();
  });
});

describe("StoryIndex — 앞부분만 있을 때(홈 첫 페이지)", () => {
  it("남은 건수는 누적 기준이고, 넘겨 펼치면 onLoadMore 를 부르고 상태 줄을 둔다", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <StoryIndex articles={list(30)} total={100} onLoadMore={onLoadMore} />,
    );
    expect(more().textContent).toContain("남은 70건");
    fireEvent.click(more());
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    // 받는 중: 이미 보인 30건은 그대로, 버튼 대신 흐린 상태 줄
    expect(screen.getAllByRole("link")).toHaveLength(30);
    expect(screen.getByRole("status").textContent).toContain("불러오는 중");
    expect(screen.queryByRole("button")).toBeNull();

    // 받은 뒤: 같은 인스턴스(펼친 수 유지)로 60건까지 보이고 남은 40건
    rerender(<StoryIndex articles={list(100)} total={100} onLoadMore={onLoadMore} />);
    expect(screen.getAllByRole("link")).toHaveLength(60);
    expect(more().textContent).toContain("남은 40건");
    fireEvent.click(more());
    expect(onLoadMore).toHaveBeenCalledTimes(1); // 다 받았으니 다시 부르지 않는다
  });

  it("실패하면 보인 기사는 두고 같은 자리에 다시 시도", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <StoryIndex articles={list(30)} total={100} onLoadMore={onLoadMore} />,
    );
    fireEvent.click(more());
    rerender(
      <StoryIndex articles={list(30)} total={100} onLoadMore={onLoadMore} loadState="error" />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(30);
    expect(screen.getByRole("alert").textContent).toContain("불러오지 못했습니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});
