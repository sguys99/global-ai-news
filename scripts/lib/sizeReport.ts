/**
 * 배포 산출물(out/) 크기 보고 — english-version-plan Phase 4-1. 실행·파일 읽기는 scripts/size-report.ts.
 *
 * GitHub Pages 사이트 한도는 1GB다. 전체 크기가 700MB 를 넘으면 경고, 950MB 를 넘으면 배포를 멈춘다.
 * 페이지 예산(기사 1쪽 HTML+RSC 평균 40KB, 호 1쪽 평균 150KB)은 경고만 낸다 — 배포는 계속한다.
 * 분류·단위는 phase0/0-4-size-build.md 와 같다: KB = 1,000 B, MB = 10^6 B, 1GB = 10^9 B(보수적).
 *
 * 보관 지면(Phase 4-3 — 90일 지난 기사·호의 가벼운 정적 HTML)은 같은 경로(`article/<id>/index.html`)라 경로로 가를 수 없다.
 * CLI 가 페이지 HTML 머리의 표지(`ARCHIVE_GENERATOR_META`)를 보고 `FileEntry.archive` 를 달면 따로 센다(기사 ≤ 8KB·호 ≤ 40KB,
 * 쪽마다 — 평균이 아니다, 경고만).
 *
 * 순수 함수만 둔다(경로 문자열·바이트 목록 → 보고서·문자열). 파일 시스템·환경변수는 CLI 가 다룬다.
 */
import {
  ARCHIVE_ARTICLE_BUDGET_BYTES,
  ARCHIVE_EDITION_BUDGET_BYTES,
  ARCHIVE_GENERATOR_META,
} from "../../src/lib/archive";

// ── 기준값(단일 출처) ───────────────────────────────────────────────────────

/** GitHub Pages 게시 사이트 한도 1GB("may be no larger than 1 GB") — 10^9 B 로 보수적으로 잡는다. */
export const PAGES_LIMIT_BYTES = 1_000_000_000;
/** 전체 크기가 이 값 이상이면 `::warning::`(배포는 계속). */
export const TOTAL_WARN_BYTES = 700_000_000;
/** 전체 크기가 이 값 이상이면 `::error::` + 종료 코드 1(업로드 전에 배포를 멈춘다). */
export const TOTAL_FAIL_BYTES = 950_000_000;
/** 기사 1쪽(index.html + index.txt) 평균 예산 — 넘으면 경고만. Phase 0 기준 92KB. */
export const ARTICLE_PAGE_BUDGET_BYTES = 40_000;
/** 호 1쪽(index.html + index.txt) 평균 예산 — 넘으면 경고만. Phase 0 기준 382KB. */
export const EDITION_PAGE_BUDGET_BYTES = 150_000;
/** 보관 기사 1쪽(index.html 뿐) 예산 — 쪽마다 본다, 넘으면 경고만(Phase 4-3, 값은 src/lib/archive.ts). */
export const ARCHIVE_ARTICLE_PAGE_BUDGET_BYTES = ARCHIVE_ARTICLE_BUDGET_BYTES;
/** 보관 호 1쪽 예산 — 쪽마다 본다, 넘으면 경고만(Phase 4-3, 값은 src/lib/archive.ts). */
export const ARCHIVE_EDITION_PAGE_BUDGET_BYTES = ARCHIVE_EDITION_BUDGET_BYTES;
/**
 * 보관 호 예산 예외 — 출시 전 대량 수집 호(148·149·167건, 보관 지면 약 67~76KB). 사용자 결정(2026-11-05)으로 한도를 넘어도
 * 그대로 둔다. 정상 운영의 호는 35건 이하(MAX_PICKS_PER_RUN)라 다시 생기지 않는다.
 */
export const ARCHIVE_BUDGET_EXEMPT: ReadonlySet<string> = new Set([
  "2026-06-09",
  "2026-07-07",
  "2026-10-06",
]);

// ── 분류 ────────────────────────────────────────────────────────────────

export type Lang = "ko" | "en";
export const LANGS: Lang[] = ["ko", "en"];

export const SIZE_CLASSES = [
  "article-html",
  "article-txt",
  "edition-html",
  "edition-txt",
  "article-archive",
  "edition-archive",
  "home",
  "og-article",
  "og-edition",
  "next-static",
  "fonts",
  "search-index",
  "feed-index",
  "other",
] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

