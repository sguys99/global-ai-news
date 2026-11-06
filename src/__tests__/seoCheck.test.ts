// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildSeoReport,
  checkFeeds,
  checkSitemaps,
  decodeEntities,
  groupIssues,
  isPageFile,
  localeOfPath,
  outPathOf,
  pageUrlOf,
  parsePage,
  seoAnnotations,
  seoConsole,
  seoExitCode,
  siteUrlFromHome,
  xmlRoot,
  type PageHead,
} from "../../scripts/lib/seoCheck";

const SITE = "https://sguys99.github.io/global-ai-news";
const u = (p: string) => `${SITE}${p}`;

interface PageOpts {
  lang?: string;
  canonical?: string | null;
  ogUrl?: string | null;
  ogLocale?: string | null;
  ogAlt?: string | null;
  /** [ko 경로, en 경로] — 있으면 hreflang ko·en·x-default(= en). */
  pair?: [string, string] | null;
  hreflang?: [string, string][];
  image?: string;
  rss?: string;
  jsonLd?: string[];
  archive?: boolean;
  /** React 모양(`hrefLang`, `/>`) 대신 보관 지면 모양(소문자, `>`). */
  plain?: boolean;
}

/** 페이지 HTML 한 장(path = basePath 뺀 자기 경로). 기본값은 검사를 통과하는 한국어 짝 페이지. */
function pageHtml(path: string, o: PageOpts = {}): string {
  const en = path.startsWith("/en/");
  const lang = o.lang ?? (en ? "en" : "ko");
  const close = o.plain ? ">" : "/>";
  const hl = o.plain ? "hreflang" : "hrefLang";
  const tags: string[] = [];
  if (o.archive) tags.push('<meta name="generator" content="daybook-archive">');
  const canonical = o.canonical === undefined ? u(path) : o.canonical;
  if (canonical !== null) tags.push(`<link rel="canonical" href="${canonical}"${close}`);
  const pair =
    o.pair === undefined
      ? ([path.replace(/^\/en\//, "/"), en ? path : `/en${path}`] as [string, string])
      : o.pair;
  const hreflang =
    o.hreflang ??
    (pair
      ? ([
          ["ko", u(pair[0])],
          ["en", u(pair[1])],
          ["x-default", u(pair[1])],
        ] as [string, string][])
      : []);
  for (const [l, h] of hreflang)
    tags.push(`<link rel="alternate" ${hl}="${l}" href="${h}"${close}`);
  const rss = o.rss ?? u(en ? "/en/feed.xml" : "/feed.xml");
  tags.push(
    `<link rel="alternate" type="application/rss+xml" title="AI Daybook" href="${rss}"${close}`,
  );
  const ogUrl = o.ogUrl === undefined ? u(path) : o.ogUrl;
  if (ogUrl !== null) tags.push(`<meta property="og:url" content="${ogUrl}"${close}`);
  const ogLocale = o.ogLocale === undefined ? (lang === "en" ? "en_US" : "ko_KR") : o.ogLocale;
  if (ogLocale !== null) tags.push(`<meta property="og:locale" content="${ogLocale}"${close}`);
  tags.push(`<meta property="og:image" content="${o.image ?? u("/og/default.png?v=1")}"${close}`);
  const ogAlt =
    o.ogAlt === undefined
      ? hreflang.length
        ? lang === "en"
          ? "ko_KR"
          : "en_US"
        : null
      : o.ogAlt;
  if (ogAlt !== null) tags.push(`<meta property="og:locale:alternate" content="${ogAlt}"${close}`);
  const ld = (o.jsonLd ?? [])
    .map((j) => `<script type="application/ld+json">${j}</script>`)
    .join("");
  return `<!DOCTYPE html><html lang="${lang}" class="x"><head><meta charSet="utf-8"/>${tags.join("")}</head><body><main>${ld}</main></body></html>`;
}

const fileOf = (p: string) => outPathOf(u(p), SITE) as string;

const articleLd = (path: string, lang: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: "제목",
    url: u(path),
    mainEntityOfPage: u(path),
    image: [u("/og/default.png")],
    datePublished: "2026-11-05T21:00:00.000Z",
    inLanguage: lang,
    isBasedOn: "https://example.com/a",
    author: { "@type": "Organization", name: "AI Daybook" },
    publisher: { "@type": "Organization", name: "AI Daybook" },
    ...over,
  }).replace(/</g, "\\u003c");

const websiteLd = (path: string, lang: string) =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AI Daybook",
    url: u(path),
    inLanguage: lang,
  });

