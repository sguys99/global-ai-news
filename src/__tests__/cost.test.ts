import { describe, expect, it, vi } from "vitest";
import { approxTokens, estimateCost, pricingFor } from "../../scripts/lib/cost";

describe("estimateCost", () => {
  it("토큰 0 이면 비용 0", () => {
    expect(estimateCost(0, 0)).toBe(0);
  });

  it("Haiku 단가($1/M 입력, $5/M 출력)로 계산한다", () => {
    // 1,000,000 입력 + 200,000 출력 = $1.00 + $1.00 = $2.00
    expect(estimateCost(1_000_000, 200_000, "claude-haiku-4-5")).toBeCloseTo(2.0, 6);
  });

  it("모델별 단가가 다르게 적용된다", () => {
    const haiku = estimateCost(1_000_000, 1_000_000, "claude-haiku-4-5");
    const opus = estimateCost(1_000_000, 1_000_000, "claude-opus-4-8");
    expect(opus).toBeGreaterThan(haiku);
  });

  it("미정의 모델은 기본(Haiku) 단가로 폴백한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallback = pricingFor("nonexistent-model");
    expect(fallback).toEqual(pricingFor("claude-haiku-4-5"));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("Batches 할인 · 토큰 근사", () => {
  it("batch=true 면 표준 단가의 50%", () => {
    const std = estimateCost(100_000, 20_000, "claude-haiku-4-5");
    expect(estimateCost(100_000, 20_000, "claude-haiku-4-5", { batch: true })).toBeCloseTo(
      std / 2,
      10,
    );
  });

  it("approxTokens 는 2글자당 1토큰(올림)", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abc")).toBe(2);
  });
});
