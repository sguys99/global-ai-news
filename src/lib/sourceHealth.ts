/**
 * 소스 헬스 판정(docs/contents-upgrade-plan.md Phase 8 "소스 헬스 패널") — 순수 함수, DB·파일 접근 없음.
 * 로컬 admin(src/lib/db.ts `getSourceHealth` → SourceHealthPanel)과 `npm run kpi`·collect.yml 요약
 * (scripts/kpi.ts → scripts/lib/healthReport.ts)이 같은 판정을 쓴다. scripts/ 는 이 파일을 상대 경로로 import 한다.
 *
 * 재료는 collection_runs.notes 의 소스별 결과 줄(scripts/collect.ts `collectCandidates`):
 *   `id: 20건(신규 6)` · `id: 50건(신규 40, 상한 10)` · `id: 25건(신규 0, 키워드 제외 25)` · `id: 실패 Status code 403`
 * 회차마다 한 줄씩이라, 최근 회차부터 거슬러 같은 결과가 몇 번 이어졌는지(연속 횟수)로 판정한다.
 *
 * 회차 결과(RunOutcome):
 * - yield    신규 1건 이상(정상 수확)
 * - stale    항목은 받았지만 전부 이미 본 글(신규 0) — 피드는 살아 있다
 * - empty    0건 — 피드가 빈 목록을 돌려줬다(주소 변경·검색어 고갈 의심)
 * - filtered 받은 항목이 키워드 사전 필터(`keywordFilter`)로 전부 제외됐다
 * - failed   fetch 실패(403·타임아웃·파싱 오류 등) — 메시지는 notes 에 남는다
 *
 * 판정(SOURCE_HEALTH_RULES, 위가 우선):
 * - error   연속 실패 ≥ 2회. 수집은 하루 1회라 한 번 실패는 일시 장애일 수 있지만(기준선 14회 중
 *           etnews_ai 3회·hnrss_frontpage 2회가 띄엄띄엄 `fetch failed`), 이틀 연속이면 그 소스 기사가
 *           이틀째 끊긴 것이고 403처럼 고쳐야 풀리는 실패가 대부분이다(industrial_ai·it_can_think 는 14회 내내 403).
 * - warn    연속 무수확(신규 0, 실패 포함) ≥ 3회 — 계획서의 "3회 연속 0건"(0건·키워드 제외·실패가 한 번이라도
 *           섞이면 이 기준). 단 무수확이 전부 stale
 *           (피드는 응답하는데 새 글만 없음)이면 ≥ 7회(일주일)로 늦춘다. DeepMind·Google AI 블로그처럼
 *           주 1~2회 쓰는 소스가 늘 경고로 뜨지 않게 하되, 일주일 넘게 새 글이 없으면 옛 피드에 고정됐는지 본다.
 * - watch   가장 최근 회차만 실패(연속 1회) — 다음 회차도 실패하면 error 가 된다.
 * - unknown 창 안 회차에 이 소스 줄이 없다(새로 추가돼 아직 수집 전).
 * - ok      그 밖.
 * 비활성(`enabled=0`) 소스는 판정하지 않는다(개수만 센다).
 */

/** notes 한 줄에서 읽은 소스별 결과. */
export interface SourceRunResult {
  /** 가져온 항목 수(실패면 null). */
  fetched: number | null;
  /** 신규(dedup 통과) 수 — 소스별 상한 적용 전. */
  fresh: number;
  /** 키워드 사전 필터로 버린 수(없으면 0). */
  dropped: number;
  /** 실패 사유(성공이면 null). */
  error: string | null;
}

export type RunOutcome = "yield" | "stale" | "empty" | "filtered" | "failed";

export type HealthLevel = "error" | "warn" | "watch" | "unknown" | "ok";

export type DryOutcome = Exclude<RunOutcome, "yield">;

/** 연속 무수확 구간의 원인 — 구간 안 결과가 한 종류면 그 종류, 섞였으면 mixed. */
export type DryCause = DryOutcome | "mixed";

