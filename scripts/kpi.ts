/**
 * KPI 점검 CLI. PRD §9 / WORK-PLAN Phase 6.
 * 실행: npm run kpi  (= tsx --env-file-if-exists=.env.local scripts/kpi.ts [days])
 *
 * collection_runs/articles 에서 자동 산출 가능한 KPI(비용·성공률·신규 카드·중복)를
 * 최근 N일(기본 30) 집계해 목표 대비 PASS/FAIL 표로 출력한다.
 * LCP·한국어 요약 품질은 자동 측정 대상이 아니므로 수동 점검 안내만 표기한다.
 *
 * 하위 명령: npm run kpi -- baseline [days=14]
 *   콘텐츠·1면 개편 기준선(docs/contents-upgrade-plan.md Phase 0/7). 집계는 scripts/lib/baseline.ts,
 *   여기서는 계획서에 옮기기 쉬운 Markdown 표로 출력만 한다. DB 는 읽기 전용으로 연다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDb, getKpiSummary } from "../src/lib/db";
import { FORMAT_LABELS, FORMATS, type Format } from "../src/lib/labels";
import { CONFIGS_DIR } from "../src/lib/paths";
import { computeBaseline, type BaselineSource, type Ratio } from "./lib/baseline";

const [, , first, second] = process.argv;
const isBaseline = first === "baseline";
const days = Number((isBaseline ? second : first) ?? (isBaseline ? 14 : 30));

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

// ── baseline ─────────────────────────────────────────────────────────────

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const ratio = (r: Ratio) => `${pct(r.today, r.size)} (${r.today}/${r.size})`;
const usd = (n: number) => `$${n.toFixed(4)}`;

/** 형식 분포 → "뉴스 370 (95%) / 오픈소스 5 (1%) / ..." */
function formatMix(counts: Record<Format, number>): string {
  const total = FORMATS.reduce((s, f) => s + counts[f], 0);
  return FORMATS.map((f) => `${FORMAT_LABELS[f]} ${counts[f]} (${pct(counts[f], total)})`).join(
    " / ",
  );
}

