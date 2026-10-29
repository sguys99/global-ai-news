// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Format } from "../../src/lib/labels";
import {
  buildTriagePool,
  buildTriageRequest,
  defaultPoolQuotas,
  poolMixNotes,
  resolvePicks,
  triageFormat,
  triageLine,
  type Candidate,
} from "../../scripts/lib/triage";

let seq = 0;
function cand(
  sourceId: string,
  p: {
    score?: number;
    publishedAt?: string;
    content?: string;
    format?: Format;
    physical?: boolean;
  } = {},
): Candidate {
  seq += 1;
  return {
    item: {
      sourceId,
      url: `https://x/${seq}`,
      title: `T${seq}`,
      contentRaw: p.content,
      publishedAt: p.publishedAt ?? "2026-10-06T00:00:00Z",
    },
    key: `k${seq}`,
    score: p.score ?? 0,
    sourceName: sourceId.toUpperCase(),
    format: p.format ?? "news",
    topic: p.physical ? "physical" : undefined,
  };
}

/** 소스 하나에 후보 n건. */
function many(n: number, sourceId: string, p: Parameters<typeof cand>[1] = {}) {
  return Array.from({ length: n }, () => cand(sourceId, p));
}

/** 뉴스 소스 count 개 × perSource 건 — 라운드로빈만으로는 비뉴스가 밀리는 풀. */
function newsSources(count: number, perSource: number) {
  return Array.from({ length: count }, (_, i) => many(perSource, `news${i}`)).flat();
}

const count = (pool: Candidate[], match: (c: Candidate) => boolean) => pool.filter(match).length;
const nonNews = (c: Candidate) => c.format !== "news";
const physical = (c: Candidate) => c.topic === "physical";

describe("buildTriagePool", () => {
  it("소스별 라운드로빈 — 기사가 많은 소스가 풀을 독식하지 않는다", () => {
    const a = [1, 2, 3, 4, 5].map((d) => cand("a", { publishedAt: `2026-10-0${d}T00:00:00Z` }));
    const b = [cand("b")];
    const c = [cand("c"), cand("c")];
    const pool = buildTriagePool([...a, ...b, ...c], 5);
    expect(pool.map((x) => x.item.sourceId)).toEqual(["a", "b", "c", "a", "c"]);
  });

  it("소스 안에서는 화제 점수 → 최신 순", () => {
    const old = cand("a", { score: 0, publishedAt: "2026-10-01T00:00:00Z" });
    const fresh = cand("a", { score: 0, publishedAt: "2026-10-05T00:00:00Z" });
    const hot = cand("a", { score: 80, publishedAt: "2026-09-30T00:00:00Z" });
    expect(buildTriagePool([old, fresh, hot], 3)).toEqual([hot, fresh, old]);
  });

  it("후보가 상한보다 적으면 전부", () => {
    expect(buildTriagePool([cand("a"), cand("b")], 150)).toHaveLength(2);
  });
});

