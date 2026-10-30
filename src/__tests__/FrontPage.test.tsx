import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrontPage } from "@/components/Edition";
import { buildEdition } from "@/lib/edition";
import type { ArticleCard } from "@/lib/types";

let seq = 0;
function card(p: Partial<ArticleCard>): ArticleCard {
  seq += 1;
  return {
    id: seq,
    source: { id: "hn", name: "Hacker News" },
    url: "https://x",
    titleKo: `기사${seq}`,
    summaryKo: "요약",
    titleOriginal: `T${seq}`,
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-10-29T00:00:00Z",
    ...p,
  };
}

/** 뉴스 10건(분야 3개 이상) — 리드 1·서브 3·브리핑 3이 찬다. */
const newsIssue = () =>
  [
    "llm",
    "agent",
    "industry",
    "research",
    "llm",
    "agent",
    "industry",
    "physical",
    "llm",
    "oss",
  ].map((category, i) => card({ category, importance: 5 - Math.floor(i / 3) }));

const radarIssue = () => [
  card({ format: "oss", category: "oss", importance: 5, titleKo: "레이더-저장소" }),
  card({ format: "oss", category: "agent", importance: 4, titleKo: "레이더-저장소2" }),
  card({ format: "model", category: "llm", importance: 3, titleKo: "레이더-모델" }),
  card({ format: "paper", category: "research", importance: 2, titleKo: "레이더-논문" }),
  card({ format: "paper", category: "research", importance: 1, titleKo: "레이더-논문2" }),
];

describe("FrontPage — 오늘의 브리핑·레이더 띠", () => {
  it("브리핑은 3행 목록, 레이더 띠는 4장과 형식 라벨(REPO·MODEL·PAPER)을 그린다", () => {
    const edition = buildEdition([...newsIssue(), ...radarIssue()]);
    expect(edition.radar).toHaveLength(4);
    render(<FrontPage edition={edition} />);

    const briefs = screen.getByRole("region", { name: "오늘의 브리핑" });
    expect(within(briefs).getAllByRole("listitem")).toHaveLength(3);
    for (const a of edition.briefs) expect(within(briefs).getByText(a.titleKo)).toBeInTheDocument();

    const radar = screen.getByRole("region", { name: "오픈소스·논문 레이더" });
    const cards = within(radar).getAllByRole("listitem");
    expect(cards).toHaveLength(4);
    // 표시 순서 = 편집 순(buildEdition 의 radar 순서)
    expect(cards.map((li) => within(li).getByRole("heading").textContent)).toEqual(
      edition.radar.map((a) => a.titleKo),
    );
    expect(within(radar).getAllByText("REPO")).toHaveLength(2);
    expect(within(radar).getByText("MODEL")).toBeInTheDocument();
    expect(within(radar).getByText("PAPER")).toBeInTheDocument();
    // 레이더에는 뉴스가 없다 — 날짜·형식 라벨 없는 뉴스 카드가 섞이지 않는다
    expect(within(radar).queryByText(edition.lead!.titleKo)).toBeNull();
  });

  it("비뉴스가 0건이면 레이더가 빈 배열이고 띠 전체(머리 포함)를 숨긴다", () => {
    const edition = buildEdition(newsIssue());
    expect(edition.radar).toEqual([]);
    render(<FrontPage edition={edition} />);
    expect(screen.getByRole("region", { name: "1면" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "오픈소스·논문 레이더" })).toBeNull();
    expect(screen.queryByText("오픈소스·논문 레이더")).toBeNull();
    expect(screen.queryByText("REPO")).toBeNull();
  });

  it("뉴스가 4건 이하면 브리핑 목록을 그리지 않는다", () => {
    const edition = buildEdition([...newsIssue().slice(0, 4), ...radarIssue()]);
    expect(edition.briefs).toEqual([]);
    render(<FrontPage edition={edition} />);
    expect(screen.queryByRole("region", { name: "오늘의 브리핑" })).toBeNull();
    expect(screen.getByRole("region", { name: "오픈소스·논문 레이더" })).toBeInTheDocument();
  });
});
