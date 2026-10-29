import { describe, expect, it, vi } from "vitest";
import { approxTokens, estimateCost, outputFormatTokens, pricingFor } from "../../scripts/lib/cost";

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

  it("approxTokens 는 글자 종류별 가중치(비ASCII 1.3, 영문자·공백 0.175, 숫자·기호 1.55)의 합(올림)", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("가나다")).toBe(4); // 3 × 1.3 = 3.9
    expect(approxTokens("hello world")).toBe(2); // 11 × 0.175 = 1.925
    expect(approxTokens("10-29 | 42")).toBe(13); // 숫자·기호 8 × 1.55 + 공백 2 × 0.175 = 12.75
  });

  it("같은 길이면 한글이 영문보다 훨씬 많이 잡힌다(한글 위주 선별 입력 과소 추정 방지)", () => {
    const ko = "앤트로픽이 새 모델을 공개했다".repeat(20);
    const en = "Anthropic released a new model".repeat(20).slice(0, ko.length);
    expect(approxTokens(ko)).toBeGreaterThan(approxTokens(en) * 4);
  });

  it("outputFormatTokens 는 구조화 출력 스키마 JSON 의 근사치", () => {
    const schema = { type: "object", properties: { picks: { type: "array" } } };
    expect(outputFormatTokens({ schema })).toBe(approxTokens(JSON.stringify(schema)));
  });
});
