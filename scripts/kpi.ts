/**
 * KPI 점검 CLI. PRD §9 / WORK-PLAN Phase 6.
 * 실행: npm run kpi  (= tsx --env-file-if-exists=.env.local scripts/kpi.ts [days])
 *
 * collection_runs/articles 에서 자동 산출 가능한 KPI(비용·성공률·신규 카드·중복)를
 * 최근 N일(기본 30) 집계해 목표 대비 PASS/FAIL 표로 출력한다.
 * LCP·한국어 요약 품질은 자동 측정 대상이 아니므로 수동 점검 안내만 표기한다.
 */
import { getKpiSummary } from "../src/lib/db";

const days = Number(process.argv[2] ?? 30);

function row(label: string, value: string, target: string, pass: boolean | null): string {
  const mark = pass === null ? "—  " : pass ? "PASS" : "FAIL";
  return [mark.padEnd(4), label.padEnd(22), value.padEnd(14), `목표 ${target}`].join(" ");
}

function main(): void {
  const k = getKpiSummary(days);

  console.log(`\nDaily AI Brief — KPI (최근 ${k.days}일, 실행 ${k.runs}회)\n`);

  if (k.runs === 0) {
    console.log("실행 이력이 없습니다. `npm run collect` 후 다시 확인하세요.\n");
  }

  const lines = [
    row(
      "일일 LLM 비용",
      `$${k.maxDailyCost.toFixed(4)}/일`,
      "≤ $0.30",
      k.runs ? k.maxDailyCost <= 0.3 : null,
    ),
    row(
      "파이프라인 성공률",
      `${(k.successRate * 100).toFixed(1)}%`,
      "≥ 95%",
      k.runs ? k.successRate >= 0.95 : null,
    ),
    row(
      "일일 신규 카드",
      `${k.avgDailyNew.toFixed(1)}건/일`,
      "≥ 30",
      k.runs ? k.avgDailyNew >= 30 : null,
    ),
    row("중복 제거", `${k.duplicateKeys}건`, "= 0", k.duplicateKeys === 0),
  ];
  for (const l of lines) console.log("  " + l);

  console.log(`\n  (참고) 기간 합계 비용: $${k.totalCost.toFixed(4)}`);
  console.log("\n수동 점검 항목(자동 측정 불가):");
  console.log("  —   피드 LCP            ≤ 2.0s   (Vercel Analytics / Lighthouse)");
  console.log("  —   한국어 요약 품질    ≥ 90%    (주간 20건 샘플 리뷰)");
  console.log("  —   소스 변경→재배포    ≤ 10분   (Vercel 배포 타임스탬프)\n");
}

main();
