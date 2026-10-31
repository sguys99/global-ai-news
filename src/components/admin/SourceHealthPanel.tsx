import { formatShortDate, shortSourceName } from "@/lib/labels";
import {
  HEALTH_LEVEL_LABELS,
  HEALTH_LEVELS,
  RUN_OUTCOME_LABELS,
  errorExcerpt,
  flaggedSources,
  healthRulesText,
  pendingSources,
  type HealthLevel,
  type RunOutcome,
  type SourceHealth,
  type SourceHealthReport,
} from "@/lib/sourceHealth";
import { cn } from "@/lib/utils";

/**
 * 소스 헬스 패널(contents-upgrade-plan Phase 8). 판정은 src/lib/sourceHealth.ts — `npm run kpi -- health`·
 * collect.yml 요약과 같은 결과다. 서버 컴포넌트(상호작용 없음, 정상 소스 목록은 네이티브 <details>).
 * DESIGN.md: 카드 박스 없이 헤어라인으로 행을 나누고, 색은 잉크 + 오류만 destructive(임계 초과).
 * 최근 회차 띠는 막대 높이로 수확을 읽는다 — 신규 있음 = 잉크 기둥, 실패 = destructive 기둥, 신규 0 = 낮은 흐림 막대.
 */

const LEVEL_TONE: Record<HealthLevel, string> = {
  error: "text-destructive",
  warn: "text-foreground",
  watch: "text-foreground-soft",
  unknown: "text-muted-foreground",
  ok: "text-muted-foreground",
};

const BAR_STYLE: Record<RunOutcome, string> = {
  yield: "h-4 bg-foreground",
  failed: "h-4 bg-destructive",
  stale: "h-2 bg-muted-foreground/60",
  filtered: "h-2 border border-muted-foreground/80",
  empty: "h-0.5 bg-muted-foreground",
};

/** 최근 회차 띠(오래된 → 최신). 기록 없는 회차는 빈 칸. */
function OutcomeStrip({ strip, runAt }: { strip: (RunOutcome | null)[]; runAt: string[] }) {
  const tally = new Map<string, number>();
  for (const o of strip) {
    const label = o ? RUN_OUTCOME_LABELS[o] : "기록 없음";
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  const summary = [...tally].map(([label, n]) => `${label} ${n}`).join(" · ");
  return (
    <span
      role="img"
      aria-label={`최근 ${strip.length}회: ${summary}`}
      className="inline-flex h-4 shrink-0 items-end gap-[3px]"
    >
      {strip.map((o, i) => (
        <i
          key={runAt[i] ?? i}
          title={`${formatShortDate(runAt[i] ?? "")} ${o ? RUN_OUTCOME_LABELS[o] : "기록 없음"}`}
          className={cn("w-1.5 shrink-0", o ? BAR_STYLE[o] : "h-px")}
        />
      ))}
    </span>
  );
}

function LastYield({ s }: { s: SourceHealth }) {
  if (!s.lastYield) return <span className="text-muted-foreground">창 안에 없음</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="font-serif font-bold tabular-nums">{formatShortDate(s.lastYield.at)}</span>
      <span className="text-muted-foreground"> · {s.lastYield.fresh}건</span>
    </span>
  );
}

function FlaggedRow({ s, runAt }: { s: SourceHealth; runAt: string[] }) {
  const short = shortSourceName(s.name);
  // 마지막 오류가 지금 연속 실패 밖(회복함)이면 날짜를 붙여 지난 일임을 알린다.
  const error = s.lastError
    ? `${errorExcerpt(s.lastError.message)}${s.failStreak > 0 ? "" : ` (${formatShortDate(s.lastError.at)})`}`
    : null;
  return (
    <li className="border-border grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-b py-3 md:grid-cols-[4.5rem_minmax(0,13rem)_minmax(0,1fr)_auto_7rem] md:items-baseline">
      <span className={cn("text-meta font-bold whitespace-nowrap", LEVEL_TONE[s.level])}>
        {HEALTH_LEVEL_LABELS[s.level]}
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="text-title truncate font-semibold" title={s.name}>
          {short}
        </span>
        <span className="text-label text-muted-foreground truncate font-mono">{s.id}</span>
      </span>

      <span className="text-caption col-start-2 flex min-w-0 flex-col md:col-start-auto">
        <span className={cn(s.level === "error" && "text-destructive")}>{s.reason}</span>
        {error && (
          <span
            className="text-label text-muted-foreground truncate font-mono"
            title={s.lastError?.message}
          >
            {error}
          </span>
        )}
      </span>

      <span className="text-meta col-start-2 flex items-end gap-3 md:contents">
        <span className="md:self-center">
          <OutcomeStrip strip={s.strip} runAt={runAt} />
        </span>
        <span className="md:text-right">
          <span className="text-muted-foreground md:hidden">마지막 신규 </span>
          <LastYield s={s} />
        </span>
      </span>
    </li>
  );
}

