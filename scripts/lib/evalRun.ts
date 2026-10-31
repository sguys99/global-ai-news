/**
 * DB 에 쓰지 않는 수집 실행(`--dry-run`·`--no-save`)과 개편 전후 선별 비교(scripts/triage-compare.ts)의 공통 부품.
 *
 * - CLI 인자: `--db <path>` 는 dry-run·no-save 에서만 받는다. 실제 수집이 다른 DB 를 가리키는 사고를 막는다.
 * - 스냅숏: no-save 회차의 선별 풀·이미 보도함·선별 원출력·선정·가공·토큰을 data/eval/ 에 JSON 으로 남긴다
 *   (gitignore). triage-compare 가 같은 풀로 개편 전 선별을 다시 돌린다.
 * - 집계: 선정의 형식·분야·Physical AI·중요도 분포와 비용(실지불·배치 환산) 표기.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FORMAT_LABELS,
  FORMATS,
  type Category,
  type Format,
} from "../../src/lib/labels";
import { EVAL_DIR } from "../../src/lib/paths";
import type { ResolvedBriefLine } from "./brief";
import { estimateCost } from "./cost";
import type { LlmUsage } from "./llm";
import type { FollowUpLink, RejectedRepeat, RepeatMatch } from "./repeatCheck";
import type { ArticleEnrichment } from "./schema";
import type { Candidate, Pick, ReportedHeadline, TriageOutput } from "./triage";

// ── CLI ─────────────────────────────────────────────────────────────────

export interface CollectArgs {
  /** 수집·선별 풀까지만(LLM·DB 쓰기 없음). */
  dryRun: boolean;
  /** 선별·가공까지 실제로 돌리되 DB 에 쓰지 않는다(결과는 스냅숏). */
  noSave: boolean;
  /** readonly 로 열 DB 경로 override(dry-run·no-save 전용). 없으면 data/app.db. */
  db?: string;
}

/**
 * collect.ts 인자. 모르는 옵션은 오류로 막는다 — `--no-sav` 같은 오타가 실제 수집(DB 쓰기)으로
 * 흘러가지 않게 한다.
 */
export function parseCollectArgs(argv: string[]): CollectArgs {
  const args: CollectArgs = { dryRun: false, noSave: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--no-save":
        args.noSave = true;
        break;
      case "--db": {
        const v = argv[++i];
        if (v === undefined || v.startsWith("--")) throw new Error("--db 에 경로가 필요합니다");
        args.db = path.resolve(v);
        break;
      }
      default:
        throw new Error(`알 수 없는 옵션: ${flag}`);
    }
  }
  if (args.dryRun && args.noSave) {
    throw new Error("--dry-run 과 --no-save 는 함께 쓸 수 없습니다");
  }
  if (args.db !== undefined && !args.dryRun && !args.noSave) {
    throw new Error(
      "--db 는 --dry-run·--no-save 에서만 쓸 수 있습니다(실제 수집은 data/app.db 고정)",
    );
  }
  return args;
}

// ── 스냅숏 ──────────────────────────────────────────────────────────────

/** no-save 회차 1건의 기록. pool 번호(Pick.index)가 모든 필드의 공통 키다. */
export interface EvalSnapshot {
  createdAt: string;
  model: string;
  maxPicks: number;
  poolSize: number;
  /** 실제 호출 방식(실지불 단가 판정용). */
  useBatch: boolean;
  /** 읽은 DB 경로. */
  db: string;
  /** 수집 후보 수(풀에 들기 전). */
  candidates: number;
  pool: Candidate[];
  reported: ReportedHeadline[];
  /** 선별 원출력(resolvePicks 이전). 선별 실패면 null. already_reported 가 생기기 전 스냅숏에는 그 필드가 없다. */
  triage: TriageOutput | null;
  picks: Pick[];
  /** 풀 번호 → 가공 결과. picks·enrichments 는 재보도 검사 전 값이다(게재 = 여기서 repeatCheck.repeats 를 뺀 것). */
  enrichments: Record<number, ArticleEnrichment>;
  /**
   * 재보도 검사 결과(검사를 건너뛰었거나 이 단계가 생기기 전 스냅숏이면 없음). repeats 는 코드 확인을 통과한 판정,
   * rejected 는 기각한 판정이다 — rejected·rejectNote 는 코드 확인이 생기기 전 스냅숏에 없다(그때 repeats 는 모델 판정 그대로).
   * links·followRejected 는 후속 보도 연결(코드 확인을 통과한 후속 판정 / 기각한 후속 판정)로, 그 전 스냅숏에 없다.
   */
  repeatCheck?: {
    status: "skipped" | "ok" | "failed";
    repeats: RepeatMatch[];
    followups: RepeatMatch[];
    rejected?: RejectedRepeat[];
    links?: FollowUpLink[];
    followRejected?: RejectedRepeat[];
    note: string | null;
    rejectNote?: string | null;
  } | null;
  /** 세 줄 요약 중 게재분에 맞춰 남은 줄(풀 번호). 원출력은 triage.brief. 이 단계가 생기기 전 스냅숏에는 없다. */
  brief?: ResolvedBriefLine[];
  /** repeat 는 재보도 검사가 생기기 전 스냅숏에 없다. */
  usage: { triage: LlmUsage; enrich: LlmUsage; repeat?: LlmUsage };
  notes: string[];
}