export const SIZE_CLASS_LABELS: Record<SizeClass, string> = {
  "article-html": "기사 HTML",
  "article-txt": "기사 RSC(.txt)",
  "edition-html": "호 HTML",
  "edition-txt": "호 RSC(.txt)",
  "article-archive": "보관 기사 HTML",
  "edition-archive": "보관 호 HTML",
  home: "홈(html+txt)",
  "og-article": "og 기사 PNG",
  "og-edition": "og 호 PNG",
  "next-static": "_next 스크립트·CSS",
  fonts: "폰트(웹폰트·OG TTF)",
  "search-index": "검색 색인",
  "feed-index": "홈 색인(feed-index)",
  other: "기타",
};

/** 언어판과 무관하게 한 벌만 있는 분류 — 보고서에서 언어 대신 "공용"으로 표시한다. */
export const SHARED_CLASSES: ReadonlySet<SizeClass> = new Set(["next-static", "fonts"]);

/** 페이지 종류 — 보관 지면(`*-archive`, HTML 한 장)은 전체 페이지와 따로 센다. */
export type PageKind = "article" | "edition" | "article-archive" | "edition-archive";
export const PAGE_KINDS: PageKind[] = ["article", "edition", "article-archive", "edition-archive"];
export type PagePart = "html" | "txt";

/** 페이지 HTML 머리(앞 1KB 남짓)가 보관 지면인지 — CLI 가 `FileEntry.archive` 를 달 때 쓴다. */
export function isArchiveHtml(head: string): boolean {
  return head.includes(ARCHIVE_GENERATOR_META);
}

/** 보관 지면 판별에 읽을 머리 바이트 수(표지는 charset 바로 뒤). */
export const ARCHIVE_SNIFF_BYTES = 1024;

/** 이 경로가 보관 지면일 수 있는 페이지 HTML 인지(CLI 가 이것만 머리를 읽는다). */
export function isPageHtmlPath(relPath: string): boolean {
  const p = relPath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/^en\//, "");
  const m = PAGE_RE.exec(p);
  return Boolean(m && m[3] === "html");
}

export interface Classified {
  cls: SizeClass;
  lang: Lang;
  /** 기사·호 페이지 파일이면 어느 페이지의 어느 부분인지(html+txt 를 한 쪽으로 묶는 키). */
  page?: { kind: PageKind; id: string; part: PagePart };
}

const FONT_EXT = /\.(woff2?|ttf|otf|eot)$/i;
/** `article/<id>/index.html`(trailingSlash) 와 `article/<id>.html` 둘 다 받는다. */
const PAGE_RE = /^(article|edition)\/([^/]+?)(?:\/index)?\.(html|txt)$/;
const HOME_RE = /^index\.(html|txt)$/;
const OG_RE = /^og\/(?:en\/)?(article|edition)\/[^/]+\.png$/i;

/**
 * out/ 기준 상대 경로(구분자 `/` 또는 `\`) → 분류·언어·페이지.
 * 영어판은 `en/` 접두(`en/article/<id>/…`, `en/edition/…`, `en/index.html`)와 `og/en/…` 를 영어로 센다.
 * 검색·홈 색인은 나눠 낸 파일(`search-index/ko/2026-11.json`, `feed-index/…`)도 접두로 넓게 받는다.
 * 월별 조각(Phase 4-2)은 언어가 디렉터리라(`search-index/en/…`) 그 자리의 `en` 도 영어로 센다.
 * `archive` 가 참이면(CLI 가 HTML 머리의 보관 표지를 봤다) 기사·호 HTML 을 보관 지면(`article-archive`·`edition-archive`)으로 센다.
 */
