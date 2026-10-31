import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeeklyRadarBand } from "@/components/Edition";
import { FeedView } from "@/components/FeedView";
import type { ArticleCard } from "@/lib/types";
import type { WeeklyItem, WeeklyRadar } from "@/lib/weeklyRadar";

function item(id: number, p: Partial<WeeklyItem> = {}): WeeklyItem {
  return {
    id,
    title: `주간${id}`,
    format: "paper",
    category: "research",
    source: { name: "HuggingFace Papers" },
    url: `https://huggingface.co/papers/2610.${30000 + id}`,
    engagement: { ups: 100 + id },
    issueDate: "2026-10-27",
    ...p,
  };
}

const weekly = (n: number): WeeklyRadar => ({
  start: "2026-10-26",
  end: "2026-11-01",
  items: Array.from({ length: n }, (_, i) =>
    item(
      i + 1,
      i % 3 === 0
        ? {
            format: "oss",
            url: `https://github.com/o/r${i}`,
            engagement: { stars: 900, stars_today: 120 },
          }
        : {},
    ),
  ),
  candidates: 23,
  formats: [
    { format: "oss", count: 4 },
    { format: "paper", count: 6 },
  ],
});

describe("WeeklyRadarBand", () => {
  it("머리: 일요일 특집 라벨 · 주간 레이더 · 기간과 형식 구성, 각주에 후보 수", () => {
    render(<WeeklyRadarBand weekly={weekly(10)} />);
    const band = screen.getByRole("region", { name: "주간 레이더" });
    expect(band.id).toBe("weekly");
    expect(within(band).getByText("일요일 특집")).toBeTruthy();
    expect(within(band).getByText("10월 26일 – 11월 1일 · 저장소 4 · 논문 6")).toBeTruthy();
    expect(band.textContent).toContain("23건에서 골랐습니다");
  });

  it("순위표: <ol> 1~10, 1~3위만 코발트, 행마다 실린 호 요일·형식 배지·메타", () => {
    render(<WeeklyRadarBand weekly={weekly(10)} />);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    const ranks = rows.map((r) => r.querySelector("a > span")!);
    expect(ranks.map((s) => s.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    expect(ranks.slice(0, 3).every((s) => s.className.includes("text-brand"))).toBe(true);
    expect(ranks.slice(3).some((s) => s.className.includes("text-brand"))).toBe(false);
    expect(rows[0].textContent).toContain("화요일 호");
    expect(rows[0].textContent).toContain("o/r0");
    expect(rows[0].textContent).toContain("당일+120");
    expect(rows[0].textContent).not.toContain("오늘");
    expect(rows[1].textContent).toContain("arXiv 2610.30002");
    // 형식 배지는 코발트 금지
    const badge = rows[0].querySelector("[aria-hidden]")?.closest("span");
    expect(badge?.className ?? "").not.toContain("text-brand");
  });

  it("md 이상 2열 세로 흐름: 앞 ceil(n/2)건이 왼쪽 열, 나머지는 세로 헤어라인 오른쪽 열", () => {
    render(<WeeklyRadarBand weekly={weekly(7)} />);
    const list = screen.getByRole("list");
    expect(list.className).toContain("md:grid-rows-[repeat(4,auto)]");
    const rows = within(list).getAllByRole("listitem");
    expect(rows.slice(0, 4).every((r) => !r.className.includes("md:border-l"))).toBe(true);
    expect(rows.slice(4).every((r) => r.className.includes("md:border-l"))).toBe(true);
  });
});

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
    publishedAt: "2026-11-01T00:00:00Z",
  };
}

describe("FeedView — 주간 레이더 자리", () => {
  const base = {
    issueArticles: [card(1), card(2)],
    index: [card(1), card(2)],
    indexTotal: 2,
    sources: [{ id: "hn", name: "Hacker News" }],
    tags: [],
    options: {},
    editionInfo: { issueNo: 140, publishedAt: "2026-10-31T21:05:00Z" },
  };

  it("weekly 가 있으면 1면 다음·전체 기사 앞에 밴드, 내비 '1면' 다음에 '주간 레이더'", () => {
    const { container } = render(<FeedView {...base} weekly={weekly(5)} />);
    const ids = [...container.querySelectorAll("main > section[id]")].map((s) => s.id);
    expect(ids.indexOf("weekly")).toBe(ids.indexOf("front") + 1);
    expect(ids.indexOf("weekly")).toBeLessThan(ids.indexOf("all"));
    const nav = screen.getByRole("navigation", { name: "지면 섹션" });
    const labels = within(nav)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(labels.slice(0, 2)).toEqual(["1면", "주간 레이더"]);
  });

  it("weekly 가 없으면(일요일이 아니거나 빈약한 주) 밴드·내비 항목 없음, 필터 모드에도 없음", () => {
    const { container, unmount } = render(<FeedView {...base} weekly={null} />);
    expect(container.querySelector("#weekly")).toBeNull();
    expect(screen.queryByText("주간 레이더")).toBeNull();
    unmount();
    const filtered = render(
      <FeedView {...base} options={{ category: "agent" }} weekly={weekly(5)} />,
    );
    expect(filtered.container.querySelector("#weekly")).toBeNull();
  });
});
