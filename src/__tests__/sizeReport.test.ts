// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_ARTICLE_PAGE_BUDGET_BYTES,
  ARCHIVE_BUDGET_EXEMPT,
  ARCHIVE_EDITION_PAGE_BUDGET_BYTES,
  ARTICLE_PAGE_BUDGET_BYTES,
  EDITION_PAGE_BUDGET_BYTES,
  PAGES_LIMIT_BYTES,
  TOTAL_FAIL_BYTES,
  TOTAL_WARN_BYTES,
  assessSizeReport,
  buildSizeReport,
  ciExitCode,
  classifyPath,
  displayWidth,
  distOf,
  formatBytes,
  isArchiveHtml,
  isPageHtmlPath,
  percentile,
  sizeAnnotations,
  sizeComparison,
  sizeConsole,
  sizeMarkdown,
  totalLevel,
  type FileEntry,
} from "../../scripts/lib/sizeReport";

describe("classifyPath", () => {
  it.each([
    ["article/123/index.html", "article-html", "ko", { kind: "article", id: "123", part: "html" }],
    ["article/123/index.txt", "article-txt", "ko", { kind: "article", id: "123", part: "txt" }],
    ["article/7.html", "article-html", "ko", { kind: "article", id: "7", part: "html" }],
    [
      "en/article/123/index.html",
      "article-html",
      "en",
      { kind: "article", id: "123", part: "html" },
    ],
    ["en/article/123/index.txt", "article-txt", "en", { kind: "article", id: "123", part: "txt" }],
    [
      "edition/2026-11-04/index.html",
      "edition-html",
      "ko",
      { kind: "edition", id: "2026-11-04", part: "html" },
    ],
    [
      "en/edition/2026-11-04/index.txt",
      "edition-txt",
      "en",
      { kind: "edition", id: "2026-11-04", part: "txt" },
    ],
  ])("%s → %s (%s)", (p, cls, lang, page) => {
    expect(classifyPath(p)).toEqual({ cls, lang, page });
  });

  it.each([
    ["index.html", "home", "ko"],
    ["index.txt", "home", "ko"],
    ["en/index.html", "home", "en"],
    ["og/article/1169.png", "og-article", "ko"],
    ["og/edition/2026-11-04.png", "og-edition", "ko"],
    ["en/og/article/1169.png", "og-article", "en"],
    ["og/en/edition/2026-11-04.png", "og-edition", "en"],
    ["og/default.png", "other", "ko"],
    ["_next/static/chunks/app/page-abc.js", "next-static", "ko"],
    ["_next/static/css/abc.css", "next-static", "ko"],
    ["_next/static/media/0b1b2b3916c110db-s.woff2", "fonts", "ko"],
    ["fonts/PretendardVariable.woff2", "fonts", "ko"],
    ["search-index.json", "search-index", "ko"],
    ["search-index-2026-11.json", "search-index", "ko"],
    ["search-index/2026-11.json", "search-index", "ko"],
    ["search-index/ko/manifest.json", "search-index", "ko"],
    ["search-index/ko/2026-11.json", "search-index", "ko"],
    ["search-index/en/2026-11.json", "search-index", "en"],
    ["feed-index/ko/manifest.json", "feed-index", "ko"],
    ["feed-index/en/manifest.json", "feed-index", "en"],
    ["en/search-index.json", "search-index", "en"],
    ["feed-index.json", "feed-index", "ko"],
    ["feed-index/page-2.json", "feed-index", "ko"],
    ["en/feed-index-1.json", "feed-index", "en"],
    ["latest.json", "other", "ko"],
    ["search/index.html", "other", "ko"],
    ["404.html", "other", "ko"],
    ["en/search/index.html", "other", "en"],
    ["article/123/opengraph.png", "other", "ko"],
  ])("%s → %s (%s)", (p, cls, lang) => {
    const c = classifyPath(p);
    expect(c.cls).toBe(cls);
    expect(c.lang).toBe(lang);
    expect(c.page).toBeUndefined();
  });

  it("윈도 구분자·./ 접두도 받는다", () => {
    expect(classifyPath("article\\5\\index.html").page).toEqual({
      kind: "article",
      id: "5",
      part: "html",
    });
    expect(classifyPath("./en/index.txt")).toEqual({ cls: "home", lang: "en" });
  });
});

