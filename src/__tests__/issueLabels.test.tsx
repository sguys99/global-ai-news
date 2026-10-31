import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Byline } from "@/components/ArticleMeta";
import { Masthead } from "@/components/Masthead";
import { type IssueStats, issueStats } from "@/lib/edition";
import type { Format } from "@/lib/labels";
import { SITE_TAGLINE } from "@/lib/site";

const article = {
  format: "news" as const,
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

describe("issueStats — 마스트헤드 귀의 호 기준 통계", () => {
  const a = (format: Format, sourceId: string) => ({
    format,
    source: { id: sourceId, name: sourceId },
  });

  it("기사·매체 수와 형식 구성(FORMATS 순서)을 세고, 0건 형식은 뺀다", () => {
    const stats = issueStats([
      a("paper", "hf"),
      a("news", "aitimes"),
      a("news", "etnews"),
      a("oss", "github"),
      a("news", "aitimes"),
      a("paper", "arxiv"),
    ]);
    expect(stats).toEqual({
      count: 6,
      sources: 5,
      formats: [
        { format: "news", count: 3 },
        { format: "oss", count: 1 },
        { format: "paper", count: 2 },
      ],
    });
  });

  it("같은 매체의 여러 피드(축약명이 같은 소스)는 매체 1곳으로 센다", () => {
    const stats = issueStats([
      { format: "news", source: { id: "hackernews", name: "Hacker News" } },
      { format: "news", source: { id: "hnrss_frontpage", name: "Hacker News Front Page" } },
      { format: "paper", source: { id: "hf_daily_papers", name: "HuggingFace Daily Papers" } },
      { format: "model", source: { id: "hf_models", name: "HuggingFace 트렌딩 모델" } },
    ]);
    expect(stats.sources).toBe(2);
  });

  it("빈 호는 0건·형식 없음", () => {
    expect(issueStats([])).toEqual({ count: 0, sources: 0, formats: [] });
  });
});

describe("Masthead 귀(이번 호 통계)", () => {
  const stats: IssueStats = {
    count: 30,
    sources: 14,
    formats: [
      { format: "news", count: 22 },
      { format: "oss", count: 3 },
      { format: "model", count: 2 },
      { format: "paper", count: 3 },
    ],
  };

  it("'이번 호 N건 · 매체 M곳'과 형식 구성을 제호 옆 귀에 표시한다", () => {
    render(
      <Masthead
        issueNo={136}
        publishedAt="2026-10-29T21:00:00.000Z"
        stats={stats}
        categories={[]}
      />,
    );
    const ear = screen.getByTestId("issue-ear");
    // 모바일 첫 줄("이번 호 " 인라인)·md 머리("이번 호")가 함께 마크업된다(표시는 CSS 로 갈린다).
    expect(ear.textContent).toBe("이번 호이번 호 30건 · 매체 14곳뉴스 22·오픈소스 3·모델 2·논문 3");
    expect(screen.queryByText(/누적|기사 \d+건/)).toBeNull();
    // 폴리오는 날짜·호수만 — 통계는 귀로 옮겼다.
    expect(screen.getByText("제136호")).toBeTruthy();
  });

  it("0건인 형식은 생략하고, 형식이 없으면 형식 줄도 그리지 않는다", () => {
    const { rerender } = render(
      <Masthead
        issueNo={5}
        publishedAt="2026-10-26T21:00:00.000Z"
        stats={{ count: 28, sources: 11, formats: [{ format: "news", count: 28 }] }}
        categories={[]}
      />,
    );
    const ear = screen.getByTestId("issue-ear");
    expect(ear.textContent).toContain("뉴스 28");
    expect(ear.textContent).not.toMatch(/오픈소스|모델|논문/);

    rerender(
      <Masthead
        issueNo={5}
        publishedAt="2026-10-26T21:00:00.000Z"
        stats={{ count: 0, sources: 0, formats: [] }}
        categories={[]}
      />,
    );
    expect(screen.getByTestId("issue-ear").textContent).toBe("이번 호이번 호 0건 · 매체 0곳");
  });

  it("태그라인은 마스트헤드에 없다(푸터·공유 썸네일로 옮김)", () => {
    render(<Masthead issueNo={5} publishedAt={null} stats={stats} categories={[]} />);
    expect(screen.queryByText(SITE_TAGLINE)).toBeNull();
  });

  it("섹션 내비는 1면 · 분야(넘긴 순서) · 색인 라벨이고 건수를 넣지 않는다", () => {
    render(
      <Masthead
        issueNo={5}
        publishedAt={null}
        stats={stats}
        categories={["llm", "agent", "physical", "oss", "research", "industry"]}
        indexLabel="이 호의 기사"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "지면 섹션" });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((l) => l.textContent)).toEqual([
      "1면",
      "LLM",
      "에이전트",
      "Physical AI",
      "오픈소스·도구",
      "연구·논문",
      "산업·정책",
      "이 호의 기사",
    ]);
    expect(links.map((l) => l.getAttribute("href"))).toContain("#section-physical");
  });
});
