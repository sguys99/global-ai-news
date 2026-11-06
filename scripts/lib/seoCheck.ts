/**
 * 배포 전 SEO 정합성 검사 — english-version-plan Phase 6-3. 파일 읽기·출력·종료 코드는 scripts/seo-check.ts.
 *
 * 정적 산출물(out/)만 보고 Phase 6-1·6-2 의 약속이 지켜졌는지 확인한다. 페이지 HTML 은 머리(`</head>` 앞)의
 * `<link>`·`<meta>` 와 본문 전체의 JSON-LD 만 정규식으로 읽는다(DOM 라이브러리 없이 2,800쪽을 수 초에).
 *
 *  1. 페이지 메타: canonical 은 하나이고 파일 경로가 뜻하는 자기 주소, og:url = canonical, `<html lang>` = 경로 언어(`en/` 아래면 en)
 *     = og:locale(ko_KR·en_US). og:locale:alternate 는 hreflang 짝이 있을 때만 상대 언어 하나.
 *  2. hreflang: 있으면 정확히 ko·en·x-default 한 줄씩, x-default = en, 자기 언어 줄 = 자기 주소, 대상 페이지가 out/ 에 있고
 *     그 `<html lang>` 이 그 언어이며 **같은 목록**을 싣는다(상호 참조). 영어 페이지에는 늘 한국어 짝이 있다(한국어판이 상위 집합).
 *  3. 참조 파일: og:image·twitter:image·RSS alternate 가 out/ 에 있다(basePath·쿼리 제거).
 *  4. JSON-LD: 모두 JSON 으로 읽히고, NewsArticle 은 headline·image[]·datePublished·url = canonical·mainEntityOfPage·
 *     inLanguage = 페이지 언어·isBasedOn(Google 기사 리치 결과 필수·권장 필드), WebSite 는 name·url = canonical·inLanguage.
 *     기사 페이지에는 NewsArticle, 두 언어 홈에는 WebSite 가 있어야 한다. description 은 보지 않는다(보관 지면은 일부러 뺀다).
 *  5. 사이트맵: `/sitemap.xml` 은 `<sitemapindex>` 이고 조각이 모두 있으며, 조각마다 URL 5만 개·50MB 이하, `<loc>` 은 out/ 의
 *     페이지 자기 주소, 모든 페이지가 어느 조각엔가 있고, `<xhtml:link>` 목록 = 그 페이지 머리 hreflang 목록.
 *  6. RSS: `/feed.xml` 과 페이지가 가리키는 피드(`/en/feed.xml`)가 RSS 2.0 이고 `language` 가 경로 언어, 항목 링크가 out/ 의
 *     같은 언어 페이지다.
 *
 * 위반은 오류(배포 중단)와 경고(요약에만)로 나눈다 — 검색엔진이 주소·언어 짝을 잘못 읽게 되는 것은 오류, 품질 권장은 경고.
 * 검사 대상 페이지 = out/ 의 `index.html`(404 셸 `404/index.html` 과 `404.html` 제외). 보관 지면(Phase 4-3)도 같은 규칙이다.
 * 순수 함수만 둔다(문자열 → 결과).
 */

export type SeoLevel = "error" | "warning";

/** 위반 한 건. `rule` 은 검사 묶음(canonical·hreflang·jsonld …), `message` 는 묶음 안 같은 종류끼리 같은 문장. */
export interface SeoIssue {
  level: SeoLevel;
  rule: string;
  file: string;
  message: string;
  detail?: string;
}

export type PageLocale = "ko" | "en";

/** 경로 언어 → og:locale. */
export const OG_LOCALE: Record<PageLocale, string> = { ko: "ko_KR", en: "en_US" };
/** hreflang 목록이 있으면 정확히 이 셋(site.ts `hreflangLanguages`). */
export const HREFLANG_SET = ["ko", "en", "x-default"] as const;
/** 사이트맵 한 파일 한도(sitemaps.org) — 넘으면 오류, 90% 를 넘으면 경고. */
export const SITEMAP_MAX_URLS = 50_000;
export const SITEMAP_MAX_BYTES = 50 * 1024 * 1024;
const SITEMAP_WARN_RATIO = 0.9;
/** 사이트맵 인덱스 경로(out/ 상대, src/lib/seo.ts SITEMAP_INDEX_PATH). */
export const SITEMAP_INDEX_FILE = "sitemap.xml";
/** 한국어 RSS(늘 있어야 한다). 영어 피드는 영어 페이지가 가리키면 따라 검사한다. */
export const FEED_FILE = "feed.xml";
/** 보관 지면 머리 표지(src/lib/archive.ts ARCHIVE_GENERATOR_META 의 content) — 요약 집계용. */
const ARCHIVE_GENERATOR = "daybook-archive";

// ── 주소 ↔ 파일 ─────────────────────────────────────────────────────────────

