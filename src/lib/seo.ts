/**
 * 검색엔진 노출(SEO) 산출물 — 사이트맵·RSS·구조화 데이터(JSON-LD). DB 조회 없는 순수 함수만 두고
 * 라우트(src/app/sitemap.xml·sitemaps/[file]·feed.xml·(en)/en/feed.xml)·페이지가 조회 결과를 넘긴다.
 *
 * 모든 URL 은 basePath 를 포함한 절대 URL(SITE_URL). robots.txt 는 도메인 루트에만 둘 수 있어
 * (`sguys99.github.io/robots.txt` = 다른 저장소) 사이트맵은 Search Console·서치어드바이저에 직접 제출한다.
 *
 * 언어판(english-version-plan 6-2): 영어판은 같은 빌더에 `locale = "en"` — 영어 제목·요약·분야 표시명, `/en/` 주소,
 * `inLanguage: "en"`. 영어 출력(RSS·JSON-LD)에는 한글을 싣지 않는다(en:hangul-check 가 out/en/** 를 검사한다).
 * 한국어 출력은 locale 인자가 생기기 전과 같다.
 */
import type { EditionRef } from "@/lib/db";
import { hasEnglish, headlineOf, summaryOf } from "@/lib/articleText";
import { localePath, type Locale } from "@/lib/i18n";
import { categoryLabel, localeTags } from "@/lib/labels";
import {
  SITE_DESCRIPTION,
  SITE_DESCRIPTION_EN,
  SITE_NAME,
  SITE_NAME_KO,
  SITE_URL,
  editionPath,
  feedPath,
  hreflangLanguages,
  ogDefaultImagePath,
} from "@/lib/site";
import type { ArticleCard } from "@/lib/types";

const abs = (path: string) => `${SITE_URL}${path}`;
export const articlePath = (id: number) => `/article/${id}/`;

const escapeXml = (s: string) =>
  s
    .replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

// ─── 사이트맵(인덱스 + 언어 × 연도 조각) ──────────────────────────────────────

/*
 * `/sitemap.xml` 은 Search Console·서치어드바이저에 이미 제출된 주소라 그대로 두고 **사이트맵 인덱스**(`<sitemapindex>`)로
 * 바꾼다. 실제 URL 은 조각 파일 `/sitemaps/<이름>.xml` 에 싣는다(english-version-plan 6-2):
 *  - `pages.xml` — 두 언어판의 홈·검색(4건). 매일 바뀌는 홈 lastmod 를 연도 조각 밖에 둬서 지난 연도 파일이 안정된다.
 *  - `ko-<연도>.xml` / `en-<연도>.xml` — 그 연도 호 고정 링크 + 그 연도 호에 실린 기사(호 날짜 = created_at 의 KST 날짜).
 *    한 언어·한 해 약 1.3만 건(하루 35건 상한)이라 한 파일 한도 5만 건에 한참 못 미친다. 그래도 넘으면
 *    `ko-2026-2.xml` 처럼 번호를 붙여 나눈다(SITEMAP_URL_LIMIT).
 * Next 15 의 `generateSitemaps` 는 조각(`/sitemap/<id>.xml`)만 만들고 인덱스 파일을 내지 않아(resolve-route-data.ts
 * "TODO-METADATA: support multi sitemap files") 라우트 핸들러가 이 파일의 XML 문자열을 그대로 낸다.
 *
 * 짝이 있는 페이지(영어판에도 있는 홈·검색·호·기사 — 보관 지면 포함)는 `<xhtml:link rel="alternate" hreflang>` 로
 * ko·en·x-default(= en, 기본값 표) 세 줄을 싣는다. 목록은 페이지 머리 hreflang 과 같은 함수(site.ts `hreflangLanguages`)이고
 * 짝 판정도 같은 기준(views/data.ts `languageAlternates` ≡ `localeArchivePlan("en")` — languageAlternates.test 가 대조) —
 * 한국어판은 영어판의 상위 집합이라 영어 URL 은 늘 짝이 있고, 한국어 URL 은 영어판이 있을 때만 싣는다.
 */

