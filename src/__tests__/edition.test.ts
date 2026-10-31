import { describe, expect, it } from "vitest";
import { EDITION_LIMITS, buildEdition, frontArticles } from "@/lib/edition";
import { CATEGORIES } from "@/lib/labels";
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

/* ───────────────────────── Phase 5-3: 1면 편집 규칙 ───────────────────────── */

const ids = (xs: ArticleCard[]) => xs.map((x) => x.id);

/**
 * 가득 찬 호(16건) — 기본 한도로 1면 11건이 모두 찬다. 각 기사의 자리는 아래 주석대로 결정된다.
 * 뉴스 편집 순: n1 > n2 > n3 > n4 > n5 > n6 > n7 > n8 > n9 > n10 (id 동점 깨기 포함)
 */
function fullIssue() {
  const n1 = card({ category: "llm", importance: 5, trendingScore: 50 }); // 리드
  const n2 = card({ category: "llm", importance: 5, trendingScore: 40 }); // 서브
  const n3 = card({ category: "llm", importance: 5, trendingScore: 30 }); // llm 3번째 → 상한으로 브리핑
  const n4 = card({ category: "agent", importance: 4, trendingScore: 20 }); // 서브
  const n5 = card({ category: "agent", importance: 4, trendingScore: 10 }); // 서브 → 분야 교체로 브리핑
  const n6 = card({ category: "industry", importance: 4 }); // 교체로 들어오는 서브
  const n7 = card({ category: "research", importance: 3, trendingScore: 5 }); // 섹션
  const n8 = card({ category: "industry", importance: 3 }); // 섹션
  const n9 = card({ category: "physical", importance: 3 }); // Physical AI 우선 배정 → 브리핑
  const n10 = card({ category: "llm", importance: 2 }); // 섹션
  const o1 = card({ format: "oss", category: "oss", importance: 5, trendingScore: 60 }); // 레이더(REPO 1위)
  const o2 = card({ format: "oss", category: "agent", importance: 4, trendingScore: 70 }); // 레이더(편집 순 보충)
  const o3 = card({ format: "oss", category: "oss", importance: 4, trendingScore: 20 }); // 섹션
  const m1 = card({ format: "model", category: "llm", importance: 3, trendingScore: 15 }); // 레이더(MODEL 1위)
  const p1 = card({ format: "paper", category: "research", importance: 4, trendingScore: 10 }); // 레이더(PAPER 1위)
  const p2 = card({ format: "paper", category: "physical", importance: 2 }); // 섹션
  const news = [n1, n2, n3, n4, n5, n6, n7, n8, n9, n10];
  const nonNews = [o1, o2, o3, m1, p1, p2];
  return {
    n1,
    n2,
    n3,
    n4,
    n5,
    n6,
    n7,
    n8,
    n9,
    n10,
    o1,
    o2,
    o3,
    m1,
    p1,
    p2,
    news,
    nonNews,
    all: [...nonNews, ...news],
  };
}

/** 결정적 의사난수(mulberry32) — 셔플·속성 테스트용. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 지면 전체를 id 로 요약 — 결정성 비교용. */
function snapshot(e: ReturnType<typeof buildEdition>) {
  return {
    lead: e.lead?.id ?? null,
    seconds: ids(e.seconds),
    briefs: ids(e.briefs),
    radar: ids(e.radar),
    trending: ids(e.trending),
    sections: e.sections.map((s) => [s.category, s.count, s.onFront, ids(s.items)]),
    issue: ids(e.issue),
  };
}

/** xs 가 그 호의 편집 순(issue 순서)을 지키는지. */
function inEditorialOrder(xs: ArticleCard[], issue: ArticleCard[]): boolean {
  const pos = xs.map((a) => issue.indexOf(a));
  return pos.every((p, i) => p >= 0 && (i === 0 || pos[i - 1] < p));
}

