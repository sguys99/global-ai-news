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
});
