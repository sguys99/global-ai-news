/**
 * 보관 지면 렌더러(english-version-plan Phase 4-3) — 90일 지난 기사·호의 가벼운 정적 HTML(기사 ≤ 8KB, 호 ≤ 40KB).
 *
 * 시안: docs/design/mockups/archive-article.html · archive-edition.html(사용자 확인 2026-11-05). 마크업은 시안 그대로다.
 * - RSC·`_next` 스크립트·클라이언트 섬이 없다. 같은 빌드의 공유 CSS·폰트(`BuildAssets`, out/index.html 에서 읽는다)와
 *   테마 스크립트(약 200B, next-themes 설정과 같은 규칙)·방문 집계(GoatCounter count.js) 한 줄만 싣는다.
 * - 스타일은 globals.css `@layer components` 클래스만 쓴다(Tailwind 유틸리티는 다른 화면에서 빠지면 컴파일에서 사라질 수
 *   있다). 예외는 다른 화면이 늘 쓰는 표지·유틸리티 `story-link`·`headline`·`text-brand`·`sr-only` 뿐이다.
 * - `<head>` 메타는 전체 페이지와 같은 metadata 객체(pageMetadata.ts `articlePageMetadata`·`editionPageMetadata` + 레이아웃
 *   `KO_LAYOUT_METADATA`)를 Next 와 같은 규칙으로 태그로 옮긴다(`metadataTags`). 구조화 데이터는 seo.ts 빌더.
 * - 문구는 messages/<영역>.ts, 날짜·분야·형식은 labels.ts 라 `locale` 하나로 영어판을 그릴 수 있다(영어 생성은 Phase 5 —
 *   scripts/lib/archive.ts `ARCHIVE_LOCALES`).
 *
 * 순수 함수만 둔다(DB·파일 없음) — 데이터는 빌드 후처리(scripts/lib/archive.ts)가 db.ts 조회로 넘긴다.
 */
import type { Metadata } from "next";
import {
  ARCHIVE_ARTICLE_BUDGET_BYTES,
  ARCHIVE_GENERATOR_META,
  ARCHIVE_WINDOW_DAYS,
} from "@/lib/archive";
import { headlineOf, sourceNameOf, summaryOf } from "@/lib/articleText";
import type { EditionRef } from "@/lib/db";
import { ISSUE_BRIEF_LIMITS, frontArticles, issueStats, type Edition } from "@/lib/edition";
import type { IssueBriefLine } from "@/lib/edition";
import { HTML_LANG, getMessages, localePath, plural, type Locale } from "@/lib/i18n";
import {
  CATEGORIES,
  FORMAT_BADGES,
  categoryLabel,
  categorySlug,
  formatCountNoun,
  formatDate,
  formatLabel,
  formatLongDate,
  formatMonthDay,
  hasHangul,
  issueNoLabel,
  normalizeCategory,
  shortSourceName,
  type Format,
} from "@/lib/labels";
import { archiveMessages } from "@/lib/messages/archive";
import { articleMessages } from "@/lib/messages/article";
import { commonMessages } from "@/lib/messages/common";
import { editionMessages } from "@/lib/messages/edition";
import { issueBriefMessages } from "@/lib/messages/issueBrief";
import { mastheadMessages } from "@/lib/messages/masthead";
import { metaMessages } from "@/lib/messages/meta";
import { pagerMessages } from "@/lib/messages/pager";
import { KO_LAYOUT_METADATA, articlePageMetadata, editionPageMetadata } from "@/lib/pageMetadata";
import { articleJsonLd, jsonLdHtml } from "@/lib/seo";
import {
  BASE_PATH,
  GOATCOUNTER_URL,
  SITE_NAME,
  SITE_URL,
  editionPath,
  siteTagline,
} from "@/lib/site";
import type { ArticleCard } from "@/lib/types";

export { ARCHIVE_GENERATOR_META };

