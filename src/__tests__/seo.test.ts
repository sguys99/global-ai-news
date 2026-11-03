import { describe, expect, it } from "vitest";
import type { EditionRef } from "@/lib/db";
import {
  FEED_ITEM_LIMIT,
  articleJsonLd,
  buildRssFeed,
  buildSitemap,
  jsonLdHtml,
  websiteJsonLd,
} from "@/lib/seo";
import { FEED_PATH, SITE_NAME, SITE_URL, shareMetadata } from "@/lib/site";
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

describe("buildSitemap", () => {
  it("홈·검색·호 고정 링크·기사를 basePath 포함 절대 URL(끝 슬래시)로 담는다", () => {
    const map = buildSitemap(
      [edition("2026-11-01", 140), edition("2026-11-02", 141)],
      [{ id: 3, collectedAt: "2026-11-02T21:00:00Z" }],
    );
    expect(map.map((e) => e.url)).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/search/`,
      `${SITE_URL}/edition/2026-11-01/`,
      `${SITE_URL}/edition/2026-11-02/`,
      `${SITE_URL}/article/3/`,
    ]);
    // 홈 lastmod = 최신 호 발행 시각, 기사 = 수집 시각
    expect(map[0].lastModified).toBe("2026-11-02T21:30:00Z");
    expect(map[4].lastModified).toBe("2026-11-02T21:00:00Z");
  });

  it("호가 없으면 홈 lastmod 를 비운다", () => {
    expect(buildSitemap([], [])[0]).toEqual({ url: `${SITE_URL}/`, lastModified: undefined });
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
