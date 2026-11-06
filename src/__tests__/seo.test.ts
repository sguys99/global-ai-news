import { describe, expect, it } from "vitest";
import type { EditionRef } from "@/lib/db";
import {
  FEED_ITEM_LIMIT,
  articleJsonLd,
  SITEMAP_INDEX_PATH,
  SITEMAP_PAGES_FILE,
  SITEMAP_URL_LIMIT,
  buildRssFeed,
  buildSitemapIndex,
  buildUrlset,
  hreflangLinks,
  jsonLdHtml,
  planSitemaps,
  websiteJsonLd,
} from "@/lib/seo";
import {
  FEED_PATH,
  FEED_PATH_EN,
  SITE_DESCRIPTION_EN,
  SITE_NAME,
  SITE_URL,
  shareMetadata,
} from "@/lib/site";
import type { ArticleCard, LatestFeedEntry } from "@/lib/types";

const card = (over: Partial<ArticleCard> = {}): ArticleCard => ({
  id: 7,
  source: { id: "s", name: "Source" },
  url: "https://example.com/original",
  titleKo: "한국어 제목",
  summaryKo: "요약 문장.",
  titleOriginal: "Original title",
  category: "agent",
  format: "news",
  tags: ["mcp"],
  trendingScore: 10,
  importance: 3,
  publishedAt: "2026-11-01T00:00:00Z",
  ...over,
});

const entry = (over: Partial<LatestFeedEntry> = {}): LatestFeedEntry =>
  ({
    ...card(),
    categoryLabel: "에이전트",
    collectedAt: "2026-11-02T21:00:00Z",
    ...over,
  }) as LatestFeedEntry;

const edition = (date: string, issueNo: number): EditionRef => ({
  date,
  issueNo,
  publishedAt: `${date}T21:30:00Z`,
  cutoff: `${date}T15:00:00Z`,
});

const HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/;

