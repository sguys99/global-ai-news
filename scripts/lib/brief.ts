/**
 * 세 줄 요약(brief, Phase 8) — 선별 호출이 함께 내는 "이번 호 핵심" 한 줄들을 게재 결과에 맞춰 거른다.
 *
 * 왜 선별 호출인가: 별도 호출 없이 출력 토큰만 약간(5줄 ≈ 200~350토큰, 배치 기준 $0.001 미만) 는다. 가공 뒤의
 * 재보도 검사 호출이 한국어 제목을 보지만, 그 프롬프트는 오탐을 줄이려 "같은 주체 + 같은 행위" 판정 하나에 맞춰
 * 다듬은 것이라(Phase 7) 다른 일을 얹지 않는다. 이미 보도함이 없거나 비용 가드에 걸리면 그 호출은 건너뛰어지기도 한다.
 *
 * 선별은 영문이 대부분인 후보를 가공·재보도 검사 **전**에 본다. 그래서
 *  - 고른 기사 일부는 나중에 빠지고(재보도 제외·가공 실패·비용 보류), 빠진 기사를 요약한 줄이 남으면 틀린 말이 된다.
 *  - 모델이 줄의 번호를 잘못 적거나(다른 후보의 내용을 쓰고 번호는 엉뚱하게), 영문 금액을 한국어 단위로 옮기다
 *    틀린다($30B → "30억 달러"). 2026-10-31 no-save 실측: 5줄 중 번호 착오 1줄·단위 오류 1줄.
 * 그래서 줄마다 코드로 확인한다(confirmRepeats 와 같은 "모델 판정을 코드가 다시 본다" 원칙).
 *  1) 모델은 줄마다 요약하는 선정 번호(id)를 적고, 앞 줄이 빠질 때를 대비해 5줄을 낸다.
 *  2) 번호를 선정(묶음 번호면 그 대표 선정)으로 풀어 **실제로 게재되는** 선정의 줄만 남긴다.
 *  3) 기사 대조: 줄의 내용어(textTokens)가 그 기사의 가공 제목·요약과 1개 이상 겹치고, 다른 게재 기사가 더 많이
 *     겹치지 않아야 한다 — 번호 착오를 거른다.
 *  4) 수치 대조: 줄의 숫자가 모두 그 기사의 가공 제목·요약(한국어, 가공 단계가 단위를 옮긴 값)에 있어야 한다.
 *     어긋나면 그 줄을 그 기사의 가공 제목(title_ko)으로 바꾼다 — 3)을 통과해 번호는 믿을 수 있고, 틀린 것은 문장의
 *     숫자뿐이다. 가공 제목은 단위를 한국어 본문과 함께 옮긴 값이라 맞고, 문체도 같은 헤드라인체다.
 *  5) 앞에서부터 BRIEF_LINES 줄. 저장 직전 풀 번호를 기사 id 로 바꿔 collection_runs.brief_json 에 담는다.
 *  6) 남은 줄이 BRIEF_MIN_LINES 미만이거나 출력이 없거나 이상하면 요약 없이 발행한다(fail-open: 회차는 그대로
 *     성공하고 화면은 띠를 숨긴다). 이 모듈의 함수는 throw 하지 않는다.
 */
import { contentTokens, contentTokensOf, sharedTokens } from "./textTokens";
import type { Pick } from "./triage";

/** 지면에 싣는 줄 수. */
export const BRIEF_LINES = 3;
/** 이보다 적게 남으면 요약을 싣지 않는다(한 줄짜리 "요약"은 리드 제목과 다를 바 없다). */
export const BRIEF_MIN_LINES = 2;
/** 모델에 요청하는 줄 수 — 앞 BRIEF_LINES 줄이 빠질 때를 대비한 예비 2줄. */
export const BRIEF_REQUESTED = 5;
/** 한 줄 최대 글자 수(코드 포인트). title_ko 상한(60자)과 같다 — 넘으면 줄을 버린다(자르면 문장이 깨진다). */
export const BRIEF_LINE_MAX_CHARS = 60;
/** 이보다 짧은 줄은 버린다("OpenAI 투자" 같은 낱말 나열). */
const BRIEF_LINE_MIN_CHARS = 8;
/**
 * 선별 출력에 더해지는 brief 몫 토큰 근사치(비용 가드·max_tokens 용). 5줄 × (한글 40자 ≈ 52 + JSON 키·번호 ≈ 15)로
 * 넉넉히 잡았다. 2026-10-31 실측(count_tokens): 5줄 214·220토큰, 입력은 프롬프트 절·스키마·확인 줄로 약 +1.7k토큰.
 */
