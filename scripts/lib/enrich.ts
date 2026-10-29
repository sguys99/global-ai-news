/**
 * LLM 가공(③단계). 선별(triage)을 통과한 기사만 한국어 제목·요약·카테고리·태그를 만든다.
 *
 * 기사 CHUNK_SIZE 건을 한 요청에 묶는다. 기사 1건당 1호출이면 시스템 프롬프트(+few-shot,
 * 약 2.7k토큰)와 출력 스키마를 매번 다시 보내 입력의 대부분이 반복 지시문이 된다
 * (Haiku 4.5 는 4,096토큰 미만 프리픽스를 캐시하지 않아 프롬프트 캐싱으로도 못 줄인다).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { FORMAT_LABELS, type Format } from "../../src/lib/labels";
import { PROMPTS_DIR } from "../../src/lib/paths";
import type { RawItem } from "../../src/lib/types";
import { approxTokens, outputFormatTokens } from "./cost";
import type { LlmRequest } from "./llm";
import { enrichBatchSchema, type ArticleEnrichment, type EnrichBatch } from "./schema";

/** 한 요청에 묶는 기사 수. 한 요청이 실패해도 잃는 기사가 이 수를 넘지 않는다. */
export const CHUNK_SIZE = 10;
/** 기사 1건 본문 입력 상한(글자). */
const MAX_INPUT_CHARS = 2000;
/** 기사 1건당 출력 토큰 상한(요약 2~3줄 + JSON). 실측 평균 약 180토큰. */
const MAX_OUTPUT_TOKENS_PER_ARTICLE = 350;
/** 기사 1건당 출력 토큰 근사치. 비용 가드 추정용. */
const EST_OUTPUT_TOKENS_PER_ARTICLE = 250;

export const enrichFormat = zodOutputFormat(enrichBatchSchema);

export interface FewShotExample {
  input: { format: Format; source: string; title: string; content: string };
  output: ArticleEnrichment;
}

/** 시스템 프롬프트에서 분야 정의(categories.md)가 들어갈 자리. */
const CATEGORIES_PLACEHOLDER = "{{CATEGORIES}}";

/**
 * 분야 정의 블록(6개 키·포함 범위·경계 규칙). 가공과 재분류(scripts/reclassify.ts)가 같은 기준으로
 * 분류하도록 configs/prompts/categories.md 한 파일에서 읽는다.
 */
export function readCategoryGuide(): string {
  return readFileSync(path.join(PROMPTS_DIR, "categories.md"), "utf-8").trim();
}

/** 프롬프트 파일은 모듈 로드 시 1회만 읽는다. */
const SYSTEM_PROMPT = buildSystemPrompt();

function buildSystemPrompt(): string {
  const system = readFileSync(path.join(PROMPTS_DIR, "enrich.system.md"), "utf-8").replace(
    CATEGORIES_PLACEHOLDER,
    readCategoryGuide(),
  );
  const examples = readFewShot()
    .map((ex, i) => {
      const input = articleFields(
        ex.input.format,
        ex.input.source,
        ex.input.title,
        ex.input.content,
      );
      return `### 예시 ${i + 1}\n입력:\n${input}\n출력:\n${JSON.stringify(ex.output)}`;
    })
    .join("\n\n");

  return `${system}\n\n## 예시 (기사 1건 기준)\n\n${examples}`;
}

/** few-shot 예시(형식별 요약 가이드의 본보기). 시스템 프롬프트 조립과 테스트가 같이 쓴다. */
export function readFewShot(): FewShotExample[] {
  return JSON.parse(
    readFileSync(path.join(PROMPTS_DIR, "enrich.fewshot.json"), "utf-8"),
  ) as FewShotExample[];
}

/**
 * 기사 1건의 입력 필드. 실제 입력과 few-shot 이 같은 모양이어야 하므로 한 곳에서 만든다.
 * [형식]은 형식별 요약 가이드를 고르는 단서다 — 분야(category)는 형식이 아니라 주제로 정한다.
 */
function articleFields(format: Format, source: string, title: string, content: string): string {
  return `[형식] ${FORMAT_LABELS[format]}\n[출처] ${source}\n[제목] ${title}\n[본문]\n${content}`;
}

/** 가공할 기사 1건. id 는 요청 안에서 결과를 매칭하는 번호(후보 풀 번호). */
export interface EnrichInput {
  id: number;
  item: RawItem;
  sourceName: string;
  /** 소스 형식(sources.json `format`). 형식별 요약 가이드 선택용. */
  format: Format;
}

function articleBlock({ id, item, sourceName, format }: EnrichInput): string {
  const content = (item.contentRaw ?? "").slice(0, MAX_INPUT_CHARS);
  return `### id=${id}\n${articleFields(format, sourceName, item.title, content || "(본문 없음)")}`;
}

/** 가공 요청 1건과 그 요청에 실린 기사 id. */
export interface EnrichChunk {
  request: LlmRequest;
  ids: number[];
}

/** 선정 기사 → CHUNK_SIZE 건씩 묶은 요청들. 입력 순서(중요도 순)를 유지한다. */
export function buildEnrichRequests(inputs: EnrichInput[], model: string): EnrichChunk[] {
  const chunks: EnrichChunk[] = [];
  for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
    const chunk = inputs.slice(i, i + CHUNK_SIZE);
    const request: LlmRequest = {
      id: `enrich-${i / CHUNK_SIZE}`,
      params: {
        model,
        max_tokens: 200 + chunk.length * MAX_OUTPUT_TOKENS_PER_ARTICLE,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              `기사 ${chunk.length}건을 각각 가공하세요. articles 배열에 기사마다 하나씩, 입력의 id 를 그대로 담으세요.\n\n` +
              chunk.map(articleBlock).join("\n\n"),
          },
        ],
        output_config: { format: enrichFormat },
      },
    };
    chunks.push({ request, ids: chunk.map((c) => c.id) });
  }
  return chunks;
}

/** 가공 요청 1건의 비용 가드용 토큰 추정치(입력에는 구조화 출력 스키마 몫도 든다). */
export function estimateEnrichTokens({ request, ids }: EnrichChunk) {
  const user = request.params.messages.map((m) => m.content).join("");
  return {
    input: approxTokens(SYSTEM_PROMPT + user) + outputFormatTokens(enrichFormat),
    output: ids.length * EST_OUTPUT_TOKENS_PER_ARTICLE,
  };
}

/** 모델 출력 → id 별 가공 결과. 요청에 없던 id 는 버린다. */
export function resolveEnrichments(
  batch: EnrichBatch,
  requestedIds: Iterable<number>,
): Map<number, ArticleEnrichment> {
  const wanted = new Set(requestedIds);
  const out = new Map<number, ArticleEnrichment>();
  for (const { id, ...enrichment } of batch.articles) {
    if (wanted.has(id) && !out.has(id)) out.set(id, enrichment);
  }
  return out;
}