describe("1면 슬롯 수", () => {
  it("가득 찬 호: 리드 1 · 서브 3 · 브리핑 3 · 레이더 4 · 지금 화제 5 — 각 자리가 정해진 기사", () => {
    const f = fullIssue();
    const e = buildEdition(f.all);
    expect(e.lead?.id).toBe(f.n1.id);
    expect(ids(e.seconds)).toEqual(ids([f.n2, f.n4, f.n6]));
    expect(ids(e.briefs)).toEqual(ids([f.n3, f.n5, f.n9]));
    expect(ids(e.radar)).toEqual(ids([f.o1, f.o2, f.p1, f.m1]));
    expect(ids(e.trending)).toEqual(ids([f.o2, f.o1, f.n1, f.n2, f.n3]));
  });

  it("frontArticles: 리드 → 서브 → 브리핑 → 레이더 순 11건, 지금 화제는 포함하지 않는다", () => {
    const f = fullIssue();
    const e = buildEdition(f.all);
    const front = frontArticles(e);
    expect(ids(front)).toEqual([f.n1.id, ...ids(e.seconds), ...ids(e.briefs), ...ids(e.radar)]);
    expect(front).toHaveLength(11);
    expect(new Set(ids(front)).size).toBe(11);
    expect(frontArticles({ lead: null, seconds: [], briefs: [], radar: [] })).toEqual([]);
  });
});

describe("분야 다양성 제약 (리드+서브)", () => {
  it("분야 3개를 못 덮으면 겹친 서브 중 가장 낮은 순위를 빼고, 덮이지 않은 분야의 최상위 뉴스를 넣는다", () => {
    const lead = card({ category: "llm", importance: 5, trendingScore: 9 });
    const llm2 = card({ category: "llm", importance: 5 });
    const agentA = card({ category: "agent", importance: 5 });
    const agentB = card({ category: "agent", importance: 4 }); // 겹친 서브 중 최하위 → 교체 대상
    const ind1 = card({ category: "industry", importance: 2 });
    const ind2 = card({ category: "industry", importance: 1 });
    const e = buildEdition([ind2, agentB, ind1, lead, llm2, agentA]);
    expect(ids(e.seconds)).toEqual(ids([llm2, agentA, ind1]));
    // 빠진 서브는 사라지지 않고 브리핑으로 간다(편집 순 첫 자리)
    expect(ids(e.briefs)).toEqual(ids([agentB, ind2]));
  });

  it("풀이 허락하면 같은 분야 2건 이하 · 분야 3개 이상", () => {
    const xs = [
      ...[5, 5, 5, 5].map((importance) => card({ category: "llm", importance })),
      ...[4, 4, 4].map((importance) => card({ category: "agent", importance })),
      card({ category: "research", importance: 1 }),
    ];
    const e = buildEdition(xs);
    const top = [e.lead!, ...e.seconds];
    const perCat = top.reduce<Record<string, number>>(
      (m, a) => ({ ...m, [a.category]: (m[a.category] ?? 0) + 1 }),
      {},
    );
    expect(Math.max(...Object.values(perCat))).toBe(2);
    expect(Object.keys(perCat).sort()).toEqual(["agent", "llm", "research"]);
  });

  it("뉴스 분야가 2개뿐이면 2개만 덮고, 남는 서브 자리는 상한을 풀어 편집 순으로 채운다", () => {
    const lead = card({ category: "llm", importance: 5 });
    const llm2 = card({ category: "llm", importance: 4 });
    const llm3 = card({ category: "llm", importance: 4 });
    const agent = card({ category: "agent", importance: 1 });
    const e = buildEdition([agent, llm3, lead, llm2]);
    expect(e.lead?.id).toBe(lead.id);
    expect(ids(e.seconds)).toEqual(ids([llm2, llm3, agent]));
    expect(new Set([e.lead!, ...e.seconds].map((a) => a.category)).size).toBe(2);
  });

  it("서브는 교체 뒤에도 편집 순으로 표시한다", () => {
    const f = fullIssue();
    const e = buildEdition(f.all);
    expect(inEditorialOrder(e.seconds, e.issue)).toBe(true);
  });

  it("서브 한도가 커져도 같은 분야 2건 상한은 분야 3개 목표와 별개로 지킨다", () => {
    // 리드+서브 4건에서는 "분야 3개"가 곧 "분야당 2건 이하"라 상한이 드러나지 않는다 → 서브 5로 확인.
    const lead = card({ category: "llm", importance: 5 });
    const llm = [5, 5, 5, 5].map((importance) => card({ category: "llm", importance }));
    const agent = [3, 3].map((importance) => card({ category: "agent", importance }));
    const ind = [2, 2].map((importance) => card({ category: "industry", importance }));
    const e = buildEdition([...ind, ...agent, ...llm, lead], { ...EDITION_LIMITS, seconds: 5 });
    expect(ids(e.seconds)).toEqual(ids([llm[0], ...agent, ...ind]));
  });
});

