import type { KpiSummary } from "@/lib/db";
import { cn } from "@/lib/utils";

/**
 * PRD §9 KPI 요약 패널. getKpiSummary() 자동 산출 지표를 목표 대비 충족/미달로 표시한다.
 * DESIGN: hairline 보더 카드, rounded.lg, 그림자 금지. 충족=Action Blue, 미달=destructive.
 * LCP·한국어 품질 등 수동 측정 항목은 "수동 점검" 배지로 별도 표기한다.
 */

interface Metric {
  label: string;
  value: string;
  target: string;
  pass: boolean | null; // null = 측정 불가(실행 0건)
}

function KpiCard({ m }: { m: Metric }) {
  return (
    <div className="bg-card border-border flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-caption text-muted-foreground">{m.label}</span>
      <span
        className={cn(
          "text-body font-semibold tabular-nums",
          m.pass === true && "text-primary",
          m.pass === false && "text-destructive",
        )}
      >
        {m.value}
      </span>
      <span className="text-caption text-muted-foreground">목표 {m.target}</span>
    </div>
  );
}

export function KpiPanel({ kpi }: { kpi: KpiSummary }) {
  const auto: Metric[] = [
    {
      label: "일일 LLM 비용",
      value: `$${kpi.maxDailyCost.toFixed(4)}/일`,
      target: "≤ $0.30",
      pass: kpi.runs ? kpi.maxDailyCost <= 0.3 : null,
    },
    {
      label: "파이프라인 성공률",
      value: `${(kpi.successRate * 100).toFixed(1)}%`,
      target: "≥ 95%",
      pass: kpi.runs ? kpi.successRate >= 0.95 : null,
    },
    {
      label: "일일 신규 카드",
      value: `${kpi.avgDailyNew.toFixed(1)}건/일`,
      target: "≥ 30",
      pass: kpi.runs ? kpi.avgDailyNew >= 30 : null,
    },
    {
      label: "중복 제거",
      value: `${kpi.duplicateKeys}건`,
      target: "= 0",
      pass: kpi.duplicateKeys === 0,
    },
  ];

  const manual = [
    { label: "피드 LCP", target: "≤ 2.0s", source: "Vercel Analytics / Lighthouse" },
    { label: "한국어 요약 품질", target: "≥ 90%", source: "주간 20건 샘플 리뷰" },
    { label: "소스 변경→재배포", target: "≤ 10분", source: "Vercel 배포 타임스탬프" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-muted-foreground">
        최근 {kpi.days}일 · 실행 {kpi.runs}회 · 기간 합계 비용 ${kpi.totalCost.toFixed(4)}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {auto.map((m) => (
          <KpiCard key={m.label} m={m} />
        ))}
      </div>

      <div className="border-border rounded-lg border p-4">
        <p className="text-caption text-muted-foreground mb-2 font-medium">
          수동 점검 항목 (자동 측정 불가)
        </p>
        <ul className="text-caption text-muted-foreground flex flex-col gap-1">
          {manual.map((m) => (
            <li key={m.label} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-foreground font-medium">{m.label}</span>
              <span>목표 {m.target}</span>
              <span>· {m.source}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
