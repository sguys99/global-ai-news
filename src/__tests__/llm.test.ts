// @vitest-environment node
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { LlmRunner, parseStructured, type LlmRequest } from "../../scripts/lib/llm";
import { triageFormat } from "../../scripts/lib/triage";

function message(
  text: string,
  stop_reason: Anthropic.Message["stop_reason"] = "end_turn",
): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 100 },
  } as unknown as Anthropic.Message;
}

const req = (id: string): LlmRequest => ({
  id,
  params: { model: "claude-haiku-4-5", max_tokens: 100, messages: [{ role: "user", content: id }] },
});

type BatchItem = { custom_id: string; result: { type: string; message?: Anthropic.Message } };

/** Anthropic 클라이언트 가짜. 배치 결과·상태 전이·일반 호출을 테스트별로 정한다. */
function fakeClient({
  batchItems = (ids: string[]) =>
    ids.map((id) => ({ custom_id: id, result: { type: "succeeded", message: message(id) } })),
  endsAfterPolls = 0,
  createFails = false,
}: {
  batchItems?: (ids: string[]) => BatchItem[];
  endsAfterPolls?: number;
  createFails?: boolean;
} = {}) {
  let ids: string[] = [];
  let polls = 0;
  let canceled = false;
  const client = {
    messages: {
      create: vi.fn(async (params: { messages: { content: string }[] }) =>
        message(`direct:${params.messages[0].content}`),
      ),
      batches: {
        create: vi.fn(async ({ requests }: { requests: { custom_id: string }[] }) => {
          if (createFails) throw new Error("batch create failed");
          ids = requests.map((r) => r.custom_id);
          return { id: "batch_1", processing_status: "in_progress" };
        }),
        retrieve: vi.fn(async () => {
          polls += 1;
          const ended = canceled || polls > endsAfterPolls;
          return { processing_status: ended ? "ended" : "in_progress" };
        }),
        cancel: vi.fn(async () => {
          canceled = true;
          return { processing_status: "canceling" };
        }),
        results: vi.fn(async () =>
          (async function* () {
            yield* canceled
              ? ids.map((id) => ({ custom_id: id, result: { type: "canceled" } }))
              : batchItems(ids);
          })(),
        ),
      },
    },
  };
  return client;
}

const runner = (
  client: ReturnType<typeof fakeClient>,
  opts: Partial<{ useBatch: boolean; batchTimeoutMs: number }> = {},
) =>
  new LlmRunner({
    useBatch: opts.useBatch ?? true,
    batchTimeoutMs: opts.batchTimeoutMs ?? 60_000,
    pollIntervalMs: 0,
    client: client as unknown as Anthropic,
    log: () => {},
  });

const textOf = (m: Anthropic.Message | null | undefined) =>
  m?.content[0].type === "text" ? m.content[0].text : null;

describe("LlmRunner — Batches API", () => {
  it("배치로 처리하고 할인 단가(50%)로 비용을 누적한다", async () => {
    const client = fakeClient({ endsAfterPolls: 2 });
    const llm = runner(client);
    const results = await llm.run([req("a"), req("b")]);

    expect(textOf(results.get("a")?.message)).toBe("a");
    expect(results.get("b")?.batch).toBe(true);
    expect(client.messages.create).not.toHaveBeenCalled();
    // Haiku $1/$5 per M: (1000·1 + 100·5)/1M = $0.0015 × 0.5 × 2건
    expect(llm.usage).toMatchObject({ calls: 2, inputTokens: 2000, outputTokens: 200 });
    expect(llm.usage.costUsd).toBeCloseTo(0.0015, 8);
  });

  it("배치 안에서 실패한 요청만 일반 호출로 재시도한다", async () => {
    const client = fakeClient({
      batchItems: (ids) =>
        ids.map((id) =>
          id === "b"
            ? { custom_id: id, result: { type: "errored" } }
            : { custom_id: id, result: { type: "succeeded", message: message(id) } },
        ),
    });
    const results = await runner(client).run([req("a"), req("b")]);
    expect(textOf(results.get("a")?.message)).toBe("a");
    expect(textOf(results.get("b")?.message)).toBe("direct:b");
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  it("시간 안에 끝나지 않으면 취소하고 전부 일반 호출로 보낸다", async () => {
    const client = fakeClient({ endsAfterPolls: Infinity });
    const llm = runner(client, { batchTimeoutMs: 0 });
    const results = await llm.run([req("a")]);
    expect(client.messages.batches.cancel).toHaveBeenCalled();
    expect(textOf(results.get("a")?.message)).toBe("direct:a");
    expect(llm.usage.costUsd).toBeCloseTo(0.0015, 8); // 일반 호출은 표준 단가
  });

  it("배치 제출 자체가 실패해도 일반 호출로 진행한다", async () => {
    const client = fakeClient({ createFails: true });
    const results = await runner(client).run([req("a")]);
    expect(textOf(results.get("a")?.message)).toBe("direct:a");
  });

  it("useBatch=false 면 배치를 쓰지 않는다", async () => {
    const client = fakeClient();
    await runner(client, { useBatch: false }).run([req("a")]);
    expect(client.messages.batches.create).not.toHaveBeenCalled();
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  it("일반 호출 오류는 throw 하지 않고 결과에 담는다", async () => {
    const client = fakeClient({ createFails: true });
    client.messages.create.mockRejectedValueOnce(new Error("overloaded"));
    const results = await runner(client).run([req("a")]);
    expect(results.get("a")).toMatchObject({ message: null, error: "overloaded" });
  });
});

describe("parseStructured", () => {
  const ok = JSON.stringify({ picks: [{ id: 0, importance: 3, duplicates: [] }] });

  it("정상 응답은 스키마로 검증해 반환", () => {
    expect(parseStructured(message(ok), triageFormat)?.picks).toHaveLength(1);
  });

  it("거절·토큰 한도 초과·스키마 불일치·응답 없음은 null", () => {
    expect(parseStructured(message(ok, "refusal"), triageFormat)).toBeNull();
    expect(parseStructured(message(ok, "max_tokens"), triageFormat)).toBeNull();
    expect(parseStructured(message('{"picks":"x"}'), triageFormat)).toBeNull();
    expect(parseStructured(null, triageFormat)).toBeNull();
  });
});