export const BRIEF_OUTPUT_TOKENS = 350;

/** 선별 원출력의 한 줄(풀 번호 기준). 스키마는 schema.ts triageSchema.brief. */
export interface BriefLineOutput {
  id: number;
  text: string;
}

/** 게재 선정에 맞춘 한 줄 — index 는 대표 선정의 풀 번호. */
export interface ResolvedBriefLine {
  index: number;
  text: string;
}

/** 저장되는 한 줄(collection_runs.brief_json 원소) — id 는 articles.id. */
export interface StoredBriefLine {
  id: number;
  text: string;
}

export interface BriefResolution {
  lines: ResolvedBriefLine[];
  /** 모델이 낸 줄 수. */
  submitted: number;
  /** 문장 검사(cleanBriefText)에서 버린 줄 수. */
  invalid: number;
  /** 가리키는 선정이 게재되지 않아(재보도·가공 실패·번호 오류) 버린 줄 수. */
  unpublished: number;
  /** 줄 내용이 가리키는 기사와 맞지 않아(번호 착오) 버린 줄 수. */
  mismatched: number;
  /** 기사에 없는 숫자가 있어(단위 환산 오류 등) 그 기사의 가공 제목으로 바꾼 줄 수. */
  repaired: number;
}

/** 게재되는 선정의 한국어 가공 결과 — 기사 대조·수치 대조의 근거이자 고침 문장(title). */
export interface BriefEvidence {
  title: string;
  summary: string;
}

const HANGUL = /[가-힣]/;
/**
 * 줄 앞 목록 기호: `1. `·`2) `·`- `·`• `·`①` 등 — 번호는 화면이 붙인다. 숫자·기호 뒤 공백을 요구해
 * "2.5배 빨라진…"·"-30% …" 같은 본문 숫자는 건드리지 않는다.
 */
const LIST_MARKER = /^(?:(?:\d{1,2}[.)]|[-–—•·*])\s+|[①-⑩]\s*)/u;

/**
 * 한 줄 정리·검사. 공백 정리, 앞 목록 기호·말미 마침표 제거(title_ko 처럼 마침표 없는 헤드라인체), 한글이 없거나
 * 너무 짧거나 길면 null. 길이는 코드 포인트로 센다.
 */
export function cleanBriefText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(LIST_MARKER, "")
    .replace(/[.。]+$/u, "")
    .trim();
  const length = [...text].length;
  if (!HANGUL.test(text)) return null;
  if (length < BRIEF_LINE_MIN_CHARS || length > BRIEF_LINE_MAX_CHARS) return null;
  return text;
}

/** 텍스트의 숫자(쉼표 뺀 정수·소수 표기). "3,000억"·"1.25조"·"Figure 04" → 3000·1.25·04. */
export function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, "")));
}

/**
 * 선별 원출력 brief → 게재된 선정의 줄(앞에서부터 BRIEF_LINES 줄). `published` = 이번 회차에 실제로 게재되는
 * 선정(가공 성공 + 재보도 아님)의 풀 번호 → 그 기사의 한국어 가공 제목·요약. 번호가 묶음(duplicates)이면
 * 그 대표 선정으로 푼다. 같은 선정을 가리키는 줄은 처음 것만 쓴다. 남은 줄이 BRIEF_MIN_LINES 미만이면 lines 는 빈 배열.
 * `representativeOf` = 가공 뒤 단계가 선정끼리 합쳤을 때(같은 사건 묶기 보강 — 합쳐져 사라진 선정 → 남은 대표 선정)
 * 그 풀 번호를 최종 대표로 옮기는 훅. 기본은 그대로 둔다. 옮긴 뒤의 번호로 게재·기사·수치 대조를 한다.
 */