/** 통과하는 작은 사이트: 두 언어 홈 + 기사 1(짝) + 한국어만 있는 기사 2. */
function siteFixture(over: Record<string, string> = {}) {
  const html: Record<string, string> = {
    "/": pageHtml("/", { jsonLd: [websiteLd("/", "ko")] }),
    "/en/": pageHtml("/en/", { jsonLd: [websiteLd("/en/", "en")] }),
    "/article/1/": pageHtml("/article/1/", { jsonLd: [articleLd("/article/1/", "ko")] }),
    "/en/article/1/": pageHtml("/en/article/1/", {
      jsonLd: [articleLd("/en/article/1/", "en")],
      archive: true,
      plain: true,
    }),
    "/article/2/": pageHtml("/article/2/", {
      pair: null,
      jsonLd: [articleLd("/article/2/", "ko")],
    }),
    ...over,
  };
  const pages = Object.entries(html).map(([p, h]) => parsePage(fileOf(p), h, SITE));
  const alt = (ko: string, en: string) =>
    [
      `<xhtml:link rel="alternate" hreflang="ko" href="${u(ko)}" />`,
      `<xhtml:link rel="alternate" hreflang="en" href="${u(en)}" />`,
      `<xhtml:link rel="alternate" hreflang="x-default" href="${u(en)}" />`,
    ].join("");
  const xml = new Map<string, string>([
    [
      "sitemap.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${u("/sitemaps/pages.xml")}</loc></sitemap><sitemap><loc>${u("/sitemaps/ko-2026.xml")}</loc></sitemap></sitemapindex>`,
    ],
    [
      "sitemaps/pages.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>${u("/")}</loc>${alt("/", "/en/")}</url><url><loc>${u("/en/")}</loc>${alt("/", "/en/")}</url></urlset>`,
    ],
    [
      "sitemaps/ko-2026.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>${u("/article/1/")}</loc>${alt("/article/1/", "/en/article/1/")}<lastmod>2026-11-05T21:00:00.000Z</lastmod></url><url><loc>${u("/en/article/1/")}</loc>${alt("/article/1/", "/en/article/1/")}</url><url><loc>${u("/article/2/")}</loc></url></urlset>`,
    ],
    [
      "feed.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>AI Daybook</title><link>${u("/")}</link><description>d</description><language>ko</language><atom:link href="${u("/feed.xml")}" rel="self" type="application/rss+xml"/><item><title>t</title><link>${u("/article/2/")}</link><pubDate>Thu, 05 Nov 2026 21:15:59 GMT</pubDate></item></channel></rss>`,
    ],
    [
      "en/feed.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>AI Daybook</title><link>${u("/en/")}</link><description>d</description><language>en</language><item><title>t</title><link>${u("/en/article/1/")}</link></item></channel></rss>`,
    ],
  ]);
  const files = new Set([...pages.map((p) => p.file), ...xml.keys(), "og/default.png", "404.html"]);
  return { pages, xml, files };
}

const report = (
  over: Record<string, string> = {},
  mutate?: (f: ReturnType<typeof siteFixture>) => void,
) => {
  const f = siteFixture(over);
  mutate?.(f);
  return buildSeoReport({ siteUrl: SITE, ...f });
};
const messages = (r: { issues: { level: string; message: string }[] }, level = "error") =>
  r.issues.filter((i) => i.level === level).map((i) => i.message);

