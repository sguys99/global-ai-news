/**
 * 재보도 검사(④-2단계). 가공을 마친 오늘 기사의 한국어 제목(+요약 첫 문장)을 최근 호 게재 제목("이미 보도함")과
 * 한 번의 호출로 대조해, 같은 사건이고 새 전개가 없는 기사를 지면에서 뺀다.
 *
 * 선별(triage)의 already_reported 가 1차 거름망이지만, 영어가 섞인 240줄 입력을 한 번에 보는 선별은
 * 4-3 검증에서 알려진 재보도 5건 중 4건을 다시 골랐다. 여기서는 같은 언어(한국어)끼리, 짧은 입력으로 이 일만 시킨다.
 *
 * 실패에 열려 있다(fail-open): 호출이 실패하거나 응답이 검증되지 않으면 아무것도 빼지 않고 notes 에만 남긴다.
 *
 * 모델의 재보도 판정은 코드로 한 번 더 확인한다(confirmRepeats). 7-3 배치 회차에서 6건을 뺐는데 5건이 같은 회사이거나
 * "투자"·"수학" 같은 단어 하나만 겹친 오탐이었다. 잘못 빼는 손해(그 호의 가장 강한 뉴스가 사라짐)가 재보도 하나를
 * 놓치는 손해(선별의 already_reported 가 이미 1차로 거른다)보다 훨씬 크므로, 두 기사가 내용어를 충분히 함께 쓰지
 * 않으면 판정을 기각하고 싣는다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Database as DatabaseType } from "better-sqlite3";
import { PROMPTS_DIR } from "../../src/lib/paths";
import { approxTokens, estimateCost, outputFormatTokens } from "./cost";
import { parseStructured, type LlmRequest, type LlmResult, type LlmRunner } from "./llm";
import { repeatCheckSchema, type ArticleEnrichment } from "./schema";
import { contentTokensOf, ENTITY_KEYS, RELATION_PATTERN, sharedTokens } from "./textTokens";
import type { Pick as TriagePick, ReportedHeadline } from "./triage";

export const repeatFormat = zodOutputFormat(repeatCheckSchema);

const SYSTEM_PROMPT = readFileSync(path.join(PROMPTS_DIR, "repeat.system.md"), "utf-8");

const TITLE_CHARS = 160;
/** 요약 첫 문장 상한(글자). 사건을 가를 주체·수치는 대개 첫 문장에 있다. */
const SENTENCE_CHARS = 120;
/** 이미 보도함 쪽 요약 첫 문장 상한(글자). 79줄 × 이 길이라 오늘 기사 쪽보다 짧게 둔다. */
const REPORTED_SENTENCE_CHARS = 80;
/** 짝 1건(`{"id":12,"reported":34,"event":"…20자"}`)당 출력 토큰 근사치. */
const OUTPUT_TOKENS_PER_PAIR = 35;

/** 검사할 오늘 기사 1건. id 는 후보 풀 번호. */
export interface RepeatInput {
  id: number;
  title: string;
  summary: string;
}