/** 사이트맵 인덱스 경로(basePath 제외) — 제출된 주소 그대로. */
export const SITEMAP_INDEX_PATH = "/sitemap.xml";
/** 사이트맵 조각 경로(basePath 제외, src/app/sitemaps/[file]). */
export const sitemapFilePath = (name: string) => `/sitemaps/${name}`;
/** 사이트맵 한 파일의 URL 상한(sitemaps.org 프로토콜). */
export const SITEMAP_URL_LIMIT = 50_000;
/** 홈·검색 조각 파일 이름. */
export const SITEMAP_PAGES_FILE = "pages.xml";

/** hreflang 대체 주소(절대 URL) — 키 순서 = 출력 순서(site.ts `hreflangLanguages`: ko·en·x-default). */
export type HreflangLinks = Record<string, string>;

/** 사이트맵 한 줄. `path` 는 basePath 제외·언어 접두어 포함 경로. */
export interface SitemapEntry {
  path: string;
  lastModified?: string;
  alternates?: HreflangLinks;
}

export interface SitemapFile {
  name: string;
  entries: SitemapEntry[];
}

export interface SitemapInput {
  /** 전체 호(오름차순, getEditionRefs). */
  editions: readonly EditionRef[];
  /** 공개 기사(id·수집 시각·호 날짜). */
  articles: readonly { id: number; collectedAt: string; issueDate: string }[];
  /** 영어판에 있는 호 날짜·기사 id — 보관 지면 포함(views/data.ts `localeArchivePlan("en")` live + archived). */
  english: { editionDates: ReadonlySet<string>; articleIds: ReadonlySet<number> };
}

/**
 * 언어 접두어 없는 경로 → 두 언어판 절대 URL + x-default(영어판). 짝 `{ ko, en }` 은 `languageAlternates` 와 같은 모양
 * (`localePath(locale, path)`), x-default 는 페이지 metadata 와 같은 `hreflangLanguages` 가 붙인다.
 */
export function hreflangLinks(path: string): HreflangLinks {
  return hreflangLanguages({ ko: abs(localePath("ko", path)), en: abs(localePath("en", path)) });
}

const yearOf = (date: string) => date.slice(0, 4);

/** 한 언어·한 해 줄을 상한마다 잘라 파일로(첫 파일은 번호 없음). */
function chunkFiles(base: string, entries: SitemapEntry[]): SitemapFile[] {
  const files: SitemapFile[] = [];
  for (let i = 0; i < entries.length; i += SITEMAP_URL_LIMIT) {
    const part = i / SITEMAP_URL_LIMIT;
    files.push({
      name: part === 0 ? `${base}.xml` : `${base}-${part + 1}.xml`,
      entries: entries.slice(i, i + SITEMAP_URL_LIMIT),
    });
  }
  return files;
}

/**
 * 사이트맵 조각 계획: `pages.xml` → 연도 오름차순으로 `ko-<연도>` · `en-<연도>`. 빈 조각은 만들지 않는다.
 * lastmod = 홈은 그 언어판 최신 호 발행 시각, 호는 발행 시각, 기사는 수집 시각(검색 페이지는 없음).
 */
