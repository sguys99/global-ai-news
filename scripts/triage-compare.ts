/**
 * 개편 전후 선별 비교 (계획 Phase 4-3). DB 를 열지 않는다.
 * 실행: npm run triage:compare -- data/eval/run-<시각>.json [--rev 096de4e]
 *       npm run triage:compare -- data/eval/run-<시각>.json --current [--known 60,130] [--max-cost 0.12]
 *       npm run triage:compare -- data/eval/run-<시각>.json --repeat-check <run.json|run.current.json> [--known 130,48]
 *
 * `npm run collect -- --no-save` 가 남긴 스냅숏의 **같은 선별 풀**로 개편 전 선별을 일반 호출 1회로 다시 돌리고,
 * 스냅숏의 개편 후 선별·가공 결과와 나란히 비교한다.
 * - 개편 전 = `--rev`(기본 096de4e, Phase 4-1 직전) 시점의 triage.system.md + 그때의 줄 형식
 *   `번호 | 매체 | 날짜 | 화제 | 제목 | 발췌` + 그때의 유저 메시지(할당·이미 보도함 없음) + 그때의 최대 선정 30건.
 *   개편 후 회차는 35건(MAX_PICKS_PER_RUN 기본값)이라 선정 수 차이 일부는 상한 차이다.
 * - 개편 전 줄 형식은 비교 전용이라 triage.ts 에 두지 않고 여기서만 재현한다.
 * - 개편 전 선별은 가공하지 않으므로 Physical AI 는 소스 topic 으로만 센다.
 * - "이미 보도함" 유사는 LLM 없이 드문 토큰 공유로 어림한 휴리스틱이다(눈으로 확인할 목록을 뽑는 용도).
 * 결과는 스냅숏 옆 `<스냅숏>.compare-<rev>.json` 에도 남긴다.
 *
 * `--current`: 4-3 보강 검증. 개편 전 선별은 다시 부르지 않고(위 compare 결과 파일을 읽는다), **지금 작업 트리의**
 * 선별(프롬프트·요청 빌더, 스냅숏의 이미 보도함·최대 선정 수)과 가공을 같은 풀로 일반 호출해 3열로 비교한다:
 * 개편 전 / 개편 후 v1(스냅숏) / 보강 후(이번 실행). `--known` 은 눈으로 확인한 "이미 보도함 재선정" 풀 번호로,
 * 각 열이 그 번호를 대표로 다시 골랐는지 센다. 결과는 `<스냅숏>.current.json`.
 *
 * `--repeat-check <파일>`: 재보도 검사(④-2)만 일반 호출 1회로 돌린다. 대상은 그 파일(스냅숏 또는 `.current.json`)의
 * 선정·가공 결과, 대조할 이미 보도함은 스냅숏의 것이다. `--known` 과 비교해 맞힌·놓친 재보도와, 눈으로 확인할
 * 오탐 후보(known 밖에서 걸린 기사 — 오늘 제목과 짝지은 이미 보도함 제목을 나란히)를 출력한다. 재현율·오탐 후보는
 * 코드 확인(confirmRepeats)을 통과한 판정 기준이고, 기각한 판정은 따로 출력한다. 결과는 `<파일>.repeat.json`.
 * `--db <path>` 를 주면 그 DB(readonly)에서 이미 보도함 요약을 읽어 collect 와 같은 입력(제목 — 요약 첫 문장)으로 돌린다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import Database from "better-sqlite3";
import { z } from "zod/v4";
import { CATEGORIES, CATEGORY_LABELS, FORMAT_LABELS } from "../src/lib/labels";
import { estimateCost } from "./lib/cost";
import {
  buildEnrichRequests,
  enrichFormat,
  estimateEnrichTokens,
  resolveEnrichments,
} from "./lib/enrich";
import { envString } from "./lib/env";
import {
  describeUsage,
  emptyUsage,
  formatCounts,
  importanceCounts,
  categoryCounts,
  pickRows,
  readSnapshot,
  summarizePicks,
  usageSince,
  type EvalSnapshot,
  type PickRow,
  type PickSummary,
} from "./lib/evalRun";
import { LlmRunner, parseStructured, type LlmRequest, type LlmUsage } from "./lib/llm";
import { attachReportedSummaries, runRepeatCheck, toRepeatInputs } from "./lib/repeatCheck";
import type { ArticleEnrichment } from "./lib/schema";
import {
  alreadyReportedIds,
  buildTriageRequest,
  estimateTriageTokens,
  paperSpreadNote,
  pickTargets,
  quotaOverflowNote,
  quotaShortfallNote,
  resolvePicks,
  triageFormat,
  type Candidate,
  type Pick,
  type ReportedHeadline,
} from "./lib/triage";

/** Phase 4-1 직전 커밋. */
export const DEFAULT_REV = "096de4e";
/** 개편 전 MAX_PICKS_PER_RUN 기본값. */
export const LEGACY_MAX_PICKS = 30;
/** `--current` 실행(선별 1회 + 가공 4회, 일반 호출)·`--repeat-check`(1회)의 비용 상한 기본값(USD). */
export const DEFAULT_MAX_COST = 0.12;