/** 검사할 페이지 파일인지(out/ 상대 `/` 경로): `index.html` 로 끝나고 404 셸·`_next` 가 아닌 것. */
export function isPageFile(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/");
  if (!(p === "index.html" || p.endsWith("/index.html"))) return false;
  return !(p === "404/index.html" || p.startsWith("_next/"));
}

/** 페이지 파일의 자기 주소(끝 슬래시 — trailingSlash). `siteUrl` 은 basePath 포함, 끝 슬래시 없음. */
export function pageUrlOf(relPath: string, siteUrl: string): string {
  const dir = relPath.replace(/\\/g, "/").replace(/(^|\/)index\.html$/, "");
  return `${siteUrl}/${dir ? `${dir}/` : ""}`;
}

/** 파일 경로 언어 — `en/` 아래(또는 `en/index.html`)면 en. */
export function localeOfPath(relPath: string): PageLocale {
  return /^en(\/|$)/.test(relPath.replace(/\\/g, "/")) ? "en" : "ko";
}

/**
 * 사이트 주소 → out/ 상대 파일 경로. 사이트 밖이면 null. 쿼리·해시는 뗀다(`?v=` 썸네일 버전).
 * `/` 로 끝나면 `index.html`, 마지막 조각에 `.` 이 있으면 파일 그대로, 아니면 디렉터리 `index.html`.
 */