export function planSitemaps({ editions, articles, english }: SitemapInput): SitemapFile[] {
  const enEditions = editions.filter((e) => english.editionDates.has(e.date));
  const pageEntry = (locale: Locale, path: string, lastModified?: string): SitemapEntry => ({
    path: localePath(locale, path),
    ...(lastModified ? { lastModified } : {}),
    alternates: hreflangLinks(path),
  });
  const pages: SitemapFile = {
    name: SITEMAP_PAGES_FILE,
    entries: [
      pageEntry("ko", "/", editions.at(-1)?.publishedAt),
      pageEntry("ko", "/search/"),
      pageEntry("en", "/", enEditions.at(-1)?.publishedAt),
      pageEntry("en", "/search/"),
    ],
  };

  const years = [
    ...new Set([
      ...editions.map((e) => yearOf(e.date)),
      ...articles.map((a) => yearOf(a.issueDate)),
    ]),
  ].sort();
  const files: SitemapFile[] = [pages];
  for (const year of years) {
    for (const locale of ["ko", "en"] as const) {
      const inLocale = (has: boolean) => locale === "ko" || has;
      const entry = (path: string, paired: boolean, lastModified: string): SitemapEntry => ({
        path: localePath(locale, path),
        lastModified,
        ...(paired ? { alternates: hreflangLinks(path) } : {}),
      });
      const entries: SitemapEntry[] = [
        ...editions
          .filter((e) => yearOf(e.date) === year && inLocale(english.editionDates.has(e.date)))
          .map((e) => entry(editionPath(e.date), english.editionDates.has(e.date), e.publishedAt)),
        ...articles
          .filter((a) => yearOf(a.issueDate) === year && inLocale(english.articleIds.has(a.id)))
          .map((a) => entry(articlePath(a.id), english.articleIds.has(a.id), a.collectedAt)),
      ];
      files.push(...chunkFiles(`${locale}-${year}`, entries));
    }
  }
  return files;
}

/** 조각 하나의 `<urlset>` XML(Next `resolveSitemap` 과 같은 모양 — 대체 주소가 있으면 xhtml 네임스페이스). */
export function buildUrlset(entries: readonly SitemapEntry[]): string {
  const hasAlternates = entries.some((e) => e.alternates);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${hasAlternates ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ""}>`,
  ];
  for (const e of entries) {
    lines.push("<url>", `<loc>${escapeXml(abs(e.path))}</loc>`);
    if (e.alternates) {
      for (const [lang, href] of Object.entries(e.alternates)) {
        lines.push(`<xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(href)}" />`);
      }
    }
    if (e.lastModified) lines.push(`<lastmod>${e.lastModified}</lastmod>`);
    lines.push("</url>");
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}

/** 조각 파일 중 가장 늦은 lastmod(원래 문자열 그대로). 없으면 undefined. */
function latestModified(entries: readonly SitemapEntry[]): string | undefined {
  let best: string | undefined;
  for (const e of entries) {
    if (e.lastModified && (!best || Date.parse(e.lastModified) > Date.parse(best))) {
      best = e.lastModified;
    }
  }
  return best;
}

/** 사이트맵 인덱스 XML — 조각마다 `<loc>` + 그 조각의 가장 늦은 lastmod. */
export function buildSitemapIndex(files: readonly SitemapFile[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const f of files) {
    const lastmod = latestModified(f.entries);
    lines.push(
      "<sitemap>",
      `<loc>${escapeXml(abs(sitemapFilePath(f.name)))}</loc>`,
      ...(lastmod ? [`<lastmod>${lastmod}</lastmod>`] : []),
      "</sitemap>",
    );
  }
  lines.push("</sitemapindex>", "");
  return lines.join("\n");
}

// ─── RSS ──────────────────────────────────────────────────────────────────────

/** RSS 에 싣는 최근 기사 수 상한 — 리더·네이버 수집기가 하루 1회 읽으면 충분한 양. */
export const FEED_ITEM_LIMIT = 60;

/** RSS 창: 최신 호 발행 시각 기준 최근 며칠 수집분(빌드 시각이 아니라 호 기준 — 같은 DB면 같은 피드). 두 언어판 공용. */
export const FEED_WINDOW_DAYS = 3;
const DAY_MS = 24 * 3600 * 1000;

/** RSS 창 시작 시각(ISO) — 최신 호 발행 시각에서 FEED_WINDOW_DAYS 앞. */
export const feedWindowStart = (latestPublishedAt: string) =>
  new Date(Date.parse(latestPublishedAt) - FEED_WINDOW_DAYS * DAY_MS).toISOString();

/** RSS 항목 입력 — LatestFeedEntry(한국어)·영어 목록 카드 모두 받는 구조 타입. */
export interface RssItem {
  id: number;
  collectedAt: string;
  category: string;
  titleKo: string;
  titleOriginal?: string;
  summaryKo: string;
  titleEn?: string;
  summaryEn?: string;
}