/** 검증된 짝: 오늘 기사(id)와 이미 보도함 R번호(1부터), 모델이 적은 공통 사건(event — 검토용). */
export interface RepeatMatch {
  id: number;
  reported: number;
  event?: string;
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 요약의 첫 문장. 마침표·물음표·느낌표 뒤에 공백이나 끝이 와야 문장 끝으로 본다 — "1.2억"·"v4.1" 의 점은 자르지 않는다.
 */
export function firstSentence(text: string, max = SENTENCE_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = /[.!?](?=\s|$)/.exec(flat);
  return oneLine(end ? flat.slice(0, end.index + 1) : flat, max);
}

/**
 * 이미 보도함 제목에 그 기사의 요약(summary_ko)을 붙인다. 제목만으로는 "같은 회사의 다른 발표"를 가르지 못해 오탐이 났다
 * (4-3 검증). 호 날짜(created_at 의 KST 날짜)와 title_ko 로 찾고, 못 찾으면 제목만 둔다. 읽기 전용.
 */
export function attachReportedSummaries(
  db: DatabaseType,
  reported: ReportedHeadline[],
): ReportedHeadline[] {
  const find = db.prepare(
    `SELECT summary_ko FROM articles
      WHERE title_ko = ? AND date(created_at, '+9 hours') = ? AND summary_ko IS NOT NULL
      ORDER BY id LIMIT 1`,
  );
  return reported.map((r) => {
    const row = find.get(r.title, r.issueDate) as { summary_ko: string } | undefined;
    return row ? { ...r, summary: row.summary_ko } : r;
  });
}

/** 선정 중 가공을 마친 것만 검사 입력으로 바꾼다(미가공은 한국어 제목이 없어 대조할 수 없다). 선정 순서를 유지한다. */
export function toRepeatInputs(
  picks: TriagePick[],
  enrichmentOf: (index: number) => ArticleEnrichment | undefined,
): RepeatInput[] {
  return picks.flatMap((p) => {
    const e = enrichmentOf(p.index);
    return e ? [{ id: p.index, title: e.title_ko, summary: e.summary_ko }] : [];
  });
}

/**
 * 재보도 검사 요청. 유저 메시지 = 지시 한 줄 → 이미 보도함(`R번호 | MM-DD | 제목 — 요약 첫 문장`, 요약이 없으면 제목만)
 * → 오늘 게재 예정(`번호 | 제목 | 요약 첫 문장`).
 */
export function buildRepeatRequest(
  inputs: RepeatInput[],
  reported: ReportedHeadline[],
  model: string,
): LlmRequest {
  const headlines = reported.map((r, i) => {
    const gist = r.summary ? ` — ${firstSentence(r.summary, REPORTED_SENTENCE_CHARS)}` : "";
    return `R${i + 1} | ${r.issueDate.slice(5)} | ${oneLine(r.title, TITLE_CHARS)}${gist}`;
  });
  const today = inputs.map(
    (x) => `${x.id} | ${oneLine(x.title, TITLE_CHARS)} | ${firstSentence(x.summary)}`,
  );
  return {
    id: "repeat-check",
    params: {
      model,
      // 짝 1건 ≈ 35토큰. 모든 기사가 짝이 돼도 넘치지 않게 잡는다(보통은 몇 건뿐이다).
      max_tokens: 200 + inputs.length * 2 * OUTPUT_TOKENS_PER_PAIR,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `이미 보도함 ${reported.length}건과 오늘 게재 예정 ${inputs.length}건을 대조하세요.`,
            `## 이미 보도함\n${headlines.join("\n")}`,
            `## 오늘 게재 예정\n${today.join("\n")}`,
          ].join("\n\n"),
        },
      ],
      output_config: { format: repeatFormat },
    },
  };
}

/**
 * 비용 가드용 토큰 추정치. 출력은 기사의 4분의 1이 짝이 된다고 본다(4-3 스냅숏: 35건 중 재보도 5건) — 최소 4건.
 */
export function estimateRepeatTokens(req: LlmRequest, inputCount: number) {
  const user = req.params.messages.map((m) => m.content).join("");
  return {
    input: approxTokens(SYSTEM_PROMPT + user) + outputFormatTokens(repeatFormat),
    output: 20 + Math.max(4, Math.ceil(inputCount / 4)) * OUTPUT_TOKENS_PER_PAIR,
  };
}

/** 재보도 판정을 받아들이는 최소 공유 증거 수(repeatEvidence.score). */
export const MIN_REPEAT_EVIDENCE = 2;

/** 오늘 기사와 이미 보도함 한 건이 함께 쓰는 내용어와 그 증거 점수. */
export interface RepeatEvidence {
  /** 함께 쓰는 내용어(회사는 정규 키 — openai·google …). */
  shared: string[];
  score: number;
}

/**
 * 두 기사가 같은 사건이라는 코드 쪽 증거. 모델이 본 것과 같은 텍스트(제목 + 요약 첫 문장)만 쓴다.
 * - 내용어(textTokens.contentTokens — 일반어·분야어 제외) 하나가 증거 하나다.
 * - 회사는 몇 개가 겹치든 증거 하나다("같은 회사"만으로는 같은 사건이 아니다). 단, 두 회사가 함께 겹치고 두 기사
 *   모두 제휴·계약·인수·투자를 다루면 둘로 센다 — 상대가 있는 사건은 두 회사가 곧 주체와 대상이다.
 */
