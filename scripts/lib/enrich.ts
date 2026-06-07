/**
 * LLM 가공(③단계). PRD §3.3 / §7, WORK-PLAN Phase 2.
 * 신규 기사 1건당 generateObject 1호출로 한국어 제목·요약·카테고리·태그·중요도를 생성한다.
 *
 * - 모델: LLM_MODEL(기본 claude-haiku-4-5), Vercel AI SDK + @ai-sdk/anthropic.
 * - 프롬프트 캐싱: 고정 시스템(+few-shot) 블록에 cacheControl 적용 → 배치 내 재청구 절감.
 * - 검증/재시도: Zod 미통과·API 오류 시 1회 재시도, 그래도 실패하면 null 반환(스킵·로깅).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { PROMPTS_DIR } from "../../src/lib/paths";
import type { RawItem } from "../../src/lib/types";
import { articleEnrichmentSchema, type ArticleEnrichment } from "./schema";

/** 본문 입력 토큰 가드 (PRD §3.4). */
const MAX_INPUT_CHARS = 2500;
/** 출력 토큰 제한 (요약 2~3줄). */
const MAX_OUTPUT_TOKENS = 400;

/** 기본 모델. LLM_MODEL 환경변수로 전환 가능. */
const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5";

interface FewShotExample {
  input: { source: string; title: string; content: string };
  output: ArticleEnrichment;
}

/** 프롬프트 파일은 모듈 로드 시 1회만 읽어 캐시(배치 내 재읽기 방지). */
const SYSTEM_PROMPT = buildSystemPrompt();

function buildSystemPrompt(): string {
  const system = readFileSync(
    path.join(PROMPTS_DIR, "enrich.system.md"),
    "utf-8",
  );
  const fewshot = JSON.parse(
    readFileSync(path.join(PROMPTS_DIR, "enrich.fewshot.json"), "utf-8"),
  ) as FewShotExample[];

  const examples = fewshot
    .map((ex, i) => {
      const input = `[출처] ${ex.input.source}\n[제목] ${ex.input.title}\n[본문]\n${ex.input.content}`;
      return `### 예시 ${i + 1}\n입력:\n${input}\n출력:\n${JSON.stringify(ex.output, null, 2)}`;
    })
    .join("\n\n");

  return `${system}\n\n## 예시 (few-shot)\n\n${examples}`;
}

/** 기사 1건 → 가변 유저 메시지. 본문은 비용 가드로 절단한다. */
function buildUserMessage(item: RawItem): string {
  const content = (item.contentRaw ?? "").slice(0, MAX_INPUT_CHARS);
  return `[제목] ${item.title}\n[본문]\n${content || "(본문 없음)"}`;
}

export interface EnrichResult {
  enrichment: ArticleEnrichment;
  usage: { inputTokens: number; outputTokens: number };
}

/** generateObject 1회 호출. 실패 시 throw (상위 enrichArticle 에서 재시도 제어). */
async function callOnce(item: RawItem): Promise<EnrichResult> {
  const { object, usage } = await generateObject({
    model: anthropic(MODEL),
    schema: articleEnrichmentSchema,
    maxTokens: MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
        // 고정 프리픽스 캐싱(프롬프트 캐싱). 가변 유저 메시지는 이후에 위치 → 미캐시.
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      { role: "user", content: buildUserMessage(item) },
    ],
  });

  return {
    enrichment: object,
    usage: {
      inputTokens: usage?.promptTokens ?? 0,
      outputTokens: usage?.completionTokens ?? 0,
    },
  };
}

/**
 * 기사 1건을 LLM 가공한다. 검증·API 실패 시 1회 재시도 후 실패하면 null(스킵).
 * 호출자는 null 이면 한국어 필드 없이 기사를 저장한다(WORK-PLAN Phase 2 결정 #2).
 */
export async function enrichArticle(item: RawItem): Promise<EnrichResult | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await callOnce(item);
    } catch (err) {
      console.warn(
        `[enrich] attempt ${attempt} failed for ${item.url}: ${(err as Error).message}`,
      );
    }
  }
  console.warn(`[enrich] giving up on ${item.url} (saved without enrichment)`);
  return null;
}