describe("Physical AI 우선 배정 (브리핑)", () => {
  // 리드·서브·브리핑 편집 순 상위를 llm·agent·industry 로 채우고, Physical AI 뉴스는 순위 밖에 둔다.
  const top = () =>
    ["llm", "agent", "industry", "llm", "agent", "industry", "llm"].map((category, i) =>
      card({ category, importance: 5, trendingScore: 70 - i }),
    );

  it("리드·서브에 없고 중요도 3 이상이면 순위 밖이어도 브리핑 1자리를 확보 — 여러 건이면 최상위 1건만", () => {
    const xs = top();
    const phyHi = card({ category: "physical", importance: 4 });
    const phyLo = card({ category: "physical", importance: 3 });
    const e = buildEdition([phyLo, ...xs, phyHi]);
    expect(e.briefs.filter((a) => a.category === "physical").map((a) => a.id)).toEqual([phyHi.id]);
    expect(e.briefs).toHaveLength(3);
    expect(inEditorialOrder(e.briefs, e.issue)).toBe(true);
    // 밀려난 뉴스는 편집 순 상위 2건만 브리핑에 남는다
    const pool = e.issue.filter(
      (a) => a.format === "news" && a !== e.lead && !e.seconds.includes(a),
    );
    expect(ids(e.briefs)).toEqual([pool[0].id, pool[1].id, phyHi.id]);
  });

  it("중요도 3 미만이면 배정하지 않는다", () => {
    const e = buildEdition([...top(), card({ category: "physical", importance: 2 })]);
    expect(e.briefs.some((a) => a.category === "physical")).toBe(false);
  });

  it("리드·서브에 이미 Physical AI 가 있으면 추가로 배정하지 않는다", () => {
    const lead = card({ category: "physical", importance: 5 });
    const xs = top().map((a) => ({ ...a, importance: 4 }));
    const phy2 = card({ category: "physical", importance: 3 });
    const e = buildEdition([lead, ...xs, phy2]);
    expect(e.lead?.id).toBe(lead.id);
    expect(e.briefs.some((a) => a.id === phy2.id)).toBe(false);
    expect(e.briefs).toHaveLength(3);
  });

  it("레이더의 Physical AI(비뉴스)는 세지 않는다 — 뉴스 축에 분야를 확보한다", () => {
    const phyPaper = card({ format: "paper", category: "physical", importance: 5 });
    const phyNews = card({ category: "physical", importance: 3 });
    const e = buildEdition([...top(), phyPaper, phyNews]);
    expect(ids(e.radar)).toContain(phyPaper.id);
    expect(ids(e.briefs)).toContain(phyNews.id);
  });
});