describe("percentile·distOf", () => {
  it("선형 보간(numpy 기본값)", () => {
    const xs = [10, 20, 30, 40];
    expect(percentile(xs, 0)).toBe(10);
    expect(percentile(xs, 50)).toBe(25);
    expect(percentile(xs, 90)).toBeCloseTo(37);
    expect(percentile(xs, 100)).toBe(40);
    expect(percentile([5], 90)).toBe(5);
    expect(percentile([], 50)).toBe(0);
  });

  it("1..10 의 p50 = 5.5, p90 = 9.1", () => {
    const xs = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(percentile(xs, 50)).toBe(5.5);
    expect(percentile(xs, 90)).toBeCloseTo(9.1);
  });

  it("distOf 는 정렬하지 않은 값도 받는다", () => {
    expect(distOf([30, 10, 20])).toEqual({ count: 3, avg: 20, p50: 20, p90: 28, max: 30, min: 10 });
    expect(distOf([])).toEqual({ count: 0, avg: 0, p50: 0, p90: 0, max: 0, min: 0 });
  });
});

function articles(lang: "ko" | "en", n: number, html: number, txt: number): FileEntry[] {
  const pre = lang === "en" ? "en/" : "";
  return Array.from({ length: n }, (_, i) => [
    { path: `${pre}article/${i + 1}/index.html`, bytes: html + i * 1000 },
    { path: `${pre}article/${i + 1}/index.txt`, bytes: txt },
  ]).flat();
}

describe("buildSizeReport", () => {
  const files: FileEntry[] = [
    ...articles("ko", 4, 20_000, 10_000), // 쪽 30·31·32·33 KB
    ...articles("en", 2, 25_000, 10_000), // 35·36 KB
    { path: "edition/2026-11-03/index.html", bytes: 90_000 },
    { path: "edition/2026-11-03/index.txt", bytes: 40_000 },
    { path: "edition/2026-11-04/index.html", bytes: 110_000 },
    { path: "edition/2026-11-04/index.txt", bytes: 50_000 },
    { path: "index.html", bytes: 5_000 },
    { path: "_next/static/chunks/a.js", bytes: 1_000 },
    { path: "_next/static/media/a.woff2", bytes: 2_000 },
    { path: "fonts/b.ttf", bytes: 3_000 },
    { path: "latest.json", bytes: 500 },
  ];
  const report = buildSizeReport(files);

  it("전체·분류별 합계(공용 분류는 언어 없음)", () => {
    expect(report.fileCount).toBe(files.length);
    expect(report.totalBytes).toBe(files.reduce((s, f) => s + f.bytes, 0));
    const row = (cls: string, lang: string | null) =>
      report.classes.find((c) => c.cls === cls && c.lang === lang);
    expect(row("article-html", "ko")).toEqual({
      cls: "article-html",
      lang: "ko",
      bytes: 86_000,
      files: 4,
    });
    expect(row("article-html", "en")?.bytes).toBe(51_000);
    expect(row("fonts", null)).toEqual({ cls: "fonts", lang: null, bytes: 5_000, files: 2 });
    expect(row("next-static", null)?.files).toBe(1);
    // SIZE_CLASSES 순서 → 언어 순
    expect(report.classes.slice(0, 3).map((c) => `${c.cls}/${c.lang}`)).toEqual([
      "article-html/ko",
      "article-html/en",
      "article-txt/ko",
    ]);
  });

  it("페이지는 html+txt 를 한 쪽으로 묶고 언어별로 낸다", () => {
    expect(report.pages.map((s) => `${s.kind}/${s.lang}`)).toEqual([
      "article/ko",
      "article/en",
      "edition/ko",
    ]);
    const ko = report.pages[0];
    expect(ko.combined.count).toBe(4);
    expect(ko.combined.avg).toBe(31_500);
    expect(ko.combined.max).toBe(33_000);
    expect(ko.html.avg).toBe(21_500);
    expect(ko.txt.avg).toBe(10_000);
    expect(ko.heaviest.map((p) => p.id)).toEqual(["4", "3", "2", "1"]);
    expect(ko.heaviest[0]).toEqual({ id: "4", html: 23_000, txt: 10_000, total: 33_000 });
    expect(report.pages[2].combined.avg).toBe(145_000);
  });

  it("가장 무거운 쪽은 5개까지", () => {
    const r = buildSizeReport(articles("ko", 8, 1_000, 1_000));
    expect(r.pages[0].heaviest.map((p) => p.id)).toEqual(["8", "7", "6", "5", "4"]);
  });

  it("빈 산출물", () => {
    expect(buildSizeReport([])).toEqual({ totalBytes: 0, fileCount: 0, classes: [], pages: [] });
  });
});