export function outPathOf(url: string, siteUrl: string): string | null {
  const bare = url.replace(/[?#].*$/, "");
  if (bare !== siteUrl && !bare.startsWith(`${siteUrl}/`)) return null;
  let rest = bare.slice(siteUrl.length).replace(/^\/+/, "");
  try {
    rest = decodeURIComponent(rest);
  } catch {
    // 잘못된 % 인코딩은 그대로 둔다(없는 파일로 걸린다).
  }
  if (rest === "") return "index.html";
  if (rest.endsWith("/")) return `${rest}index.html`;
  const last = rest.slice(rest.lastIndexOf("/") + 1);
  return last.includes(".") ? rest : `${rest}/index.html`;
}

/** 홈 HTML 의 canonical → 사이트 주소(basePath 포함, 끝 슬래시 없음). 못 찾으면 null. */
export function siteUrlFromHome(html: string): string | null {
  const canonical = parseHead(html).links.find((l) => hasRel(l, "canonical"))?.href;
  return canonical ? canonical.replace(/\/+$/, "") : null;
}

// ── HTML 머리 ───────────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** 속성 값·XML 텍스트의 엔티티(`&amp;` `&#39;` `&#x27;` …)를 푼다. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, n: string) => {
    if (n[0] === "#") {
      const code =
        n[1] === "x" || n[1] === "X" ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[n.toLowerCase()] ?? whole;
  });
}

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** 태그 속성 → 이름(소문자)별 값(엔티티 푼 값). React 의 `hrefLang`·`charSet` 도 소문자로. */
export function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  for (let m = ATTR_RE.exec(src); m; m = ATTR_RE.exec(src)) {
    const name = m[1].toLowerCase();
    if (!(name in out)) out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** 따옴표 안의 `>` 를 넘어가는 `<link>`·`<meta>` 한 태그. */
const HEAD_TAG_RE = /<(link|meta)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const HTML_TAG_RE = /<html\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i;
const JSON_LD_RE = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/gi;

type Attrs = Record<string, string>;

interface ParsedHead {
  htmlLang: string | null;
  links: Attrs[];
  metas: Attrs[];
}

const hasRel = (attrs: Attrs, rel: string) =>
  (attrs.rel ?? "").toLowerCase().split(/\s+/).includes(rel);

function parseHead(html: string): ParsedHead {
  const end = html.search(/<\/head>/i);
  const head = end < 0 ? html : html.slice(0, end);
  const htmlTag = HTML_TAG_RE.exec(head);
  const htmlLang = htmlTag ? (parseAttrs(htmlTag[1]).lang ?? null) : null;
  const links: Attrs[] = [];
  const metas: Attrs[] = [];
  HEAD_TAG_RE.lastIndex = 0;
  for (let m = HEAD_TAG_RE.exec(head); m; m = HEAD_TAG_RE.exec(head)) {
    const attrs = parseAttrs(m[2].replace(/\/\s*$/, ""));
    (m[1].toLowerCase() === "link" ? links : metas).push(attrs);
  }
  return { htmlLang, links, metas };
}

export interface HreflangLink {
  lang: string;
  href: string;
}

export type JsonLdBlock = { ok: true; value: unknown } | { ok: false; error: string };

/** 페이지 한 장에서 읽은 SEO 신호. */
export interface PageHead {
  /** out/ 상대 경로. */
  file: string;
  /** 파일 경로가 뜻하는 자기 주소. */
  url: string;
  /** 경로 언어. */
  locale: PageLocale;
  htmlLang: string | null;
  /** 보관 지면(머리 표지) 여부 — 요약 집계용. */
  archive: boolean;
  canonical: string[];
  ogUrl: string[];
  ogLocale: string[];
  ogLocaleAlternate: string[];
  ogImage: string[];
  twitterImage: string[];
  hreflang: HreflangLink[];
  rss: string[];
  jsonLd: JsonLdBlock[];
}

/** 페이지 HTML 한 장 → 신호. */
export function parsePage(file: string, html: string, siteUrl: string): PageHead {
  const { htmlLang, links, metas } = parseHead(html);
  const metaValues = (key: string) =>
    metas.filter((m) => m.property === key || m.name === key).map((m) => m.content ?? "");
  const jsonLd: JsonLdBlock[] = [];
  JSON_LD_RE.lastIndex = 0;
  for (let m = JSON_LD_RE.exec(html); m; m = JSON_LD_RE.exec(html)) {
    if ((parseAttrs(m[1]).type ?? "").toLowerCase() !== "application/ld+json") continue;
    try {
      jsonLd.push({ ok: true, value: JSON.parse(m[2]) });
    } catch (err) {
      jsonLd.push({ ok: false, error: (err as Error).message });
    }
  }
  return {
    file,
    url: pageUrlOf(file, siteUrl),
    locale: localeOfPath(file),
    htmlLang,
    archive: metas.some((m) => m.name === "generator" && m.content === ARCHIVE_GENERATOR),
    canonical: links.filter((l) => hasRel(l, "canonical")).map((l) => l.href ?? ""),
    ogUrl: metaValues("og:url"),
    ogLocale: metaValues("og:locale"),
    ogLocaleAlternate: metaValues("og:locale:alternate"),
    ogImage: metaValues("og:image"),
    twitterImage: metaValues("twitter:image"),
    hreflang: links
      .filter((l) => hasRel(l, "alternate") && l.hreflang)
      .map((l) => ({ lang: l.hreflang.toLowerCase(), href: l.href ?? "" })),
    rss: links
      .filter(
        (l) => hasRel(l, "alternate") && (l.type ?? "").toLowerCase() === "application/rss+xml",
      )
      .map((l) => l.href ?? ""),
    jsonLd,
  };
}

/** hreflang 목록 비교용 열쇠(순서 무관). */
export function hreflangKey(links: readonly HreflangLink[]): string {
  return links
    .map((l) => `${l.lang}=${l.href}`)
    .sort()
    .join(" ");
}

// ── 페이지 검사 ─────────────────────────────────────────────────────────────

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const W3C_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;
const ARTICLE_PATH_RE = /^(en\/)?article\/\d+\/index\.html$/;
const HOME_PATH_RE = /^(en\/)?index\.html$/;
const ARTICLE_TYPES = new Set(["NewsArticle", "Article", "BlogPosting"]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isHttpUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\/\S+$/.test(v);

/** JSON-LD 덩어리 → 노드 목록(배열·`@graph` 펼침). */
function ldNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(ldNodes);
  if (!isObj(value)) return [];
  if (Array.isArray(value["@graph"])) return (value["@graph"] as unknown[]).flatMap(ldNodes);
  return [value];
}

const ldTypes = (node: Record<string, unknown>): string[] =>
  ([] as unknown[]).concat(node["@type"] ?? []).filter((t): t is string => typeof t === "string");

const hasName = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 && v.every(hasName) : isObj(v) && nonEmpty(v.name);

export interface PageCheckContext {
  siteUrl: string;
  /** out/ 에 있는 파일(상대 경로). */
  files: ReadonlySet<string>;
  /** 페이지 파일 → 신호(상호 참조용). */
  pages: ReadonlyMap<string, PageHead>;
  /** JSON-LD 형식별 건수(요약) — 검사가 채운다. */
  jsonLdTypes: Record<string, number>;
}

/** 페이지 한 장의 메타·hreflang·참조 파일·JSON-LD. */
export function checkPage(page: PageHead, ctx: PageCheckContext): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const add = (level: SeoLevel, rule: string, message: string, detail?: string) =>
    issues.push({ level, rule, file: page.file, message, ...(detail ? { detail } : {}) });
  const fileExists = (url: string) => {
    const rel = outPathOf(url, ctx.siteUrl);
    return rel !== null && ctx.files.has(rel);
  };

  // 1. canonical·og:url·언어
  if (page.canonical.length !== 1) {
    add("error", "canonical", "canonical 이 정확히 하나가 아니다", `${page.canonical.length}개`);
  } else if (page.canonical[0] !== page.url) {
    add(
      "error",
      "canonical",
      "canonical 이 자기 주소가 아니다",
      `${page.canonical[0]} ≠ ${page.url}`,
    );
  }
  if (page.ogUrl.length !== 1) {
    add("error", "og:url", "og:url 이 정확히 하나가 아니다", `${page.ogUrl.length}개`);
  } else if (page.ogUrl[0] !== page.url) {
    add(
      "error",
      "og:url",
      "og:url 이 canonical(자기 주소)과 다르다",
      `${page.ogUrl[0]} ≠ ${page.url}`,
    );
  }
  if (page.htmlLang !== page.locale) {
    add(
      "error",
      "lang",
      "<html lang> 이 경로 언어와 다르다",
      `${page.htmlLang ?? "(없음)"} ≠ ${page.locale}`,
    );
  }
  if (page.ogLocale.length !== 1 || page.ogLocale[0] !== OG_LOCALE[page.locale]) {
    add(
      "error",
      "og:locale",
      "og:locale 이 페이지 언어와 맞지 않는다",
      `${page.ogLocale.join(",") || "(없음)"} ≠ ${OG_LOCALE[page.locale]}`,
    );
  }
  const other: PageLocale = page.locale === "ko" ? "en" : "ko";
  const paired = page.hreflang.length > 0;
  if (
    paired &&
    (page.ogLocaleAlternate.length !== 1 || page.ogLocaleAlternate[0] !== OG_LOCALE[other])
  ) {
    add(
      "error",
      "og:locale",
      "hreflang 짝이 있는데 og:locale:alternate 가 상대 언어 하나가 아니다",
      page.ogLocaleAlternate.join(",") || "(없음)",
    );
  }
  if (!paired && page.ogLocaleAlternate.length > 0) {
    add(
      "error",
      "og:locale",
      "hreflang 짝이 없는데 og:locale:alternate 가 있다",
      page.ogLocaleAlternate.join(","),
    );
  }

  // 2. hreflang
  if (!paired && page.locale === "en") {
    add("error", "hreflang", "영어 페이지에 hreflang(한국어 짝)이 없다");
  }
  if (paired) {
    const langs = page.hreflang.map((l) => l.lang);
    const setOk =
      langs.length === HREFLANG_SET.length && HREFLANG_SET.every((l) => langs.includes(l));
    if (!setOk) {
      add("error", "hreflang", "hreflang 목록이 정확히 ko·en·x-default 가 아니다", langs.join(","));
    }
    const href = (lang: string) => page.hreflang.find((l) => l.lang === lang)?.href;
    if (href("x-default") !== href("en")) {
      add(
        "error",
        "hreflang",
        "x-default 가 영어 주소가 아니다",
        `${href("x-default")} ≠ ${href("en")}`,
      );
    }
    if (href(page.locale) !== page.url) {
      add(
        "error",
        "hreflang",
        "자기 언어 hreflang 이 자기 주소가 아니다",
        `${href(page.locale)} ≠ ${page.url}`,
      );
    }
    const key = hreflangKey(page.hreflang);
    for (const l of page.hreflang) {
      if (l.lang === "x-default" || l.href === page.url) continue;
      const rel = outPathOf(l.href, ctx.siteUrl);
      const target = rel ? ctx.pages.get(rel) : undefined;
      if (!target || target.url !== l.href) {
        add("error", "hreflang", "hreflang 대상 페이지가 out/ 에 없다", `${l.lang} ${l.href}`);
        continue;
      }
      if (target.htmlLang !== l.lang) {
        add(
          "error",
          "hreflang",
          "hreflang 대상 페이지의 언어가 다르다",
          `${l.href} lang=${target.htmlLang}`,
        );
      }
      if (target.hreflang.length === 0) {
        add(
          "error",
          "hreflang",
          "hreflang 대상 페이지가 hreflang 을 싣지 않는다(상호 참조 없음)",
          l.href,
        );
      } else if (hreflangKey(target.hreflang) !== key) {
        add("error", "hreflang", "hreflang 대상 페이지의 목록이 다르다(상호 참조 불일치)", l.href);
      }
    }
  }

  // 3. 참조 파일
  if (page.ogImage.length === 0) add("error", "og:image", "og:image 가 없다");
  for (const img of new Set([...page.ogImage, ...page.twitterImage])) {
    if (!fileExists(img)) add("error", "og:image", "공유 이미지 파일이 out/ 에 없다", img);
  }
  if (page.rss.length === 0) add("warning", "rss", "RSS alternate 링크가 없다");
  for (const feed of page.rss) {
    const rel = outPathOf(feed, ctx.siteUrl);
    if (!rel || !ctx.files.has(rel)) add("error", "rss", "RSS 파일이 out/ 에 없다", feed);
    else if (localeOfPath(rel) !== page.locale) {
      add("warning", "rss", "RSS 링크가 다른 언어판 피드다", feed);
    }
  }

  // 4. JSON-LD
  const nodes: Record<string, unknown>[] = [];
  for (const block of page.jsonLd) {
    if (!block.ok) add("error", "jsonld", "JSON-LD 를 JSON 으로 읽지 못했다", block.error);
    else nodes.push(...ldNodes(block.value));
  }
  let articles = 0;
  let websites = 0;
  for (const node of nodes) {
    const types = ldTypes(node);
    for (const t of types) ctx.jsonLdTypes[t] = (ctx.jsonLdTypes[t] ?? 0) + 1;
    const ctxValue = String(node["@context"] ?? "");
    if (!/^https?:\/\/schema\.org\/?$/.test(ctxValue)) {
      add("warning", "jsonld", "JSON-LD @context 가 schema.org 가 아니다", ctxValue || "(없음)");
    }
    if (types.some((t) => ARTICLE_TYPES.has(t))) {
      articles++;
      issues.push(...checkArticleLd(node, page, ctx));
    }
    if (types.includes("WebSite")) {
      websites++;
      if (!nonEmpty(node.name)) add("error", "jsonld", "WebSite 에 name 이 없다");
      if (node.url !== page.url) {
        add(
          "error",
          "jsonld",
          "WebSite url 이 canonical 과 다르다",
          `${String(node.url)} ≠ ${page.url}`,
        );
      }
      if (node.inLanguage !== page.locale) {
        add(
          "error",
          "jsonld",
          "WebSite inLanguage 가 페이지 언어와 다르다",
          String(node.inLanguage),
        );
      }
    }
  }
  if (ARTICLE_PATH_RE.test(page.file)) {
    if (articles === 0) add("error", "jsonld", "기사 페이지에 NewsArticle JSON-LD 가 없다");
    else if (articles > 1)
      add("warning", "jsonld", "기사 페이지에 Article JSON-LD 가 둘 이상이다", `${articles}개`);
  }
  if (HOME_PATH_RE.test(page.file) && websites === 0) {
    add("error", "jsonld", "홈에 WebSite JSON-LD 가 없다");
  }
  return issues;
}