describe("브리핑 분야 상한 (분야당 1건)", () => {
  // 리드 llm · 서브 agent·industry·llm(id 동점 깨기) — Physical AI 는 리드·서브에 없다.
  const top = () =>
    ["llm", "agent", "industry", "llm"].map((category, i) =>
      card({ category, importance: 5, trendingScore: 90 - i }),
    );
  const cats = (xs: ArticleCard[]) => xs.map((a) => a.category);

  it("한 분야가 편집 순 상위를 차지해도 분야당 1건 — 건너뛴 기사는 섹션 밴드로 간다", () => {
    const ind = [4, 4, 4].map((importance, i) =>
      card({ category: "industry", importance, trendingScore: 50 - i }),
    );
    const agent = card({ category: "agent", importance: 3 });
    const research = card({ category: "research", importance: 2 });
    const e = buildEdition([research, ...ind, agent, ...top()]);
    expect(ids(e.briefs)).toEqual(ids([ind[0], agent, research]));
    // 리드·서브의 분야(industry·agent)는 브리핑 상한에 세지 않는다
    expect(cats([e.lead!, ...e.seconds])).toEqual(expect.arrayContaining(["industry", "agent"]));
    const band = e.sections.find((s) => s.category === "industry")!;
    expect(ids(band.items)).toEqual(ids([ind[1], ind[2]]));
    expect(band.count).toBe(4);
    expect(band.onFront).toBe(2); // 서브 1 + 브리핑 1
  });

  it("Physical AI 우선 배정분이 Physical AI 의 1건 — 더 높은 Physical AI 뉴스가 있어도 2건째는 없다", () => {
    const phy = [4, 3].map((importance) => card({ category: "physical", importance }));
    const ind = card({ category: "industry", importance: 4 });
    const research = card({ category: "research", importance: 1 });
    const e = buildEdition([...phy, ind, research, ...top()]);
    expect(ids(e.briefs)).toEqual(ids([phy[0], ind, research]));
    expect(ids(e.sections.find((s) => s.category === "physical")!.items)).toEqual([phy[1].id]);
  });

  it("우선 배정이 편집 순 밖이어도 분야 상한과 함께 성립한다", () => {
    const ind = [5, 5].map((importance) => card({ category: "industry", importance }));
    const agent = card({ category: "agent", importance: 5 });
    const phy = card({ category: "physical", importance: 3 });
    const e = buildEdition([phy, ...ind, agent, ...top()]);
    expect(ids(e.briefs)).toEqual(ids([ind[0], agent, phy]));
  });

  it("리드·서브에 Physical AI 가 있어도 브리핑에 Physical AI 1건은 오를 수 있다(우선 배정만 없다)", () => {
    const lead = card({ category: "physical", importance: 5, trendingScore: 99 });
    const rest = ["llm", "agent", "industry"].map((category) => card({ category, importance: 5 }));
    const phy = [4, 4].map((importance) => card({ category: "physical", importance }));
    const llm = card({ category: "llm", importance: 2 });
    const research = card({ category: "research", importance: 1 });
    const e = buildEdition([lead, ...rest, ...phy, llm, research]);
    expect(e.lead?.id).toBe(lead.id);
    expect(ids(e.briefs)).toEqual(ids([phy[0], llm, research]));
  });

  it("남은 분야가 모자라면 상한을 풀어 편집 순으로 채운다 — 브리핑은 뉴스가 모자랄 때만 준다", () => {
    const ind = [4, 4, 3].map((importance) => card({ category: "industry", importance }));
    const phy = [3, 2].map((importance) => card({ category: "physical", importance }));
    const e = buildEdition([...phy, ...ind, ...top()]);
    // 분야 2개(industry·physical) → 각 1위 + 편집 순 다음(ind[1])
    expect(ids(e.briefs)).toEqual(ids([ind[0], ind[1], phy[0]]));

    const one = buildEdition([...ind, card({ category: "industry", importance: 1 }), ...top()]);
    expect(cats(one.briefs)).toEqual(["industry", "industry", "industry"]);
    expect(ids(one.briefs)).toEqual(ids(ind));
  });

  it("브리핑 한도가 커지면 분야 수만큼 1건씩, 그 뒤는 편집 순 보충", () => {
    const ind = [4, 4].map((importance) => card({ category: "industry", importance }));
    const agent = card({ category: "agent", importance: 3 });
    const research = card({ category: "research", importance: 1 });
    const e = buildEdition([research, agent, ...ind, ...top()], { ...EDITION_LIMITS, briefs: 4 });
    expect(ids(e.briefs)).toEqual(ids([ind[0], ind[1], agent, research]));
    expect(buildEdition([...ind, ...top()], { ...EDITION_LIMITS, briefs: 0 }).briefs).toEqual([]);
  });

  it("결정성: 입력 순서를 섞어도 같은 브리핑(동점은 id 순)", () => {
    const ind = [4, 4, 4].map(() => card({ category: "industry", importance: 4 }));
    const phy = [3, 3].map(() => card({ category: "physical", importance: 3 }));
    const xs = [...ind, ...phy, card({ category: "agent", importance: 4 }), ...top()];
    const expected = snapshot(buildEdition(xs));
    expect(expected.briefs).toEqual(ids([ind[0], xs[5], phy[0]]));
    const rand = rng(11);
    for (let i = 0; i < 20; i += 1) {
      expect(snapshot(buildEdition(shuffle(xs, rand)))).toEqual(expected);
    }
  });
});

