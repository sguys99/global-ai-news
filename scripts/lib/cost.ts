/**
 * LLM 토큰 → 추정 비용(USD) 계산. PRD §3.4 / WORK-PLAN Phase 2.
 * collection_runs.est_cost_usd 기록 및 비용 모니터링에 사용한다.
 *
 * 단가는 100만 토큰당 USD. 모델 미정의 시 기본(Haiku) 단가로 폴백한다.
 * (Claude Haiku 4.5 기준: 입력 $1.00/M, 출력 $5.00/M)
 */

export interface ModelPricing {
  /** 입력 100만 토큰당 USD */
  inputPerM: number;
  /** 출력 100만 토큰당 USD */
  outputPerM: number;
}

/** 모델별 단가표. LLM_MODEL 전환에 대응. */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5": { inputPerM: 1.0, outputPerM: 5.0 },
  "claude-sonnet-4-6": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-opus-4-8": { inputPerM: 5.0, outputPerM: 25.0 },
};

/** 미정의 모델 폴백 단가 (Haiku). */
const DEFAULT_PRICING: ModelPricing = MODEL_PRICING["claude-haiku-4-5"];

/** 모델명에 대응하는 단가를 반환한다. 미정의 모델은 기본 단가로 폴백(+경고). */
export function pricingFor(model: string): ModelPricing {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    console.warn(`[cost] unknown model '${model}', falling back to default pricing`);
    return DEFAULT_PRICING;
  }
  return pricing;
}

/** 입력/출력 토큰 수 → 추정 비용(USD). */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model = "claude-haiku-4-5",
): number {
  const { inputPerM, outputPerM } = pricingFor(model);
  return (inputTokens / 1_000_000) * inputPerM + (outputTokens / 1_000_000) * outputPerM;
}
