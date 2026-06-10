import type { RunRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 비용 임계 — 이 값을 초과한 실행 행을 강조한다(PRD KPI: 일 ≤ $0.30). */
const COST_THRESHOLD = 0.3;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(
    2,
    "0",
  )} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const statusLabel: Record<string, string> = {
  success: "성공",
  partial: "부분",
  failed: "실패",
};

/** 라벨/값 한 줄(모바일 카드 내부). 우측 정렬 tabular-nums. */
function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", alert && "text-destructive font-semibold")}>{value}</span>
    </div>
  );
}

/**
 * 최근 배치 실행 이력. DESIGN: hairline 보더, 그림자 금지.
 * 모바일은 카드(`md:hidden`), 데스크톱은 표(`hidden md:block`)로 같은 데이터·임계 하이라이트를
 * 공유한다(mobile-plan Phase 5 — 단일 컴포넌트, 포매터·임계값 공유).
 */
export function RunsTable({ runs }: { runs: RunRow[] }) {
  if (runs.length === 0) {
    return (
      <p className="text-muted-foreground text-body">
        아직 실행 이력이 없습니다. `npm run collect` 또는 재수집 트리거 후 표시됩니다.
      </p>
    );
  }

  return (
    <>
      {/* 모바일: 카드 목록 */}
      <ul className="text-caption flex flex-col gap-3 md:hidden">
        {runs.map((r) => {
          const over = r.est_cost_usd > COST_THRESHOLD;
          return (
            <li
              key={r.id}
              className={cn(
                "border-border flex flex-col gap-2 rounded-lg border p-4",
                over && "bg-destructive/5",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold tabular-nums">{fmtTime(r.started_at)}</span>
                <span className="text-muted-foreground">{statusLabel[r.status] ?? r.status}</span>
              </div>
              <Stat label="수집 / 신규" value={`${r.items_collected} / ${r.items_new}`} />
              <Stat label="LLM 호출" value={String(r.llm_calls)} />
              <Stat
                label="토큰 (in/out)"
                value={`${r.input_tokens.toLocaleString()} / ${r.output_tokens.toLocaleString()}`}
              />
              <Stat label="비용 ($)" value={r.est_cost_usd.toFixed(4)} alert={over} />
              {r.notes && (
                <p className="text-muted-foreground border-border border-t pt-2">{r.notes}</p>
              )}
            </li>
          );
        })}
      </ul>

      {/* 데스크톱: 표 */}
      <div className="border-border hidden overflow-x-auto rounded-lg border md:block">
        <table className="text-caption w-full border-collapse">
          <thead className="text-muted-foreground border-border border-b">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
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
                    "border-border border-b last:border-b-0 [&>td]:px-3 [&>td]:py-2",
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
                  <td
                    className="text-muted-foreground max-w-[16rem] truncate"
                    title={r.notes ?? ""}
                  >
                    {r.notes ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