describe("레이더 형식 혼합", () => {
  it("형식마다 중요도가 낮아도 오픈소스·모델·논문 각 1위를 담고, 남은 1자리는 편집 순", () => {
    const f = fullIssue();
    const e = buildEdition(f.all);
    // o3(oss, 중요도 4)는 m1(model, 중요도 3)보다 편집 순이 높지만 MODEL 1위 보장에 밀린다
    expect(ids(e.radar)).not.toContain(f.o3.id);
    expect(ids(e.radar)).toContain(f.m1.id);
    expect(e.radar.map((a) => a.format).sort()).toEqual(["model", "oss", "oss", "paper"]);
    expect(inEditorialOrder(e.radar, e.issue)).toBe(true);
  });

  it("빠진 형식이 있으면 있는 형식 1위들 + 편집 순 보충", () => {
    const oss = [5, 4, 3].map((importance) => card({ format: "oss", importance }));
    const paper = [2, 2, 1].map((importance) => card({ format: "paper", importance }));
    const e = buildEdition([card({ importance: 5 }), ...paper, ...oss]);
    expect(ids(e.radar)).toEqual(ids([oss[0], oss[1], oss[2], paper[0]]));
  });

  it("뉴스는 중요도가 높고 남아돌아도 레이더에 오르지 않는다", () => {
    const news = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5].map((importance, i) =>
      card({ importance, category: ["llm", "agent", "industry"][i % 3] }),
    );
    const repo = card({ format: "oss", importance: 1 });
    const e = buildEdition([...news, repo]);
    expect(ids(e.radar)).toEqual([repo.id]);
  });

  it("레이더 한도가 형식 수보다 적으면 형식 1위끼리 편집 순으로 자른다", () => {
    const repo = card({ format: "oss", importance: 5 });
    const model = card({ format: "model", importance: 3 });
    const paper = card({ format: "paper", importance: 4 });
    const repo2 = card({ format: "oss", importance: 5 });
    const xs = [card({ importance: 5 }), model, repo2, paper, repo];
    const lim = (radar: number) => ({ ...EDITION_LIMITS, radar });
    expect(ids(buildEdition(xs, lim(2)).radar)).toEqual(ids([repo, paper]));
    expect(ids(buildEdition(xs, lim(1)).radar)).toEqual(ids([repo]));
    expect(buildEdition(xs, lim(0)).radar).toEqual([]);
  });
});

