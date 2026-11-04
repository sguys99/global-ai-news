import type { ReactNode } from "react";
import { RegionBadge } from "@/components/ArticleMeta";
import {
  ENGLISH_REJECT_HINTS,
  ENGLISH_REJECT_KEYS,
  ENGLISH_REJECT_LABELS,
  percentText,
  rejectTotal,
  type EnglishCoverage,
  type EnglishKpi,
  type EnglishRunKpi,
} from "@/lib/englishKpi";
import { formatDate, formatShortDate } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * 영어판 KPI(english-version-plan Phase 1-4) — KpiPanel 아래 "영어판" 지면. 집계는 src/lib/db.ts `getEnglishKpi`,
 * 같은 값을 `npm run kpi` 영어판 절이 텍스트로 낸다. 서버 컴포넌트(상호작용 없음).
 * DESIGN.md: 카드 박스 없이 잉크 괘선·헤어라인·칼럼 세로선으로 구획. 커버리지는 코발트 선(화제 바와 같은 문법,
 * 고정 0–100 스케일)과 세리프 숫자로 읽고, 기각·경고 수는 소스 헬스 패널처럼 세리프 숫자(0은 흐림).
 * 기각·한국어 경고는 임계가 정해지지 않아(Phase 8에서 기준선을 보고 정한다) destructive 를 쓰지 않는다.
 */