export function repeatEvidence(today: RepeatInput, reported: ReportedHeadline): RepeatEvidence {
  const todayTexts = [today.title, firstSentence(today.summary)];
  const reportedTexts = [
    reported.title,
    reported.summary ? firstSentence(reported.summary, REPORTED_SENTENCE_CHARS) : undefined,
  ];
  const shared = sharedTokens(contentTokensOf(todayTexts), contentTokensOf(reportedTexts));
  const entities = shared.filter((t) => ENTITY_KEYS.has(t)).length;
  const relation =
    entities >= 2 &&
    todayTexts.some((t) => RELATION_PATTERN.test(t)) &&
    reportedTexts.some((t) => t !== undefined && RELATION_PATTERN.test(t));
  const score = shared.length - entities + Math.min(entities, 1) + (relation ? 1 : 0);
  return { shared, score };
}

/** 코드 확인에서 기각한 재보도 판정(그대로 싣는다). */
export interface RejectedRepeat extends RepeatMatch {
  shared: string[];
}

/**
 * 재보도 판정 → 받아들인 것 / 기각한 것. 공유 증거가 MIN_REPEAT_EVIDENCE 미만이면 기각한다.
 * 짝의 기사·R번호를 찾지 못하면(resolveRepeats 를 거쳤다면 없다) 기각한다 — 실패에 열린 쪽.
 */
export function confirmRepeats(
  repeats: RepeatMatch[],
  inputs: RepeatInput[],
  reported: ReportedHeadline[],
): { confirmed: RepeatMatch[]; rejected: RejectedRepeat[] } {
  const byId = new Map(inputs.map((x) => [x.id, x]));
  const confirmed: RepeatMatch[] = [];
  const rejected: RejectedRepeat[] = [];
  for (const m of repeats) {
    const today = byId.get(m.id);
    const headline = reported[m.reported - 1];
    const evidence = today && headline ? repeatEvidence(today, headline) : { shared: [], score: 0 };
    if (evidence.score >= MIN_REPEAT_EVIDENCE) confirmed.push(m);
    else rejected.push({ ...m, shared: evidence.shared });
  }
  return { confirmed, rejected };
}

/** 검증한 검사 결과. */
export interface RepeatVerdict {
  repeats: RepeatMatch[];
  followups: RepeatMatch[];
}

/**
 * 모델 출력 → 검증된 짝. 요청에 없던 id·범위 밖 R번호(1~reportedCount)는 버리고, 한 기사는 처음 나온 짝만 쓴다.
 * repeats 와 followups 에 모두 적힌 기사는 판정이 엇갈린 것이라 빼지 않는다(followups 로 센다 — 실패에 열린 쪽).
 */
export function resolveRepeats(
  output: { repeats: RepeatMatch[]; followups: RepeatMatch[] },
  requestedIds: Iterable<number>,
  reportedCount: number,
): RepeatVerdict {
  const wanted = new Set(requestedIds);
  const valid = (m: RepeatMatch) =>
    wanted.has(m.id) &&
    Number.isInteger(m.reported) &&
    m.reported >= 1 &&
    m.reported <= reportedCount;
  const firstById = (list: RepeatMatch[]) => {
    const out = new Map<number, RepeatMatch>();
    for (const m of list) if (valid(m) && !out.has(m.id)) out.set(m.id, { ...m });
    return out;
  };
  const followups = firstById(output.followups);
  const repeats = [...firstById(output.repeats).values()].filter((m) => !followups.has(m.id));
  return { repeats, followups: [...followups.values()] };
}

/**
 * runRepeatCheck 결과. repeats 는 코드 확인을 통과한 판정만(게재에서 뺄 것), rejected 는 기각한 판정(싣는다).
 * note·rejectNote 는 collect notes 에 넣을 줄(없으면 null).
 */
export interface RepeatCheckOutcome extends RepeatVerdict {
  status: "skipped" | "ok" | "failed";
  rejected: RejectedRepeat[];
  note: string | null;
  rejectNote: string | null;
}

export interface RepeatCheckOptions {
  /** 이 단계에 쓸 수 있는 남은 비용(USD). 추정 비용이 넘으면 호출하지 않는다. */
  remainingUsd: number;
  /** 추정 비용 단가(Batches 할인 여부) — 러너 설정과 맞춘다. */
  batch: boolean;
}

/** notes 문구. kpi baseline 의 notes 파싱(`선정 N건`·`후보 N건 중`)과 겹치지 않는다. */
export function repeatNote(verdict: RepeatVerdict): string | null {
  if (verdict.repeats.length === 0 && verdict.followups.length === 0) return null;
  const follow =
    verdict.followups.length > 0 ? `(후속 보도 유지 ${verdict.followups.length}건)` : "";
  return `재보도 제외 ${verdict.repeats.length}건${follow}`;
}

