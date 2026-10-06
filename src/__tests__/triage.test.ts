// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildTriagePool,
  buildTriageRequest,
  resolvePicks,
  triageFormat,
  triageLine,
  type Candidate,
} from "../../scripts/lib/triage";

let seq = 0;
function cand(
  sourceId: string,
  p: { score?: number; publishedAt?: string; content?: string } = {},
) {
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
  } satisfies Candidate;
}

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