export function classifyPath(relPath: string, archive = false): Classified {
  let p = relPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  let lang: Lang = "ko";
  if (p.startsWith("en/")) {
    lang = "en";
    p = p.slice(3);
  }

  const page = PAGE_RE.exec(p);
  if (page) {
    const base = page[1] as "article" | "edition";
    const part = page[3] as PagePart;
    if (archive && part === "html") {
      const kind: PageKind = `${base}-archive`;
      return { cls: kind, lang, page: { kind, id: page[2], part } };
    }
    return { cls: `${base}-${part}`, lang, page: { kind: base, id: page[2], part } };
  }
  if (HOME_RE.test(p)) return { cls: "home", lang };

  const og = OG_RE.exec(p);
  if (og) {
    if (p.startsWith("og/en/")) lang = "en";
    return { cls: og[1].toLowerCase() === "article" ? "og-article" : "og-edition", lang };
  }

  if (p.startsWith("fonts/")) return { cls: "fonts", lang };
  if (p.startsWith("_next/")) return { cls: FONT_EXT.test(p) ? "fonts" : "next-static", lang };
  const indexLang: Lang = /(^|\/)(search|feed)-index\/en\//.test(p) ? "en" : lang;
  if (/(^|\/)search-index[^/]*(\/|$)/.test(p)) return { cls: "search-index", lang: indexLang };
  if (/(^|\/)feed-index[^/]*(\/|$)/.test(p)) return { cls: "feed-index", lang: indexLang };
  return { cls: "other", lang };
}

// ── 통계 ────────────────────────────────────────────────────────────────

/** 정렬된 값의 백분위 — 선형 보간(numpy 기본값, 0-4 측정과 같은 방식). 빈 배열은 0. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = ((sorted.length - 1) * Math.min(100, Math.max(0, p))) / 100;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface Dist {
  count: number;
  avg: number;
  p50: number;
  p90: number;
  max: number;
  min: number;
}

export function distOf(values: number[]): Dist {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: n,
    avg: n ? sum / n : 0,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    max: n ? sorted[n - 1] : 0,
    min: n ? sorted[0] : 0,
  };
}

// ── 보고서 ──────────────────────────────────────────────────────────────

export interface FileEntry {
  /** out/ 기준 상대 경로. */
  path: string;
  bytes: number;
  /** 보관 지면 HTML(머리에 보관 표지) — CLI 가 단다. 없으면 경로로만 가른다. */
  archive?: boolean;
}

export interface ClassRow {
  cls: SizeClass;
  /** 공용 분류(SHARED_CLASSES)는 null. */
  lang: Lang | null;
  bytes: number;
  files: number;
}

export interface PageSize {
  id: string;
  html: number;
  txt: number;
  total: number;
}

export interface PageStats {
  kind: PageKind;
  lang: Lang;
  /** html+txt 합계(한 쪽). */
  combined: Dist;
  html: Dist;
  txt: Dist;
  /** 합계 기준 무거운 순 상위 HEAVIEST_N 쪽. */
  heaviest: PageSize[];
  /** 쪽마다 보는 예산(보관 지면)을 넘은 쪽 — 예외(ARCHIVE_BUDGET_EXEMPT) 빼고, 무거운 순. 평균 예산 종류는 빈 배열. */
  overBudget: PageSize[];
  /** 예산을 넘었지만 예외로 둔 쪽 수. */
  exempt: number;
}

export interface SizeReport {
  totalBytes: number;
  fileCount: number;
  /** SIZE_CLASSES 순서 → 언어 순(ko, en). 0 파일인 분류는 뺀다. */
  classes: ClassRow[];
  /** 기사·호 × 언어 — 페이지가 1쪽 이상인 것만, 기사 ko → 기사 en → 호 ko → 호 en 순. */
  pages: PageStats[];
}

export const HEAVIEST_N = 5;