/** NewsArticle 한 노드 — Google 기사 리치 결과 필수·권장 필드 + 우리 약속(url = canonical, isBasedOn 원문). */
function checkArticleLd(
  node: Record<string, unknown>,
  page: PageHead,
  ctx: PageCheckContext,
): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const add = (level: SeoLevel, message: string, detail?: string) =>
    issues.push({ level, rule: "jsonld", file: page.file, message, ...(detail ? { detail } : {}) });
  if (!nonEmpty(node.headline)) add("error", "NewsArticle headline 이 없다");
  const images = node.image;
  if (!Array.isArray(images) || images.length === 0 || !images.every(isHttpUrl)) {
    add("error", "NewsArticle image 가 절대 URL 배열이 아니다", JSON.stringify(images));
  } else {
    for (const img of images) {
      const rel = outPathOf(img, ctx.siteUrl);
      if (!rel || !ctx.files.has(rel)) add("error", "NewsArticle image 파일이 out/ 에 없다", img);
    }
  }
  if (typeof node.datePublished !== "string" || !ISO_DATETIME_RE.test(node.datePublished)) {
    add(
      "error",
      "NewsArticle datePublished 가 시간대 있는 ISO 8601 이 아니다",
      String(node.datePublished),
    );
  }
  if (node.dateModified !== undefined) {
    if (typeof node.dateModified !== "string" || !ISO_DATETIME_RE.test(node.dateModified)) {
      add("warning", "NewsArticle dateModified 가 ISO 8601 이 아니다", String(node.dateModified));
    }
  }
  if (node.url !== page.url) {
    add("error", "NewsArticle url 이 canonical 과 다르다", `${String(node.url)} ≠ ${page.url}`);
  }
  const main = node.mainEntityOfPage;
  const mainUrl = isObj(main) ? main["@id"] : main;
  if (mainUrl !== page.url) {
    add("error", "NewsArticle mainEntityOfPage 가 canonical 이 아니다", String(mainUrl));
  }
  if (node.inLanguage !== page.locale) {
    add("error", "NewsArticle inLanguage 가 페이지 언어와 다르다", String(node.inLanguage));
  }
  const based = node.isBasedOn;
  const basedUrl = isObj(based) ? based.url : based;
  if (!isHttpUrl(basedUrl))
    add("error", "NewsArticle isBasedOn(원문 URL)이 없다", String(basedUrl));
  if (!hasName(node.author)) add("warning", "NewsArticle author 에 name 이 없다");
  if (!hasName(node.publisher)) add("warning", "NewsArticle publisher 에 name 이 없다");
  return issues;
}

