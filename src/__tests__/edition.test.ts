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
    category: "Agents",
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

  it("트렌딩은 점수 > 0 만, 점수 내림차순 상위 N", () => {
    const xs = [10, 0, 70, 30, 50].map((t) => card({ trendingScore: t }));
    const e = buildEdition(xs, limits);
    expect(e.trending.map((x) => x.trendingScore)).toEqual([70, 50, 30]);
  });

  it("섹션은 카테고리 정의 순서, 1면 기사 제외, 빈 섹션 생략, count 는 1면 포함 전체", () => {
    const lead = card({ category: "Agents", importance: 5 });
    const s1 = card({ category: "Dev Tools", importance: 5 });
    const s2 = card({ category: "Dev Tools", importance: 5 });
    const ag = card({ category: "Agents", importance: 2 });
    const lm = card({ category: "Language Models", importance: 1 });
    const e = buildEdition([ag, s1, lm, lead, s2], limits);

    expect(e.sections.map((s) => s.category)).toEqual(["Language Models", "Agents"]);
    const agents = e.sections.find((s) => s.category === "Agents")!;
    expect(agents.count).toBe(2);
    expect(agents.items.map((x) => x.id)).toEqual([ag.id]);
  });

  it("지면은 최신 게시 시각 기준 48시간 이내 기사만 — 과거 고중요도 기사는 리드가 되지 못한다", () => {
    const old = card({ importance: 5, trendingScore: 90, publishedAt: "2026-07-01T00:00:00Z" });
    const fresh = [1, 2, 3, 4].map((h) =>
      card({ importance: 3, trendingScore: 10, publishedAt: `2026-10-06T0${h}:00:00Z` }),
    );
    const e = buildEdition([old, ...fresh], limits);
    expect(e.lead?.id).not.toBe(old.id);
    expect([e.lead, ...e.seconds].map((x) => x?.id)).not.toContain(old.id);
    expect(e.trending.map((x) => x.id)).not.toContain(old.id);
    // 섹션 개수는 기간 제한 없는 전체 기준
    expect(e.sections.find((s) => s.category === "Agents")?.count).toBe(5);
    // 이번 호 기사 목록 = 기간 안 기사, 편집 순
    expect(e.issue.map((x) => x.id)).not.toContain(old.id);
    expect(e.issue).toHaveLength(fresh.length);
  });

  it("이번 호 기사가 1면을 못 채우면 전체 기사로 대체", () => {
    const old = card({ importance: 5, publishedAt: "2026-07-01T00:00:00Z" });
    const fresh = card({ importance: 3, publishedAt: "2026-10-06T00:00:00Z" });
    const e = buildEdition([fresh, old], limits);
    expect(e.lead?.id).toBe(old.id);
  });

  it("기사가 없으면 빈 지면", () => {
    expect(buildEdition([])).toEqual({
      lead: null,
      seconds: [],
      trending: [],
      sections: [],
      issue: [],
    });
  });
});