export function resolveBrief(
  brief: readonly BriefLineOutput[] | undefined | null,
  picks: readonly Pick[],
  published: ReadonlyMap<number, BriefEvidence>,
  representativeOf: (index: number) => number = (index) => index,
): BriefResolution {
  const out: BriefResolution = {
    lines: [],
    submitted: 0,
    invalid: 0,
    unpublished: 0,
    mismatched: 0,
    repaired: 0,
  };
  if (!Array.isArray(brief)) return out;
  out.submitted = brief.length;

  const ownerOf = new Map<number, number>();
  for (const p of picks) {
    ownerOf.set(p.index, p.index);
    for (const d of p.duplicates) if (!ownerOf.has(d)) ownerOf.set(d, p.index);
  }
  const tokensOf = new Map(
    [...published].map(([i, e]) => [i, contentTokensOf([e.title, e.summary])]),
  );

  const used = new Set<number>();
  const kept: ResolvedBriefLine[] = [];
  for (const line of brief) {
    const text = cleanBriefText(line?.text);
    if (text === null) {
      out.invalid += 1;
      continue;
    }
    const picked = Number.isInteger(line.id) ? ownerOf.get(line.id) : undefined;
    const owner = picked === undefined ? undefined : representativeOf(picked);
    if (owner === undefined || !published.has(owner)) {
      out.unpublished += 1;
      continue;
    }
    // 기사 대조: 가리키는 기사와 겹치는 내용어가 있고, 다른 게재 기사가 더 많이 겹치지 않는다.
    const lineTokens = contentTokens(text);
    const overlap = (i: number) => sharedTokens(lineTokens, tokensOf.get(i)!).length;
    const own = overlap(owner);
    if (own === 0 || [...tokensOf.keys()].some((i) => i !== owner && overlap(i) > own)) {
      out.mismatched += 1;
      continue;
    }
    if (used.has(owner)) continue; // 같은 기사를 두 번 요약한 줄 — 앞 줄만 쓴다
    // 수치 대조: 줄의 숫자는 모두 그 기사의 한국어 가공 텍스트에 있어야 한다. 아니면 가공 제목으로 바꾼다.
    const { title, summary } = published.get(owner)!;
    const evidence = numbersIn(`${title} ${summary}`);
    let final: string | null = text;
    if ([...numbersIn(text)].some((n) => !evidence.has(n))) {
      final = cleanBriefText(title);
      if (final === null) {
        out.invalid += 1;
        continue;
      }
      out.repaired += 1;
    }
    used.add(owner);
    kept.push({ index: owner, text: final });
  }
  const lines = kept.slice(0, BRIEF_LINES);
  out.lines = lines.length >= BRIEF_MIN_LINES ? lines : [];
  return out;
}

/**
 * notes 용 요약. 예: `세 줄 요약 3줄(제출 5줄 — 미게재 0·기사 불일치 1·형식 오류 0줄 제외, 수치 불일치 1줄은 가공 제목으로)`,
 * `세 줄 요약 생략: 남은 줄 1/5(미게재 2·기사 불일치 1·형식 오류 0)`.
 * kpi baseline 의 notes 파싱(`선정 N건`·`후보 N건 중`·`재보도 제외 N건`)과 겹치지 않는 문구다.
 */
export function briefNote(r: BriefResolution): string {
  if (r.submitted === 0) return "세 줄 요약 생략: 출력 없음";
  const reasons = `미게재 ${r.unpublished}·기사 불일치 ${r.mismatched}·형식 오류 ${r.invalid}`;
  if (r.lines.length === 0) {
    const usable = r.submitted - r.invalid - r.unpublished - r.mismatched;
    return `세 줄 요약 생략: 남은 줄 ${Math.max(usable, 0)}/${r.submitted}(${reasons})`;
  }
  const repaired = r.repaired > 0 ? `, 수치 불일치 ${r.repaired}줄은 가공 제목으로` : "";
  return `세 줄 요약 ${r.lines.length}줄(제출 ${r.submitted}줄 — ${reasons}줄 제외${repaired})`;
}

/**
 * 저장용 직렬화: 풀 번호 → 기사 id(persist 가 돌려준 맵). id 를 못 찾은 줄은 뺀다. 남은 줄이 BRIEF_MIN_LINES
 * 미만이면 null(요약 없음).
 */
export function serializeBrief(
  lines: readonly ResolvedBriefLine[],
  articleIdOf: ReadonlyMap<number, number>,
): string | null {
  const stored: StoredBriefLine[] = [];
  for (const line of lines) {
    const id = articleIdOf.get(line.index);
    if (id !== undefined) stored.push({ id, text: line.text });
  }
  return stored.length >= BRIEF_MIN_LINES ? JSON.stringify(stored) : null;
}
