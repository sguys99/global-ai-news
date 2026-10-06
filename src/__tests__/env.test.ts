// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { envFlag, envNonNegativeInt, envNonNegativeNumber, envString } from "../../scripts/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("envNonNegativeInt", () => {
  it("미설정이면 기본값", () => {
    vi.stubEnv("MAX_ITEMS_PER_RUN", undefined);
    expect(envNonNegativeInt("MAX_ITEMS_PER_RUN", 150)).toBe(150);
  });

  it("Actions vars 미설정 시 주입되는 빈 문자열·공백도 기본값 (회귀: Number('') = 0 → 0건 가공)", () => {
    vi.stubEnv("MAX_ITEMS_PER_RUN", "");
    expect(envNonNegativeInt("MAX_ITEMS_PER_RUN", 150)).toBe(150);
    vi.stubEnv("MAX_ITEMS_PER_RUN", "  ");
    expect(envNonNegativeInt("MAX_ITEMS_PER_RUN", 150)).toBe(150);
  });

  it("유효한 정수는 그대로, 명시적 0 도 허용", () => {
    vi.stubEnv("MAX_ITEMS_PER_RUN", "40");
    expect(envNonNegativeInt("MAX_ITEMS_PER_RUN", 150)).toBe(40);
    vi.stubEnv("MAX_ITEMS_PER_RUN", "0");
    expect(envNonNegativeInt("MAX_ITEMS_PER_RUN", 150)).toBe(0);
  });

  it("숫자 아님·음수·소수는 기본값", () => {
    for (const bad of ["abc", "-5", "1.5"]) {
      vi.stubEnv("MAX_ITEMS_PER_RUN", bad);
      expect(envNonNegativeInt("MAX_ITEMS_PER_RUN", 150)).toBe(150);
    }
  });
});

describe("envString", () => {
  it("미설정·빈 문자열·공백이면 기본값, 값이 있으면 trim 해서 사용", () => {
    vi.stubEnv("LLM_MODEL", undefined);
    expect(envString("LLM_MODEL", "claude-haiku-4-5")).toBe("claude-haiku-4-5");
    vi.stubEnv("LLM_MODEL", "");
    expect(envString("LLM_MODEL", "claude-haiku-4-5")).toBe("claude-haiku-4-5");
    vi.stubEnv("LLM_MODEL", " claude-sonnet-4-5 ");
    expect(envString("LLM_MODEL", "claude-haiku-4-5")).toBe("claude-sonnet-4-5");
  });
});

describe("envNonNegativeNumber", () => {
  it("실수 허용, 빈 값·음수·숫자 아님은 기본값", () => {
    vi.stubEnv("MAX_COST_USD_PER_RUN", "0.05");
    expect(envNonNegativeNumber("MAX_COST_USD_PER_RUN", 0.1)).toBe(0.05);
    for (const bad of ["", " ", "-1", "abc"]) {
      vi.stubEnv("MAX_COST_USD_PER_RUN", bad);
      expect(envNonNegativeNumber("MAX_COST_USD_PER_RUN", 0.1)).toBe(0.1);
    }
  });
});

describe("envFlag", () => {
  it("1/true/on/yes → true, 0/false/off/no → false, 그 외는 기본값", () => {
    for (const on of ["1", "true", "ON", " yes "]) {
      vi.stubEnv("LLM_USE_BATCH", on);
      expect(envFlag("LLM_USE_BATCH", false)).toBe(true);
    }
    for (const off of ["0", "false", "Off", "no"]) {
      vi.stubEnv("LLM_USE_BATCH", off);
      expect(envFlag("LLM_USE_BATCH", true)).toBe(false);
    }
    vi.stubEnv("LLM_USE_BATCH", "");
    expect(envFlag("LLM_USE_BATCH", true)).toBe(true);
  });
});
