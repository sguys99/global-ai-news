import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FilterBar } from "@/components/FilterBar";
import type { SearchOptions } from "@/lib/db";

/** 축약명이 겹치는 피드: Hacker News 2개·Google News 질의 2개. count 내림차순(getSourcesWithCounts). */
const sources = [
  { id: "techcrunch_ai", name: "TechCrunch AI", count: 119 },
  { id: "hackernews", name: "Hacker News", count: 35 },
  { id: "gnews_physical_ai", name: "Google News: physical/embodied AI", count: 9 },
  { id: "hnrss_frontpage", name: "Hacker News Front Page", count: 7 },
  { id: "gnews_humanoid", name: "Google News: humanoid robot", count: 2 },
];

function renderBar(current: SearchOptions = {}) {
  return render(<FilterBar current={current} sources={sources} tags={[]} basePath="/search" />);
}

const outletRow = () => screen.getByRole("group", { name: "매체" });

afterEach(cleanup);

describe("FilterBar — 매체 칩", () => {
  it("같은 매체의 여러 피드는 칩 하나로 묶고, 기사 수 합계 순으로 둔다", () => {
    renderBar();
    const chips = within(outletRow()).getAllByRole("link");
    expect(chips.map((c) => c.textContent)).toEqual(["TechCrunch", "Hacker News", "Google News"]);
  });

  it("칩 링크에는 묶음의 대표 id(기사가 가장 많은 피드)를 싣는다", () => {
    renderBar();
    const row = outletRow();
    expect(within(row).getByRole("link", { name: "Hacker News" })).toHaveAttribute(
      "href",
      "/search?source=hackernews",
    );
    expect(within(row).getByRole("link", { name: "Google News" })).toHaveAttribute(
      "href",
      "/search?source=gnews_physical_ai",
    );
  });

  it("옛 링크의 비대표 id 로 들어와도 묶음 칩이 활성이고, 다시 누르면 해제된다", () => {
    renderBar({ source: "hnrss_frontpage", tag: "llm" });
    const row = outletRow();
    const hn = within(row).getByRole("link", { name: "Hacker News" });
    expect(hn).toHaveAttribute("aria-current", "true");
    expect(hn).toHaveAttribute("href", "/search?tag=llm");
    expect(within(row).getByRole("link", { name: "TechCrunch" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("매체가 없으면 매체 행을 그리지 않는다", () => {
    render(<FilterBar current={{}} sources={[]} tags={[]} />);
    expect(screen.queryByRole("group", { name: "매체" })).not.toBeInTheDocument();
  });
});

describe("FilterBar — 행 라벨 정렬", () => {
  it("md 이상에서 라벨은 첫 줄 칩과 기준선으로 맞춘다(세로 가운데 정렬 아님)", () => {
    renderBar();
    for (const name of ["분야", "매체"]) {
      const row = screen.getByRole("group", { name });
      expect(row).toHaveClass("md:items-baseline");
      expect(row).not.toHaveClass("md:items-center");
    }
  });
});