describe("판정", () => {
  it("기준값", () => {
    expect(TOTAL_WARN_BYTES).toBe(700_000_000);
    expect(TOTAL_FAIL_BYTES).toBe(950_000_000);
    expect(PAGES_LIMIT_BYTES).toBe(1_000_000_000);
    expect(ARTICLE_PAGE_BUDGET_BYTES).toBe(40_000);
    expect(EDITION_PAGE_BUDGET_BYTES).toBe(150_000);
  });

  it.each([
    [TOTAL_WARN_BYTES - 1, "ok"],
    [TOTAL_WARN_BYTES, "warn"],
    [TOTAL_WARN_BYTES + 1, "warn"],
    [TOTAL_FAIL_BYTES - 1, "warn"],
    [TOTAL_FAIL_BYTES, "fail"],
    [TOTAL_FAIL_BYTES + 1, "fail"],
  ])("전체 %d B → %s", (bytes, level) => {
    expect(totalLevel(bytes)).toBe(level);
  });

  /** 전체 크기를 맞추기 위한 덩어리 파일 + 예산 이내 기사·호 한 쪽씩. */
  const sized = (total: number): FileEntry[] => [
    { path: "article/1/index.html", bytes: 20_000 },
    { path: "article/1/index.txt", bytes: 10_000 },
    { path: "edition/2026-11-04/index.html", bytes: 100_000 },
    { path: "other.bin", bytes: total - 130_000 },
  ];

  it("700MB 바로 아래: 경고·주석 없음, 종료 0", () => {
    const a = assessSizeReport(buildSizeReport(sized(TOTAL_WARN_BYTES - 1)));
    expect(a.level).toBe("ok");
    expect(a.findings).toEqual([]);
    expect(sizeAnnotations(a)).toEqual([]);
    expect(ciExitCode(a)).toBe(0);
  });

  it("700MB 이상: ::warning::, 종료 0", () => {
    const a = assessSizeReport(buildSizeReport(sized(TOTAL_WARN_BYTES + 1)));
    expect(a.level).toBe("warn");
    expect(ciExitCode(a)).toBe(0);
    const ann = sizeAnnotations(a);
    expect(ann).toHaveLength(1);
    expect(ann[0]).toMatch(
      /^::warning title=산출물 크기 경고::out\/ 700\.00 MB ≥ 경고선 700\.00 MB/,
    );
    expect(ann[0]).toContain("1 GB 까지 300.00 MB");
  });

  it("950MB 바로 아래는 경고, 이상은 ::error:: + 종료 1", () => {
    const under = assessSizeReport(buildSizeReport(sized(TOTAL_FAIL_BYTES - 1)));
    expect(under.level).toBe("warn");
    expect(ciExitCode(under)).toBe(0);

    const over = assessSizeReport(buildSizeReport(sized(TOTAL_FAIL_BYTES + 1)));
    expect(over.level).toBe("fail");
    expect(over.headroomBytes).toBe(PAGES_LIMIT_BYTES - TOTAL_FAIL_BYTES - 1);
    expect(ciExitCode(over)).toBe(1);
    const ann = sizeAnnotations(over);
    expect(ann).toHaveLength(1);
    expect(ann[0]).toMatch(/^::error title=산출물 크기 초과::/);
    expect(ann[0]).toContain("1 GB 까지 50.00 MB");
  });

  it("1GB 를 넘으면 여유가 음수", () => {
    const a = assessSizeReport(buildSizeReport(sized(PAGES_LIMIT_BYTES + 2_000_000)));
    expect(a.headroomBytes).toBe(-2_000_000);
    expect(sizeAnnotations(a)[0]).toContain("1 GB 까지 -2.00 MB");
  });

  it("페이지 예산: 평균이 예산과 같으면 통과, 넘으면 언어별 경고만(종료 0)", () => {
    const at = assessSizeReport(
      buildSizeReport([
        { path: "article/1/index.html", bytes: 30_000 },
        { path: "article/1/index.txt", bytes: 10_000 },
        { path: "edition/2026-11-04/index.html", bytes: 150_000 },
      ]),
    );
    expect(at.findings).toEqual([]);

    const over = assessSizeReport(
      buildSizeReport([
        ...articles("ko", 2, 30_000, 10_001), // 평균 40.5 KB
        ...articles("en", 2, 20_000, 10_000), // 평균 30.5 KB — 이내
        { path: "edition/2026-11-04/index.html", bytes: 150_001 },
        { path: "en/edition/2026-11-04/index.html", bytes: 200_000 },
      ]),
    );
    expect(over.level).toBe("ok");
    expect(ciExitCode(over)).toBe(0);
    expect(over.findings.map((f) => [f.level, f.title])).toEqual([
      ["warning", "페이지 예산 초과"],
      ["warning", "페이지 예산 초과"],
      ["warning", "페이지 예산 초과"],
    ]);
    const ann = sizeAnnotations(over);
    expect(ann[0]).toBe(
      "::warning title=페이지 예산 초과::기사 페이지(ko) 평균 40.5 KB > 예산 40.0 KB (2쪽, p90 40.9 KB)",
    );
    expect(ann[1]).toContain("호 페이지(ko) 평균 150.0 KB > 예산 150.0 KB");
    expect(ann[2]).toContain("호 페이지(en) 평균 200.0 KB");
    expect(ann.some((a) => a.includes("기사 페이지(en)"))).toBe(false);
  });

  it("주석 메시지의 %·줄바꿈은 이스케이프한다", () => {
    const ann = sizeAnnotations({
      level: "warn",
      headroomBytes: 0,
      findings: [{ level: "warning", title: "t", message: "100%\n둘째 줄" }],
    });
    expect(ann).toEqual(["::warning title=t::100%25%0A둘째 줄"]);
  });
});