describe("주소 ↔ 파일", () => {
  it("페이지 파일·자기 주소·언어", () => {
    expect(isPageFile("index.html")).toBe(true);
    expect(isPageFile("en/article/1/index.html")).toBe(true);
    expect(isPageFile("404/index.html")).toBe(false);
    expect(isPageFile("404.html")).toBe(false);
    expect(isPageFile("_next/static/x/index.html")).toBe(false);
    expect(pageUrlOf("index.html", SITE)).toBe(`${SITE}/`);
    expect(pageUrlOf("en/edition/2026-11-06/index.html", SITE)).toBe(
      `${SITE}/en/edition/2026-11-06/`,
    );
    expect(localeOfPath("en/index.html")).toBe("en");
    expect(localeOfPath("en/feed.xml")).toBe("en");
    expect(localeOfPath("english/index.html")).toBe("ko");
  });

  it("outPathOf — 쿼리 제거·디렉터리·파일·사이트 밖", () => {
    expect(outPathOf(u("/og/edition/2026-11-06.png?v=143-1379"), SITE)).toBe(
      "og/edition/2026-11-06.png",
    );
    expect(outPathOf(u("/"), SITE)).toBe("index.html");
    expect(outPathOf(SITE, SITE)).toBe("index.html");
    expect(outPathOf(u("/en/article/3/"), SITE)).toBe("en/article/3/index.html");
    expect(outPathOf(u("/en/article/3"), SITE)).toBe("en/article/3/index.html");
    expect(outPathOf(u("/sitemaps/ko-2026.xml"), SITE)).toBe("sitemaps/ko-2026.xml");
    expect(outPathOf("https://example.com/global-ai-news/", SITE)).toBeNull();
    expect(outPathOf(`${SITE}-evil/`, SITE)).toBeNull();
  });

  it("엔티티·홈 canonical·XML 루트", () => {
    expect(decodeEntities("a&amp;b&#39;c&#x27;&quot;")).toBe("a&b'c'\"");
    expect(siteUrlFromHome(pageHtml("/"))).toBe(SITE);
    expect(siteUrlFromHome("<html><head></head></html>")).toBeNull();
    expect(xmlRoot('<?xml version="1.0"?>\n<!-- c --><sitemapindex>')).toBe("sitemapindex");
  });
});

describe("parsePage", () => {
  it("React 모양(hrefLang·/>)과 보관 지면 모양(소문자·>)을 같게 읽는다", () => {
    const a = parsePage("article/1/index.html", pageHtml("/article/1/"), SITE);
    const b = parsePage(
      "article/1/index.html",
      pageHtml("/article/1/", { plain: true, archive: true }),
      SITE,
    );
    expect(a.hreflang).toEqual(b.hreflang);
    expect(a.hreflang.map((l) => l.lang)).toEqual(["ko", "en", "x-default"]);
    expect(a.archive).toBe(false);
    expect(b.archive).toBe(true);
    expect(a.htmlLang).toBe("ko");
    expect(a.rss).toEqual([u("/feed.xml")]);
    expect(a.ogImage).toEqual([u("/og/default.png?v=1")]);
  });

  it("JSON-LD 를 읽고 깨진 것은 오류로 남긴다", () => {
    const p = parsePage(
      "article/1/index.html",
      pageHtml("/article/1/", { jsonLd: [articleLd("/article/1/", "ko"), "{oops"] }),
      SITE,
    );
    expect(p.jsonLd.map((j) => j.ok)).toEqual([true, false]);
  });
});

describe("buildSeoReport — 통과", () => {
  it("짝·보관 지면·한국어만 있는 기사·사이트맵·피드가 맞으면 오류·경고 0", () => {
    const r = report();
    expect(r.issues).toEqual([]);
    expect(r.pages).toEqual({ total: 5, ko: 3, en: 2, archive: 1, withHreflang: 4 });
    expect(r.jsonLdTypes).toEqual({ WebSite: 2, NewsArticle: 3 });
    expect(r.sitemaps).toEqual({ files: 2, urls: 5 });
    expect(r.feeds).toEqual([
      { file: "en/feed.xml", items: 1 },
      { file: "feed.xml", items: 1 },
    ]);
    expect(seoExitCode(r)).toBe(0);
  });
});