describe("사이트맵 — 인덱스 + 언어 × 연도 조각", () => {
  const input = {
    editions: [edition("2025-12-31", 30), edition("2026-11-01", 140), edition("2026-11-02", 141)],
    articles: [
      { id: 1, collectedAt: "2025-12-31T21:00:00Z", issueDate: "2026-01-01" },
      { id: 2, collectedAt: "2025-12-30T21:00:00Z", issueDate: "2025-12-31" },
      { id: 3, collectedAt: "2026-11-01T21:00:00Z", issueDate: "2026-11-02" },
      { id: 4, collectedAt: "2026-11-01T22:00:00Z", issueDate: "2026-11-02" },
    ],
    english: { editionDates: new Set(["2026-11-02"]), articleIds: new Set([1, 3]) },
  };
  const files = planSitemaps(input);
  const byName = new Map(files.map((f) => [f.name, f]));
  const paths = (name: string) => byName.get(name)?.entries.map((e) => e.path);

  it("pages → 연도 오름차순 ko·en 조각, 빈 조각은 없다", () => {
    expect(files.map((f) => f.name)).toEqual([
      SITEMAP_PAGES_FILE,
      "ko-2025.xml",
      "ko-2026.xml",
      "en-2026.xml",
    ]);
  });

  it("pages: 두 언어판 홈·검색 + 짝 3줄, 홈 lastmod 는 그 언어판 최신 호", () => {
    const pages = byName.get(SITEMAP_PAGES_FILE)!.entries;
    expect(pages.map((e) => e.path)).toEqual(["/", "/search/", "/en/", "/en/search/"]);
    expect(pages[0].lastModified).toBe("2026-11-02T21:30:00Z");
    expect(pages[1].lastModified).toBeUndefined();
    expect(pages[2].lastModified).toBe("2026-11-02T21:30:00Z");
    expect(pages[0].alternates).toEqual({
      ko: `${SITE_URL}/`,
      en: `${SITE_URL}/en/`,
      "x-default": `${SITE_URL}/en/`,
    });
    expect(pages[3].alternates).toEqual(hreflangLinks("/search/"));
  });

  it("연도는 호 날짜(created_at KST) 기준 — 수집 시각(UTC)이 아니다", () => {
    expect(paths("ko-2025.xml")).toEqual(["/edition/2025-12-31/", "/article/2/"]);
    expect(paths("ko-2026.xml")).toEqual([
      "/edition/2026-11-01/",
      "/edition/2026-11-02/",
      "/article/1/",
      "/article/3/",
      "/article/4/",
    ]);
    // 영어판: 영어 기사가 있는 호·영어 본문이 있는 기사만
    expect(paths("en-2026.xml")).toEqual([
      "/en/edition/2026-11-02/",
      "/en/article/1/",
      "/en/article/3/",
    ]);
  });

  it("짝이 있는 줄만 xhtml:link(ko·en·x-default=en), 영어 URL 은 늘 짝이 있다", () => {
    const ko = byName.get("ko-2026.xml")!.entries;
    const at = (p: string) => ko.find((e) => e.path === p)!;
    expect(at("/article/3/").alternates).toEqual({
      ko: `${SITE_URL}/article/3/`,
      en: `${SITE_URL}/en/article/3/`,
      "x-default": `${SITE_URL}/en/article/3/`,
    });
    expect(at("/article/4/").alternates).toBeUndefined();
    expect(at("/edition/2026-11-01/").alternates).toBeUndefined();
    expect(at("/edition/2026-11-02/").alternates).toBeDefined();
    expect(byName.get("en-2026.xml")!.entries.every((e) => e.alternates)).toBe(true);
    // lastmod: 호 = 발행 시각, 기사 = 수집 시각
    expect(at("/edition/2026-11-02/").lastModified).toBe("2026-11-02T21:30:00Z");
    expect(at("/article/4/").lastModified).toBe("2026-11-01T22:00:00Z");
  });

  it("urlset XML: xhtml 네임스페이스·hreflang 줄·lastmod", () => {
    const xml = buildUrlset(byName.get("en-2026.xml")!.entries);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain(
      [
        "<url>",
        `<loc>${SITE_URL}/en/article/3/</loc>`,
        `<xhtml:link rel="alternate" hreflang="ko" href="${SITE_URL}/article/3/" />`,
        `<xhtml:link rel="alternate" hreflang="en" href="${SITE_URL}/en/article/3/" />`,
        `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/en/article/3/" />`,
        "<lastmod>2026-11-01T21:00:00Z</lastmod>",
        "</url>",
      ].join("\n"),
    );
    expect(xml.match(/<url>/g)).toHaveLength(3);
    // 짝이 하나도 없으면 xhtml 네임스페이스도 없다
    expect(buildUrlset([{ path: "/article/9/" }])).not.toContain("xmlns:xhtml");
  });

  it("인덱스: 조각마다 loc + 가장 늦은 lastmod, 제출 주소는 그대로", () => {
    expect(SITEMAP_INDEX_PATH).toBe("/sitemap.xml");
    const xml = buildSitemapIndex(files);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(
      `<sitemap>\n<loc>${SITE_URL}/sitemaps/ko-2025.xml</loc>\n<lastmod>2025-12-31T21:30:00Z</lastmod>\n</sitemap>`,
    );
    expect(xml).toContain(
      `<loc>${SITE_URL}/sitemaps/ko-2026.xml</loc>\n<lastmod>2026-11-02T21:30:00Z</lastmod>`,
    );
    expect(xml.match(/<sitemap>/g)).toHaveLength(4);
  });

  it("한 파일이 5만 건을 넘으면 번호를 붙여 나눈다(어느 파일도 상한 이하)", () => {
    const many = Array.from({ length: SITEMAP_URL_LIMIT + 10 }, (_, i) => ({
      id: i + 1,
      collectedAt: "2026-01-02T00:00:00Z",
      issueDate: "2026-01-02",
    }));
    const big = planSitemaps({
      editions: [],
      articles: many,
      english: { editionDates: new Set(), articleIds: new Set() },
    });
    expect(big.map((f) => f.name)).toEqual([SITEMAP_PAGES_FILE, "ko-2026.xml", "ko-2026-2.xml"]);
    expect(big.every((f) => f.entries.length <= SITEMAP_URL_LIMIT)).toBe(true);
    expect(big[2].entries).toHaveLength(10);
  });

  it("호가 없으면 홈 lastmod 를 비운다", () => {
    const empty = planSitemaps({
      editions: [],
      articles: [],
      english: { editionDates: new Set(), articleIds: new Set() },
    });
    expect(empty.map((f) => f.name)).toEqual([SITEMAP_PAGES_FILE]);
    expect(empty[0].entries[0]).not.toHaveProperty("lastModified");
  });
});