describe("부족 시 축소 — 다른 축·다른 호로 채우지 않는다", () => {
  const cats = ["llm", "agent", "industry", "research", "physical", "oss", "llm"];
  const newsOf = (n: number) =>
    Array.from({ length: n }, (_, i) => card({ category: cats[i % cats.length], importance: 2 }));
  const nonNewsOf = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      card({ format: (["oss", "model", "paper"] as const)[i % 3], importance: 5 }),
    );

  it.each([
    [1, 0, 0],
    [2, 1, 0],
    [3, 2, 0],
    [4, 3, 0],
    [5, 3, 1],
    [6, 3, 2],
    [7, 3, 3],
    [12, 3, 3],
  ])("뉴스 %i건 → 서브 %i · 브리핑 %i (브리핑이 먼저 준다)", (n, seconds, briefs) => {
    const e = buildEdition([...newsOf(n), ...nonNewsOf(6)]);
    expect(e.lead?.format).toBe("news");
    expect(e.seconds).toHaveLength(seconds);
    expect(e.briefs).toHaveLength(briefs);
    expect(e.radar).toHaveLength(4); // 비뉴스는 뉴스 자리를 메우지 않는다
    expect(frontArticles(e)).toHaveLength(1 + seconds + briefs + 4);
  });

  it.each([0, 1, 2, 3, 4, 9])("비뉴스 %i건 → 레이더 min(4, n), 뉴스로 메우지 않는다", (m) => {
    const e = buildEdition([...newsOf(12), ...nonNewsOf(m)]);
    expect(e.radar).toHaveLength(Math.min(4, m));
    expect(e.radar.every((a) => a.format !== "news")).toBe(true);
    expect(e.briefs).toHaveLength(3);
  });

  it("1면 본문·화제·섹션은 모두 입력(그 호) 기사뿐이다", () => {
    const xs = [...newsOf(5), ...nonNewsOf(2)].map((a, i) => ({ ...a, trendingScore: i * 7 }));
    const e = buildEdition(xs);
    const all = [
      ...frontArticles(e),
      ...e.trending,
      ...e.sections.flatMap((s) => s.items),
      ...e.issue,
    ];
    expect(all.every((a) => xs.includes(a))).toBe(true);
    expect(e.issue).toHaveLength(xs.length);
  });
});

describe("섹션 밴드", () => {
  it("1면 본문(리드·서브·브리핑·레이더)을 빼고, count 는 호 전체·onFront 는 1면 게재 수", () => {
    const f = fullIssue();
    const e = buildEdition(f.all);
    expect(e.sections.map((s) => [s.category, s.count, s.onFront, ids(s.items)])).toEqual([
      ["llm", 5, 4, [f.n10.id]],
      ["physical", 2, 1, [f.p2.id]],
      ["oss", 2, 1, [f.o3.id]],
      ["research", 2, 1, [f.n7.id]],
      ["industry", 2, 1, [f.n8.id]],
    ]);
  });

  it("분야 기사가 모두 1면에 오르면 밴드를 만들지 않는다", () => {
    const f = fullIssue();
    const e = buildEdition(f.all);
    // agent: n4(서브)·n5(브리핑)·o2(레이더) — 3건 모두 1면
    expect(e.sections.some((s) => s.category === "agent")).toBe(false);
  });

  it("지금 화제는 1면 기사와 겹쳐도 되고, 섹션은 화제에만 오른 기사를 빼지 않는다", () => {
    const f = fullIssue();
    const hot = card({ category: "llm", importance: 1, trendingScore: 90 });
    const e = buildEdition([...f.all, hot]);
    expect(e.trending[0].id).toBe(hot.id);
    const front = ids(frontArticles(e));
    expect(front).not.toContain(hot.id);
    expect(e.trending.some((a) => front.includes(a.id))).toBe(true);
    const llm = e.sections.find((s) => s.category === "llm")!;
    expect(ids(llm.items)).toEqual([f.n10.id, hot.id]);
    expect(llm.count).toBe(6);
  });
});

describe("뉴스 0건 호", () => {
  it("리드는 비뉴스 1위, 레이더는 리드를 뺀 비뉴스에서 형식을 섞어 4건", () => {
    const repo = card({ format: "oss", importance: 5, trendingScore: 30 });
    const repo2 = card({ format: "oss", importance: 5 });
    const repo3 = card({ format: "oss", importance: 4 });
    const model = card({ format: "model", importance: 2 });
    const paper = card({ format: "paper", importance: 3 });
    const paper2 = card({ format: "paper", importance: 1 });
    const e = buildEdition([paper2, model, repo3, paper, repo2, repo]);
    expect(e.lead?.id).toBe(repo.id);
    expect(e.seconds).toEqual([]);
    expect(e.briefs).toEqual([]);
    expect(ids(e.radar)).not.toContain(repo.id);
    expect(ids(e.radar)).toEqual(ids([repo2, repo3, paper, model]));
    expect(frontArticles(e)).toHaveLength(5);
  });
});

