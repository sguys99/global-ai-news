/**
 * Claude 호출 계층. 수집 배치의 모든 LLM 요청(선별·가공)이 여기를 거친다.
 *
 * - 기본은 Message Batches API(입력·출력 50% 할인). 일 1회 배치라 기다리는 사용자가 없다.
 * - 배치가 batchTimeoutMs 안에 끝나지 않거나 제출 자체가 실패하면 취소하고, 결과를 못 받은
 *   요청만 일반 Messages API 로 1회 더 보낸다(배치 내 개별 실패도 같은 경로로 재시도).
 * - 비용은 응답 usage 로 누적한다(배치 결과는 할인 단가, 일반 호출은 표준 단가).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AutoParseableOutputFormat } from "@anthropic-ai/sdk/lib/parser";
import { estimateCost } from "./cost";

export interface LlmRequest {
  /** 결과 매칭 키(Batches custom_id 규칙: 영숫자·_·- 1~64자). */
  id: string;
  params: Anthropic.MessageCreateParamsNonStreaming;
}

export interface LlmResult {
  message: Anthropic.Message | null;
  /** 실패 사유(배치 결과 유형 또는 API 오류 메시지). */
  error?: string;
  /** 배치(할인)로 처리됐는지. */
  batch: boolean;
}

export interface LlmUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LlmRunnerOptions {
  useBatch: boolean;
  batchTimeoutMs: number;
  pollIntervalMs?: number;
  /** 테스트 주입용. 미지정 시 ANTHROPIC_API_KEY 로 첫 호출 때 생성한다. */
  client?: Anthropic;
  log?: (msg: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 취소 요청 후 배치가 ended 로 바뀌기를 기다리는 최대 시간(이미 끝난 요청 결과를 회수해 중복 과금 방지). */
const CANCEL_GRACE_MS = 120_000;

export class LlmRunner {
  readonly usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  private client?: Anthropic;
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: LlmRunnerOptions) {
    this.client = opts.client;
    this.log = opts.log ?? ((msg) => console.log(`[llm] ${msg}`));
  }

  private api(): Anthropic {
    this.client ??= new Anthropic();
    return this.client;
  }

  /** 요청 묶음을 실행해 id → 결과를 돌려준다. 실패는 throw 하지 않고 결과에 담는다. */
  async run(requests: LlmRequest[]): Promise<Map<string, LlmResult>> {
    const results = new Map<string, LlmResult>();
    if (requests.length === 0) return results;

    if (this.opts.useBatch) {
      try {
        for (const [id, result] of await this.runBatch(requests)) results.set(id, result);
      } catch (err) {
        this.log(`batch failed (${(err as Error).message}) — falling back to direct calls`);
      }
    }

    for (const req of requests) {
      if (results.get(req.id)?.message) continue;
      results.set(req.id, await this.runDirect(req));
    }
    return results;
  }

  private record(message: Anthropic.Message, model: string, batch: boolean): void {
    const { input_tokens, output_tokens } = message.usage;
    this.usage.calls += 1;
    this.usage.inputTokens += input_tokens;
    this.usage.outputTokens += output_tokens;
    this.usage.costUsd += estimateCost(input_tokens, output_tokens, model, { batch });
  }

  private async runDirect(req: LlmRequest): Promise<LlmResult> {
    try {
      const message = await this.api().messages.create(req.params);
      this.record(message, req.params.model, false);
      return { message, batch: false };
    } catch (err) {
      const error = (err as Error).message;
      this.log(`direct call ${req.id} failed: ${error}`);
      return { message: null, error, batch: false };
    }
  }

  private async runBatch(requests: LlmRequest[]): Promise<Map<string, LlmResult>> {
    const api = this.api();
    const poll = this.opts.pollIntervalMs ?? 15_000;
    const modelOf = new Map(requests.map((r) => [r.id, r.params.model]));

    const created = await api.messages.batches.create({
      requests: requests.map((r) => ({ custom_id: r.id, params: r.params })),
    });
    this.log(`batch ${created.id} submitted (${requests.length} requests)`);

    const deadline = Date.now() + this.opts.batchTimeoutMs;
    let status = created.processing_status;
    while (status !== "ended" && Date.now() < deadline) {
      await sleep(poll);
      status = (await api.messages.batches.retrieve(created.id)).processing_status;
    }

    if (status !== "ended") {
      this.log(`batch ${created.id} timed out — canceling`);
      await api.messages.batches.cancel(created.id);
      const graceEnd = Date.now() + CANCEL_GRACE_MS;
      while (status !== "ended" && Date.now() < graceEnd) {
        await sleep(poll);
        status = (await api.messages.batches.retrieve(created.id)).processing_status;
      }
      if (status !== "ended") return new Map();
    }

    const results = new Map<string, LlmResult>();
    for await (const item of await api.messages.batches.results(created.id)) {
      const { custom_id: id, result } = item;
      if (result.type === "succeeded") {
        this.record(result.message, modelOf.get(id) ?? result.message.model, true);
        results.set(id, { message: result.message, batch: true });
      } else {
        results.set(id, { message: null, error: `batch ${result.type}`, batch: true });
      }
    }
    return results;
  }
}

/**
 * 구조화 출력(output_config.format) 응답을 파싱·검증한다. 거절·토큰 한도 초과·스키마
 * 불일치면 null — 호출자는 해당 요청을 실패로 처리한다.
 */
export function parseStructured<T>(
  message: Anthropic.Message | null,
  format: AutoParseableOutputFormat<T>,
): T | null {
  if (!message || message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    return null;
  }
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  try {
    return format.parse(text);
  } catch {
    return null;
  }
}