/**
 * 같은 소식 다른 매체 — 이만큼만 링크하고 나머지는 "외 N곳"(시안 결정). 구글 뉴스 리다이렉트 URL 이 250~600자라
 * 5곳이 2.5KB 가 되기도 한다 — 그래서 문서가 기사 예산(ARCHIVE_ARTICLE_BUDGET_BYTES)을 넘으면 넘지 않을 때까지 한 곳씩 줄인다
 * (0곳까지 — 그때는 목록 없이 제목의 매체 수만, renderArchiveArticle).
 */
export const ARCHIVE_COVERAGE_MAX = 5;

/**
 * 같은 빌드의 전체 페이지(out/index.html)에서 읽은 공용 `<head>` 조각 — 보관 지면이 같은 CSS·폰트·아이콘을 쓰게 한다.
 * 해시가 든 파일명이라 빌드마다 바뀐다. 읽기는 scripts/lib/archive.ts `readBuildAssets`.
 */
export interface BuildAssets {
  /** `<html class>` — next/font 변수 클래스(서체 CSS 변수). */
  htmlClass: string;
  /** `<meta name="viewport">`·`<meta name="theme-color">` 태그 그대로(SiteShell siteViewport 의 렌더 결과). */
  viewportTags: string[];
  /** 아이콘 `<link>` 태그 그대로(favicon·icon.svg·apple-icon — 해시 쿼리 포함). */
  iconTags: string[];
  /** 폰트 preload `<link>` 태그 그대로. */
  fontPreloadTags: string[];
  /** 공유 CSS href(basePath 포함) — 순서대로. */
  stylesheets: string[];
}

