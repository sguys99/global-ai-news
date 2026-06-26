import { describe, expect, it } from "vitest";
import { filterAndSortFeed } from "@/lib/feedFilter";
import type { ArticleCard } from "@/lib/types";

/**
 * getFeed.test.ts 의 시드와 동일한 데이터를 ArticleCard[] 로 구성해,
 * 클라이언트 filterAndSortFeed 가 서버 getFeed(SQL)와 같은 결과를 내는지 고정한다.
 */
function card(p: Partial<ArticleCard> & Pick<ArticleCard, "id" | "titleOriginal">): ArticleCard {
  return {
    source: { id: "hackernews", name: "Hacker News" },
    url: "https://x",
    titleKo: "",
    summaryKo: "",
    category: "",
    tags: [],
    trendingScore: 0,
    importance: 0,
    publishedAt: "2026-01-01T00:00:00Z",
    ...p,
  };
}

const A = card({
  id: 1,
  titleOriginal: "A",
  trendingScore: 90,
  importance: 2,
  publishedAt: "2026-01-03T00:00:00Z",
  tags: ["llm", "agent"],
});
const B = card({
  id: 2,
  titleOriginal: "B",
  source: { id: "techcrunch_ai", name: "TechCrunch AI" },
  trendingScore: 50,
  importance: 5,
  publishedAt: "2026-01-01T00:00:00Z",
  tags: ["llm"],
});
const C = card({
  id: 3,
  titleOriginal: "C",
  trendingScore: 70,
  importance: 3,
  publishedAt: "2026-01-02T00:00:00Z",
});

const ALL = [A, B, C];
const titles = (rows: ArticleCard[]) => rows.map((r) => r.titleOriginal);

describe("filterAndSortFeed — 정렬", () => {
  it("기본 정렬은 trending_score 내림차순", () => {
    expect(titles(filterAndSortFeed(ALL))).toEqual(["A", "C", "B"]); // 90, 70, 50
  });

  it("sort=latest 는 게시 최신순", () => {
    expect(titles(filterAndSortFeed(ALL, { sort: "latest" }))).toEqual(["A", "C", "B"]);
  });

  it("sort=importance 는 중요도 우선", () => {
    expect(titles(filterAndSortFeed(ALL, { sort: "importance" }))).toEqual(["B", "C", "A"]); // 5,3,2
  });
});

describe("filterAndSortFeed — 필터", () => {
  it("source 필터", () => {
    expect(titles(filterAndSortFeed(ALL, { source: "hackernews" })).sort()).toEqual(["A", "C"]);
  });

  it("tag 필터", () => {
    expect(titles(filterAndSortFeed(ALL, { tag: "agent" }))).toEqual(["A"]);
  });

  it("source + tag 동시 필터", () => {
    expect(titles(filterAndSortFeed(ALL, { source: "techcrunch_ai", tag: "llm" }))).toEqual(["B"]);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const before = [...ALL];
    filterAndSortFeed(ALL, { sort: "importance" });
    expect(ALL).toEqual(before);
  });
});