export function buildSizeReport(files: FileEntry[]): SizeReport {
  const classMap = new Map<string, ClassRow>();
  const pageMap = new Map<string, { kind: PageKind; lang: Lang; size: PageSize }>();
  let totalBytes = 0;

  for (const f of files) {
    totalBytes += f.bytes;
    const c = classifyPath(f.path, f.archive);
    const lang = SHARED_CLASSES.has(c.cls) ? null : c.lang;
    const key = `${c.cls}|${lang ?? ""}`;
    const row = classMap.get(key) ?? { cls: c.cls, lang, bytes: 0, files: 0 };
    row.bytes += f.bytes;
    row.files += 1;
    classMap.set(key, row);

    if (c.page) {
      const pkey = `${c.page.kind}|${c.lang}|${c.page.id}`;
      const entry = pageMap.get(pkey) ?? {
        kind: c.page.kind,
        lang: c.lang,
        size: { id: c.page.id, html: 0, txt: 0, total: 0 },
      };
      entry.size[c.page.part] += f.bytes;
      entry.size.total += f.bytes;
      pageMap.set(pkey, entry);
    }
  }

  const langOrder = (l: Lang | null) => (l === null ? -1 : LANGS.indexOf(l));
  const classes = [...classMap.values()].sort(
    (a, b) =>
      SIZE_CLASSES.indexOf(a.cls) - SIZE_CLASSES.indexOf(b.cls) ||
      langOrder(a.lang) - langOrder(b.lang),
  );

  const pages: PageStats[] = [];
  for (const kind of PAGE_KINDS) {
    for (const lang of LANGS) {
      const sizes = [...pageMap.values()]
        .filter((e) => e.kind === kind && e.lang === lang)
        .map((e) => e.size);
      if (sizes.length === 0) continue;
      const perPage = PAGE_BUDGET_MODE[kind] === "page";
      const over = perPage ? sizes.filter((p) => p.total > PAGE_BUDGETS[kind]) : [];
      const isExempt = (p: PageSize) =>
        kind === "edition-archive" && ARCHIVE_BUDGET_EXEMPT.has(p.id);
      pages.push({
        kind,
        lang,
        combined: distOf(sizes.map((s) => s.total)),
        html: distOf(sizes.map((s) => s.html)),
        txt: distOf(sizes.map((s) => s.txt)),
        heaviest: [...sizes]
          .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
          .slice(0, HEAVIEST_N),
        overBudget: over
          .filter((p) => !isExempt(p))
          .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id)),
        exempt: over.filter(isExempt).length,
      });
    }
  }

  return { totalBytes, fileCount: files.length, classes, pages };
}

// ── 판정 ────────────────────────────────────────────────────────────────

export type TotalLevel = "ok" | "warn" | "fail";

export function totalLevel(bytes: number): TotalLevel {
  if (bytes >= TOTAL_FAIL_BYTES) return "fail";
  if (bytes >= TOTAL_WARN_BYTES) return "warn";
  return "ok";
}

export const PAGE_BUDGETS: Record<PageKind, number> = {
  article: ARTICLE_PAGE_BUDGET_BYTES,
  edition: EDITION_PAGE_BUDGET_BYTES,
  "article-archive": ARCHIVE_ARTICLE_PAGE_BUDGET_BYTES,
  "edition-archive": ARCHIVE_EDITION_PAGE_BUDGET_BYTES,
};

/** 예산을 평균으로 볼지(전체 페이지) 쪽마다 볼지(보관 지면 — "≤ 8KB 라이트 페이지"는 쪽마다의 약속이다). */
export const PAGE_BUDGET_MODE: Record<PageKind, "avg" | "page"> = {
  article: "avg",
  edition: "avg",
  "article-archive": "page",
  "edition-archive": "page",
};

export interface Finding {
  level: "warning" | "error";
  title: string;
  message: string;
}

export interface SizeAssessment {
  level: TotalLevel;
  /** 1GB 까지 남은 바이트(넘었으면 음수). */
  headroomBytes: number;
  findings: Finding[];
}

const KIND_LABELS: Record<PageKind, string> = {
  article: "기사",
  edition: "호",
  "article-archive": "보관 기사",
  "edition-archive": "보관 호",
};