export const SOURCE_HEALTH_RULES = {
  /** 연속 실패 이 횟수 이상 → error. */
  failStreak: 2,
  /** 연속 무수확(신규 0, 실패 포함) 이 횟수 이상 → warn. */
  dryStreak: 3,
  /** 무수확이 전부 stale(피드 응답·새 글 없음)일 때의 warn 기준 — 일주일. */
  staleStreak: 7,
  /** 판정에 읽는 최근 회차 수(연속 횟수·마지막 수확일의 상한). */
  windowRuns: 30,
  /** 표시용 최근 회차 띠 길이(2주). */
  stripRuns: 14,
} as const;

/** 판정 규칙 한 줄 — admin 패널·kpi/CI 요약 공용. */
export function healthRulesText(): string {
  const r = SOURCE_HEALTH_RULES;
  return `연속 실패 ${r.failStreak}회 이상 = 오류 · 연속 신규 0건 ${r.dryStreak}회 이상 = 경고(새 글만 없는 경우는 ${r.staleStreak}회) · 최근 1회 실패 = 주의`;
}

export const HEALTH_LEVELS: readonly HealthLevel[] = ["error", "warn", "watch", "unknown", "ok"];

export const HEALTH_LEVEL_LABELS: Record<HealthLevel, string> = {
  error: "오류",
  warn: "경고",
  watch: "주의",
  unknown: "기록 없음",
  ok: "정상",
};

export const RUN_OUTCOME_LABELS: Record<RunOutcome, string> = {
  yield: "신규 있음",
  stale: "새 글 없음",
  empty: "0건",
  filtered: "키워드로 전부 제외",
  failed: "수집 실패",
};

const OK_LINE = /^([a-z0-9_]+): (\d+)건\(신규 (\d+)(?:, 상한 \d+)?(?:, 키워드 제외 (\d+))?\)$/;
const FAIL_LINE = /^([a-z0-9_]+): 실패 ([\s\S]*)$/; // 오류 메시지에 줄바꿈이 섞일 수 있다

/**
 * notes 문자열 → 소스 id 별 결과. collect.ts 는 notes 를 `"; "` 로 잇는다.
 * 소스 줄이 아닌 것(선별 풀·선정·비용·경고)은 건너뛴다.
 */
export function parseSourceResults(notes: string | null): Map<string, SourceRunResult> {
  const out = new Map<string, SourceRunResult>();
  if (!notes) return out;
  for (const raw of notes.split("; ")) {
    const part = raw.trim();
    const ok = OK_LINE.exec(part);
    if (ok) {
      out.set(ok[1], {
        fetched: Number(ok[2]),
        fresh: Number(ok[3]),
        dropped: ok[4] ? Number(ok[4]) : 0,
        error: null,
      });
      continue;
    }
    const fail = FAIL_LINE.exec(part);
    if (fail) out.set(fail[1], { fetched: null, fresh: 0, dropped: 0, error: fail[2].trim() });
  }
  return out;
}

export function runOutcome(r: SourceRunResult): RunOutcome {
  if (r.error !== null || r.fetched === null) return "failed";
  if (r.fresh > 0) return "yield";
  if (r.fetched === 0) return "empty";
  if (r.dropped >= r.fetched) return "filtered";
  return "stale";
}