// ─── HTML 조각 ────────────────────────────────────────────────────────────────

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 텍스트·속성 값 이스케이프(&<>"'). */
export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** 바깥 링크로 쓸 수 있는 주소만(http·https). 그 밖(javascript: 등)은 링크를 걸지 않는다. */
const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

/** 실제 언어로 `lang` — 한글이 없으면 영어로 본다(전체 페이지 원제·발췌의 `lang="en"` 과 같은 판정, 한글이면 문서 언어). */
const langAttr = (text: string, locale: Locale) =>
  hasHangul(text) ? (locale === "ko" ? "" : ' lang="ko"') : locale === "en" ? "" : ' lang="en"';

/** 사이트 내부 주소(basePath + 언어판 접두어). `path` 는 basePath 제외 루트 상대 경로. */
const href = (locale: Locale, path: string) => `${BASE_PATH}${localePath(locale, path)}`;
const articleHrefOf = (locale: Locale, id: number) => href(locale, `/article/${id}/`);
const editionHrefOf = (locale: Locale, date: string) => href(locale, editionPath(date));

const ARROW_ICON =
  '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';

/** 형식 배지(비뉴스만) — FormatBadge 와 같은 마크업(보이는 약어 + 화면 낭독용 표시명). */
function badge(format: Format, locale: Locale): string {
  const b = FORMAT_BADGES[format];
  if (!b) return "";
  return `<span class="sg-badge"><span aria-hidden="true">${esc(b)}</span><span class="sr-only">${esc(formatLabel(format, locale))}</span></span>`;
}

/** 중요도 미터 — ImportanceMeter 와 같은 마크업(`data-v` + 클래스 없는 `<i>` 5개). 0 이하면 빈 문자열. */
function meter(value: number, locale: Locale): string {
  if (value <= 0) return "";
  const v = Math.min(5, Math.floor(value));
  return `<span class="sg-imp" data-v="${v}" role="img" aria-label="${esc(getMessages(metaMessages, locale).importance(value))}"><i></i><i></i><i></i><i></i><i></i></span>`;
}

const DOT = '<i class="sg-dot"></i>';

const encoder = new TextEncoder();
/** UTF-8 바이트 수 — 정적 호스팅이 세는 크기. */
const utf8Bytes = (text: string) => encoder.encode(text).length;

/** 언어판에 보일 태그 — en 은 한글 태그를 뺀다(ArticleMeta visibleTags 와 같은 규칙), ko 는 그대로. */
const visibleTagsOf = (tags: readonly string[], locale: Locale) =>
  locale === "en" ? tags.filter((tag) => !hasHangul(tag)) : [...tags];

/** 언어판 날짜 키 → 그날 정오(KST) ISO — labels.ts 의 날짜 표기 함수에 넘긴다. */
const dateKeyIso = (date: string) => `${date}T12:00:00+09:00`;

// ─── <head> ───────────────────────────────────────────────────────────────────

/** 상대 URL(`/article/1/`) → 절대 URL(SITE_URL 기준 — Next metadataBase 와 같은 결과). */
function absUrl(url: string | URL): string {
  const s = String(url);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return `${SITE_URL}${s.startsWith("/") ? s : `/${s}`}`;
}

type Meta = Metadata;
type OgImage = { url: string | URL; width?: number; height?: number; alt?: string; type?: string };

const metaName = (name: string, content: string) =>
  `<meta name="${name}" content="${esc(content)}">`;
const metaProp = (property: string, content: string | number) =>
  `<meta property="${property}" content="${esc(content)}">`;

/**
 * Next 가 metadata 객체로 그리는 `<head>` 태그와 같은 것(이 사이트가 쓰는 필드만): title·description·검색엔진 소유 확인·
 * canonical·hreflang·RSS·og:*·article:*·twitter:card. 레이아웃 → 페이지 순으로 최상위 키 단위 얕은 병합(Next 와 같다).
 *
 * 뺀 것: Next 가 og 로 스스로 채워 넣는 twitter:title·twitter:description(site.ts shareMetadata 주석 — X 는 og 로 대체한다)
 * — 보관 지면 예산(8KB) 안에서 같은 문장을 세 번 싣지 않는다.
 */
export function metadataTags(page: Meta, layout: Meta = KO_LAYOUT_METADATA): string[] {
  // 페이지에 키가 있으면 값이 undefined 여도 레이아웃 값을 지운다 — Next(15.5 resolve-metadata mergeMetadata)도
  // `description: undefined` 를 null 로 덮는다(요약 없는 기사는 description 태그가 없다).
  const m: Meta = { ...layout, ...page };
  const tags: string[] = [];
  const title = typeof m.title === "string" ? m.title : SITE_NAME;
  tags.push(`<title>${esc(title)}</title>`);
  if (m.description) tags.push(metaName("description", m.description));
  const v = m.verification;
  if (v?.google) tags.push(metaName("google-site-verification", String(v.google)));
  for (const [name, value] of Object.entries(v?.other ?? {}))
    if (value) tags.push(metaName(name, String(value)));

  const alt = m.alternates;
  if (alt?.canonical)
    tags.push(`<link rel="canonical" href="${esc(absUrl(String(alt.canonical)))}">`);
  for (const [lang, url] of Object.entries(alt?.languages ?? {}))
    if (url)
      tags.push(
        `<link rel="alternate" hreflang="${esc(lang)}" href="${esc(absUrl(String(url)))}">`,
      );
  for (const [type, list] of Object.entries(alt?.types ?? {}))
    for (const item of Array.isArray(list) ? list : [])
      tags.push(
        `<link rel="alternate" type="${esc(type)}"${item.title ? ` title="${esc(item.title)}"` : ""} href="${esc(absUrl(String(item.url)))}">`,
      );

  const og = (m.openGraph ?? {}) as Record<string, unknown>;
  if (og.title) tags.push(metaProp("og:title", String(og.title)));
  if (og.description) tags.push(metaProp("og:description", String(og.description)));
  if (og.url) tags.push(metaProp("og:url", absUrl(String(og.url))));
  if (og.siteName) tags.push(metaProp("og:site_name", String(og.siteName)));
  if (og.locale) tags.push(metaProp("og:locale", String(og.locale)));
  for (const img of (og.images as OgImage[] | undefined) ?? []) {
    tags.push(metaProp("og:image", absUrl(img.url)));
    if (img.width) tags.push(metaProp("og:image:width", img.width));
    if (img.height) tags.push(metaProp("og:image:height", img.height));
    if (img.alt) tags.push(metaProp("og:image:alt", img.alt));
    if (img.type) tags.push(metaProp("og:image:type", img.type));
  }
  if (og.type) tags.push(metaProp("og:type", String(og.type)));
  if (og.publishedTime) tags.push(metaProp("article:published_time", String(og.publishedTime)));
  if (og.section) tags.push(metaProp("article:section", String(og.section)));
  for (const tag of (og.tags as string[] | undefined) ?? [])
    tags.push(metaProp("article:tag", tag));

  const tw = (m.twitter ?? {}) as { card?: string };
  if (tw.card) tags.push(metaName("twitter:card", tw.card));
  return tags;
}

/**
 * 테마 스크립트 — next-themes(ShellChrome: attribute="class", defaultTheme="light", enableSystem, 저장 키 "theme")와 같은 규칙:
 * 저장값 dark → 다크, system → OS 설정, 없거나 light → 라이트. 칠하기 전에 `<html class="dark">` 를 단다(깜빡임 없음).
 * 보관 지면에는 테마 버튼이 없다 — 다른 페이지에서 고른 테마가 그대로 이어진다.
 */
export const THEME_SCRIPT =
  'try{var t=localStorage.getItem("theme");if(t=="dark"||t=="system"&&matchMedia("(prefers-color-scheme: dark)").matches){var d=document.documentElement;d.classList.add("dark");d.style.colorScheme="dark"}}catch(e){}';

/**
 * 방문 집계 — Analytics.tsx 와 같은 GoatCounter 엔드포인트. 전체 페이지는 클라이언트 전환 때문에 자동 집계를 끄고
 * 경로(basePath + 끝 슬래시)를 직접 넘기지만, 보관 지면은 늘 전체 로드라 count.js 기본 동작(불러온 뒤 한 번)으로 센다.
 * count.js 는 같은 호스트의 `<link rel="canonical">` 경로를 집계 경로로 쓴다 — 보관 지면의 canonical 은 자기 주소
 * (basePath + 끝 슬래시)라 전체 페이지가 세던 경로(countPath)와 같다. 쿼리는 canonical 에 없어 빠진다.
 */
export const ANALYTICS_SCRIPT = `<script async src="https://gc.zgo.at/count.js" data-goatcounter="${GOATCOUNTER_URL}/count"></script>`;

function documentHtml({
  locale,
  assets,
  head,
  body,
}: {
  locale: Locale;
  assets: BuildAssets;
  head: string[];
  body: string;
}): string {
  const stylesheetTags = assets.stylesheets.map((h) => `<link rel="stylesheet" href="${esc(h)}">`);
  return [
    `<!DOCTYPE html><html lang="${HTML_LANG[locale]}" class="${esc(assets.htmlClass)}"><head>`,
    '<meta charset="utf-8">',
    ARCHIVE_GENERATOR_META,
    ...assets.viewportTags,
    ...head,
    ...assets.iconTags,
    ...assets.fontPreloadTags,
    ...stylesheetTags,
    `<script>${THEME_SCRIPT}</script>`,
    ANALYTICS_SCRIPT,
    `</head><body class="sh-lb">`,
    shellHeader(locale),
    body,
    shellFooter(locale),
    "</body></html>",
  ].join("");
}

// ─── 셸(머리 띠·푸터) ─────────────────────────────────────────────────────────

const WORDMARK = '<span class="text-brand">AI</span> Daybook';

function shellHeader(locale: Locale): string {
  const c = getMessages(commonMessages, locale);
  return (
    `<header class="sh-lh"><div><a class="sh-wm" href="${href(locale, "/")}" aria-label="${esc(c.homeLabel)}">${WORDMARK}</a>` +
    `<nav aria-label="${esc(c.mainNavLabel)}"><a class="sh-ln" href="${href(locale, "/")}">${esc(c.nav.today)}</a>` +
    `<a class="sh-ln" href="${href(locale, "/search/")}">${esc(c.nav.search)}</a></nav></div></header>`
  );
}

/** 짧은 푸터 — 제호·태그라인·보관 안내 + 저작권(전체 푸터와 같은 영문 표기, 연도는 빌드 시각). */
function shellFooter(locale: Locale, year = new Date().getFullYear()): string {
  const t = getMessages(archiveMessages, locale);
  return (
    `<footer class="sh-lf"><div><span class="sh-lf-np">${WORDMARK}</span><p>${esc(siteTagline(locale))}</p>` +
    `<small>${esc(t.footerNote(ARCHIVE_WINDOW_DAYS))} © ${year} Nasica Inc.</small></div></footer>`
  );
}

// ─── 보관 기사 ────────────────────────────────────────────────────────────────

export interface ArchiveArticleInput {
  article: ArticleCard;
  /** 기사가 실린 호(호 날짜의 EditionRef)와 그 호의 기사 수 — 호를 모르면 null(폴리오 날짜만, 호 링크 없음). */
  issue: { ref: Pick<EditionRef, "date" | "issueNo" | "publishedAt">; count: number } | null;
  /** 기사 호 날짜(KST) — issue 가 없을 때 폴리오 날짜. */
  issueDate: string;
}

/** 보관 기사 본문(`<main>`). */
export function archiveArticleBody(
  { article, issue, issueDate }: ArchiveArticleInput,
  locale: Locale = "ko",
  coverageMax: number = ARCHIVE_COVERAGE_MAX,
): string {
  const a = getMessages(articleMessages, locale);
  const t = getMessages(archiveMessages, locale);
  const meta = getMessages(metaMessages, locale);

  const dateText = esc(
    issue
      ? formatLongDate(issue.ref.publishedAt, locale)
      : formatLongDate(dateKeyIso(issueDate), locale),
  );
  const timeTag = `<time datetime="${esc(issueDate)}">${dateText}</time>`;
  const folio =
    `<p class="ar-fo"><b>${esc(t.label)}</b>` +
    (issue
      ? `<a class="ed-plink" href="${editionHrefOf(locale, issue.ref.date)}">${timeTag}</a><span>${esc(issueNoLabel(issue.ref.issueNo, locale))}</span>`
      : `<span>${timeTag}</span>`) +
    "</p>";

  const kickerText = categoryLabel(article.category, locale);
  const kicker = kickerText ? `<span class="sg-kick">${esc(kickerText)}</span>` : "";
  const head =
    article.format !== "news"
      ? `<span class="st-hd">${badge(article.format, locale)}${kicker}</span>`
      : kicker;

  const title = headlineOf(article, locale);
  const original =
    title && article.titleOriginal && title !== article.titleOriginal
      ? `<p class="ar-ot"${langAttr(article.titleOriginal, locale)}>${esc(article.titleOriginal)}</p>`
      : "";
  const byline =
    `<p class="sg-by"><span class="sg-em">${esc(sourceNameOf(article, locale))}</span>${DOT}` +
    `<time datetime="${esc(article.publishedAt)}">${esc(formatDate(article.publishedAt, locale))}</time>` +
    (article.importance > 0 ? `${DOT}${meter(article.importance, locale)}` : "") +
    (article.trendingScore > 0
      ? `${DOT}<span>${esc(meta.trending(article.trendingScore))}</span>`
      : "") +
    "</p>";

  const summary = summaryOf(article, locale);
  const summaryHtml = summary
    ? `<section class="ar-sm" aria-labelledby="sm"><h2 id="sm" class="ar-lbl">${esc(a.summary)}</h2><p class="ar-sum">${esc(summary)}</p></section>`
    : "";
  const cta = isWebUrl(article.url)
    ? `<a class="ar-go" href="${esc(article.url)}" rel="noopener">${esc(a.readOriginal)}${ARROW_ICON}</a>`
    : "";

  const related = (article.related ?? []).filter((r) => r && r.title);
  let coverage = "";
  if (related.length > 0) {
    const items = related.slice(0, coverageMax).map((r) => {
      const inner =
        `<span class="ar-cov-s">${esc(shortSourceName(r.source))}</span>` +
        `<span class="headline ar-cov-h"${langAttr(r.title, locale)}>${esc(r.title)}</span>`;
      return isWebUrl(r.url)
        ? `<li class="ar-li"><a class="story-link ar-cov" href="${esc(r.url)}" rel="noopener">${inner}</a></li>`
        : `<li class="ar-li"><span class="ar-cov">${inner}</span></li>`;
    });
    const more = related.length - Math.min(coverageMax, related.length);
    // 링크를 하나도 못 실으면(예산 최후 수단) 목록 없이 제목의 매체 수만 남긴다 — "외 N곳" 한 줄만 있는 목록은 어색하다.
    if (more > 0 && items.length > 0)
      items.push(`<li class="ar-li ar-cv-m">${esc(t.moreOutlets(more))}</li>`);
    const list = items.length > 0 ? `<ul>${items.join("")}</ul>` : "";
    coverage = `<section class="ar-sect ar-cv" aria-labelledby="cv"><h2 id="cv" class="ar-h">${esc(a.coverage(related.length))}</h2>${list}</section>`;
  }

  const tags = visibleTagsOf(article.tags, locale);
  const tagsHtml = tags.length
    ? `<p class="ar-tg">${tags.map((tag) => `<a href="${href(locale, `/?tag=${encodeURIComponent(tag)}`)}">#${esc(tag)}</a>`).join("")}</p>`
    : "";

  const next = issue
    ? `<a class="ed-pg-a ar-nx" href="${editionHrefOf(locale, issue.ref.date)}"><span class="ed-pg-l">${esc(t.issueOthers(Math.max(0, issue.count - 1)))}</span>` +
      `<span class="ed-pg-h">${esc(t.toIssue(issue.ref.issueNo))}</span><span class="ed-pg-d">${esc(formatMonthDay(issue.ref.publishedAt, locale))}</span></a>`
    : "";

  return (
    `<main class="ar-lt">${folio}<article><header class="ar-hd">${head}<h1 class="ar-h1">${esc(title)}</h1>${original}${byline}</header>` +
    `${summaryHtml}${cta}${coverage}${tagsHtml}</article>${next}</main>`
  );
}

/** 보관 기사 문서 전체. metadata·JSON-LD 는 전체 페이지와 같은 빌더(보관 기사는 늘 7일 썸네일 창 밖 → 기본 썸네일). */
export function renderArchiveArticle(
  input: ArchiveArticleInput,
  assets: BuildAssets,
  locale: Locale = "ko",
): string {
  // 구조화 데이터는 전체 페이지와 같은 빌더(seo.ts articleJsonLd)에서 description 만 뺀다 — 요약이 meta description·
  // og:description·본문에 이미 있어 네 번째 사본이다(약 0.5KB — 보관 기사 8KB 예산의 최대치를 넘기던 몫, 필수 속성 아님).
  const { description: _description, ...jsonLd } = articleJsonLd(input.article);
  void _description;
  const ld = `<script type="application/ld+json">${jsonLdHtml(jsonLd)}</script>`;
  const head = [...metadataTags(articlePageMetadata(input.article)), ld];
  const render = (coverageMax: number) =>
    documentHtml({ locale, assets, head, body: archiveArticleBody(input, locale, coverageMax) });
  // 예산을 넘으면 다른 매체 링크를 한 곳씩 줄인다 — 줄인 곳은 "외 N곳"으로 센다. 0곳까지 줄면 제목의 매체 수만 남는다
  // (요약이 유난히 긴 기사, 예: #919). 그래도 넘으면 그대로 낸다(크기 보고가 경고한다).
  let html = render(ARCHIVE_COVERAGE_MAX);
  for (let max = ARCHIVE_COVERAGE_MAX - 1; max >= 0; max--) {
    if (utf8Bytes(html) <= ARCHIVE_ARTICLE_BUDGET_BYTES) break;
    if ((input.article.related?.length ?? 0) <= max) continue;
    html = render(max);
  }
  return html;
}

// ─── 보관 호 ──────────────────────────────────────────────────────────────────

export interface ArchiveEditionInput {
  ref: EditionRef;
  /** buildEdition(그 호 기사) — 이 호의 기사(issue, 편집 순)와 1면 게재분(frontArticles)을 쓴다. */
  edition: Edition;
  /** 세 줄 요약(selectIssueBrief) — 2줄 미만이면 띠를 숨긴다. */
  brief: readonly IssueBriefLine[];
  prev: Pick<EditionRef, "date" | "issueNo" | "publishedAt"> | null;
  next: Pick<EditionRef, "date" | "issueNo" | "publishedAt"> | null;
  /** DB 최신 호 날짜 — 공유 썸네일 판정(editionMetadata). */
  latestEditionDate: string | null;
}

/** 분야 묶음 — CATEGORIES 순서, 묶음 안은 편집 순(edition.issue 순서 그대로). 6개 밖의 값은 뒤에 원래 이름으로. */
function categoryGroups<C extends { category: string }>(issue: readonly C[]) {
  const keys: string[] = [...CATEGORIES];
  for (const a of issue) {
    const key = normalizeCategory(a.category);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys
    .map((key) => ({ key, items: issue.filter((a) => normalizeCategory(a.category) === key) }))
    .filter((g) => g.items.length > 0);
}

function ear(edition: Edition, locale: Locale): string {
  const t = getMessages(mastheadMessages, locale).ear;
  const stats = issueStats(edition.issue);
  const comp = stats.formats
    .map(({ format, count }) =>
      locale === "en"
        ? `<span><b class="sg-em">${count}</b> ${esc(formatCountNoun(format, count, locale))}</span>`
        : `<span>${esc(formatCountNoun(format, count, locale))} <b class="sg-em">${count}</b></span>`,
    )
    .join('<i aria-hidden="true">·</i>');
  return (
    `<p class="ed-ear"><span class="ed-ear-l">${esc(t.heading)}</span>` +
    `<span><span class="ed-ear-m">${esc(t.prefix)}</span><b class="ed-ear-n">${stats.count}</b>` +
    `<span class="ed-ear-u">${esc(plural(stats.count, t.unit.one, t.unit.other))}</span> ${esc(t.outlets(stats.sources))}</span>` +
    (comp ? `<span class="ed-ear-f">${comp}</span>` : "") +
    "</p>"
  );
}

function briefBand(lines: readonly IssueBriefLine[], locale: Locale): string {
  if (lines.length < ISSUE_BRIEF_LIMITS.min) return "";
  const t = getMessages(issueBriefMessages, locale);
  const items = lines
    .map(
      (line, i) =>
        `<li><a class="story-link ed-br-a" href="${articleHrefOf(locale, line.id)}"><span class="ed-br-n" aria-hidden="true">${i + 1}</span>` +
        `<span class="headline ed-br-h">${esc(line.text)}</span></a></li>`,
    )
    .join("");
  return (
    `<section class="ed-br" aria-labelledby="br"><div class="ed-br-hd"><h2 id="br">${esc(t.heading(lines.length))}</h2>` +
    `<i aria-hidden="true">·</i><span>${esc(t.subtitle)}</span></div><ol class="ed-br-ol">${items}</ol></section>`
  );
}

function pagerLink(
  target: Pick<EditionRef, "date" | "issueNo" | "publishedAt">,
  label: string,
  locale: Locale,
  end: boolean,
): string {
  return (
    `<a class="ed-pg-a${end ? " ed-pg-n" : ""}" href="${editionHrefOf(locale, target.date)}"><span class="ed-pg-l">${esc(label)}</span>` +
    `<span class="ed-pg-h">${esc(issueNoLabel(target.issueNo, locale))}</span><span class="ed-pg-d">${esc(formatMonthDay(target.publishedAt, locale))}</span></a>`
  );
}

/** 보관 호 본문(`<main>`): 마스트헤드 축소판 → 세 줄 요약 → 분야별 헤드라인 목록 → 호 이동. */
export function archiveEditionBody(input: ArchiveEditionInput, locale: Locale = "ko"): string {
  const { ref, edition, brief, prev, next } = input;
  const t = getMessages(archiveMessages, locale);
  const common = getMessages(commonMessages, locale);
  const ed = getMessages(editionMessages, locale);
  const pager = getMessages(pagerMessages, locale);
  const frontLabel = getMessages(mastheadMessages, locale).nav.front;
  const front = new Set(frontArticles(edition).map((a) => a.id));

  const masthead =
    `<header class="ed-lm"><p class="ed-lm-f"><b>${esc(t.label)}</b><span>${esc(issueNoLabel(ref.issueNo, locale))}</span><span>${esc(common.publishedDaily)}</span></p>` +
    `<div class="ed-lm-r"><h1 class="ed-lm-h"><time datetime="${esc(ref.date)}">${esc(formatLongDate(ref.publishedAt, locale))}</time></h1>${ear(edition, locale)}</div>` +
    `<div class="ed-dbl" aria-hidden="true"></div></header>`;

  const groups = categoryGroups(edition.issue)
    .map(({ key, items }) => {
      const slug =
        categorySlug(key) === "etc" ? `etc-${encodeURIComponent(key)}` : categorySlug(key);
      const rows = items
        .map((a) => {
          const others = a.related?.length ?? 0;
          const source =
            esc(sourceNameOf(a, locale)) +
            (others > 0
              ? `<span class="sg-oth">${esc(getMessages(metaMessages, locale).otherSources(others))}</span>`
              : "");
          const imp = a.importance > 0 ? `${DOT}${meter(a.importance, locale)}` : "";
          const mark = front.has(a.id)
            ? `<span class="ed-lr-f">${esc(frontLabel)}</span>${DOT}`
            : "";
          return (
            `<li><a class="story-link ed-lr" href="${articleHrefOf(locale, a.id)}"><span class="headline ed-lr-h">${badge(a.format, locale)}${esc(headlineOf(a, locale))}</span>` +
            `<span class="sg-by">${mark}<span class="sg-em">${source}</span>${imp}</span></a></li>`
          );
        })
        .join("");
      return (
        `<div class="ed-lg"><div class="ed-lg-hd"><h3 id="c-${esc(slug)}">${esc(categoryLabel(key, locale))}</h3><span class="ed-cnt">${esc(ed.count(items.length))}</span></div>` +
        `<ul class="ed-ll" aria-labelledby="c-${esc(slug)}">${rows}</ul></div>`
      );
    })
    .join("");

  const index =
    `<section aria-labelledby="ix"><div class="ed-bh"><h2 id="ix" class="ed-bh-h">${esc(ed.index)}</h2>` +
    `<span class="ed-cnt">${esc(t.byCategory(edition.issue.length))}</span></div>${groups}</section>`;

  const nav =
    prev || next
      ? `<nav class="ed-pg" aria-label="${esc(pager.navLabel)}">${prev ? pagerLink(prev, pager.prev, locale, false) : ""}${next ? pagerLink(next, pager.next, locale, true) : ""}</nav>`
      : "";

  return `<main class="ed-lt">${masthead}${briefBand(brief, locale)}${index}${nav}</main>`;
}

/** 보관 호 문서 전체 — metadata 는 전체 호 페이지와 같은 빌더(보관 호는 30일 썸네일 창 밖 → 기본 썸네일). */
export function renderArchiveEdition(
  input: ArchiveEditionInput,
  assets: BuildAssets,
  locale: Locale = "ko",
): string {
  const meta = editionPageMetadata(input.ref, input.edition, input.latestEditionDate, input.brief);
  return documentHtml({
    locale,
    assets,
    head: metadataTags(meta),
    body: archiveEditionBody(input, locale),
  });
}