function Legend() {
  const items: RunOutcome[] = ["yield", "stale", "empty", "filtered", "failed"];
  return (
    <ul className="text-label text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
      {items.map((o) => (
        <li key={o} className="inline-flex items-end gap-1.5">
          <span className="inline-flex h-4 items-end">
            <i className={cn("w-1.5", BAR_STYLE[o])} />
          </span>
          {RUN_OUTCOME_LABELS[o]}
        </li>
      ))}
    </ul>
  );
}

export function SourceHealthPanel({ report }: { report: SourceHealthReport }) {
  if (report.runs === 0) {
    return (
      <p className="text-muted-foreground text-body">
        수집 기록이 없습니다. `npm run collect` 후 소스별 결과가 표시됩니다.
      </p>
    );
  }

  const flagged = flaggedSources(report);
  const pending = pendingSources(report);
  const ok = report.sources.filter((s) => s.level === "ok");
  const runAt = report.stripRunAt;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-caption text-muted-foreground">
        최근 {report.runs}회 · 마지막 {formatShortDate(report.latestRunAt ?? "")} 회차 · 활성 소스{" "}
        {report.sources.length}개{report.disabled > 0 && ` · 비활성 ${report.disabled}개 제외`}
      </p>

      {/* 수준별 개수 — 귀(호 통계)처럼 세리프 숫자 */}
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {HEALTH_LEVELS.map((level) => {
          const n = report.counts[level];
          return (
            <div key={level} className="flex items-baseline gap-2">
              <dt
                className={cn("text-caption", n > 0 ? LEVEL_TONE[level] : "text-muted-foreground")}
              >
                {HEALTH_LEVEL_LABELS[level]}
              </dt>
              <dd
                className={cn(
                  "text-display-md font-serif font-extrabold tabular-nums",
                  n === 0 && "text-muted-foreground/60",
                  n > 0 && level === "error" && "text-destructive",
                )}
              >
                {n}
              </dd>
            </div>
          );
        })}
      </dl>

      {flagged.length === 0 ? (
        <p className="text-body border-border border-y py-3">
          {pending.length > 0 ? "판정된 소스는 모두 정상입니다." : "모든 활성 소스가 정상입니다."}
        </p>
      ) : (
        <div className="flex flex-col">
          <div className="text-label text-muted-foreground border-rule hidden grid-cols-[4.5rem_minmax(0,13rem)_minmax(0,1fr)_auto_7rem] gap-x-4 border-b pb-2 font-semibold md:grid">
            <span>상태</span>
            <span>소스</span>
            <span>사유 · 마지막 오류</span>
            <span>최근 {runAt.length}회</span>
            <span className="text-right">마지막 신규</span>
          </div>
          <ul className="border-rule border-t md:border-t-0">
            {flagged.map((s) => (
              <FlaggedRow key={s.id} s={s} runAt={runAt} />
            ))}
          </ul>
        </div>
      )}

      {pending.length > 0 && (
        <p className="text-caption">
          <span className="text-muted-foreground font-semibold">기록 없음 {pending.length}개</span>
          <span className="text-muted-foreground"> — 다음 수집부터 판정: </span>
          {pending.map((s, i) => (
            <span key={s.id} title={`${s.name} (${s.id})`}>
              {i > 0 && <span className="text-muted-foreground"> · </span>}
              {shortSourceName(s.name)}
              <span className="text-label text-muted-foreground ml-1 font-mono">{s.id}</span>
            </span>
          ))}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Legend />
        <p className="text-label text-muted-foreground">판정: {healthRulesText()}</p>
      </div>

      {ok.length > 0 && (
        <details className="group border-border border-t pt-3">
          <summary className="text-caption flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            정상 {ok.length}개
          </summary>
          <ul className="text-caption grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
            {ok.map((s) => (
              <li
                key={s.id}
                className="border-border flex items-center justify-between gap-3 border-b py-2"
              >
                <span className="min-w-0 truncate" title={`${s.name} (${s.id})`}>
                  {shortSourceName(s.name)}
                  <span className="text-label text-muted-foreground ml-2 font-mono">{s.id}</span>
                </span>
                <OutcomeStrip strip={s.strip} runAt={runAt} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
