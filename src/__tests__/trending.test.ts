import { describe, expect, it } from "vitest";
import { trendingScore } from "../../scripts/lib/trending";
import type { RawItem } from "@/lib/types";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3.6e6).toISOString();

const base = (overrides: Partial<RawItem>): RawItem => ({
  sourceId: "s",
  url: "https://example.com/a",
  title: "t",
  publishedAt: hoursAgo(1),
  ...overrides,
});

describe("trendingScore", () => {
  it("engagement 가 없으면 0", () => {
    expect(trendingScore(base({}))).toBe(0);
  });

  it("0~100 범위를 벗어나지 않는다", () => {
    const score = trendingScore(
      base({ engagement: { points: 9999, num_comments: 9999, stars: 99999 } }),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("engagement 가 클수록 점수가 높다", () => {
    const low = trendingScore(base({ engagement: { points: 10 } }));
    const high = trendingScore(base({ engagement: { points: 400 } }));
    expect(high).toBeGreaterThan(low);
  });

  it("오래된 기사일수록 최신성 감쇠로 점수가 낮다", () => {
    const eng = { points: 300 };
    const fresh = trendingScore(base({ engagement: eng, publishedAt: hoursAgo(1) }));
    const old = trendingScore(base({ engagement: eng, publishedAt: hoursAgo(100) }));
    expect(fresh).toBeGreaterThan(old);
  });

  it("HF 모델 likes 가 클수록 점수가 높다(상한 2000 에서 신호 만점)", () => {
    const low = trendingScore(base({ engagement: { likes: 150 } }));
    const high = trendingScore(base({ engagement: { likes: 1500 } }));
    expect(high).toBeGreaterThan(low);
    expect(trendingScore(base({ engagement: { likes: 2000 } }))).toBe(40);
    expect(trendingScore(base({ engagement: { likes: 99999 } }))).toBe(40);
  });

  it("downloads·hf_trending·표시 메타는 점수에 쓰지 않는다", () => {
    const likesOnly = trendingScore(base({ engagement: { likes: 500 } }));
    const withExtras = trendingScore(
      base({
        engagement: {
          likes: 500,
          downloads: 3_000_000,
          hf_trending: 900,
          pipeline_tag: "text-generation",
          params: 8e9,
        },
      }),
    );
    expect(withExtras).toBe(likesOnly);
  });

  it("likes 신호 추가는 기존 소스 점수를 바꾸지 않는다", () => {
    // likes 항 도입 전 공식으로 계산한 고정값 — 다른 소스는 likes 가 없어 0 이 더해진다.
    expect(trendingScore(base({ engagement: { points: 120, num_comments: 30 } }))).toBe(50);
    expect(trendingScore(base({ engagement: { stars: 999 } }))).toBe(27);
    expect(trendingScore(base({ engagement: { ups: 12 } }))).toBe(19);
    expect(trendingScore(base({ engagement: { citations: 50, influential: 3 } }))).toBe(24);
  });
});