describe("buildRssFeed", () => {
  it("채널 + 항목(우리 상세 링크·수집 시각 pubDate·분야)", () => {
    const xml = buildRssFeed([entry()], "2026-11-02T21:30:00Z");
    expect(xml).toContain(`<title>${SITE_NAME}</title>`);
    expect(xml).toContain(`<atom:link href="${SITE_URL}${FEED_PATH}" rel="self"`);
    expect(xml).toContain("<language>ko</language>");
    expect(xml).toContain(`<link>${SITE_URL}/article/7/</link>`);
    expect(xml).toContain(`<guid isPermaLink="true">${SITE_URL}/article/7/</guid>`);
    expect(xml).toContain("<pubDate>Mon, 02 Nov 2026 21:00:00 GMT</pubDate>");
    expect(xml).toContain("<category>에이전트</category>");
    expect(xml).toContain("<lastBuildDate>Mon, 02 Nov 2026 21:30:00 GMT</lastBuildDate>");
  });

  it("XML 특수문자를 이스케이프하고, 한국어 제목이 없으면 원제를 쓴다", () => {
    const xml = buildRssFeed(
      [entry({ titleKo: "", titleOriginal: 'A <b> & "C"', summaryKo: "1 < 2" })],
      null,
    );
    expect(xml).toContain("<title>A &#60;b&#62; &#38; &#34;C&#34;</title>");
    expect(xml).toContain("<description>1 &#60; 2</description>");
    expect(xml).not.toContain("<lastBuildDate>");
  });

  it("최신 수집순(같은 회차는 들어온 순서 유지), 상한까지만", () => {
    const items = [
      entry({ id: 1, collectedAt: "2026-11-01T21:00:00Z" }),
      entry({ id: 2, collectedAt: "2026-11-02T21:00:00Z" }),
      entry({ id: 3, collectedAt: "2026-11-02T21:00:00Z" }),
    ];
    const ids = [...buildRssFeed(items, null).matchAll(/\/article\/(\d+)\/<\/link>/g)].map(
      (m) => m[1],
    );
    expect(ids).toEqual(["2", "3", "1"]);

    const many = Array.from({ length: FEED_ITEM_LIMIT + 5 }, (_, i) => entry({ id: i + 1 }));
    expect(buildRssFeed(many, null).match(/<item>/g)).toHaveLength(FEED_ITEM_LIMIT);
  });
});

describe("buildRssFeed — 영어판", () => {
  const enEntry = (over: Partial<LatestFeedEntry> = {}) =>
    entry({
      titleEn: "OpenAI ships a new agent SDK",
      summaryEn: "The SDK adds tool calling & memory.",
      titleKo: "",
      summaryKo: "",
      titleOriginal: "",
      tags: ["mcp"],
      ...over,
    } as Partial<LatestFeedEntry>);

  it("영어 제목·요약·분야, /en/ 링크, language en, 영어 채널 설명·self 링크", () => {
    const xml = buildRssFeed([enEntry()], "2026-11-02T21:30:00Z", "en");
    expect(xml).toContain("<language>en</language>");
    expect(xml).toContain(`<link>${SITE_URL}/en/</link>`);
    expect(xml).toContain(
      `<description>${SITE_DESCRIPTION_EN.replace(/'/g, "&#39;")}</description>`,
    );
    expect(xml).toContain(`<atom:link href="${SITE_URL}${FEED_PATH_EN}" rel="self"`);
    expect(xml).toContain("<title>OpenAI ships a new agent SDK</title>");
    expect(xml).toContain(`<link>${SITE_URL}/en/article/7/</link>`);
    expect(xml).toContain(`<guid isPermaLink="true">${SITE_URL}/en/article/7/</guid>`);
    expect(xml).toContain("<description>The SDK adds tool calling &#38; memory.</description>");
    expect(xml).toContain("<category>Agents</category>");
  });

  it("영어 본문이 없는 기사는 빼고, 한국어 가공 텍스트로 폴백하지 않는다(한글 0)", () => {
    const xml = buildRssFeed(
      [
        enEntry({ id: 1 }),
        entry({ id: 2, titleKo: "한국어만", summaryKo: "요약" }),
        enEntry({
          id: 3,
          titleKo: "한국어 제목",
          summaryKo: "한국어 요약",
          titleOriginal: "한글 원제",
        }),
      ],
      null,
      "en",
    );
    const ids = [...xml.matchAll(/\/article\/(\d+)\/<\/link>/g)].map((m) => m[1]);
    expect(ids).toEqual(["1", "3"]);
    expect(HANGUL.test(xml)).toBe(false);
  });
});