/** 모든 페이지 — 상호 참조는 `pages` 전체로 본다. */
export function checkPages(
  pages: readonly PageHead[],
  siteUrl: string,
  files: ReadonlySet<string>,
): { issues: SeoIssue[]; jsonLdTypes: Record<string, number> } {
  const byFile = new Map(pages.map((p) => [p.file, p]));
  const ctx: PageCheckContext = { siteUrl, files, pages: byFile, jsonLdTypes: {} };
  const issues: SeoIssue[] = [];
  if (!/^https:\/\//.test(siteUrl) || /localhost|127\.0\.0\.1/.test(siteUrl)) {
    issues.push({
      level: "error",
      rule: "site",
      file: "index.html",
      message: "사이트 주소가 배포 https 주소가 아니다(NEXT_PUBLIC_SITE_URL 없이 빌드?)",
      detail: siteUrl,
    });
  }
  for (const p of pages) issues.push(...checkPage(p, ctx));
  return { issues, jsonLdTypes: ctx.jsonLdTypes };
}

// ── XML(사이트맵·RSS) ────────────────────────────────────────────────────────

/** `<tag …>…</tag>` 블록들의 안쪽. 이름공간 접두어는 그대로 쓴다(`xhtml:link`). */
function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

/** 첫 `<tag>텍스트</tag>`(엔티티·CDATA 푼 값, 앞뒤 공백 제거). */
function xmlText(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!m) return null;
  const raw = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodeEntities(raw).trim();
}