/** 실패 메시지 발췌 — 한 줄로 접고 `max` 자에서 자른다. */
export function errorExcerpt(message: string, max = 80): string {
  const line = message.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export interface HealthSourceInput {
  id: string;
  name: string;
  enabled: number | boolean;
}

export interface HealthRunInput {
  id: number;
  /** collection_runs.started_at (ISO, UTC). */
  startedAt: string;
  notes: string | null;
}

export interface SourceHealth {
  id: string;
  name: string;
  level: HealthLevel;
  /** 한 줄 판정 사유(사람이 읽는 문구). */
  reason: string;
  /** 가장 최근 회차부터 이어진 실패 횟수. */
  failStreak: number;
  /** 가장 최근 회차부터 이어진 무수확(신규 0, 실패 포함) 횟수. */
  dryStreak: number;
  /** 무수확 구간의 원인(dryStreak = 0 이면 null). */
  dryCause: DryCause | null;
  /** 무수확 구간의 결과별 횟수. */
  dryBreakdown: Partial<Record<DryOutcome, number>>;
  /** 가장 최근 회차 결과(창 안에 줄이 없으면 null). */
  latest: (SourceRunResult & { outcome: RunOutcome; at: string }) | null;
  /** 창 안 마지막 실패 사유·시각. */
  lastError: { message: string; at: string } | null;
  /** 창 안 마지막 수확(신규 ≥ 1) 시각·신규 수. 창 안에 없으면 null. */
  lastYield: { at: string; fresh: number } | null;
  /** 최근 `stripRuns` 회차 결과(오래된 → 최신, 회차 칸 정렬 — 그 회차에 줄이 없으면 null). */
  strip: (RunOutcome | null)[];
  /** 창 안에서 이 소스 줄이 있는 회차 수. */
  runsSeen: number;
}

export interface SourceHealthReport {
  /** 판정에 쓴 회차 수(소스 줄이 하나도 없는 회차는 뺀다). */
  runs: number;
  /** 가장 최근 회차 시각(회차가 없으면 null). */
  latestRunAt: string | null;
  /** 띠 칸에 대응하는 회차 시각(오래된 → 최신). */
  stripRunAt: string[];
  /** 활성 소스 판정 — 심각도 → 연속 횟수 → id 순. */
  sources: SourceHealth[];
  counts: Record<HealthLevel, number>;
  /** 판정에서 뺀 비활성 소스 수. */
  disabled: number;
}

const LEVEL_RANK: Record<HealthLevel, number> = { error: 0, warn: 1, watch: 2, unknown: 3, ok: 4 };

/** 무수확 구간 구성 → "0건 7 · 새 글 없음 5"(많은 순). */
function breakdownText(breakdown: Partial<Record<DryOutcome, number>>): string {
  return (Object.entries(breakdown) as [DryOutcome, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([o, n]) => `${RUN_OUTCOME_LABELS[o]} ${n}`)
    .join(" · ");
}

/** 무수확 구간 원인 문구. `streak` 은 표시용 횟수("3" 또는 창을 넘긴 "30+"). */
function dryReason(
  streak: string,
  cause: DryCause,
  breakdown: Partial<Record<DryOutcome, number>>,
): string {
  switch (cause) {
    case "empty":
      return `${streak}회 연속 0건 — 피드가 빈 목록을 돌려준다`;
    case "filtered":
      return `${streak}회 연속 키워드 필터로 전부 제외`;
    case "stale":
      return `${streak}회 연속 새 글 없음 — 피드는 응답한다`;
    case "failed":
      return `${streak}회 연속 수집 실패`;
    case "mixed":
      return `${streak}회 연속 신규 0건 — ${breakdownText(breakdown)}`;
  }
}

function assessOne(
  source: HealthSourceInput,
  runs: { at: string; results: Map<string, SourceRunResult> }[],
  stripRuns: number,
  truncated: boolean,
): SourceHealth {
  // runs 는 최신 → 오래된 순.
  const seen = runs
    .map((r) => ({ at: r.at, result: r.results.get(source.id) }))
    .filter((r): r is { at: string; result: SourceRunResult } => r.result !== undefined)
    .map((r) => ({ ...r, outcome: runOutcome(r.result) }));

  const strip = runs
    .slice(0, stripRuns)
    .map((r) => {
      const result = r.results.get(source.id);
      return result ? runOutcome(result) : null;
    })
    .reverse();

  const base = {
    id: source.id,
    name: source.name,
    strip,
    runsSeen: seen.length,
  };

  if (seen.length === 0) {
    return {
      ...base,
      level: "unknown",
      reason: "최근 회차에 기록 없음 — 다음 수집부터 판정",
      failStreak: 0,
      dryStreak: 0,
      dryCause: null,
      dryBreakdown: {},
      latest: null,
      lastError: null,
      lastYield: null,
    };
  }

  let failStreak = 0;
  while (failStreak < seen.length && seen[failStreak].outcome === "failed") failStreak++;
  let dryStreak = 0;
  while (dryStreak < seen.length && seen[dryStreak].outcome !== "yield") dryStreak++;

  const dryBreakdown: Partial<Record<DryOutcome, number>> = {};
  for (const r of seen.slice(0, dryStreak)) {
    const o = r.outcome as DryOutcome;
    dryBreakdown[o] = (dryBreakdown[o] ?? 0) + 1;
  }
  const dryKinds = Object.keys(dryBreakdown) as DryOutcome[];
  const dryCause: DryCause | null =
    dryStreak === 0 ? null : dryKinds.length === 1 ? dryKinds[0] : "mixed";

  const lastFail = seen.find((r) => r.outcome === "failed");
  const lastYieldRun = seen.find((r) => r.outcome === "yield");
  const head = seen[0];
  const lastError = lastFail ? { message: lastFail.result.error ?? "", at: lastFail.at } : null;
  // 창(windowRuns) 밖에도 회차가 있는데 연속이 창 끝까지 이어지면 실제로는 더 길다 → "30+".
  const count = (n: number) => `${n}${truncated && n === seen.length ? "+" : ""}`;

  let level: HealthLevel = "ok";
  let reason = "정상 수확";
  const staleOnly = dryCause === "stale";
  if (failStreak >= SOURCE_HEALTH_RULES.failStreak) {
    level = "error";
    reason = `${count(failStreak)}회 연속 수집 실패`;
  } else if (
    dryCause !== null &&
    dryStreak >= (staleOnly ? SOURCE_HEALTH_RULES.staleStreak : SOURCE_HEALTH_RULES.dryStreak)
  ) {
    level = "warn";
    reason = dryReason(count(dryStreak), dryCause, dryBreakdown);
  } else if (failStreak === 1) {
    level = "watch";
    reason = "최근 회차 수집 실패 — 다음 회차도 실패하면 오류";
  } else if (dryCause !== null) {
    reason =
      dryCause === "mixed"
        ? `${dryStreak}회 연속 신규 0건`
        : `${dryStreak}회 연속 ${RUN_OUTCOME_LABELS[dryCause]}`;
  }

  return {
    ...base,
    level,
    reason,
    failStreak,
    dryStreak,
    dryCause,
    dryBreakdown,
    latest: { ...head.result, outcome: head.outcome, at: head.at },
    lastError,
    lastYield: lastYieldRun ? { at: lastYieldRun.at, fresh: lastYieldRun.result.fresh } : null,
  };
}

/**
 * 활성 소스마다 최근 회차 notes 로 헬스를 판정한다. `runs` 는 순서 무관(시각으로 정렬),
 * 소스 줄이 하나도 없는 회차(수집 전에 끝난 회차 등)는 뺀 뒤 최근 `windowRuns` 회만 쓴다.
 */
export function assessSourceHealth(
  sources: HealthSourceInput[],
  runs: HealthRunInput[],
  opts: { windowRuns?: number; stripRuns?: number } = {},
): SourceHealthReport {
  const windowRuns = opts.windowRuns ?? SOURCE_HEALTH_RULES.windowRuns;
  const stripRuns = opts.stripRuns ?? SOURCE_HEALTH_RULES.stripRuns;
  const all = [...runs]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((r) => ({ at: r.startedAt, results: parseSourceResults(r.notes) }))
    .filter((r) => r.results.size > 0);
  const parsed = all.slice(0, windowRuns);
  const truncated = all.length > parsed.length;

  const active = sources.filter((s) => Boolean(s.enabled));
  const list = active
    .map((s) => assessOne(s, parsed, stripRuns, truncated))
    .sort(
      (a, b) =>
        LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
        b.failStreak - a.failStreak ||
        b.dryStreak - a.dryStreak ||
        a.id.localeCompare(b.id),
    );

  const counts = Object.fromEntries(HEALTH_LEVELS.map((l) => [l, 0])) as Record<
    HealthLevel,
    number
  >;
  for (const s of list) counts[s.level]++;

  return {
    runs: parsed.length,
    latestRunAt: parsed[0]?.at ?? null,
    stripRunAt: parsed
      .slice(0, stripRuns)
      .map((r) => r.at)
      .reverse(),
    sources: list,
    counts,
    disabled: sources.length - active.length,
  };
}

/** 조치가 필요할 수 있는 소스(오류·경고·주의). 기록 없음은 판정 전이라 따로 한 줄로 보인다. */
export function flaggedSources(report: SourceHealthReport): SourceHealth[] {
  return report.sources.filter(
    (s) => s.level === "error" || s.level === "warn" || s.level === "watch",
  );
}

/** 아직 회차 기록이 없는 소스(새로 추가). */
export function pendingSources(report: SourceHealthReport): SourceHealth[] {
  return report.sources.filter((s) => s.level === "unknown");
}
