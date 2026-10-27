import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Byline } from "@/components/ArticleMeta";
import { Masthead } from "@/components/Masthead";

const article = {
  source: { id: "hn", name: "Hacker News" },
  publishedAt: "2026-10-27T01:00:00.000Z", // 10:00 KST
  importance: 3,
  trendingScore: 0,
  related: [],
};
const BASE = "2026-10-27T04:00:00.000Z"; // 호 발행 기준(3시간 뒤)

describe("Byline 시각 표기", () => {
  // RelativeTime 은 마운트 후 실제 시각으로 재계산하므로 현재 시각을 기준 시각에 고정한다.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(BASE));
  });
  afterEach(() => vi.useRealTimers());

  it("timeBase 가 있으면 상대 시각(<time>)으로 그린다", () => {
    const { container } = render(<Byline article={article} timeBase={BASE} />);
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    expect(time?.textContent).toBe("3시간 전");
    expect(time?.getAttribute("datetime")).toBe(article.publishedAt);
  });

  it("timeBase 가 없으면 절대 날짜를 유지한다", () => {
    const { container } = render(<Byline article={article} />);
    expect(container.querySelector("time")).toBeNull();
    expect(container.textContent).not.toContain("시간 전");
    expect(container.textContent).toMatch(/10\.27|10월 27일/);
  });
});

describe("Masthead 호 기준 통계", () => {
  it("'이번 호 N건 · 매체 M곳'을 표시한다", () => {
    render(
      <Masthead
        issueNo={5}
        publishedAt="2026-10-26T21:00:00.000Z"
        issueCount={28}
        issueSourceCount={11}
        categories={[]}
      />,
    );
    expect(screen.getByText("이번 호 28건 · 매체 11곳")).toBeTruthy();
    expect(screen.queryByText(/누적|기사 \d+건/)).toBeNull();
  });
});
