// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  articlePagePath,
  editionPagePath,
  isArchivePage,
  verifyArchiveOutput,
  writeArchivePages,
  type ArchiveSource,
} from "../../scripts/lib/archive";
import { readBuildAssets } from "../../scripts/lib/archiveAssets";
import { ARCHIVE_GENERATOR_META, type ArchivePlan } from "@/lib/archive";
import type { BuildAssets } from "@/lib/archivePage";
import { buildEdition } from "@/lib/edition";
import type { ArticleCard } from "@/lib/types";

/*
 * 빌드 후처리 — 보관 지면 쓰기(scripts/lib/archive.ts)와 같은 빌드의 공유 조각 읽기(scripts/lib/archiveAssets.ts).
 * DB 대신 가짜 출처(ArchiveSource)를 넘긴다.
 */

let out: string;
const put = (rel: string, content: string) => {
  const abs = path.join(out, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};
const read = (rel: string) => readFileSync(path.join(out, rel), "utf8");

beforeEach(() => {
  out = mkdtempSync(path.join(os.tmpdir(), "archive-test-"));
});
afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

/** Next 정적 export 홈 `<head>` 의 모양(React 출력 그대로 — `/>`·`charSet`·`crossorigin=""`). */
const HOME_HEAD =
  '<!DOCTYPE html><!--abc--><html lang="ko" class="__variable_33a67b __variable_96ca31"><head><meta charSet="utf-8"/>' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>' +
  '<link rel="preload" href="/global-ai-news/_next/static/media/ff840cfebfb63b0c-s.p.woff2" as="font" crossorigin="" type="font/woff2"/>' +
  '<link rel="stylesheet" href="/global-ai-news/_next/static/css/3ad5445a001bfb5f.css" data-precedence="next"/>' +
  '<link rel="stylesheet" href="/global-ai-news/_next/static/css/fa42fe11ee371e2c.css" data-precedence="next"/>' +
  '<link rel="preload" as="script" fetchPriority="low" href="/global-ai-news/_next/static/chunks/webpack-1.js"/>' +
  '<link rel="preload" href="https://gc.zgo.at/count.js" as="script"/>' +
  '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4f4f1"/>' +
  '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f1118"/>' +
  "<title>AI Daybook</title>" +
  '<link rel="canonical" href="https://sguys99.github.io/global-ai-news/"/>' +
  '<link rel="icon" href="/global-ai-news/favicon.ico" type="image/x-icon" sizes="16x16"/>' +
  '<link rel="apple-touch-icon" href="/global-ai-news/apple-icon.png?2e9f" type="image/png" sizes="180x180"/>' +
  '</head><body class="sh-body"><link rel="stylesheet" href="/not-in-head.css"/></body></html>';

describe("readBuildAssets — out/index.html 의 공용 조각", () => {
  it("next/font 클래스·CSS·폰트 preload·아이콘·viewport/theme-color·사이트 주소·basePath", () => {
    put("index.html", HOME_HEAD);
    expect(readBuildAssets(out)).toEqual({
      htmlClass: "__variable_33a67b __variable_96ca31",
      stylesheets: [
        "/global-ai-news/_next/static/css/3ad5445a001bfb5f.css",
        "/global-ai-news/_next/static/css/fa42fe11ee371e2c.css",
      ],
      fontPreloadTags: [
        '<link rel="preload" href="/global-ai-news/_next/static/media/ff840cfebfb63b0c-s.p.woff2" as="font" crossorigin type="font/woff2">',
      ],
      iconTags: [
        '<link rel="icon" href="/global-ai-news/favicon.ico" type="image/x-icon" sizes="16x16">',
        '<link rel="apple-touch-icon" href="/global-ai-news/apple-icon.png?2e9f" type="image/png" sizes="180x180">',
      ],
      viewportTags: [
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4f4f1">',
        '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f1118">',
      ],
      basePath: "/global-ai-news",
      siteUrl: "https://sguys99.github.io/global-ai-news",
    });
  });

  it("없거나 형식이 다르면 크게 실패한다", () => {
    expect(() => readBuildAssets(out)).toThrow(/index\.html 가 없다/);
    put("index.html", HOME_HEAD.replace(/<link rel="stylesheet"[^>]*>/g, ""));
    expect(() => readBuildAssets(out)).toThrow(/stylesheet/);
    put("index.html", HOME_HEAD.replace(' class="__variable_33a67b __variable_96ca31"', ""));
    expect(() => readBuildAssets(out)).toThrow(/html class/);
    put("index.html", HOME_HEAD.replace("sguys99.github.io/global-ai-news/", "example.com/other/"));
    expect(() => readBuildAssets(out)).toThrow(/basePath/);
  });
});

const ASSETS: BuildAssets = {
  htmlClass: "__v",
  viewportTags: ['<meta name="viewport" content="width=device-width">'],
  iconTags: [],
  fontPreloadTags: [],
  stylesheets: ["/_next/static/css/a.css"],
};

function card(id: number, over: Partial<ArticleCard> = {}): ArticleCard {
  return {
    id,
    source: { id: "tc", name: "TechCrunch AI" },
    url: `https://example.com/${id}`,
    titleKo: `제목 ${id}`,
    summaryKo: `요약 ${id}`,
    titleOriginal: `Title ${id}`,
    category: "llm",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-06-07T00:00:00.000Z",
    related: [],
    ...over,
  };
}

const PLAN: ArchivePlan = {
  latestEditionDate: "2026-11-05",
  liveArticleIds: [10],
  archivedArticleIds: [1, 2],
  liveEditionDates: ["2026-11-05"],
  archivedEditionDates: ["2026-06-07"],
};
const ref = (date: string, issueNo: number) => ({
  date,
  issueNo,
  publishedAt: `${date}T06:00:00+09:00`,
  cutoff: `${date}T23:59:59+09:00`,
});

const source: ArchiveSource = {
  plan: PLAN,
  article: (id) =>
    id === 99
      ? null
      : {
          article: card(id),
          issueDate: "2026-06-07",
          issue: { ref: ref("2026-06-07", 1), count: 2 },
        },
  edition: (date) => ({
    ref: ref(date, 1),
    edition: buildEdition([card(1), card(2)]),
    brief: [],
    prev: null,
    next: ref("2026-11-05", 2),
    latestEditionDate: PLAN.latestEditionDate,
  }),
};

/** Next 가 만든 전체 페이지(전체 페이지 대상) 모양. */
function fullPages() {
  put("article/10/index.html", "<!DOCTYPE html><html><head><meta charSet='utf-8'/></head></html>");
  put("edition/2026-11-05/index.html", "<!DOCTYPE html><html><head></head></html>");
  put("edition/2026-11-05/index.txt", "rsc");
}

describe("writeArchivePages", () => {
  it("보관 대상만 같은 주소에 보관 지면으로 쓴다(index.txt 없음) — 전체 페이지는 그대로", () => {
    fullPages();
    const r = writeArchivePages(out, source, ASSETS);
    expect(r).toMatchObject({ articles: 2, editions: 1, files: 3, changed: 3 });
    for (const rel of [
      "article/1/index.html",
      "article/2/index.html",
      "edition/2026-06-07/index.html",
    ]) {
      expect(read(rel)).toContain(ARCHIVE_GENERATOR_META);
      expect(isArchivePage(path.join(out, rel))).toBe(true);
      expect(existsSync(path.join(out, path.dirname(rel), "index.txt"))).toBe(false);
    }
    expect(read("article/10/index.html")).not.toContain(ARCHIVE_GENERATOR_META);
    expect(read("edition/2026-06-07/index.html")).toContain('href="/edition/2026-11-05/"');
    expect(r.bytes).toBe(
      ["article/1/index.html", "article/2/index.html", "edition/2026-06-07/index.html"]
        .map((rel) => Buffer.byteLength(read(rel)))
        .reduce((a, b) => a + b),
    );
  });

  it("멱등 — 두 번째는 같은 내용(바뀜 0)", () => {
    fullPages();
    const first = writeArchivePages(out, source, ASSETS);
    const before = read("article/1/index.html");
    const second = writeArchivePages(out, source, ASSETS);
    expect(second).toEqual({ ...first, changed: 0 });
    expect(read("article/1/index.html")).toBe(before);
  });

  it("보관 대상에 전체 페이지가 있으면(라우트와 판정이 어긋남) 덮어쓰지 않고 실패한다", () => {
    fullPages();
    put("article/2/index.html", "<!DOCTYPE html><html><head></head><body>full</body></html>");
    expect(() => writeArchivePages(out, source, ASSETS)).toThrow(
      /article\/2\/index\.html: 보관 대상인데 전체 페이지다/,
    );
    expect(read("article/2/index.html")).toContain("full");
  });

  it("전체 페이지 대상이 빠졌거나 보관 데이터가 없으면 실패한다", () => {
    put("edition/2026-11-05/index.html", "<html></html>");
    expect(() => writeArchivePages(out, source, ASSETS)).toThrow(
      /article\/10\/index\.html: 전체 페이지가 없다/,
    );
    fullPages();
    expect(() =>
      writeArchivePages(out, { ...source, plan: { ...PLAN, archivedArticleIds: [1, 99] } }, ASSETS),
    ).toThrow(/article 99: 보관 대상인데 기사 데이터가 없다/);
  });

  it("verifyArchiveOutput — 보관 지면 옆 RSC·전체 페이지 대상의 보관 지면도 잡는다", () => {
    fullPages();
    writeArchivePages(out, source, ASSETS);
    expect(verifyArchiveOutput(out, PLAN)).toEqual([]);
    put("article/1/index.txt", "rsc");
    put(
      "article/10/index.html",
      `<!DOCTYPE html><html><head>${ARCHIVE_GENERATOR_META}</head></html>`,
    );
    expect(verifyArchiveOutput(out, PLAN)).toEqual([
      "article/1/index.html: 보관 지면 옆에 RSC(index.txt)가 남아 있다",
      "article/10/index.html: 전체 페이지 대상인데 보관 지면이다",
    ]);
  });

  it("경로 — 영어판은 en/ 접두(Phase 5)", () => {
    expect(articlePagePath("ko", 12)).toBe("article/12/index.html");
    expect(articlePagePath("en", 12)).toBe("en/article/12/index.html");
    expect(editionPagePath("en", "2026-06-07")).toBe("en/edition/2026-06-07/index.html");
  });
});
