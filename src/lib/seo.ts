/**
 * 검색엔진 노출(SEO) 산출물 — 사이트맵·RSS·구조화 데이터(JSON-LD). DB 조회 없는 순수 함수만 두고
 * 라우트(src/app/sitemap.ts·feed.xml)·페이지가 조회 결과를 넘긴다.
 *
 * 모든 URL 은 basePath 를 포함한 절대 URL(SITE_URL). robots.txt 는 도메인 루트에만 둘 수 있어
 * (`sguys99.github.io/robots.txt` = 다른 저장소) 사이트맵은 Search Console·서치어드바이저에 직접 제출한다.
 */
import type { MetadataRoute } from "next";
import type { EditionRef } from "@/lib/db";
import { categoryLabel } from "@/lib/labels";
import {
  FEED_PATH,
  OG_DEFAULT_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_NAME_KO,
  SITE_URL,
  editionPath,
} from "@/lib/site";
import type { ArticleCard, LatestFeedEntry } from "@/lib/types";

const abs = (path: string) => `${SITE_URL}${path}`;
export const articlePath = (id: number) => `/article/${id}/`;

/** 사이트맵: 홈·검색·호 고정 링크 전체·기사 전체. lastmod = 호 발행 시각·기사 수집 시각. */
export function buildSitemap(
  editions: readonly EditionRef[],
  articles: readonly { id: number; collectedAt: string }[],
): MetadataRoute.Sitemap {
  return [
    { url: abs("/"), lastModified: editions.at(-1)?.publishedAt },
    { url: abs("/search/") },
    ...editions.map((e) => ({ url: abs(editionPath(e.date)), lastModified: e.publishedAt })),
    ...articles.map((a) => ({ url: abs(articlePath(a.id)), lastModified: a.collectedAt })),
  ];
}

/** RSS 에 싣는 최근 기사 수 상한 — 리더·네이버 수집기가 하루 1회 읽으면 충분한 양. */
export const FEED_ITEM_LIMIT = 60;

const escapeXml = (s: string) =>
  s
    .replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/**
 * RSS 2.0 피드. 항목 = 최근 수집분(최신 수집순 → 같은 회차는 들어온 순서 = 중요도 순), 링크는 우리 상세 페이지.
 * pubDate 는 원문 게시 시각이 아니라 수집 시각 — 피드에 새로 나타난 시각이라 리더의 "새 글" 판정과 맞는다.
 */
export function buildRssFeed(items: readonly LatestFeedEntry[], builtAt: string | null): string {
  const sorted = [...items]
    .sort((a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt))
    .slice(0, FEED_ITEM_LIMIT);
  const entries = sorted.map((a) => {
    const link = abs(articlePath(a.id));
    const label = categoryLabel(a.category);
    return [
      "<item>",
      `<title>${escapeXml(a.titleKo || a.titleOriginal)}</title>`,
      `<link>${link}</link>`,
      `<guid isPermaLink="true">${link}</guid>`,
      `<pubDate>${new Date(a.collectedAt).toUTCString()}</pubDate>`,
      a.summaryKo ? `<description>${escapeXml(a.summaryKo)}</description>` : "",
      label ? `<category>${escapeXml(label)}</category>` : "",
      "</item>",
    ].join("");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(SITE_NAME)}</title>`,
    `<link>${abs("/")}</link>`,
    `<description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    "<language>ko</language>",
    builtAt ? `<lastBuildDate>${new Date(builtAt).toUTCString()}</lastBuildDate>` : "",
    `<atom:link href="${abs(FEED_PATH)}" rel="self" type="application/rss+xml"/>`,
    ...entries,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}

const ORGANIZATION = {
  "@type": "Organization",
  name: SITE_NAME,
  url: abs("/"),
  logo: { "@type": "ImageObject", url: abs("/apple-icon.png") },
} as const;

/** 홈 구조화 데이터: 사이트 이름(검색 결과의 사이트 이름 표기)·한국어 대체 이름. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: SITE_NAME_KO,
    url: abs("/"),
    description: SITE_DESCRIPTION,
    inLanguage: "ko",
    publisher: ORGANIZATION,
  };
}

/** 상세 구조화 데이터(NewsArticle): 우리 요약 페이지 — 원문은 isBasedOn 으로 밝힌다. */
export function articleJsonLd(article: ArticleCard, imagePath: string = OG_DEFAULT_IMAGE) {
  const url = abs(articlePath(article.id));
  const label = categoryLabel(article.category);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.titleKo || article.titleOriginal,
    ...(article.summaryKo ? { description: article.summaryKo } : {}),
    url,
    mainEntityOfPage: url,
    image: [abs(imagePath)],
    datePublished: article.publishedAt,
    inLanguage: "ko",
    ...(label ? { articleSection: label } : {}),
    ...(article.tags.length > 0 ? { keywords: article.tags } : {}),
    isBasedOn: article.url,
    author: ORGANIZATION,
    publisher: ORGANIZATION,
  };
}

/** `<script type="application/ld+json">` 본문 — `<` 를 이스케이프해 문자열 안의 `</script>` 가 태그를 닫지 못하게 한다. */
export const jsonLdHtml = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");