/** data/eval/run-<시각>.json. 시각의 `:`·`.` 은 파일명에 쓸 수 있게 `-` 로 바꾼다. */
export function snapshotPath(createdAt: string, dir: string = EVAL_DIR): string {
  return path.join(dir, `run-${createdAt.replace(/[:.]/g, "-")}.json`);
}

export function writeSnapshot(file: string, snapshot: EvalSnapshot): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export function readSnapshot(file: string): EvalSnapshot {
  return JSON.parse(readFileSync(file, "utf-8")) as EvalSnapshot;
}

// ── 비용 ────────────────────────────────────────────────────────────────

export const emptyUsage = (): LlmUsage => ({
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
});

/** 누적 usage 에서 앞 단계 몫을 뺀 나머지(= 뒤 단계). */
export function usageSince(total: LlmUsage, before: LlmUsage): LlmUsage {
  return {
    calls: total.calls - before.calls,
    inputTokens: total.inputTokens - before.inputTokens,
    outputTokens: total.outputTokens - before.outputTokens,
    costUsd: total.costUsd - before.costUsd,
  };
}

/** `선별: 1회, 입력 16,000·출력 900토큰, 실지불 $0.0205(direct), 배치 환산 $0.0103` */
export function describeUsage(
  label: string,
  usage: LlmUsage,
  model: string,
  paidBatch: boolean,
): string {
  const batchCost = estimateCost(usage.inputTokens, usage.outputTokens, model, { batch: true });
  return (
    `${label}: ${usage.calls}회, 입력 ${usage.inputTokens.toLocaleString("en-US")}·` +
    `출력 ${usage.outputTokens.toLocaleString("en-US")}토큰, ` +
    `실지불 $${usage.costUsd.toFixed(4)}(${paidBatch ? "batch" : "direct"}), 배치 환산 $${batchCost.toFixed(4)}`
  );
}

// ── 선정 집계 ───────────────────────────────────────────────────────────

/** 집계용 선정 1건. category 는 가공 분야(미가공·개편 전 선별이면 없음). */
export interface PickRow {
  importance: number;
  format: Format;
  /** 소스 주력 분야(sources.json topic). */
  topic?: Category;
  category?: Category;
}

export interface PickSummary {
  total: number;
  byFormat: Record<Format, number>;
  nonNews: number;
  /** 가공 분야별. 가공 결과가 없는 선정은 세지 않는다. */
  byCategory: Record<Category, number>;
  /** Physical AI — 가공 분야 기준(category === physical). */
  physicalCategory: number;
  /** Physical AI — 소스 topic 기준. */
  physicalTopic: number;
  /** 중요도 1~5 → 건수. */
  importance: Record<1 | 2 | 3 | 4 | 5, number>;
}

const zeros = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export function summarizePicks(rows: PickRow[]): PickSummary {
  const byFormat = zeros(FORMATS);
  const byCategory = zeros(CATEGORIES);
  const importance = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) {
    byFormat[r.format] += 1;
    if (r.category) byCategory[r.category] += 1;
    const level = Math.min(5, Math.max(1, Math.round(r.importance))) as keyof typeof importance;
    importance[level] += 1;
  }
  return {
    total: rows.length,
    byFormat,
    nonNews: rows.length - byFormat.news,
    byCategory,
    physicalCategory: rows.filter((r) => r.category === "physical").length,
    physicalTopic: rows.filter((r) => r.topic === "physical").length,
    importance,
  };
}

/** 선정 → 집계 행. 가공 결과가 있으면 분야를 붙인다. */
export function pickRows(
  pool: Candidate[],
  picks: Pick[],
  enrichments: Record<number, ArticleEnrichment> | Map<number, ArticleEnrichment> = {},
): PickRow[] {
  const get = (i: number) =>
    enrichments instanceof Map
      ? enrichments.get(i)
      : (enrichments[i] as ArticleEnrichment | undefined);
  return picks.map((p) => ({
    importance: p.importance,
    format: pool[p.index].format,
    topic: pool[p.index].topic,
    category: get(p.index)?.category,
  }));
}

/** `뉴스 25, 오픈소스 4, 모델 2, 논문 4` */
export function formatCounts(s: PickSummary): string {
  return FORMATS.map((f) => `${FORMAT_LABELS[f]} ${s.byFormat[f]}`).join(", ");
}

/** `LLM 6, 에이전트 5, …` (가공된 선정만) */
export function categoryCounts(s: PickSummary): string {
  return CATEGORIES.map((c) => `${CATEGORY_LABELS[c]} ${s.byCategory[c]}`).join(", ");
}

/** `5:2 4:9 3:15 2:4 1:0` */
export function importanceCounts(s: PickSummary): string {
  return ([5, 4, 3, 2, 1] as const).map((n) => `${n}:${s.importance[n]}`).join(" ");
}
