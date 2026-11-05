import { describe, expect, it } from "vitest";
import {
  INDEX_PAGE_SIZE,
  buildFeedIndex,
  mergeIndex,
  relatedCountOf,
  toEntryCard,
  toIndexCard,
} from "@/lib/feedIndex";
import { filterAndSortFeed } from "@/lib/feedFilter";
import type { FeedOptions } from "@/lib/db";
import type { ArticleCard } from "@/lib/types";

const CATS = ["llm", "agent", "physical", "oss", "research", "industry"];
const SOURCES = [
  { id: "hn", name: "Hacker News" },
  { id: "hn_front", name: "Hacker News Front Page" },
  { id: "tc", name: "TechCrunch AI" },
  { id: "gh", name: "GitHub Trending" },
];

/** 누적 카드(DB getFeed 모양). 화제·게시 시각 동점이 섞이도록 값을 접는다. */
function card(i: number): ArticleCard {
  return {
    id: i,
    source: SOURCES[i % SOURCES.length],
    url: `https://x/${i}`,
    titleKo: i % 17 === 0 ? "" : `기사${i}`,
    summaryKo: `요약${i}`,
    titleOriginal: `T${i}`,
    contentRaw: "본문",
    category: CATS[i % CATS.length],
    format: i % 5 === 0 ? "oss" : "news",
    tags: i % 3 === 0 ? ["llm", "agent"] : ["llm"],
    trendingScore: i % 4 === 0 ? 0 : (i * 7) % 60,
    importance: (i % 5) + 1,
    publishedAt: `2026-10-${String(10 + (i % 20)).padStart(2, "0")}T0${i % 3}:00:00Z`,
    related: i % 6 === 0 ? [{ source: "Reuters", url: "https://r", title: "R" }] : [],
    engagement: i % 5 === 0 ? { stars: 100 + i } : undefined,
  };
}

// getFeed() 결과처럼 기본 정렬(화제 → 게시 시각) 순서로 둔다 — 동점의 상대 순서가 입력 순서를 따르기 때문이다.
const cards = filterAndSortFeed(Array.from({ length: 95 }, (_, i) => card(i + 1)));
const sources = SOURCES.map((s) => ({ ...s, count: 1 }));
const ids = (list: { id: number }[]) => list.map((a) => a.id);

describe("toIndexCard", () => {
  it("색인이 그리는 필드만 남긴다(원문 URL·원제·본문·묶음 목록·메트릭 제외)", () => {
    const c = toIndexCard(card(6));
    expect(Object.keys(c).sort()).toEqual(
      [
        "id",
        "source",
        "titleKo",
        "summaryKo",
        "category",
        "format",
        "tags",
        "trendingScore",
        "importance",
        "publishedAt",
        "relatedCount",
      ].sort(),
    );
    expect(c.relatedCount).toBe(1);
  });

  it("한국어 제목이 비면 원제를 titleKo 에 미리 넣는다(StoryEntry 폴백과 같은 결과)", () => {
    expect(toIndexCard(card(17)).titleKo).toBe("T17");
  });

  it("묶인 보도가 없으면 relatedCount 키를 두지 않는다", () => {
    expect("relatedCount" in toIndexCard(card(1))).toBe(false);
  });

  it("이미 색인 카드면 그대로(멱등)", () => {
    const once = toIndexCard(card(6));
    expect(toIndexCard(once)).toEqual(once);
  });

  it("relatedCountOf: 카드는 related 길이, 색인 카드는 relatedCount", () => {
    expect(relatedCountOf(card(6))).toBe(1);
    expect(relatedCountOf(toIndexCard(card(6)))).toBe(1);
    expect(relatedCountOf(toIndexCard(card(1)))).toBe(0);
  });
});