describe("buildTriagePool — 최소 할당", () => {
  it("기본 할당은 풀 180건에서 40·20건, 150건에서 33·17건", () => {
    expect(defaultPoolQuotas(180)).toEqual({ minNonNews: 40, minPhysical: 20 });
    expect(defaultPoolQuotas(150)).toEqual({ minNonNews: 33, minPhysical: 17 });
  });

  it("후보가 있으면 비뉴스·Physical AI 할당을 채운다 — 라운드로빈만으로는 못 채우는 경우", () => {
    // 뉴스 40개 소스 × 10건이면 라운드로빈 앞 150건 중 비뉴스 소스 2개 몫은 4건씩이다.
    const candidates = [
      ...newsSources(40, 10),
      ...many(40, "papers", { format: "paper" }),
      ...many(40, "robots", { physical: true }),
    ];
    const pool = buildTriagePool(candidates, 150);
    expect(pool).toHaveLength(150);
    expect(count(pool, nonNews)).toBeGreaterThanOrEqual(33);
    expect(count(pool, physical)).toBeGreaterThanOrEqual(17);
    // 뉴스 몫은 그대로 남는다.
    expect(count(pool, (c) => c.format === "news")).toBeGreaterThanOrEqual(150 - 33 - 17);
  });

  it("할당보다 후보가 적으면 있는 만큼 전부", () => {
    const papers = many(5, "papers", { format: "paper" });
    const robots = many(3, "robots", { physical: true });
    const pool = buildTriagePool([...newsSources(40, 10), ...papers, ...robots], 150);
    for (const c of [...papers, ...robots]) expect(pool).toContain(c);
  });

  it("비뉴스이면서 physical 인 후보는 두 할당에 모두 센다", () => {
    const candidates = [
      ...newsSources(40, 10),
      ...many(20, "arxiv_ro", { format: "paper", physical: true }),
      ...many(20, "robots", { physical: true }),
    ];
    const pool = buildTriagePool(candidates, 150, { minNonNews: 20, minPhysical: 20 });
    // ① 비뉴스 20건이 모두 physical 이라 ②는 더 채우지 않는다 — Physical AI 할당이 없을 때와 같은 풀.
    expect(count(pool, (c) => c.item.sourceId === "arxiv_ro")).toBe(20);
    expect(pool).toEqual(buildTriagePool(candidates, 150, { minNonNews: 20, minPhysical: 0 }));
    expect(count(pool, (c) => c.item.sourceId === "robots")).toBeLessThan(20);
  });

  it("비뉴스 할당은 형식별로 고르게 — 논문만으로 차지 않는다", () => {
    const candidates = [
      ...newsSources(40, 10),
      ...many(30, "hf_papers", { format: "paper", score: 50 }),
      ...many(30, "arxiv", { format: "paper" }),
      ...many(30, "takara", { format: "paper" }),
      ...many(2, "hf_models", { format: "model" }),
      ...many(10, "gh_a", { format: "oss" }),
      ...many(10, "gh_b", { format: "oss" }),
    ];
    const pool = buildTriagePool(candidates, 150, { minNonNews: 30, minPhysical: 0 });
    const of = (f: Format) => count(pool, (c) => c.format === f);
    expect(of("model")).toBe(2);
    // 남는 몫은 oss·paper 가 나눈다(형식 라운드로빈 14·14, 라운드로빈 몫 4건씩은 그 안에 든다).
    expect(of("oss")).toBe(14);
    expect(of("paper")).toBe(14);
    // 형식 안에서는 소스 라운드로빈 — 한 소스가 몫을 독식하지 않는다.
    expect(count(pool, (c) => c.item.sourceId === "gh_a")).toBe(7);
    expect(count(pool, (c) => c.item.sourceId === "gh_b")).toBe(7);
  });

  it("작은 풀: 할당은 풀 절반을 넘지 않고 뉴스 자리가 남는다", () => {
    const candidates = [
      ...newsSources(5, 5),
      ...many(10, "papers", { format: "paper" }),
      ...many(10, "robots", { physical: true }),
    ];
    // 기본 할당(4 → 1·0)
    const tiny = buildTriagePool(candidates, 4);
    expect(tiny).toHaveLength(4);
    expect(count(tiny, (c) => c.format === "news")).toBeGreaterThanOrEqual(2);
    // 풀보다 큰 할당도 절반(5)으로 비율 축소 — 뉴스가 최소 5건 남는다.
    const capped = buildTriagePool(candidates, 10, { minNonNews: 40, minPhysical: 20 });
    expect(capped).toHaveLength(10);
    expect(count(capped, (c) => c.format === "news" && !physical(c))).toBeGreaterThanOrEqual(5);
  });

  it("할당이 이미 채워지면 기존 라운드로빈과 같고, 할당분도 라운드로빈 순서로 섞인다", () => {
    const candidates = [
      ...many(3, "a"),
      ...many(3, "papers", { format: "paper" }),
      ...many(3, "b"),
    ];
    expect(buildTriagePool(candidates, 6, { minNonNews: 2, minPhysical: 0 })).toEqual(
      buildTriagePool(candidates, 6, { minNonNews: 0, minPhysical: 0 }),
    );
    const pool = buildTriagePool(
      [...newsSources(3, 5), ...many(5, "papers", { format: "paper" })],
      8,
      {
        minNonNews: 4,
        minPhysical: 0,
      },
    );
    // 할당분이 앞에 몰리지 않는다(선별 줄 번호 위치 편향 방지).
    expect(pool.map((c) => c.format).slice(0, 4)).toEqual(["news", "news", "news", "paper"]);
  });

  it("결정적이다 — 같은 입력이면 같은 풀", () => {
    const candidates = [
      ...newsSources(30, 6),
      ...many(20, "papers", { format: "paper" }),
      ...many(8, "gh", { format: "oss", physical: true }),
      ...many(15, "robots", { physical: true }),
    ];
    const first = buildTriagePool(candidates, 60);
    expect(buildTriagePool(candidates, 60)).toEqual(first);
    expect(buildTriagePool([...candidates], 60).map((c) => c.key)).toEqual(first.map((c) => c.key));
  });
});

