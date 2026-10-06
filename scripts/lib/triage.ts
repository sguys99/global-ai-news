/**
 * LLM 선별(triage). 하루치 후보 전체를 한 번의 호출로 비교해 가공할 기사(최대 N건)를 고르고,
 * 같은 사건을 다룬 기사를 묶고, 중요도(1~5)를 상대 평가한다.
 *
 * 본문 전체가 아닌 제목·출처·짧은 발췌만 보내 입력을 작게 유지한다(후보 1건 ≈ 60토큰).
 * 본문을 읽고 한국어로 쓰는 일은 선정된 기사에 한해 enrich.ts 가 한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PROMPTS_DIR } from "../../src/lib/paths";
import type { RawItem } from "../../src/lib/types";
import { approxTokens } from "./cost";
import type { LlmRequest } from "./llm";
import { triageSchema, type Triage } from "./schema";

/** 수집·dedup 을 통과한 후보. articleId 가 있으면 가공에 실패해 재시도하는 기존 행이다. */
export interface Candidate {
  item: RawItem;
  key: string;
  score: number;
  sourceName: string;
  articleId?: number;
}

export interface Pick {
  /** 후보 풀 번호. */
  index: number;
  importance: number;
  /** 같은 사건을 다룬 다른 후보 번호. */
  duplicates: number[];
}

const TITLE_CHARS = 160;
const SNIPPET_CHARS = 120;
/** 선정 1건당 출력 토큰 근사치(id·importance·duplicates JSON). 비용 가드 추정용. */
const OUTPUT_TOKENS_PER_PICK = 25;

export const triageFormat = zodOutputFormat(triageSchema);

const SYSTEM_PROMPT = readFileSync(path.join(PROMPTS_DIR, "triage.system.md"), "utf-8");

/**
 * 선별에 보낼 후보 풀. 소스별로 화제 점수 → 최신 순 정렬 후 라운드로빈으로 뽑아, 기사가 많은
 * 소스(국내 매체·GitHub 등)가 풀을 독식하지 않게 한다. RSS 는 화제 점수가 0 이라 점수만으로
 * 자르면 API 소스에 밀린다.
 */
export function buildTriagePool(candidates: Candidate[], size: number): Candidate[] {
  const bySource = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const group = bySource.get(c.item.sourceId) ?? [];
    group.push(c);
    bySource.set(c.item.sourceId, group);
  }
  const queues = [...bySource.values()].map((group) =>
    [...group].sort(
      (a, b) => b.score - a.score || b.item.publishedAt.localeCompare(a.item.publishedAt),
    ),
  );

  const pool: Candidate[] = [];
  for (let round = 0; pool.length < size; round++) {
    let took = false;
    for (const queue of queues) {
      if (round < queue.length && pool.length < size) {
        pool.push(queue[round]);
        took = true;
      }
    }
    if (!took) break;
  }
  return pool;
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 후보 1건 → 한 줄. `번호 | 매체 | 게시일 | 화제 | 제목 | 발췌` */
export function triageLine(c: Candidate, index: number): string {
  const date = c.item.publishedAt.slice(5, 10);
  const snippet = oneLine(c.item.contentRaw ?? "", SNIPPET_CHARS);
  return [
    index,
    c.sourceName,
    date,
    c.score > 0 ? `화제 ${c.score}` : "-",
    oneLine(c.item.title, TITLE_CHARS),
    snippet || "-",
  ].join(" | ");
}

export function buildTriageRequest(pool: Candidate[], maxPicks: number, model: string): LlmRequest {
  const lines = pool.map(triageLine).join("\n");
  return {
    id: "triage",
    params: {
      model,
      max_tokens: 1000 + maxPicks * 60,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `오늘 후보 ${pool.length}건 중 최대 ${maxPicks}건을 고르세요.\n\n${lines}`,
        },
      ],
      output_config: { format: triageFormat },
    },
  };
}

/** 선별 요청의 비용 가드용 토큰 추정치. */
export function estimateTriageTokens(req: LlmRequest, maxPicks: number) {
  const user = req.params.messages.map((m) => m.content).join("");
  return {
    input: approxTokens(SYSTEM_PROMPT + user),
    output: maxPicks * OUTPUT_TOKENS_PER_PICK,
  };
}

/**
 * 모델 출력 → 검증된 선정 목록. 범위 밖·중복 번호는 버리고(한 후보는 한 번만 — 선정이든
 * 묶음이든), 중요도 높은 순으로 maxPicks 건까지만 남긴다.
 */
export function resolvePicks(triage: Triage, poolSize: number, maxPicks: number): Pick[] {
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < poolSize;
  const ordered = [...triage.picks].sort((a, b) => b.importance - a.importance);

  const used = new Set<number>();
  const picks: Pick[] = [];
  for (const p of ordered) {
    if (picks.length >= maxPicks) break;
    if (!valid(p.id) || used.has(p.id)) continue;
    used.add(p.id);
    const duplicates: number[] = [];
    for (const d of p.duplicates) {
      if (!valid(d) || used.has(d)) continue;
      used.add(d);
      duplicates.push(d);
    }
    picks.push({ index: p.id, importance: p.importance, duplicates });
  }
  return picks;
}
