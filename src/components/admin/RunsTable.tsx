import type { RunRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 비용 임계 — 이 값을 초과한 실행 행을 강조한다(PRD KPI: 일 ≤ $0.30). */
const COST_THRESHOLD = 0.3;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const statusLabel: Record<string, string> = {
  success: "성공",
  partial: "부분",
  failed: "실패",
};

/** 최근 배치 실행 이력 표. DESIGN: hairline 보더, 그림자 금지. */
export function RunsTable({ runs }: { runs: RunRow[] }) {
  if (runs.length === 0) {
    return (
      <p className="text-muted-foreground text-body">
        아직 실행 이력이 없습니다. `npm run collect` 또는 재수집 트리거 후 표시됩니다.
      </p>
    );
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="text-caption w-full border-collapse">
        <thead className="text-muted-foreground border-border border-b">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
            <th>실행 시각</th>
            <th>상태</th>
            <th className="text-right">수집</th>
            <th className="text-right">신규</th>
            <th className="text-right">LLM</th>
            <th className="text-right">토큰(in/out)</th>
            <th className="text-right">비용($)</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const over = r.est_cost_usd > COST_THRESHOLD;
            return (
              <tr
                key={r.id}
                className={cn(
                  "border-border [&>td]:px-3 [&>td]:py-2 border-b last:border-b-0",
                  over && "bg-destructive/5",
                )}
              >
                <td className="whitespace-nowrap">{fmtTime(r.started_at)}</td>
                <td>{statusLabel[r.status] ?? r.status}</td>
                <td className="text-right tabular-nums">{r.items_collected}</td>
                <td className="text-right tabular-nums">{r.items_new}</td>
                <td className="text-right tabular-nums">{r.llm_calls}</td>
                <td className="text-right tabular-nums">
                  {r.input_tokens.toLocaleString()}/{r.output_tokens.toLocaleString()}
                </td>
                <td
                  className={cn(
                    "text-right tabular-nums",
                    over && "text-destructive font-semibold",
                  )}
                >
                  {r.est_cost_usd.toFixed(4)}
                </td>
                <td className="text-muted-foreground max-w-[16rem] truncate" title={r.notes ?? ""}>
                  {r.notes ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
