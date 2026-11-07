/**
 * 방문 집계 출력(읽기·합산은 scripts/lib/traffic.ts) — `npm run kpi -- traffic [--ci]` 용.
 * --ci 는 traffic.yml(주간)이 쓴다: Markdown 을 $GITHUB_STEP_SUMMARY 에 붙인다.
 * 순수 문자열 함수만 둔다 — 파일·환경변수·네트워크는 scripts/kpi.ts 가 다룬다.
 */
import {
  referrerChannel,
  type PageKind,
  type PathCount,
  type StatRow,
  type TrafficData,
  type TrafficSummary,
  type TrafficWindow,
} from "./traffic";

export const PAGE_KIND_LABELS: Record<PageKind, string> = {
  home: "홈",
  edition: "호",
  article: "기사",
  archive: "보관 지면",
  search: "검색",
  other: "기타",
};

const REF_SCHEME_LABELS: Record<string, string> = {
  h: "리퍼러",
  g: "묶음",
  c: "태그(ref·utm)",
  o: "기타",
};

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
const num = (n: number) => n.toLocaleString("en-US");
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

/** "2026-10-24 ~ 2026-11-06 (KST 14일)" / "2026-11-05 ~ 지금 (KST, 3일째)". */
export function windowText(w: TrafficWindow): string {
  return w.untilNow
    ? `${w.startDate} ~ 지금 (KST, ${w.days}일째)`
    : `${w.startDate} ~ ${w.endDate} (KST ${w.days}일)`;
}

function langTable(s: TrafficSummary, data: TrafficData): string[] {
  const unlistedLabel =
    data.mode === "api" ? "목록 밖 경로(쪽 상한)" : "사이트맵 밖 경로(basePath 밖·옛 주소 등)";
  const rows: string[][] = [
    ["한국어판 `/global-ai-news/…`", num(s.byLang.ko), pct(s.byLang.ko, s.total)],
    ["영어판 `/global-ai-news/en/…`", num(s.byLang.en), pct(s.byLang.en, s.total)],
  ];
  if (s.byLang.outside)
    rows.push(["basePath 밖", num(s.byLang.outside), pct(s.byLang.outside, s.total)]);
  if (s.unlisted) rows.push([unlistedLabel, num(s.unlisted), pct(s.unlisted, s.total)]);
  rows.push(["**사이트 합계**", `**${num(s.total)}**`, ""]);
  return ["| 구분 | 방문 | 비율 |", "|---|--:|--:|", ...rows.map((r) => `| ${r.join(" | ")} |`)];
}

function kindTable(s: TrafficSummary): string[] {
  const kinds = (Object.keys(PAGE_KIND_LABELS) as PageKind[]).filter(
    (k) => s.byKind.ko[k] || s.byKind.en[k] || k !== "other",
  );
  return [
    "| 종류 | 한국어 | 영어 | 영어 비율 |",
    "|---|--:|--:|--:|",
    ...kinds.map(
      (k) =>
        `| ${PAGE_KIND_LABELS[k]} | ${num(s.byKind.ko[k])} | ${num(s.byKind.en[k])} | ${pct(
          s.byKind.en[k],
          s.byKind.ko[k] + s.byKind.en[k],
        )} |`,
    ),
  ];
}

function statTable(rows: StatRow[], heading: string, topN: number, total?: number): string[] {
  if (rows.length === 0) return ["기간 안 기록 없음."];
  const sum = total ?? rows.reduce((a, r) => a + r.count, 0);
  return [
    `| 순위 | ${heading} | 방문 | 비율 |`,
    "|--:|---|--:|--:|",
    ...rows
      .slice(0, topN)
      .map(
        (r, i) =>
          `| ${i + 1} | ${cell(r.id && r.id !== r.name ? `${r.name} (${r.id})` : r.name)} | ${num(r.count)} | ${pct(r.count, sum)} |`,
      ),
  ];
}

function referrerTable(rows: StatRow[], topN: number): string[] {
  if (rows.length === 0) return ["기간 안 기록 없음(직접 방문만)."];
  return [
    "| 순위 | 유입 | 종류 | 채널 | 방문 |",
    "|--:|---|---|---|--:|",
    ...rows.slice(0, topN).map((r, i) => {
      const channel = referrerChannel(r.name);
      const scheme = r.refScheme ? (REF_SCHEME_LABELS[r.refScheme] ?? r.refScheme) : "";
      const name = r.refScheme === "c" ? `**${cell(r.name)}**` : cell(r.name);
      return `| ${i + 1} | ${name} | ${scheme} | ${channel ?? ""} | ${num(r.count)} |`;
    }),
  ];
}