describe("poolMixNotes", () => {
  it("형식별·Physical AI 후보→풀→게재 수", () => {
    const n1 = cand("n");
    const n2 = cand("n");
    const g = cand("gh", { format: "oss", physical: true });
    const p = cand("arxiv", { format: "paper" });
    const r = cand("robots", { physical: true });
    expect(poolMixNotes([n1, n2, g, p, r], [n1, g, p, r], [g, r])).toEqual([
      "형식별 후보→풀→게재: 뉴스 3→2→1, 오픈소스 1→1→1, 모델 0→0→0, 논문 1→1→0",
      "Physical AI 후보→풀→게재: 2→2→2",
    ]);
  });

  it("게재를 넘기지 않으면(dry-run) 후보→풀만", () => {
    expect(poolMixNotes([cand("n")], [])).toEqual([
      "형식별 후보→풀: 뉴스 1→0, 오픈소스 0→0, 모델 0→0, 논문 0→0",
      "Physical AI 후보→풀: 0→0",
    ]);
  });
});

describe("triageLine / buildTriageRequest", () => {
  it("번호 | 매체 | 날짜 | 화제 | 제목 | 발췌 한 줄, 발췌는 공백 정리·절단", () => {
    const c = cand("hn", { score: 42, content: `first\n\nsecond ${"x".repeat(300)}` });
    const line = triageLine(c, 7);
    expect(line.startsWith(`7 | HN | 10-06 | 화제 42 | ${c.item.title} | first second`)).toBe(true);
    expect(line).not.toContain("\n");
    expect(line.length).toBeLessThan(250);
  });

  it("화제·발췌가 없으면 '-'", () => {
    expect(triageLine(cand("a"), 0)).toMatch(/\| - \| T\d+ \| -$/);
  });

  it("최대 선정 수를 유저 메시지에 싣고 구조화 출력을 요청한다", () => {
    const req = buildTriageRequest([cand("a"), cand("b")], 30, "claude-haiku-4-5");
    expect(req.params.messages[0].content).toContain("후보 2건 중 최대 30건");
    expect(req.params.output_config?.format?.type).toBe("json_schema");
  });
});

describe("resolvePicks", () => {
  it("범위 밖·중복 번호를 버리고, 한 후보는 선정이든 묶음이든 한 번만", () => {
    const picks = resolvePicks(
      {
        picks: [
          { id: 0, importance: 5, duplicates: [1, 1, 9, 0] },
          { id: 1, importance: 4, duplicates: [] }, // 이미 0 에 묶임
          { id: 2, importance: 3, duplicates: [1, 3] },
          { id: 2, importance: 3, duplicates: [] }, // 같은 번호 재선정
        ],
      },
      5,
      30,
    );
    expect(picks).toEqual([
      { index: 0, importance: 5, duplicates: [1] },
      { index: 2, importance: 3, duplicates: [3] },
    ]);
  });

  it("중요도 높은 순으로 maxPicks 건까지만", () => {
    const picks = resolvePicks(
      {
        picks: [
          { id: 0, importance: 2, duplicates: [] },
          { id: 1, importance: 5, duplicates: [] },
          { id: 2, importance: 4, duplicates: [] },
        ],
      },
      3,
      2,
    );
    expect(picks.map((p) => p.index)).toEqual([1, 2]);
  });

  it("triageFormat.parse 는 중요도 범위를 검증한다", () => {
    expect(() =>
      triageFormat.parse(JSON.stringify({ picks: [{ id: 0, importance: 9, duplicates: [] }] })),
    ).toThrow();
  });
});
