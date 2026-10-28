import { describe, expect, it } from "vitest";
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
    summaryKo: "",
    titleOriginal: `T${seq}`,
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-07-01T00:00:00Z",
    ...p,
  };
}

const limits = { seconds: 2, trending: 3, sectionItems: 2 };

describe("buildEdition", () => {
  it("리드·서브는 중요도 → 트렌딩 → 최신 순", () => {
    const a = card({ importance: 5, trendingScore: 0 });
    const b = card({ importance: 5, trendingScore: 40 });
    const c = card({ importance: 4, publishedAt: "2026-07-03T00:00:00Z" });
    const d = card({ importance: 4, publishedAt: "2026-07-02T00:00:00Z" });
    const e = buildEdition([a, c, d, b], limits);
    expect(e.lead?.id).toBe(b.id);
    expect(e.seconds.map((x) => x.id)).toEqual([a.id, c.id]);
  });

  it("완전 동점이면 id 순으로 고정 — 입력 순서와 무관", () => {
    const a = card({ importance: 4, trendingScore: 10 });
    const b = card({ importance: 4, trendingScore: 10 });
    const c = card({ importance: 4, trendingScore: 10 });
    const one = buildEdition([c, a, b], limits);
    const two = buildEdition([b, c, a], limits);
    expect(one.lead?.id).toBe(a.id);
    expect(two.lead?.id).toBe(a.id);
    expect(one.seconds.map((x) => x.id)).toEqual([b.id, c.id]);
    expect(two.seconds.map((x) => x.id)).toEqual([b.id, c.id]);
    expect(one.trending.map((x) => x.id)).toEqual(two.trending.map((x) => x.id));
  });

  it("트렌딩은 점수 > 0 만, 점수 내림차순 상위 N", () => {
    const xs = [10, 0, 70, 30, 50].map((t) => card({ trendingScore: t }));
    const e = buildEdition(xs, limits);
    expect(e.trending.map((x) => x.trendingScore)).toEqual([70, 50, 30]);
  });

  it("섹션은 카테고리 정의 순서, 1면 기사 제외, 빈 섹션 생략", () => {
    const lead = card({ category: "agent", importance: 5 });
    const s1 = card({ category: "oss", importance: 5 });
    const s2 = card({ category: "oss", importance: 5 });
    const ag = card({ category: "agent", importance: 2 });
    const lm = card({ category: "llm", importance: 1 });
    const e = buildEdition([ag, s1, lm, lead, s2], limits);

    expect(e.sections.map((s) => s.category)).toEqual(["llm", "agent"]);
    const agents = e.sections.find((s) => s.category === "agent")!;
    expect(agents.items.map((x) => x.id)).toEqual([ag.id]);
  });

  it("섹션 순서 = LLM·에이전트·Physical AI·오픈소스·도구·연구·논문·산업·정책", () => {
    const order = ["industry", "research", "oss", "physical", "agent", "llm"];
    // 리드 1건(+서브 0건)을 따로 두고, 분야마다 1건씩 섹션에 남긴다.
    const xs = [card({ category: "industry", importance: 5 })].concat(
      order.map((category) => card({ category, importance: 1 })),
    );
    const e = buildEdition(xs, { seconds: 0, trending: 0, sectionItems: 4 });
    expect(e.sections.map((s) => s.category)).toEqual([
      "llm",
      "agent",
      "physical",
      "oss",
      "research",
      "industry",
    ]);
  });

  it("섹션 count 는 입력(그 호) 안의 개수, 1면 기사 포함", () => {
    const xs = [
      card({ category: "agent", importance: 5 }),
      card({ category: "agent", importance: 4 }),
      card({ category: "agent", importance: 3 }),
    ];
    const e = buildEdition(xs, { seconds: 1, trending: 3, sectionItems: 4 });
    const agents = e.sections.find((s) => s.category === "agent")!;
    expect(agents.count).toBe(3);
    expect(agents.items).toHaveLength(1);
  });

  it("입력 기사만으로 구성 — 게시 시각이 오래돼도 기간 필터·대체 없이 그대로 쓴다", () => {
    const old = card({ importance: 5, publishedAt: "2026-07-01T00:00:00Z" });
    const fresh = card({ importance: 3, publishedAt: "2026-10-06T00:00:00Z" });
    const e = buildEdition([fresh, old], limits);
    expect(e.lead?.id).toBe(old.id);
    expect(e.issue.map((x) => x.id)).toEqual([old.id, fresh.id]);
  });

  it("기사가 없으면 리드 없음", () => {
    expect(buildEdition([])).toEqual({
      lead: null,
      seconds: [],
      trending: [],
      sections: [],
      issue: [],
    });
  });
});