export function assessSizeReport(report: SizeReport): SizeAssessment {
  const level = totalLevel(report.totalBytes);
  const findings: Finding[] = [];
  const total = formatBytes(report.totalBytes);
  const headroom = formatBytes(PAGES_LIMIT_BYTES - report.totalBytes);

  if (level === "fail") {
    findings.push({
      level: "error",
      title: "산출물 크기 초과",
      message: `out/ ${total} ≥ 실패선 ${formatBytes(TOTAL_FAIL_BYTES)} — GitHub Pages 한도 1 GB 까지 ${headroom}. 배포를 멈춘다. 페이지 경량화(Phase 4)·보관 등급을 먼저 적용할 것`,
    });
  } else if (level === "warn") {
    findings.push({
      level: "warning",
      title: "산출물 크기 경고",
      message: `out/ ${total} ≥ 경고선 ${formatBytes(TOTAL_WARN_BYTES)} — 실패선(${formatBytes(TOTAL_FAIL_BYTES)})까지 ${formatBytes(TOTAL_FAIL_BYTES - report.totalBytes)}, 1 GB 까지 ${headroom}`,
    });
  }

  for (const s of report.pages) {
    const budget = PAGE_BUDGETS[s.kind];
    if (PAGE_BUDGET_MODE[s.kind] === "page") {
      if (s.overBudget.length > 0) {
        const top = s.overBudget[0];
        findings.push({
          level: "warning",
          title: "페이지 예산 초과",
          message: `${KIND_LABELS[s.kind]} 페이지(${s.lang}) ${s.overBudget.length.toLocaleString("en-US")}쪽 > 예산 ${formatKB(budget)}/쪽 (최대 ${formatKB(top.total)} ${top.id}, 전체 ${s.combined.count.toLocaleString("en-US")}쪽${s.exempt ? ` · 예외 ${s.exempt}쪽 제외` : ""})`,
        });
      }
      continue;
    }
    if (s.combined.avg > budget) {
      findings.push({
        level: "warning",
        title: "페이지 예산 초과",
        message: `${KIND_LABELS[s.kind]} 페이지(${s.lang}) 평균 ${formatKB(s.combined.avg)} > 예산 ${formatKB(budget)} (${s.combined.count.toLocaleString("en-US")}쪽, p90 ${formatKB(s.combined.p90)})`,
      });
    }
  }

  return { level, headroomBytes: PAGES_LIMIT_BYTES - report.totalBytes, findings };
}

/** `--ci` 종료 코드 — 실패선을 넘을 때만 1. 페이지 예산 초과는 경고뿐이다. */
export function ciExitCode(assessment: SizeAssessment): number {
  return assessment.level === "fail" ? 1 : 0;
}

// ── 출력 ────────────────────────────────────────────────────────────────

function withCommas(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** 10진 단위: 1,000 B = 1 KB, 10^6 B = 1 MB, 10^9 B = 1 GB. 음수는 부호를 붙인다. */
export function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? "-" : "";
  const b = Math.abs(bytes);
  if (b >= 1e9) return `${sign}${(b / 1e9).toFixed(3)} GB`;
  if (b >= 1e6) return `${sign}${(b / 1e6).toFixed(2)} MB`;
  if (b >= 1e3) return `${sign}${(b / 1e3).toFixed(1)} KB`;
  return `${sign}${Math.round(b)} B`;
}

export function formatKB(bytes: number): string {
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}

function signed(text: string, delta: number): string {
  return delta > 0 ? `+${text}` : text;
}

const langCell = (l: Lang | null) => l ?? "공용";

/** 한글·전각 문자를 2칸으로 센 표시 폭(콘솔 표 정렬용). */
export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6);
    w += wide ? 2 : 1;
  }
  return w;
}

/** 콘솔 표 — 첫 열은 왼쪽, 나머지는 오른쪽 정렬. */
export function textTable(header: string[], rows: string[][]): string {
  const all = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...all.map((r) => displayWidth(r[i] ?? ""))));
  const fmt = (r: string[]) =>
    r
      .map((c, i) => {
        const pad = " ".repeat(widths[i] - displayWidth(c));
        return i === 0 ? c + pad : pad + c;
      })
      .join("  ")
      .trimEnd();
  const sep = widths.map((w) => "─".repeat(w)).join("  ");
  return [fmt(header), sep, ...rows.map(fmt)].join("\n");
}

function mdTable(header: string[], rows: string[][], align: string[]): string {
  const line = (r: string[]) => `| ${r.join(" | ")} |`;
  return [line(header), line(align), ...rows.map(line)].join("\n");
}

const LEVEL_TEXT: Record<TotalLevel, string> = {
  ok: "정상",
  warn: "경고(700MB 이상)",
  fail: "실패(950MB 이상)",
};

function pageTitle(s: PageStats): string {
  return `${KIND_LABELS[s.kind]}(${s.lang})`;
}

function budgetCell(s: PageStats): string {
  const budget = PAGE_BUDGETS[s.kind];
  if (PAGE_BUDGET_MODE[s.kind] === "page") {
    const exempt = s.exempt ? ` (예외 ${s.exempt})` : "";
    return `${formatKB(budget)}/쪽 ${s.overBudget.length ? `${s.overBudget.length}쪽 초과` : "이내"}${exempt}`;
  }
  return `${formatKB(budget)} ${s.combined.avg > budget ? "초과" : "이내"}`;
}