/** XML 루트 요소 이름(선언·주석·처리 지시 건너뜀). */
export function xmlRoot(xml: string): string | null {
  const m = /^(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->)*<([A-Za-z_][\w:.-]*)/.exec(xml);
  return m ? m[1] : null;
}

export interface SitemapStats {
  files: number;
  urls: number;
}

/**
 * 사이트맵 인덱스와 조각. `xml` 은 out/ 의 XML 파일(상대 경로 → 내용).
 * 페이지가 하나라도 빠지거나, 없는 주소를 싣거나, 대체 주소가 페이지 hreflang 과 다르면 오류.
 */
export function checkSitemaps(
  xml: ReadonlyMap<string, string>,
  pages: readonly PageHead[],
  siteUrl: string,
): { issues: SeoIssue[]; stats: SitemapStats } {
  const issues: SeoIssue[] = [];
  const stats: SitemapStats = { files: 0, urls: 0 };
  const add = (level: SeoLevel, file: string, message: string, detail?: string) =>
    issues.push({ level, rule: "sitemap", file, message, ...(detail ? { detail } : {}) });
  const index = xml.get(SITEMAP_INDEX_FILE);
  if (index === undefined) {
    add("error", SITEMAP_INDEX_FILE, "사이트맵 인덱스(sitemap.xml)가 없다");
    return { issues, stats };
  }
  if (xmlRoot(index) !== "sitemapindex") {
    add(
      "error",
      SITEMAP_INDEX_FILE,
      "sitemap.xml 이 <sitemapindex> 가 아니다",
      xmlRoot(index) ?? "(없음)",
    );
    return { issues, stats };
  }
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const listedIn = new Map<string, string>();
  const children = xmlBlocks(index, "sitemap").map((b) => xmlText(b, "loc") ?? "");
  if (children.length === 0) add("error", SITEMAP_INDEX_FILE, "사이트맵 인덱스에 조각이 없다");
  for (const loc of children) {
    const rel = outPathOf(loc, siteUrl);
    const content = rel ? xml.get(rel) : undefined;
    if (!rel || content === undefined) {
      add("error", SITEMAP_INDEX_FILE, "인덱스가 가리키는 사이트맵 조각이 out/ 에 없다", loc);
      continue;
    }
    stats.files++;
    if (xmlRoot(content) !== "urlset") {
      add("error", rel, "사이트맵 조각이 <urlset> 이 아니다", xmlRoot(content) ?? "(없음)");
      continue;
    }
    const bytes = Buffer.byteLength(content, "utf8");
    const urls = xmlBlocks(content, "url");
    stats.urls += urls.length;
    if (urls.length > SITEMAP_MAX_URLS) {
      add(
        "error",
        rel,
        `사이트맵 조각이 URL ${SITEMAP_MAX_URLS.toLocaleString("en-US")}개를 넘는다`,
        `${urls.length}개`,
      );
    } else if (urls.length > SITEMAP_MAX_URLS * SITEMAP_WARN_RATIO) {
      add(
        "warning",
        rel,
        "사이트맵 조각 URL 수가 한도의 90% 를 넘었다 — 조각을 더 나눌 때",
        `${urls.length}개`,
      );
    }
    if (bytes > SITEMAP_MAX_BYTES) {
      add("error", rel, "사이트맵 조각이 50MB 를 넘는다", `${bytes} bytes`);
    } else if (bytes > SITEMAP_MAX_BYTES * SITEMAP_WARN_RATIO) {
      add("warning", rel, "사이트맵 조각 크기가 한도의 90% 를 넘었다", `${bytes} bytes`);
    }
    for (const block of urls) {
      const pageUrl = xmlText(block, "loc") ?? "";
      const page = byUrl.get(pageUrl);
      if (!page) {
        add(
          "error",
          rel,
          "사이트맵 주소가 out/ 의 페이지 자기 주소가 아니다",
          pageUrl || "(loc 없음)",
        );
        continue;
      }
      const prev = listedIn.get(pageUrl);
      if (prev) add("warning", rel, "같은 주소가 사이트맵에 두 번 실렸다", `${pageUrl} (${prev})`);
      else listedIn.set(pageUrl, rel);
      const alternates: HreflangLink[] = [
        ...block.matchAll(/<xhtml:link\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g),
      ]
        .map((m) => parseAttrs(m[1].replace(/\/\s*$/, "")))
        .filter((a) => (a.rel ?? "") === "alternate" && a.hreflang)
        .map((a) => ({ lang: a.hreflang.toLowerCase(), href: a.href ?? "" }));
      if (hreflangKey(alternates) !== hreflangKey(page.hreflang)) {
        add("error", rel, "사이트맵 xhtml:link 가 페이지 hreflang 과 다르다", pageUrl);
      }
      const lastmod = xmlText(block, "lastmod");
      if (lastmod !== null && !W3C_DATE_RE.test(lastmod)) {
        add("warning", rel, "lastmod 가 W3C 날짜 형식이 아니다", `${pageUrl} ${lastmod}`);
      }
    }
  }
  for (const p of pages) {
    if (!listedIn.has(p.url)) {
      issues.push({
        level: "error",
        rule: "sitemap",
        file: p.file,
        message: "페이지가 어느 사이트맵에도 없다",
        detail: p.url,
      });
    }
  }
  return { issues, stats };
}

