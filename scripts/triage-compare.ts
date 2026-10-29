/**
 * 개편 전후 선별 비교 (계획 Phase 4-3). DB 를 열지 않는다.
 * 실행: npm run triage:compare -- data/eval/run-<시각>.json [--rev 096de4e]
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
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { FORMAT_LABELS } from "../src/lib/labels";
import { envString } from "./lib/env";
import {
  describeUsage,
  formatCounts,
  importanceCounts,
  categoryCounts,
  pickRows,
  readSnapshot,
  summarizePicks,
  type PickSummary,
} from "./lib/evalRun";
import { LlmRunner, parseStructured, type LlmRequest } from "./lib/llm";
import {
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
      output_config: { format: triageFormat },
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

/** 비교 표(마크다운). 개편 전은 가공하지 않아 분야 기준 Physical AI 가 없다. */
export function compareTable(
  oldS: PickSummary,
  newS: PickSummary,
  hits: { old: number; new: number },
  rev: string,
): string {
  const row = (label: string, a: string | number, b: string | number) =>
    `| ${label} | ${a} | ${b} |`;
  const fmt = (s: PickSummary, f: keyof PickSummary["byFormat"]) => s.byFormat[f];
  return [
    `| 항목 | 개편 전(${rev}) | 개편 후 |`,
    "|---|---|---|",
    row("선정", oldS.total, newS.total),
    ...(["news", "oss", "model", "paper"] as const).map((f) =>
      row(FORMAT_LABELS[f], fmt(oldS, f), fmt(newS, f)),
    ),
    row("비뉴스 합계", oldS.nonNews, newS.nonNews),
    row("Physical AI (소스 topic)", oldS.physicalTopic, newS.physicalTopic),
    row("Physical AI (가공 분야)", "— (미가공)", newS.physicalCategory),
    row("중요도 5:4:3:2:1", importanceCounts(oldS), importanceCounts(newS)),
    row("이미 보도함 유사 (휴리스틱)", hits.old, hits.new),
  ].join("\n");
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
}

export function parseCompareArgs(argv: string[]): CompareArgs {
  let snapshot: string | undefined;
  let rev = DEFAULT_REV;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--rev") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error("--rev 에 커밋이 필요합니다");
      rev = v;
    } else if (flag.startsWith("--")) {
      throw new Error(`알 수 없는 옵션: ${flag}`);
    } else if (snapshot === undefined) {
      snapshot = path.resolve(flag);
    } else {
      throw new Error(`스냅숏은 하나만 받습니다: ${flag}`);
    }
  }
  if (!snapshot)
    throw new Error("사용법: npm run triage:compare -- <snapshot.json> [--rev <commit>]");
  return { snapshot, rev };
}

async function main(): Promise<void> {
  const args = parseCompareArgs(process.argv.slice(2));
  const snap = readSnapshot(args.snapshot);
  const model = envString("LLM_MODEL", snap.model);
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
  const triage = parseStructured(res?.message ?? null, triageFormat);
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

  const out = `${args.snapshot.replace(/\.json$/, "")}.compare-${args.rev}.json`;
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