/** 분포(키→수) → 많은 순 "키 N (p%)" 목록. */
function mix(counts: Record<string, number>): string {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k || "(없음)"} ${n} (${pct(n, total)})`)
    .join(" / ");
}

function table(header: string[], rows: (string | number)[][]): string {
  return [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

function readSourcesConfig(): BaselineSource[] {
  return JSON.parse(
    readFileSync(path.join(CONFIGS_DIR, "sources.json"), "utf-8"),
  ) as BaselineSource[];
}

function baseline(): void {
  const r = computeBaseline(getDb(), days, readSourcesConfig());
  if (!r.to) {
    console.log("\n호가 없습니다. `npm run collect` 후 다시 확인하세요.\n");
    return;
  }
  const t = r.totals;
  const n = r.issues.length;

  console.log(`\n# 개편 기준선 — 최근 ${r.days}일 (${r.from} ~ ${r.to} KST, 호 ${n}개)\n`);
  console.log(
    "형식은 소스 속성(sources.format, configs/sources.json). 컬럼이 없는 예전 DB 는 소스 id/kind 규칙으로 판정.\n",
  );

  console.log("## 요약\n");
  console.log(
    table(
      ["항목", "값"],
      [
        ["측정 기간", `${r.from} ~ ${r.to} (KST 호 ${n}개, 공개 기사 ${t.published}건)`],
        ["형식 비율 (뉴스/오픈소스/모델/논문)", formatMix(t.formats)],
        ["분야 비율", mix(t.categories)],
        [
          "Physical AI 키워드 기사 수",
          `${t.physicalAi}건 (${pct(t.physicalAi, t.published)}, 호당 ${(t.physicalAi / n).toFixed(1)}; 제목·태그만 ${t.physicalAiStrict}건) — 분류: ${mix(t.physicalAiByCategory)}`,
        ],
        ["1면 오늘 호 비율 (리드+서브)", ratio(t.front)],
        ["1면 본문 기사 수", `${(t.front.size / n).toFixed(1)}건/호`],
        ["지금 화제 오늘 호 비율", ratio(t.trending)],
        [
          "회차 평균 비용",
          `${usd(t.cost.avg)} (최소 ${usd(t.cost.min)} · 최대 ${usd(t.cost.max)} · ${t.cost.runs}회 합계 ${usd(t.cost.total)})`,
        ],
        [
          "회차 평균 LLM 호출·토큰",
          `${(t.llmCalls / (t.cost.runs || 1)).toFixed(1)}회 · 입력 ${Math.round(t.inputTokens / (t.cost.runs || 1))} / 출력 ${Math.round(t.outputTokens / (t.cost.runs || 1))}`,
        ],
        ["회차 상태", mix(t.runsByStatus)],
        ["신규 후보(notes, 상한 적용) 형식 비율", formatMix(t.candidatesByFormat)],
        ["이틀 연속 중복 후보 (휴리스틱)", `${r.duplicates.length}쌍`],
        [
          "0건 소스 (활성, 기간 내 게재 0)",
          `${r.zeroYield.length}개 — ${r.zeroYield.map((s) => s.id).join(", ")}`,
        ],
      ],
    ),
  );

  console.log("\n## 호별\n");
  console.log(
    table(
      [
        "호 날짜",
        "호",
        "게재",
        "뉴스/OSS/모델/논문",
        "PAI",
        "1면 오늘",
        "화제 오늘",
        "비용",
        "후보 OSS/모델/논문",
      ],
      r.issues.map((i) => {
        const run = r.runs.filter((x) => x.date === i.date);
        const c = run.reduce(
          (acc, x) => FORMATS.map((f, k) => acc[k] + x.candidatesByFormat[f]),
          [0, 0, 0, 0],
        );
        return [
          i.date,
          i.issueNo,
          i.published,
          FORMATS.map((f) => i.formats[f]).join("/"),
          i.physicalAi,
          `${i.front.today}/${i.front.size}`,
          `${i.trending.today}/${i.trending.size}`,
          usd(i.costUsd),
          `${c[1]}/${c[2]}/${c[3]}`,
        ];
      }),
    ),
  );

  console.log("\n## 호별 분야\n");
  const cats = Object.keys(t.categories).sort((a, b) => t.categories[b] - t.categories[a]);
  console.log(
    table(
      ["호 날짜", ...cats],
      r.issues.map((i) => [i.date, ...cats.map((c) => i.categories[c] ?? 0)]),
    ),
  );

  console.log("\n## 1면에 오른 지난 호 기사\n");
  for (const i of r.issues) {
    for (const s of i.staleFront)
      console.log(`- ${i.date} 1면 ← ${s.issueDate} 호 #${s.id} ${s.title}`);
  }

  console.log("\n## Physical AI 키워드 기사\n");
  for (const a of t.physicalAiArticles)
    console.log(
      `- ${a.date} [${a.category}] #${a.id} ${a.title}${a.strict ? "" : " (요약에서만 일치)"}`,
    );

  console.log(
    "\n## 이틀 연속 같은 사건 후보 (제목 Jaccard ≥ 0.5 · 희귀 토큰 3개 이상 공유 · URL 공유 — 휴리스틱)\n",
  );
  for (const d of r.duplicates) {
    const why = [
      `J=${d.similarity.toFixed(2)}`,
      d.sharedRare.length ? `공유 ${d.sharedRare.join(",")}` : "",
      d.sharedUrl ? "URL 공유" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(
      `- ${d.prevDate} #${d.prev.id} ${d.prev.title}\n  → ${d.date} #${d.next.id} ${d.next.title} (${why})`,
    );
  }

  console.log("\n## 활성 소스 수확 (게재 / 신규 후보 / 실패 회차)\n");
  console.log(
    table(
      ["소스", "형식", "게재", "신규 후보", "실패", "마지막 실패"],
      [...r.sources]
        .sort((a, b) => a.published - b.published || a.candidates - b.candidates)
        .map((s) => [
          s.id,
          FORMAT_LABELS[s.format],
          s.published,
          s.candidates,
          s.failures,
          s.lastError ?? "",
        ]),
    ),
  );
  console.log("");
}

if (isBaseline) baseline();
else main();