describe("JSON-LD", () => {
  it("WebSite: 이름·한국어 대체 이름·홈 URL", () => {
    expect(websiteJsonLd()).toMatchObject({
      "@type": "WebSite",
      name: SITE_NAME,
      alternateName: "AI 데이북",
      url: `${SITE_URL}/`,
      inLanguage: "ko",
    });
  });

  it("NewsArticle: 우리 상세 URL·원문 isBasedOn·분야·태그·썸네일 절대 URL", () => {
    const ld = articleJsonLd(card(), "/og/article/7.png");
    expect(ld).toMatchObject({
      "@type": "NewsArticle",
      headline: "한국어 제목",
      description: "요약 문장.",
      url: `${SITE_URL}/article/7/`,
      image: [`${SITE_URL}/og/article/7.png`],
      isBasedOn: "https://example.com/original",
      articleSection: "에이전트",
      keywords: ["mcp"],
    });
  });

  it("빈 요약·태그·분야는 키를 생략하고, 썸네일이 없으면 기본 썸네일", () => {
    const ld = articleJsonLd(card({ summaryKo: "", tags: [], category: "" }));
    expect(ld).not.toHaveProperty("description");
    expect(ld).not.toHaveProperty("keywords");
    expect(ld).not.toHaveProperty("articleSection");
    expect(ld.image).toEqual([`${SITE_URL}/og/default.png`]);
  });

  it("WebSite 영어판: /en/ 주소·영어 설명·inLanguage en, 한글 대체 이름 없음", () => {
    const ld = websiteJsonLd("en");
    expect(ld).toMatchObject({
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${SITE_URL}/en/`,
      description: SITE_DESCRIPTION_EN,
      inLanguage: "en",
    });
    expect(ld).not.toHaveProperty("alternateName");
    expect(HANGUL.test(JSON.stringify(ld))).toBe(false);
  });

  it("NewsArticle 영어판: 영어 제목·요약·/en/ 주소·영어 분야·라틴 태그만·영어 기본 썸네일, 한글 0", () => {
    const article = card({
      titleOriginal: "한국 매체 원제",
      titleEn: "Naver opens its HyperCLOVA X agent",
      summaryEn: "Naver released an agent built on HyperCLOVA X.",
      tags: ["mcp", "네이버", "agents"],
    });
    const ld = articleJsonLd(article, undefined, "en");
    expect(ld).toMatchObject({
      "@type": "NewsArticle",
      headline: "Naver opens its HyperCLOVA X agent",
      description: "Naver released an agent built on HyperCLOVA X.",
      url: `${SITE_URL}/en/article/7/`,
      mainEntityOfPage: `${SITE_URL}/en/article/7/`,
      image: [`${SITE_URL}/og/en/default.png`],
      inLanguage: "en",
      articleSection: "Agents",
      keywords: ["mcp", "agents"],
      isBasedOn: "https://example.com/original",
    });
    expect(HANGUL.test(JSON.stringify(ld))).toBe(false);
    expect(articleJsonLd(article, "/og/en/article/7.png", "en").image).toEqual([
      `${SITE_URL}/og/en/article/7.png`,
    ]);
  });

  it("스크립트 본문에서 </script> 를 끊는다", () => {
    expect(jsonLdHtml({ t: "</script><x>" })).toBe('{"t":"\\u003c/script>\\u003cx>"}');
  });
});

describe("shareMetadata — canonical·RSS", () => {
  it("경로가 있으면 canonical = 그 경로, RSS 링크는 늘 붙는다", () => {
    const m = shareMetadata({ title: "t", description: "d", path: "/article/3/" });
    expect(m.alternates).toEqual({
      canonical: "/article/3/",
      types: { "application/rss+xml": [{ url: FEED_PATH, title: SITE_NAME }] },
    });
    expect(shareMetadata({ title: "t", description: "d" }).alternates?.canonical).toBeUndefined();
  });
});