/** 커버리지 선 — 트랙 헤어라인 위 코발트 채움. 색만으로 전하지 않게 aria-label 에 비율을 싣는다. */
function CoverageLine({
  c,
  label,
  className,
}: {
  c: EnglishCoverage;
  label: string;
  className?: string;
}) {
  const pct = c.published > 0 ? (c.english / c.published) * 100 : 0;
  return (
    <span
      role="img"
      aria-label={`${label} ${percentText(c.english, c.published)} (${c.english}/${c.published}건)`}
      className={cn("bg-border relative block h-0.5 overflow-hidden", className)}
    >
      <span className="bg-brand absolute inset-y-0 left-0" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** "94.3%" → 세리프 숫자 + 작은 % (분모 0이면 "—"). */
function Percent({ c, className }: { c: EnglishCoverage; className?: string }) {
  const text = percentText(c.english, c.published);
  const unit = text.endsWith("%");
  return (
    <span className={cn("font-serif font-extrabold tabular-nums", className)}>
      {unit ? text.slice(0, -1) : text}
      {unit && <span className="ml-0.5 text-[0.55em] font-bold">%</span>}
    </span>
  );
}

function SplitRow({ name, c, badge }: { name: string; c: EnglishCoverage; badge?: boolean }) {
  return (
    <div className="border-border grid min-h-11 grid-cols-[6.5rem_minmax(0,1fr)_3.5rem_4.5rem] items-center gap-x-3 border-b">
      <dt className="text-caption flex items-center gap-1.5 font-semibold whitespace-nowrap">
        {name}
        {badge && <RegionBadge region="kr" />}
      </dt>
      <dd className="contents">
        <CoverageLine c={c} label={`${name} 영어 커버리지`} />
        <Percent c={c} className="text-title text-right" />
        <span className="text-label text-muted-foreground text-right tabular-nums">
          {c.english}/{c.published}건
        </span>
      </dd>
    </div>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-meta text-brand font-bold">{children}</p>;
}

function RunRow({ r }: { r: EnglishRunKpi }) {
  const n = r.notes;
  const rejected = n ? rejectTotal(n.rejected) : 0;
  const reasons = n ? ENGLISH_REJECT_KEYS.filter((k) => n.rejected[k] > 0) : [];
  return (
    <li className="border-border grid min-h-11 grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b py-2 md:grid-cols-[3.25rem_3.5rem_minmax(0,9rem)_minmax(0,1fr)_6.5rem]">
      <span className="font-serif font-bold tabular-nums">{formatShortDate(r.startedAt)}</span>
      <span className="text-label text-muted-foreground hidden font-mono md:inline">
        #{r.id}
        {r.status !== "success" && <span className="block">{r.status}</span>}
      </span>

      {n ? (
        <span className="flex min-w-0 items-center gap-2">
          <CoverageLine
            c={{ published: n.checked, english: n.passed }}
            label="영어 가공"
            className="w-14 shrink-0"
          />
          <span className="text-caption tabular-nums">
            <span className="font-semibold">{n.passed}</span>
            <span className="text-muted-foreground">/{n.checked}</span>
          </span>
        </span>
      ) : (
        <span className="text-caption text-muted-foreground">영어 기록 없음</span>
      )}

      <span className="text-caption col-start-2 min-w-0 md:col-start-auto">
        {rejected > 0 ? (
          <span>
            기각 {rejected}
            <span className="text-muted-foreground">
              {" — "}
              {reasons.map((k) => `${ENGLISH_REJECT_LABELS[k]} ${n!.rejected[k]}`).join(" · ")}
            </span>
          </span>
        ) : (
          n && <span className="text-muted-foreground">기각 없음</span>
        )}
        {n && n.koreanMismatch > 0 && (
          <span className="text-muted-foreground"> · 한국어 숫자 {n.koreanMismatch}</span>
        )}
      </span>

      <span
        className="text-label text-muted-foreground col-start-3 row-start-1 text-right tabular-nums md:col-start-auto md:row-start-auto"
        title="지금 DB 기준 — 이 회차가 게재한 기사 중 영어 보유(백필 반영)"
      >
        게재 {r.coverage.english}/{r.coverage.published}
      </span>
    </li>
  );
}

function EmptyState({ k }: { k: EnglishKpi }) {
  return (
    <div className="border-border flex flex-col gap-1.5 border-y py-5">
      <p className="text-display-md text-muted-foreground font-serif font-extrabold">아직 없음</p>
      <p className="text-caption text-foreground-soft">
        {k.hasColumns
          ? "영어 가공 회차가 없습니다. Phase 1 배포 뒤 첫 회차부터 커버리지·기각 사유가 쌓입니다."
          : "DB 에 영어 컬럼(title_en·summary_en)이 없습니다. 수집 또는 `npm run db:init` 뒤 생깁니다."}
      </p>
      <p className="text-caption text-muted-foreground">
        지난 게재{" "}
        <span className="text-foreground font-semibold tabular-nums">
          {k.allPublished.toLocaleString("ko-KR")}건
        </span>
        은 영어 없음 — Phase 2 백필 대상
      </p>
    </div>
  );
}

export function EnglishKpiPanel({ english: k }: { english: EnglishKpi }) {
  const c = k.checks;
  const rejected = rejectTotal(c.rejected);
  const before = k.allPublished - k.overall.published;

  return (
    <section
      aria-labelledby="english-kpi-title"
      className="border-rule flex flex-col gap-5 border-t pt-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="english-kpi-title" className="text-headline font-serif font-extrabold">
          영어판
        </h3>
        <p className="text-caption text-muted-foreground">
          {k.since
            ? `${formatDate(k.since)} 시작 이후 누적 · 영어 회차 ${c.runs}회`
            : "영어판 이전"}
        </p>
      </header>

      {k.since === null ? (
        <EmptyState k={k} />
      ) : (
        <>
          <div className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-0">
            {/* 커버리지 — 게재 대비 영어 보유(지금 DB) */}
            <div className="flex flex-col gap-3 md:pr-8">
              <Kicker>영어 커버리지</Kicker>
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Percent c={k.overall} className="text-display-lg leading-none" />
                <span className="text-caption text-foreground-soft">
                  게재{" "}
                  <span className="tabular-nums">
                    {k.overall.published.toLocaleString("ko-KR")}
                  </span>
                  건 중 영어{" "}
                  <span className="text-foreground font-semibold tabular-nums">
                    {k.overall.english.toLocaleString("ko-KR")}
                  </span>
                  건
                </span>
              </p>
              <CoverageLine c={k.overall} label="영어 커버리지" className="h-1" />
              <dl className="border-rule mt-2 border-t">
                <SplitRow name="한국 매체" c={k.korea} badge />
                <SplitRow name="해외 매체" c={k.overseas} />
              </dl>
              {before > 0 && (
                <p className="text-label text-muted-foreground">
                  시작 이전 게재 {before.toLocaleString("ko-KR")}건은 영어 없음 — 백필 대상(커버리지
                  분모 제외)
                </p>
              )}
            </div>

            {/* 기각 사유·한국어 경고 — 회차 notes 합계 */}
            <div className="md:border-border flex flex-col gap-3 md:border-l md:pl-8">
              <Kicker>기각 사유</Kicker>
              <p className="text-caption text-foreground-soft">
                검사 <span className="tabular-nums">{c.checked.toLocaleString("ko-KR")}</span>건 중{" "}
                <span className="text-foreground font-semibold tabular-nums">{rejected}</span>건
                기각
                {c.checked > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({percentText(rejected, c.checked)})
                  </span>
                )}
                <span className="text-muted-foreground">
                  {" "}
                  — 기각하면 영어만 비우고 한국어는 싣는다
                </span>
              </p>
              <dl className="border-rule grid grid-cols-3 border-t">
                {ENGLISH_REJECT_KEYS.map((key, i) => {
                  const v = c.rejected[key];
                  return (
                    <div
                      key={key}
                      className={cn(
                        "border-border flex flex-col gap-1 border-b py-3",
                        i > 0 && "border-l pl-4",
                      )}
                    >
                      <dt className="text-caption font-semibold">{ENGLISH_REJECT_LABELS[key]}</dt>
                      <dd
                        className={cn(
                          "text-display-md font-serif font-extrabold tabular-nums",
                          v === 0 && "text-muted-foreground/60",
                        )}
                      >
                        {v}
                      </dd>
                      <dd className="text-label text-muted-foreground">
                        {ENGLISH_REJECT_HINTS[key]}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <dl className="border-border flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-3">
                <dt className="text-caption font-semibold">한국어 숫자 불일치</dt>
                <dd
                  className={cn(
                    "text-headline font-serif font-extrabold tabular-nums",
                    c.koreanMismatch === 0 && "text-muted-foreground/60",
                  )}
                >
                  {c.koreanMismatch}
                  <span className="ml-0.5 text-[0.7em] font-bold">건</span>
                </dd>
                <dd className="text-label text-muted-foreground basis-full">
                  경고 전용 — 원문에 없는 숫자가 한국어 제목·요약에 있음, 게재는 막지 않는다
                </dd>
              </dl>
            </div>
          </div>

          {k.runs.length > 0 && (
            <div className="flex flex-col">
              <div className="text-label text-muted-foreground border-rule grid grid-cols-[3.25rem_minmax(0,1fr)_auto] gap-x-3 border-b pb-2 font-semibold md:grid-cols-[3.25rem_3.5rem_minmax(0,9rem)_minmax(0,1fr)_6.5rem]">
                <span>회차</span>
                <span className="hidden md:inline">번호</span>
                <span>영어 가공</span>
                <span className="hidden md:inline">기각 · 한국어 경고</span>
                <span className="text-right">지금 DB</span>
              </div>
              <ol aria-label={`최근 ${k.runs.length}회 영어 가공`}>
                {k.runs.map((r) => (
                  <RunRow key={r.id} r={r} />
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}