describe("페이지 메타", () => {
  it("canonical 없음·다른 주소·둘", () => {
    expect(
      messages(
        report({
          "/article/2/": pageHtml("/article/2/", {
            pair: null,
            canonical: null,
            jsonLd: [articleLd("/article/2/", "ko")],
          }),
        }),
      ),
    ).toContain("canonical 이 정확히 하나가 아니다");
    const r = report({
      "/en/article/1/": pageHtml("/en/article/1/", {
        canonical: u("/article/1/"),
        jsonLd: [articleLd("/en/article/1/", "en")],
      }),
    });
    expect(messages(r)).toContain("canonical 이 자기 주소가 아니다");
  });

  it("og:url ≠ canonical, lang·og:locale 불일치", () => {
    const r = report({
      "/en/": pageHtml("/en/", {
        ogUrl: u("/"),
        ogLocale: "ko_KR",
        jsonLd: [websiteLd("/en/", "en")],
      }),
    });
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        "og:url 이 canonical(자기 주소)과 다르다",
        "og:locale 이 페이지 언어와 맞지 않는다",
      ]),
    );
    const r2 = report({
      "/en/": pageHtml("/en/", { lang: "ko", jsonLd: [websiteLd("/en/", "ko")] }),
    });
    expect(messages(r2)).toContain("<html lang> 이 경로 언어와 다르다");
  });

  it("og:locale:alternate 는 짝이 있을 때만", () => {
    const r = report({
      "/article/2/": pageHtml("/article/2/", {
        pair: null,
        ogAlt: "en_US",
        jsonLd: [articleLd("/article/2/", "ko")],
      }),
      "/article/1/": pageHtml("/article/1/", {
        ogAlt: null,
        jsonLd: [articleLd("/article/1/", "ko")],
      }),
    });
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        "hreflang 짝이 없는데 og:locale:alternate 가 있다",
        "hreflang 짝이 있는데 og:locale:alternate 가 상대 언어 하나가 아니다",
      ]),
    );
  });

  it("공유 이미지·RSS 파일이 없으면 오류, 다른 언어 피드는 경고", () => {
    const r = report({
      "/article/1/": pageHtml("/article/1/", {
        image: u("/og/article/1.png"),
        rss: u("/en/feed.xml"),
        jsonLd: [articleLd("/article/1/", "ko")],
      }),
      "/article/2/": pageHtml("/article/2/", {
        pair: null,
        rss: u("/nope.xml"),
        jsonLd: [articleLd("/article/2/", "ko")],
      }),
    });
    expect(messages(r)).toEqual(
      expect.arrayContaining(["공유 이미지 파일이 out/ 에 없다", "RSS 파일이 out/ 에 없다"]),
    );
    expect(messages(r, "warning")).toContain("RSS 링크가 다른 언어판 피드다");
  });

  it("배포 주소가 아니면(localhost) 오류", () => {
    const f = siteFixture();
    const r = buildSeoReport({ siteUrl: "http://localhost:3000", ...f });
    expect(messages(r)).toContain(
      "사이트 주소가 배포 https 주소가 아니다(NEXT_PUBLIC_SITE_URL 없이 빌드?)",
    );
  });
});