/** 로컬 콘솔 보고서(주석 없음). */
export function sizeConsole(
  report: SizeReport,
  assessment: SizeAssessment,
  outDir?: string,
): string {
  const lines: string[] = [];
  lines.push(`산출물 크기${outDir ? ` — ${outDir}` : ""}`);
  lines.push(
    `전체 ${formatBytes(report.totalBytes)} (${withCommas(report.totalBytes)} B) · 파일 ${withCommas(report.fileCount)}개 · 판정 ${LEVEL_TEXT[assessment.level]}`,
  );
  lines.push(
    `1 GB 까지 ${formatBytes(assessment.headroomBytes)} · 경고선 ${formatBytes(TOTAL_WARN_BYTES)} · 실패선 ${formatBytes(TOTAL_FAIL_BYTES)}`,
  );
  lines.push("");
  lines.push(
    textTable(
      ["분류", "언어", "파일", "크기", "비중"],
      report.classes.map((c) => [
        SIZE_CLASS_LABELS[c.cls],
        langCell(c.lang),
        withCommas(c.files),
        formatBytes(c.bytes),
        pct(c.bytes, report.totalBytes),
      ]),
    ),
  );

  if (report.pages.length) {
    lines.push("");
    lines.push("페이지당 크기 (KB = 1,000 B)");
    const rows: string[][] = [];
    for (const s of report.pages) {
      // 보관 지면은 HTML 한 장이라 합계 줄만.
      const parts = [
        ["합계", s.combined],
        ["HTML", s.html],
        ["RSC", s.txt],
      ] as const;
      for (const [part, d] of PAGE_BUDGET_MODE[s.kind] === "page" ? parts.slice(0, 1) : parts) {
        rows.push([
          part === "합계" ? pageTitle(s) : "",
          part,
          withCommas(d.count),
          formatKB(d.avg),
          formatKB(d.p50),
          formatKB(d.p90),
          formatKB(d.max),
          part === "합계" ? budgetCell(s) : "",
        ]);
      }
    }
    lines.push(textTable(["페이지", "부분", "쪽", "평균", "p50", "p90", "최대", "예산"], rows));

    for (const s of report.pages) {
      lines.push("");
      lines.push(`가장 무거운 ${pageTitle(s)} ${s.heaviest.length}쪽`);
      lines.push(
        textTable(
          ["id", "합계", "HTML", "RSC"],
          s.heaviest.map((p) => [p.id, formatKB(p.total), formatKB(p.html), formatKB(p.txt)]),
        ),
      );
    }
  }

  lines.push("");
  if (assessment.findings.length === 0) lines.push("판정: 경고 없음");
  for (const f of assessment.findings) {
    lines.push(`${f.level === "error" ? "실패" : "경고"}: ${f.message}`);
  }
  return lines.join("\n");
}