/**
 * 개편 전 선별 출력 스키마(already_reported 없음). 옛 프롬프트는 이 필드를 모르므로 지금 triageFormat 을 쓰면
 * 필수 필드가 비어 검증에 실패하거나, 구조화 출력이 옛 프롬프트에 없던 단계를 끼워 넣어 비교가 흐려진다.
 */
export const legacyTriageFormat = zodOutputFormat(
  z.object({
    picks: z.array(
      z.object({
        id: z.number().int(),
        importance: z.number().int().min(1).max(5),
        duplicates: z.array(z.number().int()),
      }),
    ),
  }),
);

// ── 개편 전 선별 요청 재현 ──────────────────────────────────────────────

const TITLE_CHARS = 160;
const SNIPPET_CHARS = 120;

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 개편 전 줄 형식(형식 열 없음): `번호 | 매체 | 게시일 | 화제 | 제목 | 발췌` */
export function legacyTriageLine(c: Candidate, index: number): string {
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

/** 개편 전 선별 요청 — 지시 한 줄 + 후보 줄뿐(할당·이미 보도함 없음). */
export function buildLegacyTriageRequest(
  pool: Candidate[],
  maxPicks: number,
  model: string,
  system: string,
): LlmRequest {
  const lines = pool.map(legacyTriageLine).join("\n");
  return {
    id: "triage-legacy",
    params: {
      model,
      max_tokens: 1000 + maxPicks * 60,
      system,
      messages: [
        {
          role: "user",
          content: `오늘 후보 ${pool.length}건 중 최대 ${maxPicks}건을 고르세요.\n\n${lines}`,
        },
      ],
      output_config: { format: legacyTriageFormat },
    },
  };
}

// ── 비교 집계 ──────────────────────────────────────────────────────────

export interface PickOverlap {
  /** 두 선별이 같은 번호를 대표(id)로 고른 수. */
  common: number;
  /** 개편 전 선정 중 개편 후 선정(대표 또는 묶음)에 든 수. */
  oldCoveredByNew: number;
  /** 개편 후 선정 중 개편 전 선정(대표 또는 묶음)에 든 수. */
  newCoveredByOld: number;
}

const covered = (picks: Pick[]) => new Set(picks.flatMap((p) => [p.index, ...p.duplicates]));

export function pickOverlap(oldPicks: Pick[], newPicks: Pick[]): PickOverlap {
  const newIds = new Set(newPicks.map((p) => p.index));
  const oldCover = covered(oldPicks);
  const newCover = covered(newPicks);
  return {
    common: oldPicks.filter((p) => newIds.has(p.index)).length,
    oldCoveredByNew: oldPicks.filter((p) => newCover.has(p.index)).length,
    newCoveredByOld: newPicks.filter((p) => oldCover.has(p.index)).length,
  };
}

/** 비교 표의 한 열. */
export interface CompareColumn {
  label: string;
  summary: PickSummary;
  /** 가공했는가 — 아니면 분야 기준 칸을 비운다. */
  enriched: boolean;
  /** 이미 보도함 유사(휴리스틱) 수. */
  hits: number;
}

/** 표 아래에 덧붙일 행: [항목, 열마다 값]. */
export type ExtraRow = [string, ...(string | number)[]];

/** N열 비교 표(마크다운). 가공하지 않은 열은 분야 기준 Physical AI 가 `— (미가공)`이다. */
export function columnsTable(cols: CompareColumn[], extra: ExtraRow[] = []): string {
  const row = (label: string, values: (string | number)[]) =>
    `| ${label} | ${values.join(" | ")} |`;
  const each = (f: (c: CompareColumn) => string | number) => cols.map(f);
  return [
    row(
      "항목",
      each((c) => c.label),
    ),
    `|---|${cols.map(() => "---|").join("")}`,
    row(
      "선정",
      each((c) => c.summary.total),
    ),
    ...(["news", "oss", "model", "paper"] as const).map((f) =>
      row(
        FORMAT_LABELS[f],
        each((c) => c.summary.byFormat[f]),
      ),
    ),
    row(
      "비뉴스 합계",
      each((c) => c.summary.nonNews),
    ),
    row(
      "Physical AI (소스 topic)",
      each((c) => c.summary.physicalTopic),
    ),
    row(
      "Physical AI (가공 분야)",
      each((c) => (c.enriched ? c.summary.physicalCategory : "— (미가공)")),
    ),
    row(
      "중요도 5:4:3:2:1",
      each((c) => importanceCounts(c.summary)),
    ),
    row(
      "이미 보도함 유사 (휴리스틱)",
      each((c) => c.hits),
    ),
    ...extra.map(([label, ...values]) => row(label, values)),
  ].join("\n");
}

/** 개편 전후 2열 비교 표. 개편 전은 가공하지 않아 분야 기준 Physical AI 가 없다. */
export function compareTable(
  oldS: PickSummary,
  newS: PickSummary,
  hits: { old: number; new: number },
  rev: string,
): string {
  return columnsTable([
    { label: `개편 전(${rev})`, summary: oldS, enriched: false, hits: hits.old },
    { label: "개편 후", summary: newS, enriched: true, hits: hits.new },
  ]);
}

/**
 * 할당 미달·초과 경고(collect.ts 와 같은 판정). Physical AI 는 가공 분야, 미가공이면 소스 topic 으로 센다.
 * 경고가 없으면 `-`.
 */
export function quotaWarnings(pool: Candidate[], rows: PickRow[], maxPicks: number): string {
  const mix = rows.map((r) => ({
    format: r.format,
    physical: (r.category ?? r.topic) === "physical",
  }));
  const targets = pickTargets(pool, maxPicks);
  const notes = [
    quotaShortfallNote(mix, targets),
    quotaOverflowNote(mix, targets),
    paperSpreadNote(rows),
  ].filter(Boolean);
  return notes.length > 0 ? notes.join(" / ") : "-";
}

/** 재보도 검사 결과 vs 눈으로 확인한 재보도(known): 맞힌 것·놓친 것·known 밖에서 걸린 것(오탐 후보). */
export function repeatRecall(
  flagged: number[],
  known: number[],
): { hit: number[]; missed: number[]; extra: number[] } {
  const f = new Set(flagged);
  const k = new Set(known);
  return {
    hit: known.filter((i) => f.has(i)),
    missed: known.filter((i) => !f.has(i)),
    extra: flagged.filter((i) => !k.has(i)),
  };
}

/** 알려진 이미 보도함 재선정 번호 중 대표(id)로 다시 고른 번호. */
export function knownRepeats(picks: Pick[], known: number[]): number[] {
  const ids = new Set(picks.map((p) => p.index));
  return known.filter((i) => ids.has(i));
}

// ── "이미 보도함" 유사 휴리스틱 ─────────────────────────────────────────

/** 너무 흔해 사건을 가르지 못하는 토큰. 드문 토큰 판정(df)과 함께 쓴다. */
const STOPWORDS = new Set(
  (
    "the and for with new from into how what why its are has have that this your you our now all can " +
    "will more than about after over not but out get gets via using use based open source model models " +
    "agent agents data release releases released launches launch launched announces introduces introducing unveils debuts says said " +
    "2025 2026 github hugging face paper arxiv " +
    "공개 출시 발표 모델 오픈소스 에이전트 기반 위한 개발 기술 서비스 지원 기업 시장 투자 인공지능 도입 " +
    "플랫폼 활용 강화 확대 추진 국내 글로벌 새로운 최신 대한 통해"
  ).split(" "),
);
/** 한글 토큰 끝 조사(하나만 떼어 낸다). */
const PARTICLES = /(은|는|이|가|을|를|의|에|와|과|로|도|서)$/;

/** 제목 → 비교 토큰(소문자 영숫자 3자 이상 또는 숫자 포함, 한글 2자 이상, 불용어 제외). */
export function titleTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const [raw] of text
    .toLowerCase()
    .matchAll(/[a-z0-9][a-z0-9.+-]*[a-z0-9+]|[a-z0-9]|[가-힣]+/g)) {
    let t = raw;
    if (/^[가-힣]+$/.test(t)) {
      if (t.length > 2) t = t.replace(PARTICLES, "");
      if (t.length < 2) continue;
    } else if (t.length < 3 && !/\d/.test(t)) {
      continue;
    }
    if (!STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

export interface ReportedHit {
  title: string;
  headline: string;
  shared: string[];
}

/**
 * 제목들 중 "이미 보도함" 제목과 드문 토큰을 공유하는 것(휴리스틱). 드문 토큰 = 보도 목록에서 2개 이하 제목에만
 * 나오는 토큰. 드문 토큰 2개 이상, 또는 숫자 섞인 4자 이상 토큰(모델명·버전 — 예: k3.1, gpt-5.5) 1개면 유사로 본다.
 */
export function reportedHits(titles: string[], reported: ReportedHeadline[]): ReportedHit[] {
  const headlineTokens = reported.map((r) => titleTokens(r.title));
  const df = new Map<string, number>();
  for (const set of headlineTokens) for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);

  const hits: ReportedHit[] = [];
  for (const title of titles) {
    const tokens = titleTokens(title);
    let best: ReportedHit | undefined;
    for (const [i, set] of headlineTokens.entries()) {
      const shared = [...tokens].filter((t) => set.has(t) && (df.get(t) ?? 0) <= 2);
      const strong = shared.some((t) => t.length >= 4 && /\d/.test(t) && /[a-z가-힣]/.test(t));
      if ((shared.length >= 2 || strong) && shared.length > (best?.shared.length ?? 0)) {
        best = { title, headline: reported[i].title, shared };
      }
    }
    if (best) hits.push(best);
  }
  return hits;
}

// ── CLI ─────────────────────────────────────────────────────────────────

export interface CompareArgs {
  snapshot: string;
  rev: string;
  /** 지금 작업 트리의 선별·가공을 같은 풀로 돌려 3열 비교한다. */
  current: boolean;
  /** 눈으로 확인한 이미 보도함 재선정 풀 번호(`--current` 집계용). */
  known: number[];
  /** `--current`·`--repeat-check` 비용 상한(USD, 일반 호출 기준 추정). */
  maxCost: number;
  /** 재보도 검사만 돌릴 선정·가공 결과 파일(스냅숏 또는 `.current.json`). */
  repeatCheck?: string;
  /** `--repeat-check` 전용: 이미 보도함 요약을 읽을 DB(readonly). 스냅숏의 이미 보도함에는 요약이 없다. */
  db?: string;
}

export function parseCompareArgs(argv: string[]): CompareArgs {
  let snapshot: string | undefined;
  let rev = DEFAULT_REV;
  let current = false;
  let known: number[] = [];
  let maxCost = DEFAULT_MAX_COST;
  let repeatCheck: string | undefined;
  let db: string | undefined;
  const value = (i: number, what: string) => {
    const v = argv[i];
    if (v === undefined || v.startsWith("--")) throw new Error(`${argv[i - 1]} 에 ${what}`);
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--rev") {
      rev = value(++i, "커밋이 필요합니다");
    } else if (flag === "--current") {
      current = true;
    } else if (flag === "--db") {
      db = path.resolve(value(++i, "DB 경로가 필요합니다"));
    } else if (flag === "--repeat-check") {
      repeatCheck = path.resolve(value(++i, "선정·가공 결과 파일이 필요합니다"));
    } else if (flag === "--known") {
      known = value(++i, "풀 번호 목록이 필요합니다(예: 60,130)")
        .split(",")
        .map((x) => Number(x.trim()));
      if (known.some((n) => !Number.isInteger(n) || n < 0)) {
        throw new Error("--known 은 쉼표로 구분한 0 이상 정수입니다");
      }
    } else if (flag === "--max-cost") {
      maxCost = Number(value(++i, "USD 값이 필요합니다"));
      if (!(maxCost > 0)) throw new Error("--max-cost 는 0 보다 큰 수입니다");
    } else if (flag.startsWith("--")) {
      throw new Error(`알 수 없는 옵션: ${flag}`);
    } else if (snapshot === undefined) {
      snapshot = path.resolve(flag);
    } else {
      throw new Error(`스냅숏은 하나만 받습니다: ${flag}`);
    }
  }
  if (!snapshot)
    throw new Error(
      "사용법: npm run triage:compare -- <snapshot.json> [--rev <commit>] [--current | --repeat-check <run.json> [--db <app.db>]] [--known 1,2] [--max-cost 0.12]",
    );
  if (current && repeatCheck) throw new Error("--current 와 --repeat-check 는 함께 쓸 수 없습니다");
  if (db && !repeatCheck) throw new Error("--db 는 --repeat-check 에서만 씁니다");
  return {
    snapshot,
    rev,
    current,
    known,
    maxCost,
    ...(repeatCheck ? { repeatCheck } : {}),
    ...(db ? { db } : {}),
  };
}

