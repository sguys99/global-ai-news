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
  plans: { ko: PLAN },
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
      writeArchivePages(
        out,
        { ...source, plans: { ko: { ...PLAN, archivedArticleIds: [1, 99] } } },
        ASSETS,
      ),
    ).toThrow(/article 99: 보관 대상인데 기사 데이터가 없다/);
  });

  it("verifyArchiveOutput — 보관 지면 옆 RSC·전체 페이지 대상의 보관 지면도 잡는다", () => {
    fullPages();
    writeArchivePages(out, source, ASSETS);
    expect(verifyArchiveOutput(out, { ko: PLAN })).toEqual([]);
    put("article/1/index.txt", "rsc");
    put(
      "article/10/index.html",
      `<!DOCTYPE html><html><head>${ARCHIVE_GENERATOR_META}</head></html>`,
    );
    expect(verifyArchiveOutput(out, { ko: PLAN })).toEqual([
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

describe("writeArchivePages — 영어판(Phase 5-2)", () => {
  const HANGUL = /[가-힯]/;
  /** 영어판 범위 — 기사 2만 영어(한국 매체·한국어 원제·한국어 제목만 있는 묶인 보도), 1 은 영어 없음. */
  const enArticle = card(2, {
    source: { id: "aitimes", name: "AI타임스", nameEn: "AI Times", region: "kr" },
    url: "https://www.aitimes.com/news/2",
    titleOriginal: "한국어 원제 2",
    titleEn: "Story two",
    summaryEn: "Summary two.",
    tags: ["robotics", "로봇"],
    related: [{ source: "ETNews", url: "https://www.etnews.com/1", title: "", koreanTitle: true }],
  });
  const EN_PLAN: ArchivePlan = {
    latestEditionDate: PLAN.latestEditionDate,
    liveArticleIds: [10],
    archivedArticleIds: [2],
    liveEditionDates: ["2026-11-05"],
    archivedEditionDates: ["2026-06-07"],
  };
  const both: ArchiveSource = {
    plans: { ko: PLAN, en: EN_PLAN },
    article: (id, locale) =>
      locale === "en"
        ? {
            article: enArticle,
            issueDate: "2026-06-07",
            issue: { ref: ref("2026-06-07", 1), count: 1 },
          }
        : source.article(id, locale),
    edition: (date, locale) =>
      locale === "en"
        ? {
            ref: ref(date, 1),
            edition: buildEdition([enArticle]),
            brief: [],
            prev: null,
            next: ref("2026-11-05", 2),
            latestEditionDate: PLAN.latestEditionDate,
          }
        : source.edition(date, locale),
  };
  /** 한국어 전체 페이지 + 영어 전체 페이지(영어 라우트가 만든 것). */
  function bothFullPages() {
    fullPages();
    put("en/article/10/index.html", "<!DOCTYPE html><html lang=en><head></head></html>");
    put("en/edition/2026-11-05/index.html", "<!DOCTYPE html><html lang=en><head></head></html>");
  }
  /** lang="ko" 요소를 뺀 글자에 한글이 있는지(영어 페이지의 한글 허용은 원제 한 줄·언어 전환 링크 `한국어`). */
  const leaksHangul = (html: string) =>
    HANGUL.test(
      html
        .replace(/<span class="ar-orig-t" lang="ko">[^<]*<\/span>/g, "")
        .replace(/<a class="sh-ln" [^>]*lang="ko"[^>]*>[^<]*<\/a>/g, ""),
    );

  it("두 언어판을 같은 계획 규칙으로 쓴다 — 영어는 en/ 아래, 영어 범위의 보관 대상만", () => {
    bothFullPages();
    const r = writeArchivePages(out, both, ASSETS);
    expect(r).toMatchObject({ articles: 3, editions: 2, files: 5 });
    expect(isArchivePage(path.join(out, "en/article/2/index.html"))).toBe(true);
    expect(isArchivePage(path.join(out, "en/edition/2026-06-07/index.html"))).toBe(true);
    // 영어 없는 기사(1)는 영어 보관 지면이 없다
    expect(existsSync(path.join(out, "en/article/1/index.html"))).toBe(false);
  });

  it("영어 보관 기사: lang=en·영어 머리·KOREA 바이라인·원제 들임 단락·한국어 보도 안내·원문 언어 안내, 한글은 원제뿐", () => {
    bothFullPages();
    writeArchivePages(out, both, ASSETS);
    const html = read("en/article/2/index.html");
    expect(html).toContain('<html lang="en"');
    expect(html).toContain("<title>Story two — AI Daybook</title>");
    // 영어 구조화 데이터(6-2): 영어 제목·영어 주소·inLanguage en(보관 지면은 description 을 뺀다), 한국어 원제는 싣지 않는다
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]);
    expect(ld).toMatchObject({
      "@type": "NewsArticle",
      headline: "Story two",
      url: "http://localhost:3000/en/article/2/",
      inLanguage: "en",
      image: ["http://localhost:3000/og/en/default.png"],
    });
    expect(ld).not.toHaveProperty("description");
    expect(JSON.stringify(ld)).not.toMatch(/[\uac00-\ud7a3]/);
    // 자기 canonical·영어 공유 메타(6-1·6-2) — 보관 기사는 늘 썸네일 창 밖이라 영어 기본 썸네일
    expect(html).toContain('<link rel="canonical" href="http://localhost:3000/en/article/2/">');
    expect(html).toContain('<meta property="og:locale" content="en_US">');
    expect(html).toContain(
      '<meta property="og:image" content="http://localhost:3000/og/en/default.png">',
    );
    expect(html).toContain('href="http://localhost:3000/en/feed.xml"');
    expect(html).toContain(
      '<p class="sg-by"><span class="sg-region"><span aria-hidden="true">KOREA</span><span class="sr-only">Korean outlet</span></span><i class="sg-dot"></i><span class="sg-em">AI Times</span>',
    );
    expect(html).toContain('<span class="ar-orig-t" lang="ko">한국어 원제 2</span>');
    expect(html).toContain("Korean-language report<small>etnews.com · in Korean</small>");
    expect(html).toContain('<p class="ar-ctan ar-gon"><b>aitimes.com</b> · in Korean</p>');
    expect(html).toContain('href="/en/edition/2026-06-07/"');
    expect(leaksHangul(html)).toBe(false);
  });

  it("영어 보관 호: 영어 제목·KOREA 표지·/en 링크, 한글 없음", () => {
    bothFullPages();
    writeArchivePages(out, both, ASSETS);
    const html = read("en/edition/2026-06-07/index.html");
    expect(html).toContain('<html lang="en"');
    expect(html).toMatch(
      /<title>AI News Briefing — Sunday, June 7, 2026 \(No\. 1\) — AI Daybook<\/title>/,
    );
    expect(html).toContain('href="/en/article/2/"');
    expect(html).toContain('<span class="sg-region">');
    expect(html).toContain('href="/en/edition/2026-11-05/"');
    expect(leaksHangul(html)).toBe(false);
  });

  it("확인은 두 언어를 함께 본다 — 영어 전체 페이지 대상이 빠지면 실패", () => {
    fullPages();
    put("en/article/10/index.html", "<!DOCTYPE html><html><head></head></html>");
    expect(() => writeArchivePages(out, both, ASSETS)).toThrow(
      /en\/edition\/2026-11-05\/index\.html: 전체 페이지가 없다/,
    );
    bothFullPages();
    writeArchivePages(out, both, ASSETS);
    expect(verifyArchiveOutput(out, both.plans)).toEqual([]);
    // 영어 보관 대상에 전체 페이지가 남아 있으면(영어 라우트와 판정 어긋남) 실패
    put(
      "en/article/2/index.html",
      "<!DOCTYPE html><html lang=en><head></head><body>full</body></html>",
    );
    expect(verifyArchiveOutput(out, both.plans)).toEqual([
      "en/article/2/index.html: 보관 대상인데 전체 페이지다(라우트 generateStaticParams 와 보관 판정이 어긋났다)",
    ]);
  });
});