describe("출력", () => {
  const report = buildSizeReport([
    ...articles("ko", 3, 60_000, 30_000),
    { path: "edition/2026-11-04/index.html", bytes: 250_000 },
    { path: "edition/2026-11-04/index.txt", bytes: 120_000 },
    { path: "_next/static/media/a.woff2", bytes: 4_000_000 },
  ]);
  const assessment = assessSizeReport(report);

  it("formatBytes 는 10진 단위", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(92_000)).toBe("92.0 KB");
    expect(formatBytes(144_650_000)).toBe("144.65 MB");
    expect(formatBytes(1_000_000_000)).toBe("1.000 GB");
    expect(formatBytes(-2_500_000)).toBe("-2.50 MB");
  });

  it("displayWidth 는 한글을 2칸으로 센다", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("기사 HTML")).toBe(9);
  });

  it("콘솔: 전체·여유·분류·페이지 표·무거운 쪽·예산 경고, 주석 없음", () => {
    const text = sizeConsole(report, assessment, "out");
    expect(text).toContain("산출물 크기 — out");
    expect(text).toContain("1 GB 까지");
    expect(text).toContain("기사(ko)");
    expect(text).toContain("40.0 KB 초과");
    expect(text).toContain("가장 무거운 기사(ko) 3쪽");
    expect(text).toContain("가장 무거운 호(ko) 1쪽");
    expect(text).toContain("경고: 기사 페이지(ko) 평균 91.0 KB > 예산 40.0 KB");
    expect(text).not.toContain("::");
  });

  it("Markdown: 요약 줄·분류 표·페이지 표", () => {
    const md = sizeMarkdown(report, assessment);
    expect(md).toContain("### 산출물 크기");
    expect(md).toContain("판정 **정상**");
    expect(md).toContain("| 폰트(웹폰트·OG TTF) | 공용 | 1 | 4.00 MB |");
    expect(md).toContain("| 기사(ko) | 3 | 91.0 KB | 91.0 KB | 91.8 KB | 92.0 KB | 40.0 KB 초과 |");
    expect(md).toContain("| 호(ko) | 1 | 370.0 KB |");
    expect(md).toContain("- 경고: 호 페이지(ko) 평균 370.0 KB > 예산 150.0 KB");
  });

  it("비교(--base): 분류·페이지 평균 증감", () => {
    const lighter = buildSizeReport([
      ...articles("ko", 3, 20_000, 10_000),
      { path: "edition/2026-11-04/index.html", bytes: 100_000 },
      { path: "_next/static/media/a.woff2", bytes: 4_000_000 },
    ]);
    const text = sizeComparison(report, lighter);
    expect(text).toMatch(/전체 4\.64 MB → 4\.19 MB \(-\d+\.\d+ KB, -9\.\d%\)/);
    expect(text).toMatch(/기사\(ko\)\s+합계\s+91\.0 KB\s+31\.0 KB\s+-60\.0 KB\s+-65\.9%/);
    // 후보에서 사라진 분류(호 RSC)도 0 으로 보인다
    expect(text).toMatch(/호 RSC\(\.txt\)\s+ko\s+120\.0 KB\s+0 B\s+-120\.0 KB\s+-100\.0%/);
  });
});

