import { describe, expect, it } from "vitest";
import {
  filterAndSortFeed,
  findSourceGroup,
  groupSources,
  hasActiveFilter,
  parseFeedOptions,
} from "@/lib/feedFilter";
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
    format: "news",
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

  it("category 필터 (getFeed.test 와 동일 의미)", () => {
    const withCat = [{ ...A, category: "agent" }, { ...B, category: "oss" }, C];
    expect(titles(filterAndSortFeed(withCat, { category: "agent" }))).toEqual(["A"]);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const before = [...ALL];
    filterAndSortFeed(ALL, { sort: "importance" });
    expect(ALL).toEqual(before);
  });
});

/** 실제 sources.json 이름 — 축약명이 겹치는 피드(HN 2개·HF 2개·Google News 질의). count 내림차순(getSourcesWithCounts). */
const SOURCES = [
  { id: "techcrunch_ai", name: "TechCrunch AI", count: 119 },
  { id: "hf_daily_papers", name: "HuggingFace Daily Papers", count: 46 },
  { id: "hackernews", name: "Hacker News", count: 35 },
  { id: "hf_models", name: "HuggingFace 트렌딩 모델", count: 12 },
  { id: "gnews_physical_ai", name: "Google News: physical/embodied AI", count: 9 },
  { id: "hnrss_frontpage", name: "Hacker News Front Page", count: 7 },
  { id: "gnews_humanoid", name: "Google News: humanoid robot", count: 2 },
  { id: "hf_blog", name: "Hugging Face Blog", count: 9 },
];

describe("groupSources — 매체 칩은 축약명 단위로 하나", () => {
  it("축약명이 같은 피드를 한 묶음으로 모으고, 묶음 기사 수 합계 내림차순으로 둔다", () => {
    expect(groupSources(SOURCES)).toEqual([
      { id: "techcrunch_ai", label: "TechCrunch", ids: ["techcrunch_ai"], count: 119 },
      {
        id: "hf_daily_papers",
        label: "Hugging Face",
        ids: ["hf_daily_papers", "hf_models"],
        count: 58,
      },
      {
        id: "hackernews",
        label: "Hacker News",
        ids: ["hackernews", "hnrss_frontpage"],
        count: 42,
      },
      {
        id: "gnews_physical_ai",
        label: "Google News",
        ids: ["gnews_physical_ai", "gnews_humanoid"],
        count: 11,
      },
      // 축약명이 다른 매체(회사 블로그)는 따로 둔다.
      { id: "hf_blog", label: "Hugging Face Blog", ids: ["hf_blog"], count: 9 },
    ]);
  });

  it("대표 id 는 묶음에서 기사가 가장 많은 소스다(입력 순서와 무관)", () => {
    const [hn] = groupSources([
      { id: "hnrss_frontpage", name: "Hacker News Front Page", count: 3 },
      { id: "hackernews", name: "Hacker News", count: 30 },
    ]);
    expect(hn).toMatchObject({ id: "hackernews", ids: ["hnrss_frontpage", "hackernews"] });
  });

  it("count 가 없으면 입력 순서를 지키고 먼저 나온 id 를 대표로 둔다", () => {
    const groups = groupSources([
      { id: "a", name: "Alpha" },
      { id: "hnrss_frontpage", name: "Hacker News Front Page" },
      { id: "hackernews", name: "Hacker News" },
    ]);
    expect(groups.map((g) => [g.id, g.label])).toEqual([
      ["a", "Alpha"],
      ["hnrss_frontpage", "Hacker News"],
    ]);
  });

  it("findSourceGroup: 묶음의 어느 id 로도 같은 묶음을 찾고, 모르는 id·빈 값은 undefined", () => {
    const groups = groupSources(SOURCES);
    expect(findSourceGroup(groups, "hnrss_frontpage")?.label).toBe("Hacker News");
    expect(findSourceGroup(groups, "hackernews")?.label).toBe("Hacker News");
    expect(findSourceGroup(groups, "nope")).toBeUndefined();
    expect(findSourceGroup(groups, undefined)).toBeUndefined();
  });
});

describe("filterAndSortFeed — 매체 묶음 필터", () => {
  const hn1 = card({ id: 11, titleOriginal: "HN1", trendingScore: 30 });
  const hn2 = card({
    id: 12,
    titleOriginal: "HN2",
    trendingScore: 20,
    source: { id: "hnrss_frontpage", name: "Hacker News Front Page" },
  });
  const tc = card({ id: 13, titleOriginal: "TC", source: B.source, trendingScore: 10 });
  const rows = [hn1, hn2, tc];

  it("매체 목록을 주면 대표 id 로 묶음 전체(같은 매체의 모든 피드)를 거른다", () => {
    expect(titles(filterAndSortFeed(rows, { source: "hackernews" }, SOURCES))).toEqual([
      "HN1",
      "HN2",
    ]);
  });

  it("옛 링크의 비대표 id(?source=hnrss_frontpage)도 같은 묶음으로 풀린다", () => {
    expect(titles(filterAndSortFeed(rows, { source: "hnrss_frontpage" }, SOURCES))).toEqual([
      "HN1",
      "HN2",
    ]);
  });

  it("매체 목록이 없거나 목록에 없는 id 면 id 정확 일치(getFeed 와 같은 의미)", () => {
    expect(titles(filterAndSortFeed(rows, { source: "hnrss_frontpage" }))).toEqual(["HN2"]);
    expect(filterAndSortFeed(rows, { source: "gone" }, SOURCES)).toEqual([]);
  });
});

describe("parseFeedOptions / hasActiveFilter", () => {
  it("URL 쿼리를 옵션으로 파싱하고 알 수 없는 sort 는 버린다", () => {
    const params = new URLSearchParams("q=agent&category=agent&source=hn&tag=llm&sort=weird");
    expect(parseFeedOptions(params)).toEqual({
      q: "agent",
      category: "agent",
      source: "hn",
      tag: "llm",
      sort: undefined,
    });
  });

  it.each([
    ["Language%20Models", "llm"],
    ["Language+Models", "llm"],
    ["Agents", "agent"],
    ["Dev%20Tools", "oss"],
    ["MLOps", "oss"],
    ["%EC%97%B0%EA%B5%AC%C2%B7%EB%85%BC%EB%AC%B8", "research"],
    ["%EC%82%B0%EC%97%85%C2%B7%EC%A0%95%EC%B1%85", "industry"],
  ])("분야 개편 전 공유 링크 category=%s 는 새 키 %s 로 받는다", (raw, key) => {
    expect(parseFeedOptions(new URLSearchParams(`category=${raw}`)).category).toBe(key);
  });

  it("새 분야 키와 미정의 분야 값은 그대로 둔다", () => {
    expect(parseFeedOptions(new URLSearchParams("category=physical")).category).toBe("physical");
    expect(parseFeedOptions(new URLSearchParams("category=Robotics")).category).toBe("Robotics");
  });

  it("빈 값은 undefined 로 정규화한다", () => {
    expect(parseFeedOptions(new URLSearchParams("category=&sort=latest"))).toMatchObject({
      category: undefined,
      sort: "latest",
    });
  });

  it("분야·매체·태그만 필터로 본다(정렬·검색어 제외)", () => {
    expect(hasActiveFilter({ sort: "latest" })).toBe(false);
    expect(hasActiveFilter({ category: "agent" })).toBe(true);
    expect(hasActiveFilter({ tag: "llm" })).toBe(true);
  });
});