const compareFile = (snapshot: string, rev: string) =>
  `${snapshot.replace(/\.json$/, "")}.compare-${rev}.json`;

/** 개편 전 비교 결과 파일(main 이 쓰는 모양). */
interface LegacyCompareResult {
  rev: string;
  maxPicks: number;
  picks: Pick[];
  usage: LlmUsage;
}

/** `비용` 칸: `$실지불 / $배치 환산`. */
function costCell(usage: LlmUsage, model: string): string {
  const batch = estimateCost(usage.inputTokens, usage.outputTokens, model, { batch: true });
  return `$${usage.costUsd.toFixed(4)} / $${batch.toFixed(4)}`;
}

const sumUsage = (a: LlmUsage, b: LlmUsage): LlmUsage => ({
  calls: a.calls + b.calls,
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  costUsd: a.costUsd + b.costUsd,
});

/** `--current`: 지금 선별·가공을 같은 풀로 돌려 개편 전 / v1 / 보강 후 3열로 비교한다. */
async function runCurrent(args: CompareArgs, snap: EvalSnapshot, model: string): Promise<void> {
  const pool = snap.pool;
  const legacy = JSON.parse(
    readFileSync(compareFile(args.snapshot, args.rev), "utf-8"),
  ) as LegacyCompareResult;
  const llm = new LlmRunner({ useBatch: false, batchTimeoutMs: 0 });
  const estCost = (input: number, output: number) => estimateCost(input, output, model);

  // ① 선별 — 스냅숏과 같은 풀·이미 보도함·최대 선정 수, 지금 프롬프트·빌더.
  const triageReq = buildTriageRequest(pool, snap.maxPicks, model, { reported: snap.reported });
  const tEst = estimateTriageTokens(triageReq, snap.maxPicks);
  console.log(
    `[compare] 보강 후 선별: 풀 ${pool.length}건 · 최대 ${snap.maxPicks}건 · 이미 보도함 ${snap.reported.length}건 · ` +
      `${model} 일반 호출 · 추정 입력 ${tEst.input}토큰 $${estCost(tEst.input, tEst.output).toFixed(4)}`,
  );
  if (estCost(tEst.input, tEst.output) > args.maxCost) {
    throw new Error(`선별 추정 비용이 상한 $${args.maxCost} 를 넘습니다`);
  }
  const triageRes = (await llm.run([triageReq])).get(triageReq.id);
  const triage = parseStructured(triageRes?.message ?? null, triageFormat);
  if (!triage) throw new Error(`보강 후 선별 실패: ${triageRes?.error ?? "응답 검증 실패"}`);
  const triageUsage = { ...llm.usage };
  console.log(
    `[compare] 선별 입력 실측 ${triageUsage.inputTokens} vs 추정 ${tEst.input} ` +
      `(${((tEst.input / triageUsage.inputTokens - 1) * 100).toFixed(1)}%)`,
  );
  const picks = resolvePicks(triage, pool.length, snap.maxPicks);
  const reportedIds = [...alreadyReportedIds(triage, pool.length)];

  // ② 가공 — 지금 가공 프롬프트.
  const chunks = buildEnrichRequests(
    picks.map((p) => ({
      id: p.index,
      item: pool[p.index].item,
      sourceName: pool[p.index].sourceName,
      format: pool[p.index].format,
    })),
    model,
  );
  const eEst = chunks
    .map(estimateEnrichTokens)
    .reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output }), {
      input: 0,
      output: 0,
    });
  const spent = triageUsage.costUsd + estCost(eEst.input, eEst.output);
  if (spent > args.maxCost) {
    throw new Error(
      `선별 실지불 + 가공 추정 $${spent.toFixed(4)} 가 상한 $${args.maxCost} 를 넘습니다`,
    );
  }
  const results = await llm.run(chunks.map((c) => c.request));
  const enriched = new Map<number, ArticleEnrichment>();
  for (const chunk of chunks) {
    const parsed = parseStructured(results.get(chunk.request.id)?.message ?? null, enrichFormat);
    if (!parsed) continue;
    for (const [id, e] of resolveEnrichments(parsed, chunk.ids)) enriched.set(id, e);
  }
  const enrichUsage = usageSince(llm.usage, triageUsage);
  console.log(
    `[compare] 가공 입력 실측 ${enrichUsage.inputTokens} vs 추정 ${eEst.input} ` +
      `(${((eEst.input / enrichUsage.inputTokens - 1) * 100).toFixed(1)}%)`,
  );

  // ③ 3열 집계.
  const columns = [
    {
      label: `개편 전(${args.rev})`,
      picks: legacy.picks,
      maxPicks: legacy.maxPicks,
      enrich: {} as Record<number, ArticleEnrichment>,
      usage: { triage: legacy.usage, enrich: emptyUsage() },
      enriched: false,
      reported: "—",
    },
    {
      label: "개편 후 v1",
      picks: snap.picks,
      maxPicks: snap.maxPicks,
      enrich: snap.enrichments,
      usage: snap.usage,
      enriched: true,
      reported: snap.triage?.already_reported?.length ?? "—",
    },
    {
      label: "보강 후",
      picks,
      maxPicks: snap.maxPicks,
      enrich: Object.fromEntries(enriched) as Record<number, ArticleEnrichment>,
      usage: { triage: triageUsage, enrich: enrichUsage },
      enriched: true,
      reported: reportedIds.length,
    },
  ];
  const rows = columns.map((c) => pickRows(pool, c.picks, c.enrich));
  const summaries = rows.map(summarizePicks);
  const hits = columns.map(
    (c) =>
      reportedHits(
        c.picks.map((p) => pool[p.index].item.title),
        snap.reported,
      ).length,
  );
  const extra: ExtraRow[] = [
    ...CATEGORIES.map(
      (cat): ExtraRow => [
        `분야: ${CATEGORY_LABELS[cat]}`,
        ...columns.map((c, i) => (c.enriched ? summaries[i].byCategory[cat] : "—")),
      ],
    ),
    ["할당 경고", ...columns.map((c, i) => quotaWarnings(pool, rows[i], c.maxPicks))],
    [
      `이미 보도함 재선정 (확인된 ${args.known.length}건 중)`,
      ...columns.map((c) => {
        const again = knownRepeats(c.picks, args.known);
        return again.length > 0 ? `${again.length} (#${again.join(", #")})` : 0;
      }),
    ],
    ["already_reported 표시", ...columns.map((c) => c.reported)],
    ["비용 선별 (실지불 / 배치 환산)", ...columns.map((c) => costCell(c.usage.triage, model))],
    [
      "비용 가공 (실지불 / 배치 환산)",
      ...columns.map((c) => (c.enriched ? costCell(c.usage.enrich, model) : "—")),
    ],
    [
      "비용 합계 (실지불 / 배치 환산)",
      ...columns.map((c) => costCell(sumUsage(c.usage.triage, c.usage.enrich), model)),
    ],
  ];
  const table = columnsTable(
    columns.map((c, i) => ({
      label: c.label,
      summary: summaries[i],
      enriched: c.enriched,
      hits: hits[i],
    })),
    extra,
  );

  console.log(`\n## 보강 후 선정 ${picks.length}건 (중요도 | 형식 | 분야 | 매체 | 가공 제목)`);
  for (const p of picks) {
    const c = pool[p.index];
    const e = enriched.get(p.index);
    console.log(
      `  #${p.index} ${p.importance} | ${FORMAT_LABELS[c.format]} | ${e ? CATEGORY_LABELS[e.category] : "-"} | ` +
        `${c.sourceName} | ${e?.title_ko ?? `(미가공) ${c.item.title}`}` +
        (p.duplicates.length > 0 ? ` (+#${p.duplicates.join(", #")})` : ""),
    );
  }
  console.log(`\n## already_reported ${reportedIds.length}건`);
  for (const i of reportedIds) console.log(`  #${i} ${pool[i].item.title}`);
  console.log(`\n## 비교 (같은 풀 ${pool.length}건)\n${table}`);
  console.log(`\n## 보강 후 비뉴스 요약 (환각 점검)`);
  for (const p of picks.filter((p) => pool[p.index].format !== "news")) {
    const c = pool[p.index];
    const e = enriched.get(p.index);
    if (!e) continue;
    console.log(
      `  #${p.index} [${FORMAT_LABELS[c.format]}·${CATEGORY_LABELS[e.category]}] ${e.title_ko}\n` +
        `    입력: ${(c.item.contentRaw ?? "").replace(/\s+/g, " ").slice(0, 200)}\n    요약: ${e.summary_ko}`,
    );
  }

  const out = `${args.snapshot.replace(/\.json$/, "")}.current.json`;
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        rev: args.rev,
        maxPicks: snap.maxPicks,
        known: args.known,
        triage,
        picks,
        enrichments: Object.fromEntries(enriched),
        usage: { triage: triageUsage, enrich: enrichUsage },
        estimate: { triage: tEst, enrich: eEst },
        table,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n[compare] 결과: ${out}`);
}

/** `--repeat-check`: 기존 회차의 선정·가공 결과에 재보도 검사만 돌려 known 과 비교한다. */
async function runRepeatEval(
  args: CompareArgs,
  file: string,
  snap: EvalSnapshot,
  model: string,
): Promise<void> {
  const source = JSON.parse(readFileSync(file, "utf-8")) as {
    picks: Pick[];
    enrichments: Record<number, ArticleEnrichment>;
  };
  const enrichmentOf = (i: number) => source.enrichments[i] as ArticleEnrichment | undefined;
  const inputs = toRepeatInputs(source.picks, enrichmentOf);
  let reported = snap.reported;
  if (args.db) {
    const db = new Database(args.db, { readonly: true, fileMustExist: true });
    reported = attachReportedSummaries(db, reported);
    db.close();
  }
  const withSummary = reported.filter((r) => r.summary).length;
  console.log(
    `[compare] 재보도 검사: 가공된 선정 ${inputs.length}건 × 이미 보도함 ${reported.length}건` +
      `(요약 ${withSummary}건) · ${model} 일반 호출`,
  );
  const llm = new LlmRunner({ useBatch: false, batchTimeoutMs: 0 });
  const outcome = await runRepeatCheck(llm, inputs, reported, model, {
    remainingUsd: args.maxCost,
    batch: false,
  });
  if (outcome.status !== "ok") throw new Error(outcome.note ?? "재보도 검사를 건너뛰었습니다");

  const titleOf = (i: number) => enrichmentOf(i)?.title_ko ?? snap.pool[i]?.item.title ?? "?";
  const headline = (r: number) => {
    const h = reported[r - 1];
    return h ? `R${r} ${h.issueDate.slice(5)} ${h.title}` : `R${r} ?`;
  };
  const rc = repeatRecall(
    outcome.repeats.map((m) => m.id),
    args.known,
  );
  const known = new Set(args.known);
  console.log(`\n## 재보도 판정 ${outcome.repeats.length}건 (오늘 제목 ≈ 이미 보도함)`);
  for (const m of outcome.repeats) {
    const mark = args.known.length === 0 ? "" : known.has(m.id) ? " [known]" : " [오탐 후보]";
    console.log(
      `  #${m.id}${mark} ${titleOf(m.id)}\n    ≈ ${headline(m.reported)}  [${m.event ?? ""}]`,
    );
  }
  console.log(
    `\n## 재보도 판정 기각 ${outcome.rejected.length}건 (코드 확인: 내용어 겹침 부족 — 그대로 게재)`,
  );
  for (const m of outcome.rejected) {
    const mark = args.known.length === 0 ? "" : known.has(m.id) ? " [known]" : "";
    console.log(
      `  #${m.id}${mark} ${titleOf(m.id)}\n    ≈ ${headline(m.reported)}  [${m.event ?? ""}]` +
        ` 겹침: ${m.shared.join(", ") || "없음"}`,
    );
  }
  // 후속 보도 판정(모두 게재): 코드 확인을 통과해 follow_up_of 로 이을 짝은 [연결 #이전 보도 id], 기각은 겹친 내용어와 함께.
  const linkOf = new Map(outcome.links.map((l) => [l.id, l.articleId]));
  const followRejected = new Map(outcome.followRejected.map((m) => [m.id, m.shared]));
  console.log(
    `\n## 후속 보도 판정 ${outcome.followups.length}건 (그대로 게재 — 연결 ${outcome.links.length}건, 기각 ${outcome.followRejected.length}건)`,
  );
  for (const m of outcome.followups) {
    const shared = followRejected.get(m.id);
    const mark = linkOf.has(m.id)
      ? ` [연결 #${linkOf.get(m.id)}]`
      : shared
        ? ` [기각 — 겹침: ${shared.join(", ") || "없음"}]`
        : " [연결 안 함 — 이전 보도 id 없음]";
    console.log(
      `  #${m.id} ${titleOf(m.id)}\n    ≈ ${headline(m.reported)}  [${m.event ?? ""}]${mark}`,
    );
  }
  if (args.known.length > 0) {
    console.log(
      `\n재현율: ${rc.hit.length}/${args.known.length}` +
        (rc.missed.length > 0
          ? ` — 놓침 ${rc.missed.map((i) => `#${i} ${titleOf(i)}`).join(" / ")}`
          : ""),
    );
    console.log(`known 밖에서 걸린 기사(오탐 후보, 눈으로 확인): ${rc.extra.length}건`);
  }
  console.log(`\n${describeUsage("재보도 검사", llm.usage, model, false)}`);

  const out = `${file.replace(/\.json$/, "")}.repeat.json`;
  writeFileSync(
    out,
    `${JSON.stringify({ createdAt: new Date().toISOString(), known: args.known, ...outcome, recall: rc, usage: llm.usage }, null, 2)}\n`,
  );
  console.log(`\n[compare] 결과: ${out}`);
}