/**
 * 코드 확인에서 기각한 판정 수. `재보도 제외` 와 따로 둔 notes 한 줄이다 — kpi baseline 은
 * parseRunWarnings.repeatRejected 로 읽는다(`재보도 제외`·`재보도 검사 실패·생략` 파싱과 겹치지 않는다).
 */
export function rejectNote(rejected: RejectedRepeat[]): string | null {
  return rejected.length > 0 ? `재보도 판정 기각 ${rejected.length}건(내용어 겹침 부족)` : null;
}

/** 아무것도 빼지 않는 결과(실패·생략). */
const nothing = (status: "skipped" | "failed", note: string | null): RepeatCheckOutcome => ({
  status,
  repeats: [],
  followups: [],
  rejected: [],
  note,
  rejectNote: null,
});

const failed = (reason: string) => nothing("failed", `재보도 검사 실패(전부 게재): ${reason}`);

/**
 * 러너 결과 1건 → 판정. 응답이 없거나 검증되지 않으면 실패(아무것도 빼지 않음).
 * 검증된 재보도 판정은 confirmRepeats 로 한 번 더 확인해, 내용어 겹침이 부족한 것은 기각하고 싣는다.
 */
export function interpretRepeatResult(
  result: LlmResult | undefined,
  inputs: RepeatInput[],
  reported: ReportedHeadline[],
): RepeatCheckOutcome {
  const parsed = parseStructured(result?.message ?? null, repeatFormat);
  if (!parsed) return failed(result?.error ?? "응답 검증 실패");
  const verdict = resolveRepeats(
    parsed,
    inputs.map((x) => x.id),
    reported.length,
  );
  const { confirmed, rejected } = confirmRepeats(verdict.repeats, inputs, reported);
  const kept = { repeats: confirmed, followups: verdict.followups };
  return {
    status: "ok",
    ...kept,
    rejected,
    note: repeatNote(kept),
    rejectNote: rejectNote(rejected),
  };
}

/**
 * 재보도 검사 1회. 이미 보도함이나 검사할 기사가 없으면 부르지 않는다(skipped, note 없음).
 * 추정 비용이 남은 한도를 넘으면 부르지 않고 note 만 남긴다. 러너 예외도 실패로 돌려 전부 게재한다.
 */
export async function runRepeatCheck(
  runner: { run: LlmRunner["run"] },
  inputs: RepeatInput[],
  reported: ReportedHeadline[],
  model: string,
  { remainingUsd, batch }: RepeatCheckOptions,
): Promise<RepeatCheckOutcome> {
  if (inputs.length === 0 || reported.length === 0) return nothing("skipped", null);
  const req = buildRepeatRequest(inputs, reported, model);
  const est = estimateRepeatTokens(req, inputs.length);
  const cost = estimateCost(est.input, est.output, model, { batch });
  if (cost > remainingUsd) {
    return nothing("skipped", `재보도 검사 생략: 비용 한도 초과 예상($${cost.toFixed(4)})`);
  }
  try {
    return interpretRepeatResult((await runner.run([req])).get(req.id), inputs, reported);
  } catch (err) {
    return failed((err as Error).message);
  }
}

/** 재보도로 판정된 선정을 뺀 게재 목록. 뺀 선정의 묶음(duplicates)도 함께 빠진다 — 같은 사건이다. */
export interface RepeatDrop {
  picks: TriagePick[];
  enriched: Map<number, ArticleEnrichment>;
  dropped: TriagePick[];
}

/**
 * 선정·가공 결과에서 재보도를 뺀다. 남은 picks 만 저장(persist)에 넘기면, 뺀 선정과 그 묶음은 어느 선정에도
 * 속하지 않으므로 persist 가 미선정 후보처럼 처리한다 — seen_items 에 키를 남기고, 재심사 중이던 미가공 행
 * (articleId 가 있는 backfill)은 지운다. 그래서 다음 회차에 backfill 로 다시 올라오지 않는다.
 */
export function dropRepeats(
  picks: TriagePick[],
  enriched: Map<number, ArticleEnrichment>,
  repeatIds: Iterable<number>,
): RepeatDrop {
  const drop = new Set(repeatIds);
  const kept = picks.filter((p) => !drop.has(p.index));
  const dropped = picks.filter((p) => drop.has(p.index));
  const keptEnriched = new Map([...enriched].filter(([i]) => !drop.has(i)));
  return { picks: kept, enriched: keptEnriched, dropped };
}