describe("buildFeedIndex — 첫 페이지와 JSON 이 같은 순서", () => {
  it("기본 정렬은 클라 filterAndSortFeed(기존 홈 동작)와 같은 순서다", () => {
    expect(ids(buildFeedIndex(cards))).toEqual(ids(filterAndSortFeed(cards)));
  });

  it("첫 페이지(정적 HTML)는 전체(JSON)의 앞부분이다", () => {
    const all = buildFeedIndex(cards);
    expect(all.slice(0, INDEX_PAGE_SIZE)).toEqual(buildFeedIndex(cards).slice(0, INDEX_PAGE_SIZE));
    expect(ids(all).slice(0, INDEX_PAGE_SIZE)).toEqual(ids(filterAndSortFeed(cards)).slice(0, 30));
  });
});

describe("mergeIndex — 첫 페이지 + 받은 전체 + 이번 호", () => {
  const all = buildFeedIndex(cards);
  const head = all.slice(0, INDEX_PAGE_SIZE);
  const issue = cards.slice(80).map(toIndexCard);

  it("데이터가 일관되면 결과는 받은 전체와 같다(순서·중복 없음)", () => {
    const merged = mergeIndex(head, all, issue);
    expect(merged).toEqual(all);
    expect(new Set(ids(merged)).size).toBe(merged.length);
  });

  it("낡은 JSON(캐시)이어도 페이지에 이미 있는 첫 페이지·이번 호 기사는 빠지지 않는다", () => {
    const stale = all.filter((a) => a.id <= 70); // 어제 JSON: 71~95 없음
    const merged = mergeIndex(head, stale, issue);
    for (const id of [...ids(head), ...ids(issue)]) expect(ids(merged)).toContain(id);
    expect(new Set(ids(merged)).size).toBe(merged.length);
  });

  const cases: FeedOptions[] = [
    {},
    { sort: "latest" },
    { sort: "importance" },
    { category: "physical" },
    { category: "agent", sort: "latest" },
    { tag: "agent" },
    { tag: "agent", sort: "importance" },
    { source: "hn_front" }, // 축약명 묶음(Hacker News 두 피드)
    { source: "gh", category: "oss" },
    { source: "nope" },
  ];
  it.each(cases)(
    "필터·정렬 %o: 합친 전체로 거른 결과 = 기존(누적 카드 전체를 실은 홈)과 같다",
    (opts) => {
      const before = filterAndSortFeed(cards, opts, sources); // 개편 전: 누적 ArticleCard 전체
      const after = filterAndSortFeed(mergeIndex(head, all, issue), opts, sources);
      expect(ids(after)).toEqual(ids(before));
    },
  );
});

describe("toEntryCard — 상세 같은 분야 기사 섬 props", () => {
  it("ko: 색인 카드에서 태그만 뺀다(원제 폴백·묶인 보도 개수 그대로)", () => {
    const a = { ...card(17), tags: ["x", "y"] };
    const { tags, ...rest } = toIndexCard(a);
    expect(tags).toEqual(["x", "y"]);
    expect(toEntryCard(a)).toEqual(rest);
    expect(toEntryCard(a, "ko")).not.toHaveProperty("tags");
    expect(toEntryCard(a).titleKo).toBe("T17");
  });

  it("en: 영어 제목·요약·영문 매체명만 더하고 한국어 본문은 싣지 않는다, 없는 값은 키도 없다", () => {
    const a: ArticleCard = {
      ...card(3),
      titleEn: "English title",
      summaryEn: "English summary",
      source: { id: "kr", name: "한국 매체", nameEn: "Korean Outlet" },
    };
    const en = toEntryCard(a, "en");
    expect(en).toMatchObject({
      titleKo: "",
      summaryKo: "",
      titleEn: "English title",
      summaryEn: "English summary",
      source: { id: "kr", name: "한국 매체", nameEn: "Korean Outlet" },
    });
    expect(en).not.toHaveProperty("titleOriginal");
    const bare = toEntryCard({ ...card(3), titleEn: undefined, summaryEn: undefined }, "en");
    expect(bare).not.toHaveProperty("titleEn");
    expect(bare).not.toHaveProperty("summaryEn");
    expect(bare.titleOriginal).toBe("T3");
    expect(Object.values(bare as Record<string, unknown>)).not.toContain(undefined);
  });
});