describe("결정성", () => {
  it("입력 순서를 섞어도 지면 전체(슬롯·화제·섹션)가 같다", () => {
    const f = fullIssue();
    const expected = snapshot(buildEdition(f.all));
    const rand = rng(7);
    for (let i = 0; i < 20; i += 1) {
      expect(snapshot(buildEdition(shuffle(f.all, rand)))).toEqual(expected);
    }
  });
});

describe("편집 규칙 불변식 (무작위 호 300개)", () => {
  const formats = ["news", "news", "news", "oss", "model", "paper"] as const;

  it("슬롯 수·형식 분리·분야 제약·Physical AI·레이더 혼합·섹션·결정성이 항상 성립", () => {
    const rand = rng(20261030);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    for (let round = 0; round < 300; round += 1) {
      const size = Math.floor(rand() * 36);
      const xs = Array.from({ length: size }, () =>
        card({
          format: pick(formats),
          category: pick(CATEGORIES),
          importance: 1 + Math.floor(rand() * 5),
          trendingScore: rand() < 0.4 ? Math.floor(rand() * 90) : 0,
          publishedAt: `2026-10-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}T00:00:00Z`,
        }),
      );
      const e = buildEdition(xs);
      const news = xs.filter((a) => a.format === "news");
      const nonNews = xs.filter((a) => a.format !== "news");
      const front = frontArticles(e);
      const ctx = `round ${round}: news ${news.length}, non-news ${nonNews.length}`;

      // 입력 기사만, 1면 본문은 겹치지 않는다
      expect(
        front.every((a) => xs.includes(a)),
        ctx,
      ).toBe(true);
      expect(new Set(ids(front)).size, ctx).toBe(front.length);

      // 슬롯 수
      const n = news.length;
      const radarPool = n > 0 ? nonNews.length : Math.max(0, nonNews.length - 1);
      expect(e.lead === null, ctx).toBe(xs.length === 0);
      expect(e.seconds.length, ctx).toBe(n > 0 ? Math.min(3, n - 1) : 0);
      expect(e.briefs.length, ctx).toBe(Math.min(3, Math.max(0, n - 4)));
      expect(e.radar.length, ctx).toBe(Math.min(4, radarPool));

      // 형식 분리
      if (n > 0) expect(e.lead!.format, ctx).toBe("news");
      expect(
        [...e.seconds, ...e.briefs].every((a) => a.format === "news"),
        ctx,
      ).toBe(true);
      expect(
        e.radar.every((a) => a.format !== "news"),
        ctx,
      ).toBe(true);

      // 표시 순서 = 편집 순
      for (const slot of [e.seconds, e.briefs, e.radar]) {
        expect(inEditorialOrder(slot, e.issue), ctx).toBe(true);
      }

      if (n > 0) {
        const top = [e.lead!, ...e.seconds];
        const counts = new Map<string, number>();
        for (const a of news) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
        // 분야 3개 이상(뉴스 분야가 허락하는 만큼)
        expect(new Set(top.map((a) => a.category)).size, ctx).toBeGreaterThanOrEqual(
          Math.min(3, counts.size),
        );
        // 분야당 2건씩만 써도 리드+서브를 채울 수 있으면 같은 분야는 2건 이하
        const capacity = [...counts.values()].reduce((s, c) => s + Math.min(c, 2), 0);
        if (capacity >= top.length) {
          const per = new Map<string, number>();
          for (const a of top) per.set(a.category, (per.get(a.category) ?? 0) + 1);
          expect(Math.max(...per.values()), ctx).toBeLessThanOrEqual(2);
        }
        // Physical AI 우선 배정
        const physicalTop = top.some((a) => a.category === "physical");
        const candidate = news.some(
          (a) => !top.includes(a) && a.category === "physical" && a.importance >= 3,
        );
        if (!physicalTop && candidate && e.briefs.length > 0) {
          expect(
            e.briefs.some((a) => a.category === "physical"),
            ctx,
          ).toBe(true);
        }
        // 브리핑 분야 상한: 분야 수 = min(브리핑 수, 남은 뉴스의 분야 수)
        // → 남은 분야가 브리핑 수 이상(기본 3)이면 브리핑 분야가 모두 다르다
        const rest = e.issue.filter((a) => a.format === "news" && !top.includes(a)); // 편집 순
        const restCats = new Set(rest.map((a) => a.category)).size;
        const briefCats = new Set(e.briefs.map((a) => a.category)).size;
        expect(briefCats, ctx).toBe(Math.min(e.briefs.length, restCats));
        if (restCats >= 3) expect(briefCats, ctx).toBe(e.briefs.length);
        // 상한을 풀어 채운 경우에도 각 분야의 1위가 먼저 오른다(건너뛴 분야 1위가 없다)
        for (const c of new Set(e.briefs.map((a) => a.category))) {
          const head = rest.find((a) => a.category === c)!;
          expect(e.briefs.includes(head), `${ctx} brief head ${c}`).toBe(true);
        }
      }

      // 레이더: 풀에 있는 형식은 모두 담는다
      const pool = nonNews.filter((a) => a !== e.lead);
      for (const f of ["oss", "model", "paper"]) {
        if (pool.some((a) => a.format === f)) {
          expect(
            e.radar.some((a) => a.format === f),
            `${ctx} format ${f}`,
          ).toBe(true);
        }
      }

      // 섹션: 1면 본문 제외, count·onFront 일치, 빈 밴드 없음
      const frontIds = new Set(ids(front));
      for (const s of e.sections) {
        const inCat = xs.filter((a) => a.category === s.category);
        expect(s.count, ctx).toBe(inCat.length);
        expect(s.onFront, ctx).toBe(inCat.filter((a) => frontIds.has(a.id)).length);
        expect(s.items.length, ctx).toBeGreaterThan(0);
        expect(
          s.items.some((a) => frontIds.has(a.id)),
          ctx,
        ).toBe(false);
      }

      // 결정성
      expect(snapshot(buildEdition(shuffle(xs, rand))), ctx).toEqual(snapshot(e));
    }
  });
});