export interface FeedStats {
  file: string;
  items: number;
}

/**
 * RSS 피드. 대상 = `feed.xml` + 페이지가 가리키는 RSS 파일. 피드 언어는 경로 언어(`en/feed.xml` → en).
 */
export function checkFeeds(
  xml: ReadonlyMap<string, string>,
  pages: readonly PageHead[],
  siteUrl: string,
): { issues: SeoIssue[]; feeds: FeedStats[] } {
  const issues: SeoIssue[] = [];
  const feeds: FeedStats[] = [];
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const targets = new Set([FEED_FILE]);
  for (const p of pages) {
    for (const href of p.rss) {
      const rel = outPathOf(href, siteUrl);
      if (rel) targets.add(rel); // 없는 파일은 페이지 검사(rss)가 잡는다.
    }
  }
  for (const file of [...targets].sort()) {
    const add = (level: SeoLevel, message: string, detail?: string) =>
      issues.push({ level, rule: "feed", file, message, ...(detail ? { detail } : {}) });
    const content = xml.get(file);
    if (content === undefined) {
      if (file === FEED_FILE) add("error", "RSS(feed.xml)가 없다");
      continue;
    }
    const locale = localeOfPath(file);
    if (xmlRoot(content) !== "rss" || !/<rss\b[^>]*\sversion="2\.0"/.test(content)) {
      add("error", "RSS 2.0 문서가 아니다", xmlRoot(content) ?? "(없음)");
      continue;
    }
    const channel = xmlBlocks(content, "channel")[0];
    if (channel === undefined) {
      add("error", "RSS 에 <channel> 이 없다");
      continue;
    }
    const head = channel.replace(/<item\b[\s\S]*$/, "");
    for (const tag of ["title", "link", "description"]) {
      if (!xmlText(head, tag)) add("error", `RSS channel 에 <${tag}> 이 없다`);
    }
    const lang = xmlText(head, "language");
    if (lang !== locale)
      add("error", "RSS language 가 피드 경로 언어와 다르다", `${lang ?? "(없음)"} ≠ ${locale}`);
    const self = /<atom:link\b[^>]*\shref="([^"]*)"/.exec(head)?.[1];
    if (self !== undefined && decodeEntities(self) !== `${siteUrl}/${file}`) {
      add("warning", "RSS atom:link self 가 피드 주소가 아니다", self);
    }
    const items = xmlBlocks(channel, "item");
    feeds.push({ file, items: items.length });
    if (items.length === 0) add("warning", "RSS 항목이 없다");
    for (const item of items) {
      const link = xmlText(item, "link") ?? "";
      const page = byUrl.get(link);
      if (!page) add("error", "RSS 항목 링크가 out/ 의 페이지가 아니다", link || "(link 없음)");
      else if (page.locale !== locale) add("error", "RSS 항목 링크가 다른 언어판 페이지다", link);
      const pub = xmlText(item, "pubDate");
      if (pub !== null && Number.isNaN(Date.parse(pub)))
        add("warning", "RSS pubDate 를 읽지 못했다", pub);
    }
  }
  return { issues, feeds };
}

// ── 보고서 ──────────────────────────────────────────────────────────────────

export interface SeoReport {
  siteUrl: string;
  pages: { total: number; ko: number; en: number; archive: number; withHreflang: number };
  jsonLdTypes: Record<string, number>;
  sitemaps: SitemapStats;
  feeds: FeedStats[];
  errors: number;
  warnings: number;
  issues: SeoIssue[];
}

