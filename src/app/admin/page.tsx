import { CollectButton } from "@/components/admin/CollectButton";
import { KpiPanel } from "@/components/admin/KpiPanel";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { RunsTable } from "@/components/admin/RunsTable";
import { SourceManager } from "@/components/admin/SourceManager";
import { getKpiSummary, getRecentRuns, type KpiSummary } from "@/lib/db";
import { readSources } from "@/lib/sources";
import type { RunRow, SourceConfig } from "@/lib/types";

/** 인증·운영 데이터에 의존 → 매 요청 SSR. */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let sources: SourceConfig[] = [];
  try {
    sources = await readSources();
  } catch {
    sources = [];
  }

  let runs: RunRow[] = [];
  try {
    runs = getRecentRuns();
  } catch {
    // DB 미생성 등 — 빈 목록으로 처리
    runs = [];
  }

  let kpi: KpiSummary | null = null;
  try {
    kpi = getKpiSummary();
  } catch {
    // DB 미생성 등 — KPI 섹션 숨김
    kpi = null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-primary text-caption font-semibold tracking-tight">
            Daily AI Brief
          </span>
          <h1 className="text-display-md font-semibold tracking-tight">운영 콘솔</h1>
        </div>
        <LogoutButton />
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-body font-semibold tracking-tight">소스 관리</h2>
        </div>
        <SourceManager initial={sources} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-body font-semibold tracking-tight">재수집</h2>
        <CollectButton />
      </section>

      {kpi && (
        <section className="flex flex-col gap-4">
          <h2 className="text-body font-semibold tracking-tight">KPI 요약</h2>
          <KpiPanel kpi={kpi} />
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-body font-semibold tracking-tight">실행 이력 · 비용</h2>
        <RunsTable runs={runs} />
      </section>
    </main>
  );
}