describe("Acceptance — 오늘 호 30건", () => {
  it("뉴스 22(6개 분야, Physical AI 포함) + 비뉴스 8 → 1면 본문 11건, 비뉴스 4건, 모두 오늘 호 기사", () => {
    const rand = rng(30);
    const newsCats = [
      "llm",
      "llm",
      "llm",
      "agent",
      "agent",
      "industry",
      "industry",
      "research",
      "oss",
      "physical",
    ];
    const news = Array.from({ length: 22 }, (_, i) =>
      card({
        category: i < 6 ? CATEGORIES[i] : newsCats[Math.floor(rand() * newsCats.length)],
        importance: 1 + Math.floor(rand() * 5),
        trendingScore: rand() < 0.2 ? Math.floor(rand() * 70) : 0,
      }),
    );
    const nonNews = (
      ["oss", "oss", "oss", "model", "paper", "paper", "paper", "paper"] as const
    ).map((format) =>
      card({
        format,
        category: format === "paper" ? "research" : format === "model" ? "llm" : "oss",
        importance: 1 + Math.floor(rand() * 5),
        trendingScore: Math.floor(rand() * 70),
      }),
    );
    const issue = [...news, ...nonNews];
    const e = buildEdition(issue);
    const front = frontArticles(e);
    expect(front).toHaveLength(11);
    expect(front.filter((a) => a.format !== "news")).toHaveLength(4);
    expect(front.every((a) => issue.includes(a))).toBe(true);
    expect(new Set(e.radar.map((a) => a.format))).toEqual(new Set(["oss", "model", "paper"]));
    expect(new Set([e.lead!, ...e.seconds].map((a) => a.category)).size).toBeGreaterThanOrEqual(3);
    expect(e.trending).toHaveLength(5);
    // 1면에 못 오른 19건은 섹션 밴드(분야당 최대 4건)로 간다
    const sectionIds = e.sections.flatMap((s) => ids(s.items));
    expect(sectionIds.every((id) => !ids(front).includes(id))).toBe(true);
  });
});