/** GitHub 워크플로 명령의 메시지 이스케이프(%·CR·LF). */
function escapeCommand(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** `--ci` 주석 — 전체 크기 경고·실패, 페이지 예산 초과 경고. */
export function sizeAnnotations(assessment: SizeAssessment): string[] {
  return assessment.findings.map(
    (f) => `::${f.level} title=${f.title}::${escapeCommand(f.message)}`,
  );
}

/** `$GITHUB_STEP_SUMMARY` 용 짧은 Markdown — 전체·여유, 분류별 크기, 페이지 평균 대 예산. */
export function sizeMarkdown(report: SizeReport, assessment: SizeAssessment): string {
  const lines: string[] = [];
  lines.push("### 산출물 크기");
  lines.push("");
  lines.push(
    `**${formatBytes(report.totalBytes)}** · 파일 ${withCommas(report.fileCount)}개 · 판정 **${LEVEL_TEXT[assessment.level]}** · 1 GB 까지 ${formatBytes(assessment.headroomBytes)} (경고 ${formatBytes(TOTAL_WARN_BYTES)} · 실패 ${formatBytes(TOTAL_FAIL_BYTES)})`,
  );
  lines.push("");
  lines.push(
    mdTable(
      ["분류", "언어", "파일", "크기", "비중"],
      report.classes.map((c) => [
        SIZE_CLASS_LABELS[c.cls],
        langCell(c.lang),
        withCommas(c.files),
        formatBytes(c.bytes),
        pct(c.bytes, report.totalBytes),
      ]),
      [":--", ":--", "--:", "--:", "--:"],
    ),
  );
  if (report.pages.length) {
    lines.push("");
    lines.push(
      mdTable(
        ["페이지(html+txt)", "쪽", "평균", "p50", "p90", "최대", "예산"],
        report.pages.map((s) => [
          pageTitle(s),
          withCommas(s.combined.count),
          formatKB(s.combined.avg),
          formatKB(s.combined.p50),
          formatKB(s.combined.p90),
          formatKB(s.combined.max),
          budgetCell(s),
        ]),
        [":--", "--:", "--:", "--:", "--:", "--:", "--:"],
      ),
    );
  }
  if (assessment.findings.length) {
    lines.push("");
    for (const f of assessment.findings) {
      lines.push(`- ${f.level === "error" ? "**실패**" : "경고"}: ${f.message}`);
    }
  }
  return lines.join("\n");
}

/** 두 산출물 비교(`--base`) — 경량화 작업 전후 차이. 분류별·페이지 평균별 증감. */
export function sizeComparison(base: SizeReport, cand: SizeReport): string {
  const lines: string[] = [];
  const delta = (a: number, b: number) => signed(formatBytes(b - a), b - a);
  const deltaPct = (a: number, b: number) =>
    a > 0 ? signed(`${(((b - a) / a) * 100).toFixed(1)}%`, b - a) : "—";

  lines.push("기준 대비 차이 (--base)");
  lines.push(
    `전체 ${formatBytes(base.totalBytes)} → ${formatBytes(cand.totalBytes)} (${delta(base.totalBytes, cand.totalBytes)}, ${deltaPct(base.totalBytes, cand.totalBytes)}) · 파일 ${withCommas(base.fileCount)} → ${withCommas(cand.fileCount)}`,
  );
  lines.push("");

  const key = (c: ClassRow) => `${c.cls}|${c.lang ?? ""}`;
  const baseMap = new Map(base.classes.map((c) => [key(c), c]));
  const candMap = new Map(cand.classes.map((c) => [key(c), c]));
  const keys = [...new Set([...baseMap.keys(), ...candMap.keys()])];
  const ordered = keys
    .map((k) => (candMap.get(k) ?? baseMap.get(k)) as ClassRow)
    .sort(
      (a, b) =>
        SIZE_CLASSES.indexOf(a.cls) - SIZE_CLASSES.indexOf(b.cls) ||
        String(a.lang).localeCompare(String(b.lang)),
    );
  lines.push(
    textTable(
      ["분류", "언어", "기준", "후보", "차이", "증감"],
      ordered.map((c) => {
        const a = baseMap.get(key(c))?.bytes ?? 0;
        const b = candMap.get(key(c))?.bytes ?? 0;
        return [
          SIZE_CLASS_LABELS[c.cls],
          langCell(c.lang),
          formatBytes(a),
          formatBytes(b),
          delta(a, b),
          deltaPct(a, b),
        ];
      }),
    ),
  );

  const pageKey = (s: PageStats) => `${s.kind}|${s.lang}`;
  const basePages = new Map(base.pages.map((s) => [pageKey(s), s]));
  const rows: string[][] = [];
  for (const s of cand.pages) {
    const b = basePages.get(pageKey(s));
    const parts = [
      ["합계", (x: PageStats) => x.combined],
      ["HTML", (x: PageStats) => x.html],
      ["RSC", (x: PageStats) => x.txt],
    ] as const;
    // 보관 지면은 HTML 한 장이라 합계 줄만.
    for (const [part, pick] of PAGE_BUDGET_MODE[s.kind] === "page" ? parts.slice(0, 1) : parts) {
      const before = b ? pick(b).avg : 0;
      const after = pick(s).avg;
      rows.push([
        part === "합계" ? pageTitle(s) : "",
        part,
        b ? formatKB(before) : "—",
        formatKB(after),
        b ? signed(formatKB(after - before), after - before) : "—",
        b ? deltaPct(before, after) : "—",
        part === "합계" && b ? `${formatKB(pick(b).p90)} → ${formatKB(pick(s).p90)}` : "",
      ]);
    }
  }
  if (rows.length) {
    lines.push("");
    lines.push("페이지 평균");
    lines.push(textTable(["페이지", "부분", "기준", "후보", "차이", "증감", "p90"], rows));
  }
  return lines.join("\n");
}