async function main(): Promise<void> {
  const args = parseCompareArgs(process.argv.slice(2));
  const snap = readSnapshot(args.snapshot);
  const model = envString("LLM_MODEL", snap.model);
  if (args.repeatCheck) return runRepeatEval(args, args.repeatCheck, snap, model);
  if (args.current) return runCurrent(args, snap, model);
  const pool = snap.pool;
  const system = execFileSync("git", ["show", `${args.rev}:configs/prompts/triage.system.md`], {
    encoding: "utf-8",
  });

  console.log(
    `[compare] 풀 ${pool.length}건 · 개편 전 ${args.rev} 최대 ${LEGACY_MAX_PICKS}건 / ` +
      `개편 후 최대 ${snap.maxPicks}건 · ${model} 일반 호출`,
  );
  const llm = new LlmRunner({ useBatch: false, batchTimeoutMs: 0 });
  const req = buildLegacyTriageRequest(pool, LEGACY_MAX_PICKS, model, system);
  const res = (await llm.run([req])).get(req.id);
  const triage = parseStructured(res?.message ?? null, legacyTriageFormat);
  if (!triage) throw new Error(`개편 전 선별 실패: ${res?.error ?? "응답 검증 실패"}`);
  const oldPicks = resolvePicks(triage, pool.length, LEGACY_MAX_PICKS);

  const newPicks = snap.picks;
  const enriched = snap.enrichments;
  const oldS = summarizePicks(pickRows(pool, oldPicks));
  const newS = summarizePicks(pickRows(pool, newPicks, enriched));
  const oldHits = reportedHits(
    oldPicks.map((p) => pool[p.index].item.title),
    snap.reported,
  );
  const newHits = reportedHits(
    newPicks.map((p) => pool[p.index].item.title),
    snap.reported,
  );

  console.log(`\n## 개편 전 선정 ${oldPicks.length}건 (중요도 | 형식 | topic | 매체 | 원제목)`);
  for (const p of oldPicks) {
    const c = pool[p.index];
    console.log(
      `  ${p.importance} | ${FORMAT_LABELS[c.format]} | ${c.topic ?? "-"} | ${c.sourceName} | ${c.item.title}`,
    );
  }

  console.log(`\n## 비교 (같은 풀 ${pool.length}건)`);
  console.log(compareTable(oldS, newS, { old: oldHits.length, new: newHits.length }, args.rev));
  console.log(`\n개편 전 형식별: ${formatCounts(oldS)}`);
  console.log(`개편 후 형식별: ${formatCounts(newS)}`);
  console.log(`개편 후 분야별(가공): ${categoryCounts(newS)}`);
  const ov = pickOverlap(oldPicks, newPicks);
  console.log(
    `겹침: 같은 대표 ${ov.common}건 · 개편 전 선정 중 개편 후에 포함(대표·묶음) ${ov.oldCoveredByNew}/${oldPicks.length} · ` +
      `개편 후 선정 중 개편 전에 포함 ${ov.newCoveredByOld}/${newPicks.length}`,
  );

  for (const [label, hits] of [
    ["개편 전", oldHits],
    ["개편 후", newHits],
  ] as const) {
    console.log(
      `\n## 이미 보도함 유사 — ${label} ${hits.length}건 (휴리스틱: 드문 토큰 공유, 눈으로 확인)`,
    );
    for (const h of hits)
      console.log(`  ${h.title}\n    ≈ ${h.headline}  [${h.shared.join(", ")}]`);
  }

  console.log(`\n## 비용`);
  console.log(describeUsage(`개편 전 선별(${args.rev})`, llm.usage, model, false));
  console.log(describeUsage("개편 후 선별(스냅숏)", snap.usage.triage, snap.model, snap.useBatch));
  console.log(describeUsage("개편 후 가공(스냅숏)", snap.usage.enrich, snap.model, snap.useBatch));

  const out = compareFile(args.snapshot, args.rev);
  writeFileSync(
    out,
    `${JSON.stringify({ rev: args.rev, maxPicks: LEGACY_MAX_PICKS, triage, picks: oldPicks, usage: llm.usage }, null, 2)}\n`,
  );
  console.log(`\n[compare] 결과: ${out}`);
}

// tsx 로 직접 실행될 때만 동작. SDK 소켓이 이벤트 루프를 붙잡지 않도록 명시적으로 종료한다.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit())
    .catch((err) => {
      console.error(`[compare] ${(err as Error).message}`);
      process.exit(1);
    });
}