export function buildSeoReport(input: {
  siteUrl: string;
  pages: readonly PageHead[];
  files: ReadonlySet<string>;
  xml: ReadonlyMap<string, string>;
}): SeoReport {
  const { siteUrl, pages, files, xml } = input;
  const pageResult = checkPages(pages, siteUrl, files);
  const sitemap = checkSitemaps(xml, pages, siteUrl);
  const feed = checkFeeds(xml, pages, siteUrl);
  const issues = [...pageResult.issues, ...sitemap.issues, ...feed.issues];
  return {
    siteUrl,
    pages: {
      total: pages.length,
      ko: pages.filter((p) => p.locale === "ko").length,
      en: pages.filter((p) => p.locale === "en").length,
      archive: pages.filter((p) => p.archive).length,
      withHreflang: pages.filter((p) => p.hreflang.length > 0).length,
    },
    jsonLdTypes: pageResult.jsonLdTypes,
    sitemaps: sitemap.stats,
    feeds: feed.feeds,
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
    issues,
  };
}

export interface IssueGroup {
  level: SeoLevel;
  rule: string;
  message: string;
  count: number;
  /** 예시(파일 · 세부) — 앞 3개. */
  examples: string[];
  firstFile: string;
}

/** 같은 수준·묶음·문장끼리 — 수천 쪽에 같은 문제가 나도 한 줄로. 오류 먼저, 많은 순. */
export function groupIssues(issues: readonly SeoIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const i of issues) {
    const key = `${i.level}\u0000${i.rule}\u0000${i.message}`;
    const example = i.detail ? `${i.file} · ${i.detail}` : i.file;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (g.examples.length < 3) g.examples.push(example);
    } else {
      groups.set(key, {
        level: i.level,
        rule: i.rule,
        message: i.message,
        count: 1,
        examples: [example],
        firstFile: i.file,
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.level === b.level ? b.count - a.count : a.level === "error" ? -1 : 1,
  );
}

const n = (v: number) => v.toLocaleString("en-US");

/** 콘솔 요약. 묶음 상위 `limit` 개(예시 3개씩). */
export function seoConsole(report: SeoReport, outDir: string, limit = 40): string {
  const p = report.pages;
  const lines = [
    `SEO 검사 — ${outDir} (${report.siteUrl})`,
    `  페이지 ${n(p.total)}쪽(ko ${n(p.ko)} · en ${n(p.en)} · 보관 ${n(p.archive)}) · hreflang 짝 ${n(p.withHreflang)}쪽`,
    `  JSON-LD ${
      Object.entries(report.jsonLdTypes)
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `${t} ×${n(c)}`)
        .join(", ") || "없음"
    }`,
    `  사이트맵 조각 ${n(report.sitemaps.files)}개 · URL ${n(report.sitemaps.urls)}개 · RSS ${report.feeds.map((f) => `${f.file} ${n(f.items)}건`).join(", ") || "없음"}`,
    `  오류 ${n(report.errors)}건 · 경고 ${n(report.warnings)}건`,
  ];
  const groups = groupIssues(report.issues);
  for (const g of groups.slice(0, limit)) {
    lines.push(`  ${g.level === "error" ? "✗" : "!"} [${g.rule}] ×${n(g.count)} ${g.message}`);
    for (const ex of g.examples) lines.push(`      ${ex}`);
  }
  if (groups.length > limit) lines.push(`  … 묶음 ${groups.length - limit}개 더`);
  if (p.total === 0) lines.push("  ✗ 검사할 페이지가 없다(out/ 이 비었나?)");
  return lines.join("\n");
}

/** `--ci`: 묶음마다 `::error::`·`::warning::`(상위 `limit` 개). */
export function seoAnnotations(report: SeoReport, limit = 20): string[] {
  if (report.pages.total === 0)
    return ["::error title=SEO 검사::검사할 페이지가 없다 — out/ 을 확인"];
  const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  return groupIssues(report.issues)
    .slice(0, limit)
    .map(
      (g) =>
        `::${g.level} file=out/${g.firstFile},title=SEO 검사 [${g.rule}]::${esc(`×${g.count} ${g.message} — ${g.examples[0]}`)}`,
    );
}

/** `$GITHUB_STEP_SUMMARY` 한 단락. */
export function seoSummary(report: SeoReport): string {
  const p = report.pages;
  const head = `검사 ${n(p.total)}쪽(ko ${n(p.ko)} · en ${n(p.en)}) · 사이트맵 URL ${n(report.sitemaps.urls)}개`;
  const verdict =
    report.errors === 0
      ? `오류 없음${report.warnings ? ` · 경고 ${n(report.warnings)}건` : ""}`
      : `**오류 ${n(report.errors)}건** · 경고 ${n(report.warnings)}건`;
  return `### SEO 검사\n\n${head} — ${verdict}\n`;
}

/** 오류가 있거나 페이지가 0쪽이면 1. 경고만이면 0. */
export function seoExitCode(report: SeoReport): number {
  return report.errors > 0 || report.pages.total === 0 ? 1 : 0;
}
