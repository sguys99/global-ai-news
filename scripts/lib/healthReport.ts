/**
 * 소스 헬스 출력(판정은 src/lib/sourceHealth.ts) — `npm run kpi`·`npm run kpi -- health [--ci]` 용.
 * --ci 는 collect.yml 의 "Source health summary" 스텝이 쓴다: Markdown 을 $GITHUB_STEP_SUMMARY 에 붙이고
 * 오류·경고 소스마다 `::warning::` 주석을 낸다(로컬 admin 은 `next dev` 전용이라 자주 열리지 않는다).
 * 순수 문자열 함수만 둔다 — 파일·환경변수는 scripts/kpi.ts 가 다룬다.
 */
import { formatShortDate, shortSourceName } from "../../src/lib/labels";
import {
  HEALTH_LEVEL_LABELS,
  RUN_OUTCOME_LABELS,
  errorExcerpt,
  flaggedSources,
  healthRulesText,
  pendingSources,
  type RunOutcome,
  type SourceHealth,
  type SourceHealthReport,
} from "../../src/lib/sourceHealth";

/** 최근 회차 띠 기호 — 표·로그에서 한 칸 한 글자. */
export const OUTCOME_GLYPHS: Record<RunOutcome, string> = {
  yield: "●",
  stale: "○",
  empty: "0",
  filtered: "◇",
  failed: "✕",
};
const NO_RECORD_GLYPH = "·";

export function stripText(strip: (RunOutcome | null)[]): string {
  return strip.map((o) => (o ? OUTCOME_GLYPHS[o] : NO_RECORD_GLYPH)).join("");
}

export const STRIP_LEGEND = [
  ...(Object.keys(OUTCOME_GLYPHS) as RunOutcome[]).map(
    (o) => `${OUTCOME_GLYPHS[o]} ${RUN_OUTCOME_LABELS[o]}`,
  ),
  `${NO_RECORD_GLYPH} 기록 없음`,
].join(" · ");

/** "오류 2 · 경고 3 · 주의 1 · 기록 없음 4 · 정상 30" (0인 수준은 생략, 정상은 늘 표시). */
export function healthCountsText(report: SourceHealthReport): string {
  return (Object.keys(report.counts) as (keyof typeof report.counts)[])
    .filter((l) => report.counts[l] > 0 || l === "ok")
    .map((l) => `${HEALTH_LEVEL_LABELS[l]} ${report.counts[l]}`)
    .join(" · ");
}

function sourceLabel(s: SourceHealth): string {
  const short = shortSourceName(s.name);
  return `${short} \`${s.id}\``;
}

const cell = (text: string) => text.replace(/\|/g, "\\|");

/** 오류 발췌 — 마지막 실패가 지금 연속 실패 구간 밖이면 날짜를 붙인다. */
function errorCell(s: SourceHealth): string {
  if (!s.lastError) return "";
  const text = errorExcerpt(s.lastError.message, 60);
  return s.failStreak > 0 ? text : `${text} (${formatShortDate(s.lastError.at)})`;
}

/** Markdown 보고서(GitHub 요약·kpi 출력 공용). */
export function healthMarkdown(report: SourceHealthReport, heading = "## 소스 헬스"): string {
  const lines: string[] = [heading, ""];
  if (report.runs === 0) {
    lines.push("수집 기록이 없습니다(collection_runs 에 소스 결과 줄이 없음).");
    return lines.join("\n");
  }
  lines.push(
    `최근 ${report.runs}회(마지막 ${formatShortDate(report.latestRunAt ?? "")} 회차) · 활성 소스 ${report.sources.length}개 — ${healthCountsText(report)}` +
      (report.disabled ? ` · 비활성 ${report.disabled}개 제외` : ""),
    "",
    `판정: ${healthRulesText()}`,
    "",
  );

  const flagged = flaggedSources(report);
  const pending = pendingSources(report);
  if (flagged.length === 0) {
    lines.push(pending.length ? "판정된 소스는 모두 정상입니다." : "모든 활성 소스가 정상입니다.");
  } else {
    lines.push(
      `| 상태 | 소스 | 사유 | 최근 ${report.stripRunAt.length}회 | 마지막 신규 | 마지막 오류 |`,
      "|---|---|---|---|---|---|",
      ...flagged.map(
        (s) =>
          `| ${HEALTH_LEVEL_LABELS[s.level]} | ${cell(sourceLabel(s))} | ${cell(s.reason)} | \`${stripText(s.strip)}\` | ${
            s.lastYield
              ? `${formatShortDate(s.lastYield.at)} (${s.lastYield.fresh}건)`
              : "창 안에 없음"
          } | ${cell(errorCell(s))} |`,
      ),
    );
  }
  if (pending.length > 0) {
    lines.push(
      "",
      `기록 없음 ${pending.length}개(다음 수집부터 판정): ${pending.map(sourceLabel).join(" · ")}`,
    );
  }
  lines.push("", `띠(오래된 → 최신): ${STRIP_LEGEND}`);

  const ok = report.sources.filter((s) => s.level === "ok");
  if (ok.length > 0) {
    lines.push(
      "",
      `<details><summary>정상 ${ok.length}개</summary>`,
      "",
      ...ok.map((s) => `- ${sourceLabel(s)} \`${stripText(s.strip)}\``),
      "",
      "</details>",
    );
  }
  return lines.join("\n");
}

/** GitHub 워크플로 명령의 메시지 이스케이프(%·CR·LF). */
function escapeCommand(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** 오류·경고 소스마다 `::warning title=…::…` 한 줄(주의·기록 없음은 요약 표에만). */
export function healthAnnotations(report: SourceHealthReport): string[] {
  return report.sources
    .filter((s) => s.level === "error" || s.level === "warn")
    .map((s) => {
      const err =
        s.level === "error" && s.lastError ? ` — ${errorExcerpt(s.lastError.message)}` : "";
      return `::warning title=소스 헬스 ${HEALTH_LEVEL_LABELS[s.level]}::${escapeCommand(
        `${s.id} (${s.name}): ${s.reason}${err}`,
      )}`;
    });
}
