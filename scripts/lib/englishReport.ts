/**
 * 영어판 KPI 출력(집계는 src/lib/db.ts `getEnglishKpi`, 정의는 src/lib/englishKpi.ts) — `npm run kpi` 기본 리포트의
 * "영어판" 절. 순수 문자열 함수만 둔다(healthReport.ts 와 같은 분리).
 * Phase 8-1: 지표 이름(DB 보유율·수집 경로 커버리지·기각률·회차 비용)과 목표 대비 PASS/FAIL 을 적어, 2주·4주 리뷰가
 * `npm run kpi` 출력을 그대로 옮기게 한다(정의·목표 근거 docs/english-version/phase8/8-1-english-kpi.md).
 */
import {
  ENGLISH_REJECT_HINTS,
  ENGLISH_REJECT_KEYS,
  ENGLISH_REJECT_LABELS,
  englishGap,
  englishTargetRows,
  percentText,
  rejectBreakdownText,
  rejectTotal,
  type EnglishCoverage,
  type EnglishKpi,
} from "../../src/lib/englishKpi";
import { formatShortDate, kstDateKey } from "../../src/lib/labels";

const usd = (v: number) => `$${v.toFixed(4)}`;

const coverageText = (c: EnglishCoverage) =>
  `${percentText(c.english, c.published)} (${c.english}/${c.published}건)`;

/** 터미널 표시 폭 — 한글·전각은 2칸(padEnd 는 글자 수로 채워 한글 라벨 뒤 칸이 어긋난다). */
const displayWidth = (s: string) =>
  [...s].reduce(
    (w, ch) =>
      w + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60]/.test(ch) ? 2 : 1),
    0,
  );
const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - displayWidth(s)));

const line = (label: string, value: string, note = "") =>
  `  ${pad(label, 20)} ${note ? `${pad(value, 24)} ${note}` : value}`.trimEnd();

/** `npm run kpi` 의 영어판 절(앞뒤 빈 줄 없음). */
export function englishKpiText(k: EnglishKpi): string {
  const out: string[] = [];
  if (k.since === null) {
    out.push("영어판 — 아직 없음");
    out.push(
      k.hasColumns
        ? "  영어 가공 회차가 없습니다. Phase 1 배포 뒤 첫 회차부터 커버리지·기각 사유가 쌓입니다."
        : "  DB 에 영어 컬럼(title_en·summary_en)이 없습니다 — 수집 또는 `npm run db:init` 뒤 생깁니다.",
    );
    out.push(
      `  지난 게재 ${k.allPublished.toLocaleString("en-US")}건은 영어 없음 (Phase 2 백필 대상).`,
    );
    return out.join("\n");
  }

  const c = k.checks;
  const rejected = rejectTotal(c.rejected);
  out.push(`영어판 (${kstDateKey(k.since)} 시작 이후 누적, 영어 회차 ${c.runs}회)`);
  out.push(line("DB 보유율", coverageText(k.overall), "게재 중 영어 제목·요약 보유(백필 포함)"));
  out.push(line("  한국 매체", coverageText(k.korea)));
  out.push(line("  해외 매체", coverageText(k.overseas)));
  const gap = englishGap(k);
  if (gap.missing > 0) {
    out.push(
      line(
        "  영어 없음",
        `${gap.missing.toLocaleString("en-US")}건`,
        `= 회차 기각 ${gap.collectRejected} + notes 밖 ${gap.outsideNotes} (백필 기각·본문 없음)`,
      ),
    );
  }
  if (k.allPublished > k.overall.published) {
    const before = k.allPublished - k.overall.published;
    out.push(
      line("  시작 이전 게재", `${before.toLocaleString("en-US")}건`, "영어 없음 (백필 대상)"),
    );
  }
  out.push(
    line(
      "수집 경로 커버리지",
      c.checked ? `${percentText(c.passed, c.checked)} (${c.passed}/${c.checked}건)` : "—",
      "회차 notes 영어 가공 N/M 합",
    ),
  );
  out.push(
    line(
      "영어 기각 (notes)",
      `${rejected}건 / 검사 ${c.checked}건`,
      c.checked ? `${rejectBreakdownText(c.rejected)} (${percentText(rejected, c.checked)})` : "",
    ),
  );
  out.push(line("한국어 숫자 불일치", `${c.koreanMismatch}건`, "경고 전용 — 게재는 막지 않음"));
  if (k.cost.runs > 0) {
    out.push(
      line(
        "회차 비용",
        `평균 ${usd(k.cost.total / k.cost.runs)} · 최대 ${usd(k.cost.max)} (영어 회차 ${k.cost.runs}회)`,
      ),
    );
  }
  out.push(
    `  기각 사유: ${ENGLISH_REJECT_KEYS.map((key) => `${ENGLISH_REJECT_LABELS[key]} = ${ENGLISH_REJECT_HINTS[key]}`).join(" · ")}`,
  );

  out.push("");
  out.push("  목표 (Phase 8-1):");
  for (const r of englishTargetRows(k)) {
    const mark = r.pass === null ? "—   " : r.pass ? "PASS" : "FAIL";
    out.push(`    ${mark} ${pad(r.label, 20)} ${pad(r.value, 10)} 목표 ${r.target}`);
  }

  if (k.runs.length > 0) {
    out.push("");
    out.push(
      `  최근 ${k.runs.length}회 (회차 notes 영어 가공 N/M · 지금 DB 게재 중 영어 · 회차 비용):`,
    );
    for (const r of k.runs) {
      const n = r.notes;
      const parts = [
        pad(`${formatShortDate(r.startedAt)} #${r.id}`, 10),
        pad(n ? `영어 ${n.passed}/${n.checked}` : "영어 기록 없음", 14),
        pad(`DB ${coverageText(r.coverage)}`, 21),
        pad(`${usd(r.costUsd)} · 호출 ${r.llmCalls}`, 16),
        n && rejectTotal(n.rejected) > 0 ? `기각 ${rejectBreakdownText(n.rejected, "·")}` : "",
        n && n.koreanMismatch > 0 ? `한국어 경고 ${n.koreanMismatch}` : "",
        r.status === "success" ? "" : `(${r.status})`,
      ];
      out.push(`    ${parts.filter(Boolean).join("  ")}`.trimEnd());
    }
  }
  return out.join("\n");
}