describe("보관 지면(Phase 4-3)", () => {
  it("HTML 머리의 보관 표지로 가린다 — 경로만으로는 전체 페이지와 같다", () => {
    expect(
      isArchiveHtml(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="generator" content="daybook-archive">',
      ),
    ).toBe(true);
    expect(isArchiveHtml('<!DOCTYPE html><html><head><meta charSet="utf-8"/>')).toBe(false);
    expect(isPageHtmlPath("article/12/index.html")).toBe(true);
    expect(isPageHtmlPath("en/edition/2026-06-07/index.html")).toBe(true);
    expect(isPageHtmlPath("article/12/index.txt")).toBe(false);
    expect(isPageHtmlPath("index.html")).toBe(false);
    expect(classifyPath("article/12/index.html", true)).toEqual({
      cls: "article-archive",
      lang: "ko",
      page: { kind: "article-archive", id: "12", part: "html" },
    });
    expect(classifyPath("en/edition/2026-06-07/index.html", true)).toMatchObject({
      cls: "edition-archive",
      lang: "en",
    });
    // .txt 는 보관 표지와 무관(보관 지면에는 없다)
    expect(classifyPath("article/12/index.txt", true).cls).toBe("article-txt");
  });

  it("따로 센다 — 전체 기사·호 평균에 섞이지 않는다", () => {
    const r = buildSizeReport([
      { path: "article/1/index.html", bytes: 30_000 },
      { path: "article/2/index.html", bytes: 7_000, archive: true },
      { path: "edition/2026-06-07/index.html", bytes: 20_000, archive: true },
    ]);
    expect(r.pages.map((p) => [p.kind, p.lang, p.combined.count, p.combined.avg])).toEqual([
      ["article", "ko", 1, 30_000],
      ["article-archive", "ko", 1, 7_000],
      ["edition-archive", "ko", 1, 20_000],
    ]);
    expect(r.classes.map((c) => c.cls)).toEqual([
      "article-html",
      "article-archive",
      "edition-archive",
    ]);
  });

  it("예산은 쪽마다(기사 8KB·호 40KB) — 넘은 쪽 수·최대를 경고, 출시 전 대량 호는 예외", () => {
    expect(ARCHIVE_ARTICLE_PAGE_BUDGET_BYTES).toBe(8_000);
    expect(ARCHIVE_EDITION_PAGE_BUDGET_BYTES).toBe(40_000);
    expect([...ARCHIVE_BUDGET_EXEMPT]).toEqual(["2026-06-09", "2026-07-07", "2026-10-06"]);

    const ok = assessSizeReport(
      buildSizeReport([
        { path: "article/1/index.html", bytes: 8_000, archive: true },
        { path: "edition/2026-06-09/index.html", bytes: 70_000, archive: true }, // 예외
        { path: "edition/2026-06-07/index.html", bytes: 13_000, archive: true },
      ]),
    );
    expect(ok.findings).toEqual([]);

    const over = buildSizeReport([
      { path: "article/1/index.html", bytes: 7_000, archive: true },
      { path: "article/2/index.html", bytes: 8_001, archive: true },
      { path: "article/3/index.html", bytes: 9_500, archive: true },
      { path: "edition/2026-06-09/index.html", bytes: 70_000, archive: true },
      { path: "edition/2027-01-01/index.html", bytes: 41_000, archive: true },
    ]);
    const a = assessSizeReport(over);
    expect(ciExitCode(a)).toBe(0);
    expect(sizeAnnotations(a)).toEqual([
      "::warning title=페이지 예산 초과::보관 기사 페이지(ko) 2쪽 > 예산 8.0 KB/쪽 (최대 9.5 KB 3, 전체 3쪽)",
      "::warning title=페이지 예산 초과::보관 호 페이지(ko) 1쪽 > 예산 40.0 KB/쪽 (최대 41.0 KB 2027-01-01, 전체 2쪽 · 예외 1쪽 제외)",
    ]);
    const text = sizeConsole(over, a);
    expect(text).toContain("보관 기사(ko)");
    expect(text).toContain("8.0 KB/쪽 2쪽 초과");
    expect(text).toContain("40.0 KB/쪽 1쪽 초과 (예외 1)");
  });
});