describe("hreflang", () => {
  it("x-default ≠ en, 목록이 셋이 아님", () => {
    const r = report({
      "/article/1/": pageHtml("/article/1/", {
        hreflang: [
          ["ko", u("/article/1/")],
          ["en", u("/en/article/1/")],
          ["x-default", u("/article/1/")],
        ],
        jsonLd: [articleLd("/article/1/", "ko")],
      }),
    });
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        "x-default 가 영어 주소가 아니다",
        "hreflang 대상 페이지의 목록이 다르다(상호 참조 불일치)",
      ]),
    );
    const r2 = report({
      "/article/1/": pageHtml("/article/1/", {
        hreflang: [
          ["ko", u("/article/1/")],
          ["en", u("/en/article/1/")],
        ],
        ogAlt: "en_US",
        jsonLd: [articleLd("/article/1/", "ko")],
      }),
    });
    expect(messages(r2)).toContain("hreflang 목록이 정확히 ko·en·x-default 가 아니다");
  });

  it("상대 페이지가 없거나 hreflang 을 싣지 않으면(상호 참조 없음) 오류", () => {
    const r = report({
      "/article/2/": pageHtml("/article/2/", { jsonLd: [articleLd("/article/2/", "ko")] }),
    });
    expect(messages(r)).toContain("hreflang 대상 페이지가 out/ 에 없다");
    const r2 = report({
      "/en/article/1/": pageHtml("/en/article/1/", {
        pair: null,
        jsonLd: [articleLd("/en/article/1/", "en")],
      }),
    });
    expect(messages(r2)).toEqual(
      expect.arrayContaining([
        "영어 페이지에 hreflang(한국어 짝)이 없다",
        "hreflang 대상 페이지가 hreflang 을 싣지 않는다(상호 참조 없음)",
      ]),
    );
  });

  it("자기 언어 줄이 자기 주소가 아니면 오류", () => {
    const r = report({
      "/article/1/": pageHtml("/article/1/", {
        pair: ["/article/9/", "/en/article/1/"],
        jsonLd: [articleLd("/article/1/", "ko")],
      }),
    });
    expect(messages(r)).toContain("자기 언어 hreflang 이 자기 주소가 아니다");
  });
});

describe("JSON-LD", () => {
  it("NewsArticle 필수 필드", () => {
    const r = report({
      "/article/1/": pageHtml("/article/1/", {
        jsonLd: [
          articleLd("/article/1/", "en", {
            headline: "",
            image: [u("/og/missing.png")],
            datePublished: "2026-11-05 21:00",
            url: u("/article/9/"),
            mainEntityOfPage: { "@id": u("/article/9/") },
            isBasedOn: undefined,
            author: undefined,
          }),
        ],
      }),
    });
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        "NewsArticle headline 이 없다",
        "NewsArticle image 파일이 out/ 에 없다",
        "NewsArticle datePublished 가 시간대 있는 ISO 8601 이 아니다",
        "NewsArticle url 이 canonical 과 다르다",
        "NewsArticle mainEntityOfPage 가 canonical 이 아니다",
        "NewsArticle inLanguage 가 페이지 언어와 다르다",
        "NewsArticle isBasedOn(원문 URL)이 없다",
      ]),
    );
    expect(messages(r, "warning")).toContain("NewsArticle author 에 name 이 없다");
  });

  it("기사에 NewsArticle 없음·홈에 WebSite 없음·깨진 JSON", () => {
    const r = report({
      "/article/2/": pageHtml("/article/2/", { pair: null, jsonLd: ["{bad"] }),
      "/en/": pageHtml("/en/"),
    });
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        "기사 페이지에 NewsArticle JSON-LD 가 없다",
        "홈에 WebSite JSON-LD 가 없다",
        "JSON-LD 를 JSON 으로 읽지 못했다",
      ]),
    );
  });

  it("WebSite url·inLanguage", () => {
    const r = report({ "/en/": pageHtml("/en/", { jsonLd: [websiteLd("/", "ko")] }) });
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        "WebSite url 이 canonical 과 다르다",
        "WebSite inLanguage 가 페이지 언어와 다르다",
      ]),
    );
  });
});