/**
 * RSS 2.0 피드. 항목 = 최근 수집분(최신 수집순 → 같은 회차는 들어온 순서 = 중요도 순), 링크는 우리 상세 페이지.
 * pubDate 는 원문 게시 시각이 아니라 수집 시각 — 피드에 새로 나타난 시각이라 리더의 "새 글" 판정과 맞는다.
 * en 은 영어판에 실린 기사(`hasEnglish`)만 — 영어 제목·요약·분야 표시명, `/en/article/<id>/` 링크, `language en`.
 */
export function buildRssFeed(
  items: readonly RssItem[],
  builtAt: string | null,
  locale: Locale = "ko",
): string {
  const sorted = [...items]
    .filter((a) => locale === "ko" || hasEnglish(a))
    .sort((a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt))
    .slice(0, FEED_ITEM_LIMIT);
  const entries = sorted.map((a) => {
    const link = abs(localePath(locale, articlePath(a.id)));
    const label = categoryLabel(a.category, locale);
    const summary = summaryOf(a, locale);
    return [
      "<item>",
      `<title>${escapeXml(headlineOf(a, locale))}</title>`,
      `<link>${link}</link>`,
      `<guid isPermaLink="true">${link}</guid>`,
      `<pubDate>${new Date(a.collectedAt).toUTCString()}</pubDate>`,
      summary ? `<description>${escapeXml(summary)}</description>` : "",
      label ? `<category>${escapeXml(label)}</category>` : "",
      "</item>",
    ].join("");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(SITE_NAME)}</title>`,
    `<link>${abs(localePath(locale, "/"))}</link>`,
    `<description>${escapeXml(locale === "en" ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION)}</description>`,
    `<language>${locale}</language>`,
    builtAt ? `<lastBuildDate>${new Date(builtAt).toUTCString()}</lastBuildDate>` : "",
    `<atom:link href="${abs(feedPath(locale))}" rel="self" type="application/rss+xml"/>`,
    ...entries,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}

// ─── 구조화 데이터(JSON-LD) ────────────────────────────────────────────────────

const ORGANIZATION = {
  "@type": "Organization",
  name: SITE_NAME,
  url: abs("/"),
  logo: { "@type": "ImageObject", url: abs("/apple-icon.png") },
} as const;

/**
 * 홈 구조화 데이터: 사이트 이름(검색 결과의 사이트 이름 표기). ko 는 한국어 대체 이름·한국어 설명,
 * en 은 영어판 홈 주소·영어 설명(대체 이름은 한글이라 싣지 않는다).
 */
export function websiteJsonLd(locale: Locale = "ko") {
  if (locale === "en") {
    return {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: abs(localePath("en", "/")),
      description: SITE_DESCRIPTION_EN,
      inLanguage: "en",
      publisher: ORGANIZATION,
    };
  }
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

/**
 * 상세 구조화 데이터(NewsArticle): 우리 요약 페이지 — 원문은 isBasedOn 으로 밝힌다.
 * `imagePath` 가 없으면 언어판 기본 썸네일. en 은 영어 제목·요약(한국어로 폴백하지 않는다 — articleText.ts),
 * 영어판 주소, 영어 분야 표시명, 라틴 문자 태그만.
 */
export function articleJsonLd(article: ArticleCard, imagePath?: string, locale: Locale = "ko") {
  const url = abs(localePath(locale, articlePath(article.id)));
  const label = categoryLabel(article.category, locale);
  const description = summaryOf(article, locale);
  const keywords = localeTags(article.tags, locale);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: headlineOf(article, locale),
    ...(description ? { description } : {}),
    url,
    mainEntityOfPage: url,
    image: [abs(imagePath ?? ogDefaultImagePath(locale))],
    datePublished: article.publishedAt,
    inLanguage: locale,
    ...(label ? { articleSection: label } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    isBasedOn: article.url,
    author: ORGANIZATION,
    publisher: ORGANIZATION,
  };
}

/** `<script type="application/ld+json">` 본문 — `<` 를 이스케이프해 문자열 안의 `</script>` 가 태그를 닫지 못하게 한다. */
export const jsonLdHtml = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");