function pageTable(rows: PathCount[]): string[] {
  if (rows.length === 0) return ["기간 안 방문 없음."];
  const withTitle = rows.some((r) => r.title);
  return [
    withTitle ? "| 방문 | 경로 | 제목 |" : "| 방문 | 경로 |",
    withTitle ? "|--:|---|---|" : "|--:|---|",
    ...rows.map((r) =>
      withTitle
        ? `| ${num(r.count)} | \`${cell(r.path)}\` | ${cell((r.title ?? "").slice(0, 60))} |`
        : `| ${num(r.count)} | \`${cell(r.path)}\` |`,
    ),
  ];
}

/** Markdown 보고서(GitHub 요약·kpi 출력 공용). */
export function trafficMarkdown(
  data: TrafficData,
  s: TrafficSummary,
  { heading = "## 방문 (GoatCounter)", topN = 10 } = {},
): string {
  const mode =
    data.mode === "api"
      ? "API 모드"
      : `공개 카운터 모드(토큰 없음, 주소 ${num(data.checked ?? 0)}개 조회)`;
  const lines: string[] = [
    heading,
    "",
    `기간 ${windowText(data.window)} · ${mode} · 방문 ${num(s.total)} · 영어판 비율 **${
      s.enShare === null ? "—" : pct(s.byLang.en, s.byLang.ko + s.byLang.en)
    }**(언어판 합 기준)`,
    "",
    "수는 GoatCounter 방문자(경로마다 세션당 1회)다 — 페이지뷰는 따로 세지 않는다.",
    "",
    ...langTable(s, data),
    "",
    "### 페이지 종류별",
    "",
    ...kindTable(s),
    "",
    "### 국가 top " + topN,
    "",
  ];
  if (data.countries === null)
    lines.push("토큰 필요(GOATCOUNTER_API_TOKEN — 공개 카운터에는 국가가 없다).");
  else {
    lines.push("전체:", "", ...statTable(data.countries, "국가", topN));
    lines.push(
      "",
      "영어판(`/en/` 경로만):",
      "",
      ...statTable(data.countriesEn ?? [], "국가", topN),
    );
  }
  lines.push("", `### 유입 경로 top ${topN}`, "");
  if (data.referrers === null) lines.push("토큰 필요(GOATCOUNTER_API_TOKEN).");
  else {
    lines.push(...referrerTable(data.referrers, topN));
    lines.push("", "굵은 행은 공유 태그(`?ref=`·`utm_source`)로 들어온 방문이다.");
    if (data.campaigns && data.campaigns.length) {
      lines.push("", "캠페인(utm_campaign):", "", ...statTable(data.campaigns, "캠페인", topN));
    }
  }
  lines.push(
    "",
    `### 상위 페이지 — 한국어 top ${topN}`,
    "",
    ...pageTable(s.topPages.ko),
    "",
    `### 상위 페이지 — 영어 top ${topN}`,
    "",
    ...pageTable(s.topPages.en),
  );
  if (data.notes.length) lines.push("", ...data.notes.map((n) => `- ${n}`));
  return lines.join("\n");
}

/** --json 출력(경로 전체는 빼고 상위만). */
export function trafficJson(data: TrafficData, s: TrafficSummary) {
  return {
    mode: data.mode,
    window: {
      start: data.window.start.toISOString(),
      end: data.window.end.toISOString(),
      startDate: data.window.startDate,
      endDate: data.window.endDate,
      untilNow: data.window.untilNow,
      days: data.window.days,
    },
    total: s.total,
    pathSum: s.pathSum,
    unlisted: s.unlisted,
    byLang: s.byLang,
    enShare: s.enShare,
    byKind: s.byKind,
    topPages: s.topPages,
    countries: data.countries,
    countriesEn: data.countriesEn,
    referrers: data.referrers,
    campaigns: data.campaigns,
    checked: data.checked,
    notes: data.notes,
  };
}
