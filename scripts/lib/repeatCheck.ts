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
 *
 * 후속 보도(followups — 같은 사건의 새 전개)는 그대로 싣고, 짝지은 이미 보도함 기사를 follow_up_of 로 잇는다
 * (상세 페이지의 사건 타임라인). 추가 호출은 없다. 잘못 이은 링크는 독자 눈에 보이는 오류라 같은 코드 확인
 * (confirmFollowups)을 거친 짝만 잇는다 — 기각한 후속 판정도 기사는 그대로 싣고 링크만 달지 않는다.
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
 * (4-3 검증). 기사 id 가 있으면 id 로, 없으면(옛 스냅숏) 호 날짜(created_at 의 KST 날짜)와 title_ko 로 찾아 id 도
 * 채운다 — 후속 보도 연결이 R번호를 기사로 되짚는다. 못 찾으면 그대로 둔다. 읽기 전용.
 */
export function attachReportedSummaries(
  db: DatabaseType,
  reported: ReportedHeadline[],
): ReportedHeadline[] {
  const byId = db.prepare(
    `SELECT id, summary_ko FROM articles WHERE id = ? AND summary_ko IS NOT NULL`,
  );
  const byTitle = db.prepare(
    `SELECT id, summary_ko FROM articles
      WHERE title_ko = ? AND date(created_at, '+9 hours') = ? AND summary_ko IS NOT NULL
      ORDER BY id LIMIT 1`,
  );
  return reported.map((r) => {
    const row = (r.id !== undefined ? byId.get(r.id) : byTitle.get(r.title, r.issueDate)) as
      | { id: number; summary_ko: string }
      | undefined;
    return row ? { ...r, id: row.id, summary: row.summary_ko } : r;
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

/**
 * 후속 보도 연결을 받아들이는 최소 공유 증거 수. 재보도와 같은 기준(2)이다 — 후속 보도는 정의상 같은 사건이라
 * 재보도와 같은 증거(주체 + 제품·대상 하나, 또는 내용어 둘)가 나와야 한다. 3으로 올리면 "Mistral Large 4 공개" →
 * "Mistral Large 4 가중치 공개"(실제 10-06 → 10-30)처럼 주체와 제품만 겹치는 전형적인 후속 보도를 놓친다.
 * 1(회사 하나)이면 같은 회사의 다른 소식을 잇는다 — 지금까지 모델이 낸 후속 판정 4건이 모두 이 경우였다.
 */
export const MIN_FOLLOWUP_EVIDENCE = MIN_REPEAT_EVIDENCE;

/** 숫자·버전·수치만인 토큰("3.5"·"15%"·"1,000") — 무엇에 관한 소식인지 말해 주지 않는다. */
const NUMERIC_TOKEN = /^[\d.,%]+$/;

/**
 * 후속 보도 연결은 점수에 더해, 회사도 숫자도 아닌 공유 낱말(제품·대상 — "large"·"k3.1"·"voxtral")이 하나는 있어야 한다.
 * 회사 + 버전 번호만으로는 같은 제품군의 다른 출시를 잇는다(실제: "NVIDIA, 로봇용 소형 언어모델 Nemotron 3.5 출시" →
 * "엔비디아, 40개 언어 지원 음성 모델 Nemotron 3.5 공개"가 nvidia·3.5 로 2점). 재보도 판정에는 쓰지 않는다
 * — 그쪽은 잘못 빼는 손해를 줄이는 기각 규칙이고, 여기는 잘못 잇는 손해(보이는 오류)를 줄이는 규칙이다.
 */
export function hasTopicWord(shared: string[]): boolean {
  return shared.some((t) => !ENTITY_KEYS.has(t) && !NUMERIC_TOKEN.test(t));
}

/** 저장할 후속 보도 연결: 오늘 기사(id = 풀 번호)가 이미 보도함 기사(articleId)의 후속 보도다. */
export interface FollowUpLink extends RepeatMatch {
  /** 이전 보도의 articles.id — follow_up_of 에 저장한다. */
  articleId: number;
}

/**
 * 후속 판정 → 이을 짝 / 기각한 짝. 같은 텍스트로 repeatEvidence 를 매겨 MIN_FOLLOWUP_EVIDENCE 이상이고 hasTopicWord 이면
 * 잇는다. 짝의 기사·R번호를 찾지 못하면 기각한다. 통과한 짝 중 이미 보도함 기사 id 를 모르는 것(id 없는 옛 스냅숏)은
 * 잇지도 기각하지도 않는다 — 어느 쪽이든 기사는 싣고 링크만 달지 않는다(실패에 열린 쪽).
 */
export function confirmFollowups(
  followups: RepeatMatch[],
  inputs: RepeatInput[],
  reported: ReportedHeadline[],
): { links: FollowUpLink[]; rejected: RejectedRepeat[] } {
  const byId = new Map(inputs.map((x) => [x.id, x]));
  const links: FollowUpLink[] = [];
  const rejected: RejectedRepeat[] = [];
  for (const m of followups) {
    const today = byId.get(m.id);
    const headline = reported[m.reported - 1];
    const evidence = today && headline ? repeatEvidence(today, headline) : { shared: [], score: 0 };
    if (evidence.score < MIN_FOLLOWUP_EVIDENCE || !hasTopicWord(evidence.shared)) {
      rejected.push({ ...m, shared: evidence.shared });
    } else if (Number.isInteger(headline?.id)) {
      links.push({ ...m, articleId: headline.id as number });
    }
  }
  return { links, rejected };
}

/** 후속 판정 중 코드 확인에서 기각한 수(기사는 싣고 링크만 달지 않는다). */
export function followUpRejectNote(rejected: RejectedRepeat[]): string | null {
  return rejected.length > 0 ? `후속 판정 기각 ${rejected.length}건(내용어 겹침 부족)` : null;
}

/** 실제로 저장한 후속 보도 연결 수(collect 가 저장 뒤에 센다). */
export function followUpNote(linked: number): string | null {
  return linked > 0 ? `후속 보도 연결 ${linked}건` : null;
}

/**
 * 후속 보도 연결 1건 저장기(collect 의 저장 트랜잭션 안에서 부른다). 이 기사(id·dedup_key 가 모두 맞는 공개 행)에만,
 * 자기 자신이 아니고 공개된 이전 보도로만 follow_up_of 를 적고 바뀐 행 수(0|1)를 돌려준다. 실패에 열려 있다 — 준비·실행
 * 오류는 onError 로 알리고 0(준비 실패면 null)을 돌려, 링크 하나 때문에 그날 호 저장이 깨지지 않게 한다.
 */
export function prepareFollowUpLink(
  db: DatabaseType,
  onError: (err: Error) => void,
): ((id: number, key: string, prev: number) => number) | null {
  try {
    const stmt = db.prepare(
      `UPDATE articles SET follow_up_of = @prev
        WHERE id = @id AND dedup_key = @key AND id != @prev AND summary_ko IS NOT NULL
          AND EXISTS (SELECT 1 FROM articles p WHERE p.id = @prev AND p.summary_ko IS NOT NULL)`,
    );
    return (id, key, prev) => {
      try {
        return stmt.run({ id, key, prev }).changes;
      } catch (err) {
        onError(err as Error);
        return 0;
      }
    };
  } catch (err) {
    onError(err as Error);
    return null;
  }
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
 * followups 는 모델의 후속 판정 전부(모두 싣는다), links 는 그중 코드 확인을 통과해 follow_up_of 로 이을 짝,
 * followRejected 는 기각한 후속 판정(링크 없이 싣는다).
 * note·rejectNote·followRejectNote 는 collect notes 에 넣을 줄(없으면 null). `후속 보도 연결`은 저장 뒤에 센다(followUpNote).
 */
export interface RepeatCheckOutcome extends RepeatVerdict {
  status: "skipped" | "ok" | "failed";
  rejected: RejectedRepeat[];
  links: FollowUpLink[];
  followRejected: RejectedRepeat[];
  note: string | null;
  rejectNote: string | null;
  followRejectNote: string | null;
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
  links: [],
  followRejected: [],
  note,
  rejectNote: null,
  followRejectNote: null,
});

const failed = (reason: string) => nothing("failed", `재보도 검사 실패(전부 게재): ${reason}`);

/**
 * 러너 결과 1건 → 판정. 응답이 없거나 검증되지 않으면 실패(아무것도 빼지 않음).
 * 검증된 재보도 판정은 confirmRepeats 로 한 번 더 확인해, 내용어 겹침이 부족한 것은 기각하고 싣는다.
 * 후속 판정도 같은 확인(confirmFollowups)을 거친 짝만 links 로 낸다.
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
  const follow = confirmFollowups(verdict.followups, inputs, reported);
  return {
    status: "ok",
    ...kept,
    rejected,
    links: follow.links,
    followRejected: follow.rejected,
    note: repeatNote(kept),
    rejectNote: rejectNote(rejected),
    followRejectNote: followUpRejectNote(follow.rejected),
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
