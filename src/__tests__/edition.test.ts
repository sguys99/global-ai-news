import { describe, expect, it } from "vitest";
import { buildEdition, frontArticles } from "@/lib/edition";
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

const limits = { seconds: 2, briefs: 0, radar: 0, trending: 3, sectionItems: 2 };

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

  it("섹션은 카테고리 정의 순서, 1면 기사 제외, 남은 기사 없는 섹션 생략", () => {
    const lead = card({ category: "agent", importance: 5 });
    const s1 = card({ category: "oss", importance: 5 });
    const s2 = card({ category: "oss", importance: 5 });
    const ag = card({ category: "agent", importance: 2 });
    const lm = card({ category: "llm", importance: 1 });
    const e = buildEdition([ag, s1, lm, lead, s2], limits);

    // 분야 3개를 덮으려고 겹친 서브(s2) 대신 llm(lm)이 1면에 오른다 → llm 은 남은 기사가 없어 밴드 생략.
    expect(e.seconds.map((x) => x.id)).toEqual([s1.id, lm.id]);
    expect(e.sections.map((s) => s.category)).toEqual(["agent", "oss"]);
    const agents = e.sections.find((s) => s.category === "agent")!;
    expect(agents.items.map((x) => x.id)).toEqual([ag.id]);
    expect(e.sections.find((s) => s.category === "oss")!.items.map((x) => x.id)).toEqual([s2.id]);
  });

  it("섹션 순서 = LLM·에이전트·Physical AI·오픈소스·도구·연구·논문·산업·정책", () => {
    const order = ["industry", "research", "oss", "physical", "agent", "llm"];
    // 리드 1건(+서브 0건)을 따로 두고, 분야마다 1건씩 섹션에 남긴다.
    const xs = [card({ category: "industry", importance: 5 })].concat(
      order.map((category) => card({ category, importance: 1 })),
    );
    const e = buildEdition(xs, { seconds: 0, briefs: 0, radar: 0, trending: 0, sectionItems: 4 });
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
    const e = buildEdition(xs, { seconds: 1, briefs: 0, radar: 0, trending: 3, sectionItems: 4 });
    const agents = e.sections.find((s) => s.category === "agent")!;
    expect(agents.count).toBe(3);
    expect(agents.onFront).toBe(2);
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
      briefs: [],
      radar: [],
      trending: [],
      sections: [],
      issue: [],
    });
  });
});

describe("buildEdition 1면 슬롯 (스모크)", () => {
  const ids = (xs: ArticleCard[]) => xs.map((x) => x.id);

  it("기본 한도: 리드 1 · 서브 3 · 브리핑 3 · 레이더 4 · 화제 5, 화제 외 슬롯은 겹치지 않는다", () => {
    const cats = ["llm", "agent", "industry", "llm", "agent", "industry", "research", "llm"];
    const news = cats.map((category, i) =>
      card({ category, importance: 5 - (i % 3), trendingScore: 10 + i }),
    );
    const nonNews = [
      card({ format: "oss", category: "oss", importance: 4, trendingScore: 30 }),
      card({ format: "oss", category: "oss", importance: 5 }),
      card({ format: "model", category: "llm", importance: 3 }),
      card({ format: "paper", category: "research", importance: 2 }),
      card({ format: "paper", category: "research", importance: 4 }),
    ];
    const e = buildEdition([...nonNews, ...news]);
    expect(e.lead?.format).toBe("news");
    expect(e.seconds).toHaveLength(3);
    expect(e.briefs).toHaveLength(3);
    expect(e.radar).toHaveLength(4);
    expect(e.trending).toHaveLength(5);
    expect([e.lead!, ...e.seconds, ...e.briefs].every((a) => a.format === "news")).toBe(true);
    expect(e.radar.every((a) => a.format !== "news")).toBe(true);
    const front = frontArticles(e);
    expect(new Set(ids(front)).size).toBe(11);
    // 섹션에는 1면 본문 기사가 없다
    const sectionIds = e.sections.flatMap((s) => ids(s.items));
    expect(sectionIds.some((id) => ids(front).includes(id))).toBe(false);
  });

  it("리드+서브: 같은 분야 최대 2건, 분야 3개 이상", () => {
    const xs = [
      card({ category: "llm", importance: 5 }),
      card({ category: "llm", importance: 5 }),
      card({ category: "llm", importance: 5 }),
      card({ category: "agent", importance: 4 }),
      card({ category: "agent", importance: 4 }),
      card({ category: "industry", importance: 2 }),
    ];
    const e = buildEdition(xs);
    const top = [e.lead!, ...e.seconds];
    expect(top.filter((a) => a.category === "llm")).toHaveLength(2);
    expect(new Set(top.map((a) => a.category)).size).toBe(3);
    // 밀려난 llm·agent 는 브리핑으로 간다
    expect(e.briefs.map((a) => a.category)).toEqual(["llm", "agent"]);
  });

  it("뉴스 풀이 한 분야뿐이면 상한을 풀어 서브를 채운다", () => {
    const xs = [5, 4, 4, 3, 3].map((importance) => card({ category: "llm", importance }));
    const e = buildEdition(xs);
    expect(e.seconds).toHaveLength(3);
    expect(e.briefs).toHaveLength(1);
  });

  it("리드·서브에 Physical AI 가 없으면 중요도 3 이상 Physical AI 뉴스를 브리핑에 우선 배정", () => {
    const xs = [
      ...["llm", "agent", "industry", "llm", "agent", "industry", "llm"].map((category) =>
        card({ category, importance: 5 }),
      ),
      card({ category: "physical", importance: 3 }),
    ];
    const phy = xs.at(-1)!;
    const e = buildEdition(xs);
    expect(ids(e.briefs)).toContain(phy.id);
    expect(e.briefs).toHaveLength(3);
    expect(e.briefs.at(-1)!.id).toBe(phy.id); // 표시는 편집 순

    const low = buildEdition([...xs.slice(0, -1), card({ category: "physical", importance: 2 })]);
    expect(low.briefs.some((a) => a.category === "physical")).toBe(false);
  });

  it("레이더: 오픈소스·모델·논문 각 1건을 먼저 담고 나머지는 편집 순", () => {
    const oss = [5, 5, 4].map((importance) => card({ format: "oss", importance }));
    const model = card({ format: "model", importance: 2 });
    const paper = card({ format: "paper", importance: 1 });
    const e = buildEdition([card({ importance: 5 }), ...oss, model, paper]);
    expect(e.radar.map((a) => a.format).sort()).toEqual(["model", "oss", "oss", "paper"]);
    expect(ids(e.radar)).toEqual([oss[0].id, oss[1].id, model.id, paper.id]);
  });

  it("부족하면 줄어든다 — 비뉴스 0건이면 레이더 빈 배열, 뉴스 4건이면 브리핑 0건", () => {
    const e = buildEdition(
      [5, 4, 4, 3].map((importance, i) =>
        card({ importance, category: ["llm", "agent", "industry", "research"][i] }),
      ),
    );
    expect(e.seconds).toHaveLength(3);
    expect(e.briefs).toEqual([]);
    expect(e.radar).toEqual([]);
  });

  it("뉴스가 없는 호는 비뉴스 1위가 리드, 레이더는 나머지 비뉴스", () => {
    const repo = card({ format: "oss", importance: 5 });
    const paper = card({ format: "paper", importance: 4 });
    const e = buildEdition([paper, repo]);
    expect(e.lead?.id).toBe(repo.id);
    expect(e.seconds).toEqual([]);
    expect(ids(e.radar)).toEqual([paper.id]);
  });
});
