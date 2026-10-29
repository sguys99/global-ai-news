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

/** Message Batches API 는 입력·출력 토큰 모두 표준 단가의 50%. */
export const BATCH_DISCOUNT = 0.5;

/** 입력/출력 토큰 수 → 추정 비용(USD). batch=true 면 Batches API 할인을 적용한다. */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model = "claude-haiku-4-5",
  { batch = false }: { batch?: boolean } = {},
): number {
  const { inputPerM, outputPerM } = pricingFor(model);
  const cost = (inputTokens / 1_000_000) * inputPerM + (outputTokens / 1_000_000) * outputPerM;
  return batch ? cost * BATCH_DISCOUNT : cost;
}

/**
 * 글자 종류별 토큰 가중치(글자당). 2026-10-30 실제 선별·가공 요청 25개 구간을 count_tokens 로 잰 회귀값
 * (한글 등 비ASCII ≈1.24, ASCII 영문자·공백 ≈0.16, ASCII 숫자·기호 ≈1.47)을 조금 올려 잡았다.
 * 한글 시스템 프롬프트(≈0.94토큰/자)와 영문 본문(≈0.21토큰/자), `|`·날짜·숫자가 많은 선별 줄이 섞여
 * 글자 수 하나로는 맞출 수 없다(이전 "2글자당 1토큰"은 한글이 많은 선별 입력을 12% 과소 추정했다).
 */
const TOKENS_PER_CHAR = {
  /** 한글·CJK·특수 기호 등 비ASCII(서로게이트 쌍은 2글자로 센다). */
  nonAscii: 1.3,
  /** ASCII 영문자·공백 — 영단어는 여러 글자가 1토큰이다. */
  word: 0.175,
  /** ASCII 숫자·기호 — 대부분 1글자 1토큰 이상. */
  symbol: 1.55,
} as const;

/**
 * 호출 전 비용 가드용 토큰 근사치. 4-3 스냅숏 실측(선별 24,078 / 가공 4회 27,923 입력 토큰) 대비
 * 3~7% 넉넉하게 잡힌다(구조화 출력 몫 포함 — 이전 "2글자당 1토큰"은 각각 -12%·-11%). 실제 과금은 응답 usage 로 기록한다.
 */
export function approxTokens(text: string): number {
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 128) tokens += TOKENS_PER_CHAR.nonAscii;
    else if (
      code === 32 ||
      (code >= 9 && code <= 13) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122)
    ) {
      tokens += TOKENS_PER_CHAR.word;
    } else tokens += TOKENS_PER_CHAR.symbol;
  }
  return Math.ceil(tokens);
}

/**
 * 구조화 출력(output_config.format)이 입력에 더하는 토큰 근사치. API 가 JSON 스키마와 지시문을 입력 앞에
 * 붙이므로 요청마다 든다(실측: 선별 스키마 367, 가공 스키마 639토큰). 스키마 JSON 에 approxTokens 를 쓴다.
 */
export function outputFormatTokens(format: { schema: unknown }): number {
  return approxTokens(JSON.stringify(format.schema));
}