describe("사이트맵", () => {
  it("인덱스가 아니거나 조각이 없으면 오류", () => {
    const { pages } = siteFixture();
    const r = checkSitemaps(new Map([["sitemap.xml", "<urlset></urlset>"]]), pages, SITE);
    expect(messages(r)).toEqual(["sitemap.xml 이 <sitemapindex> 가 아니다"]);
    const r2 = checkSitemaps(
      new Map([
        [
          "sitemap.xml",
          `<sitemapindex><sitemap><loc>${u("/sitemaps/x.xml")}</loc></sitemap></sitemapindex>`,
        ],
      ]),
      pages,
      SITE,
    );
    expect(messages(r2)).toContain("인덱스가 가리키는 사이트맵 조각이 out/ 에 없다");
    expect(messages(r2)).toContain("페이지가 어느 사이트맵에도 없다");
    expect(messages(checkSitemaps(new Map(), pages, SITE))).toEqual([
      "사이트맵 인덱스(sitemap.xml)가 없다",
    ]);
  });

  it("없는 주소·빠진 페이지·대체 주소 불일치·중복", () => {
    const r = report({}, (f) => {
      f.xml.set(
        "sitemaps/ko-2026.xml",
        `<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>${u("/article/1/")}</loc></url><url><loc>${u("/article/3/")}</loc></url><url><loc>${u("/")}</loc><lastmod>yesterday</lastmod></url></urlset>`,
      );
    });
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        "사이트맵 xhtml:link 가 페이지 hreflang 과 다르다",
        "사이트맵 주소가 out/ 의 페이지 자기 주소가 아니다",
        "페이지가 어느 사이트맵에도 없다",
      ]),
    );
    expect(messages(r, "warning")).toEqual(
      expect.arrayContaining([
        "같은 주소가 사이트맵에 두 번 실렸다",
        "lastmod 가 W3C 날짜 형식이 아니다",
      ]),
    );
  });
});

describe("RSS", () => {
  it("language·항목 링크 언어·없는 페이지", () => {
    const { pages, xml } = siteFixture();
    xml.set(
      "en/feed.xml",
      `<rss version="2.0"><channel><title>t</title><link>${u("/en/")}</link><description>d</description><language>ko</language><item><link>${u("/article/2/")}</link></item><item><link>${u("/en/article/7/")}</link></item></channel></rss>`,
    );
    const r = checkFeeds(xml, pages, SITE);
    expect(messages(r)).toEqual([
      "RSS language 가 피드 경로 언어와 다르다",
      "RSS 항목 링크가 다른 언어판 페이지다",
      "RSS 항목 링크가 out/ 의 페이지가 아니다",
    ]);
  });

  it("feed.xml 이 없거나 RSS 2.0 이 아니면 오류", () => {
    const { pages, xml } = siteFixture();
    xml.delete("feed.xml");
    xml.set("en/feed.xml", "<feed></feed>");
    expect(messages(checkFeeds(xml, pages, SITE))).toEqual([
      "RSS 2.0 문서가 아니다",
      "RSS(feed.xml)가 없다",
    ]);
  });
});

describe("출력", () => {
  it("묶음·콘솔·주석·종료 코드", () => {
    const r = report({
      "/article/2/": pageHtml("/article/2/", {
        pair: null,
        canonical: null,
        jsonLd: [articleLd("/article/2/", "ko")],
      }),
    });
    const groups = groupIssues(r.issues);
    expect(groups[0].level).toBe("error");
    expect(seoConsole(r, "out")).toContain("✗ [canonical] ×1 canonical 이 정확히 하나가 아니다");
    expect(seoAnnotations(r)[0]).toMatch(
      /^::error file=out\/article\/2\/index\.html,title=SEO 검사 \[canonical\]::/,
    );
    expect(seoExitCode(r)).toBe(1);
    const empty = buildSeoReport({
      siteUrl: SITE,
      pages: [] as PageHead[],
      files: new Set(),
      xml: new Map(),
    });
    expect(seoExitCode(empty)).toBe(1);
    expect(seoAnnotations(empty)).toEqual([
      "::error title=SEO 검사::검사할 페이지가 없다 — out/ 을 확인",
    ]);
  });
});
