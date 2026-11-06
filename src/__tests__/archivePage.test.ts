// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ARCHIVE_ARTICLE_BUDGET_BYTES, ARCHIVE_GENERATOR_META } from "@/lib/archive";
import {
  ARCHIVE_COVERAGE_MAX,
  THEME_SCRIPT,
  archiveArticleBody,
  archiveEditionBody,
  esc,
  metadataTags,
  renderArchiveArticle,
  renderArchiveEdition,
  type BuildAssets,
} from "@/lib/archivePage";
import type { EditionRef } from "@/lib/db";
import { buildEdition, frontArticles } from "@/lib/edition";
import { articlePageMetadata } from "@/lib/pageMetadata";
import { SITE_URL } from "@/lib/site";
import type { ArticleCard } from "@/lib/types";
import { COMPONENT_CLASS, GLOBALS_CSS } from "./componentCss";

/*
 * 보관 지면 렌더러(Phase 4-3, src/lib/archivePage.ts) — 시안 docs/design/mockups/archive-article.html·archive-edition.html.
 * 테스트 환경은 basePath "" · SITE_URL localhost(site.ts 기본값).
 */

const ASSETS: BuildAssets = {
  htmlClass: "__variable_a __variable_b",
  viewportTags: [
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  ],
  iconTags: ['<link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="16x16">'],
  fontPreloadTags: [
    '<link rel="preload" href="/_next/static/media/f.woff2" as="font" crossorigin type="font/woff2">',
  ],
  stylesheets: ["/_next/static/css/a.css", "/_next/static/css/b.css"],
};

function card(over: Partial<ArticleCard> = {}): ArticleCard {
  return {
    id: 1029,
    source: { id: "byline", name: "바이라인네트워크" },
    url: "https://byline.network/2026/10/22-613/",
    titleKo: "PHP에 원격 서버 제어 가능한 치명적 취약점 발견",
    summaryKo: "PHP에서 인증 없이 악성코드 실행이 가능한 취약점이 발견됐다.",
    titleOriginal: "웹사이트 개발 언어 ‘PHP’서 치명적 보안취약점 발견",
    category: "oss",
    format: "news",
    tags: ["php", "보안 패치"],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-10-21T23:47:26.000Z",
    related: [],
    ...over,
  };
}

const REF: EditionRef = {
  date: "2026-10-23",
  issueNo: 129,
  publishedAt: "2026-10-22T21:05:00.000Z",
  cutoff: "2026-10-23T15:00:00.000Z",
};

/** 문서의 class 속성 낱말 전부. */
function classesOf(html: string): Set<string> {
  return new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)));
}

/** 보관 지면이 써도 되는 비컴포넌트 클래스 — 다른 화면이 늘 쓰는 표지·유틸리티와 아이콘 기본값. */
const ALLOWED_NON_COMPONENT = new Set(["story-link", "headline", "text-brand", "sr-only", "ic"]);
const ARTICLE_HTML_CLASS = ASSETS.htmlClass.split(" ");

function expectOnlyComponentClasses(html: string) {
  const bad = [...classesOf(html)].filter(
    (c) =>
      !ALLOWED_NON_COMPONENT.has(c) && !ARTICLE_HTML_CLASS.includes(c) && !COMPONENT_CLASS.test(c),
  );
  expect(bad).toEqual([]);
  // 쓰는 컴포넌트 클래스는 모두 globals.css 에 정의돼 있다.
  const undefinedClasses = [...classesOf(html)]
    .filter((c) => COMPONENT_CLASS.test(c))
    .filter((c) => !GLOBALS_CSS.includes(`.${c}`));
  expect(undefinedClasses).toEqual([]);
}

describe("보관 기사", () => {
  const issue = { ref: REF, count: 27 };

  it("문서: 표지·lang·next/font 클래스·공유 CSS·테마·집계, RSC·_next 스크립트 없음", () => {
    const html = renderArchiveArticle({ article: card(), issue, issueDate: REF.date }, ASSETS);
    expect(
      html.startsWith(
        '<!DOCTYPE html><html lang="ko" class="__variable_a __variable_b"><head><meta charset="utf-8">',
      ),
    ).toBe(true);
    expect(html.indexOf(ARCHIVE_GENERATOR_META)).toBeLessThan(200);
    expect(html).toContain(
      '<link rel="stylesheet" href="/_next/static/css/a.css"><link rel="stylesheet" href="/_next/static/css/b.css">',
    );
    expect(html).toContain(ASSETS.fontPreloadTags[0]);
    expect(html).toContain(`<script>${THEME_SCRIPT}</script>`);
    expect(html).toContain(
      '<script async src="https://gc.zgo.at/count.js" data-goatcounter="https://sguys99.goatcounter.com/count"></script>',
    );
    expect(html).not.toMatch(/_next\/static\/chunks|self\.__next_f/);
    expect(html).toContain('<body class="sh-lb">');
    expectOnlyComponentClasses(html);
  });

  it("<head> 메타는 전체 페이지와 같은 metadata(articlePageMetadata)에서 — canonical·og·article:tag·twitter:card", () => {
    const html = renderArchiveArticle({ article: card(), issue, issueDate: REF.date }, ASSETS);
    const url = `${SITE_URL}/article/1029/`;
    expect(html).toContain(
      "<title>PHP에 원격 서버 제어 가능한 치명적 취약점 발견 — AI Daybook</title>",
    );
    expect(html).toContain(`<link rel="canonical" href="${url}">`);
    expect(html).toContain(`<meta property="og:url" content="${url}">`);
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/og/default.png">`);
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).toContain('<meta property="article:section" content="오픈소스·도구">');
    expect(html).toContain('<meta property="article:tag" content="보안 패치">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(
      `<link rel="alternate" type="application/rss+xml" title="AI Daybook" href="${SITE_URL}/feed.xml">`,
    );
    // 구조화 데이터(NewsArticle) — description 은 뺀다(meta description·og 에 있다).
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]);
    expect(ld).toMatchObject({
      "@type": "NewsArticle",
      mainEntityOfPage: url,
      isBasedOn: card().url,
    });
    expect(ld.description).toBeUndefined();
  });

  it("metadataTags: 페이지 키가 레이아웃을 덮는다 — undefined 여도(Next 와 같다: 요약 없는 기사는 description 없음)", () => {
    const tags = metadataTags(articlePageMetadata(card({ summaryKo: "" })));
    expect(tags.some((t) => t.startsWith('<meta name="description"'))).toBe(false);
    // og:description 은 shareMetadata 가 사이트 설명으로 채운다.
    expect(tags.find((t) => t.includes('"og:description"'))).toContain("데일리 브리핑");
    expect(tags.filter((t) => t.startsWith("<title>"))).toHaveLength(1);
    expect(tags.some((t) => t.includes("twitter:title"))).toBe(false);
  });

  it("본문: 폴리오(호 링크·호수) → 키커 → 제목 → 원제(실제 언어) → 바이라인 → 요약 → 원문 → 태그 → 이 호로", () => {
    const body = archiveArticleBody({ article: card(), issue, issueDate: REF.date });
    expect(body).toContain(
      '<p class="ar-fo"><b>보관 지면</b><a class="ed-plink" href="/edition/2026-10-23/"><time datetime="2026-10-23">2026년 10월 23일 금요일</time></a><span>제129호</span></p>',
    );
    expect(body).toContain('<span class="sg-kick">오픈소스·도구</span><h1 class="ar-h1">');
    // 한국 매체 원제는 한국어 — 문서 언어와 같아 lang 을 달지 않는다.
    expect(body).toContain(
      '<p class="ar-ot">웹사이트 개발 언어 ‘PHP’서 치명적 보안취약점 발견</p>',
    );
    expect(body).toContain('<span class="sg-imp" data-v="3" role="img" aria-label="중요도 3/5">');
    expect(body).toContain('<time datetime="2026-10-21T23:47:26.000Z">2026.10.22</time>');
    expect(body).toContain(
      '<a class="ar-go" href="https://byline.network/2026/10/22-613/" rel="noopener">원문 기사 읽기',
    );
    expect(body).toContain(
      '<a href="/?tag=%EB%B3%B4%EC%95%88%20%ED%8C%A8%EC%B9%98">#보안 패치</a>',
    );
    expect(body).toContain(
      '<a class="ed-pg-a ar-nx" href="/edition/2026-10-23/"><span class="ed-pg-l">이 호의 다른 기사 26건</span><span class="ed-pg-h">제129호 지면 →</span><span class="ed-pg-d">10월 23일(금)</span></a>',
    );
    expect(body).not.toContain("원문 발췌");
    // 순서
    const order = [
      "ar-fo",
      "sg-kick",
      "ar-h1",
      "ar-ot",
      "sg-by",
      "ar-sum",
      "ar-go",
      "ar-tg",
      "ar-nx",
    ].map((c) => body.search(new RegExp(`class="([a-z-]+ )?${c}["\\s]`)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("비뉴스는 형식 배지 + 키커, 영문 원제는 lang=en, 화제 지수는 0보다 클 때만", () => {
    const body = archiveArticleBody({
      article: card({ format: "oss", titleOriginal: "owner/repo", trendingScore: 42 }),
      issue,
      issueDate: REF.date,
    });
    expect(body).toContain(
      '<span class="st-hd"><span class="sg-badge"><span aria-hidden="true">REPO</span><span class="sr-only">저장소</span></span><span class="sg-kick">',
    );
    expect(body).toContain('<p class="ar-ot" lang="en">owner/repo</p>');
    expect(body).toContain("<span>화제 42</span>");
  });

  it(`다른 매체는 ${ARCHIVE_COVERAGE_MAX}곳까지 링크하고 나머지는 "외 N곳"`, () => {
    const related = Array.from({ length: 8 }, (_, i) => ({
      source: "TechCrunch AI",
      url: `https://example.com/${i}`,
      title: `Story ${i}`,
    }));
    const body = archiveArticleBody({ article: card({ related }), issue, issueDate: REF.date });
    expect(body).toContain('<h2 id="cv" class="ar-h">같은 소식, 다른 매체 · 8곳</h2>');
    expect(body.match(/class="story-link ar-cov"/g)).toHaveLength(ARCHIVE_COVERAGE_MAX);
    expect(body).toContain(
      '<span class="ar-cov-s">TechCrunch</span><span class="headline ar-cov-h" lang="en">Story 0</span>',
    );
    expect(body).toContain('<li class="ar-li ar-cv-m">외 3곳</li>');
  });

  it("다른 매체 링크가 길어 8KB 를 넘으면 넘지 않을 때까지 한 곳씩 줄이고 나머지는 셈만", () => {
    const longUrl = (i: number) =>
      `https://news.google.com/rss/articles/${"CBMi".repeat(70)}${i}?oc=5`;
    const related = Array.from({ length: 7 }, (_, i) => ({
      source: "Google News: VLA",
      url: longUrl(i),
      title: `로봇 기업 ${i}, 휴머노이드 시범 운영을 공장 세 곳으로 넓혀 생산 라인 자동화 범위 확대`,
    }));
    const html = renderArchiveArticle(
      { article: card({ related }), issue, issueDate: REF.date },
      ASSETS,
    );
    expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(ARCHIVE_ARTICLE_BUDGET_BYTES);
    const links = html.match(/class="story-link ar-cov"/g)?.length ?? 0;
    expect(links).toBeGreaterThanOrEqual(1);
    expect(links).toBeLessThan(ARCHIVE_COVERAGE_MAX);
    expect(html).toContain(`<li class="ar-li ar-cv-m">외 ${7 - links}곳</li>`);
    expect(html).toContain("같은 소식, 다른 매체 · 7곳");
  });

  it("다른 매체 링크를 0곳까지 줄이면 목록 없이 제목의 매체 수만 남긴다", () => {
    const related = [
      { source: "전자신문 AI", url: "https://example.com/1", title: "같은 사건 보도" },
    ];
    const body = archiveArticleBody(
      { article: card({ related }), issue, issueDate: REF.date },
      "ko",
      0,
    );
    expect(body).toContain(
      '<section class="ar-sect ar-cv" aria-labelledby="cv"><h2 id="cv" class="ar-h">같은 소식, 다른 매체 · 1곳</h2></section>',
    );
    expect(body).not.toContain("ar-cv-m");
    expect(body).not.toContain('class="story-link ar-cov"');
  });

  it("이스케이프 — 제목·요약·URL 의 <>&\"' 와 javascript: 링크", () => {
    const body = archiveArticleBody({
      article: card({
        titleKo: '<script>alert("x")</script> & co',
        summaryKo: "it's <b>",
        url: "javascript:alert(1)",
        related: [{ source: "X", url: "javascript:alert(2)", title: "t<i>" }],
      }),
      issue,
      issueDate: REF.date,
    });
    expect(body).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
    expect(body).toContain("it&#39;s &lt;b&gt;");
    expect(body).not.toContain("javascript:");
    expect(body).not.toContain("<script");
    expect(esc(`a"b'c<d>&`)).toBe("a&quot;b&#39;c&lt;d&gt;&amp;");
  });

  it("호를 모르면 폴리오에 날짜만, 이 호로 가는 줄은 없다", () => {
    const body = archiveArticleBody({ article: card(), issue: null, issueDate: "2026-06-07" });
    expect(body).toContain(
      '<p class="ar-fo"><b>보관 지면</b><span><time datetime="2026-06-07">2026년 6월 7일 일요일</time></span></p>',
    );
    expect(body).not.toContain("ar-nx");
  });

  it("영어 렌더: 문구·날짜·lang 이 영어로", () => {
    const html = renderArchiveArticle(
      {
        article: card({ titleEn: "Critical PHP flaw", summaryEn: "A flaw." }),
        issue,
        issueDate: REF.date,
      },
      ASSETS,
      "en",
    );
    expect(html).toContain('<html lang="en"');
    expect(html).toContain("<b>From the archive</b>");
    expect(html).toContain('href="/en/edition/2026-10-23/"');
    expect(html).toContain('<h1 class="ar-h1">Critical PHP flaw</h1>');
    expect(html).toContain(
      '<p class="ar-orig"><span class="ar-orig-l">Original article in Korean</span><span class="ar-orig-t" lang="ko">',
    );
    expect(html).not.toContain("#보안 패치"); // 한글 태그는 영어판에서 숨긴다
  });

  it("보통 기사 크기는 8KB 예산 안(공유 조각 길이는 실제 빌드와 비슷하게)", () => {
    const real: BuildAssets = {
      htmlClass: "__variable_33a67b __variable_96ca31",
      viewportTags: [
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4f4f1">',
        '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f1118">',
      ],
      iconTags: [
        '<link rel="icon" href="/global-ai-news/favicon.ico" type="image/x-icon" sizes="16x16">',
        '<link rel="icon" href="/global-ai-news/icon.svg?0077a3388c5fb959" type="image/svg+xml" sizes="any">',
        '<link rel="apple-touch-icon" href="/global-ai-news/apple-icon.png?2e9f729d0d3d67fb" type="image/png" sizes="180x180">',
      ],
      fontPreloadTags: [
        '<link rel="preload" href="/global-ai-news/_next/static/media/ff840cfebfb63b0c-s.p.woff2" as="font" crossorigin type="font/woff2">',
      ],
      stylesheets: [
        "/global-ai-news/_next/static/css/3ad5445a001bfb5f.css",
        "/global-ai-news/_next/static/css/fa42fe11ee371e2c.css",
      ],
    };
    const related = Array.from({ length: 3 }, (_, i) => ({
      source: "전자신문 AI",
      url: `https://www.etnews.com/2026102200046${i}`,
      title: "中·日 정부, PHP 취약점에 신속 대응 촉구…“일본 PHP 의존도 높아”",
    }));
    const summaryKo =
      "세계적으로 사용되는 웹 개발 언어 PHP에서 인증 없이 악성코드 실행 및 서버 정보 접근이 가능한 보안 취약점이 발견됐다. 영향 범위가 광범위해 일부 유럽 국가에서는 정부 웹서비스를 예방적으로 중단했다.";
    const html = renderArchiveArticle(
      {
        article: card({
          related,
          summaryKo,
          tags: ["php", "security", "vulnerability", "보안", "패치"],
        }),
        issue,
        issueDate: REF.date,
      },
      real,
    );
    expect(Buffer.byteLength(html)).toBeLessThan(8_000);
  });
});

describe("보관 호", () => {
  const mk = (id: number, over: Partial<ArticleCard> = {}) =>
    card({ id, titleKo: `제목 ${id}`, importance: 3, related: [], ...over });
  const issue = [
    mk(1, {
      category: "industry",
      importance: 5,
      related: [{ source: "A", url: "https://a", title: "a" }],
    }),
    mk(2, { category: "llm", importance: 4 }),
    mk(3, {
      category: "agent",
      importance: 4,
      format: "paper",
      source: { id: "hf", name: "HuggingFace Daily Papers" },
    }),
    mk(4, { category: "llm", importance: 2 }),
    mk(5, { category: "physical", importance: 1 }),
    mk(6, { category: "industry", importance: 1 }),
  ];
  const edition = buildEdition(issue);
  const input = {
    ref: REF,
    edition,
    brief: [
      { id: 1, text: "첫 줄" },
      { id: 2, text: "둘째 줄" },
    ],
    prev: { date: "2026-10-22", issueNo: 128, publishedAt: "2026-10-21T21:00:00.000Z" },
    next: null,
    latestEditionDate: "2027-02-01",
  };

  it("문서: 메타는 전체 호 페이지와 같은 빌더(제목·기본 썸네일), 클래스는 컴포넌트 클래스만", () => {
    const html = renderArchiveEdition(input, ASSETS);
    expect(html).toContain(
      "<title>2026년 10월 23일 금요일 AI 뉴스 브리핑 제129호 — AI Daybook</title>",
    );
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/edition/2026-10-23/">`);
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/og/default.png">`);
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).not.toContain("application/ld+json");
    expectOnlyComponentClasses(html);
  });

  it("마스트헤드 축소판: 폴리오·날짜 h1·귀(건수·매체·형식 구성)·이중 괘선", () => {
    const body = archiveEditionBody(input);
    expect(body).toContain(
      '<p class="ed-lm-f"><b>보관 지면</b><span>제129호</span><span>매일 06:00 KST 발행</span></p>',
    );
    expect(body).toContain(
      '<h1 class="ed-lm-h"><time datetime="2026-10-23">2026년 10월 23일 금요일</time></h1>',
    );
    expect(body).toContain(
      '<b class="ed-ear-n">6</b><span class="ed-ear-u">건</span> · 매체 2곳</span>',
    );
    expect(body).toContain(
      '<span class="ed-ear-f"><span>뉴스 <b class="sg-em">5</b></span><i aria-hidden="true">·</i><span>논문 <b class="sg-em">1</b></span></span>',
    );
    expect(body).toContain('<div class="ed-dbl" aria-hidden="true"></div>');
  });

  it("세 줄 요약: 2줄이면 '두 줄 요약', 1줄이면 띠를 숨긴다", () => {
    expect(archiveEditionBody(input)).toContain('<h2 id="br">두 줄 요약</h2>');
    expect(archiveEditionBody({ ...input, brief: [{ id: 1, text: "x" }] })).not.toContain("ed-br");
  });

  it("분야 묶음은 CATEGORIES 순, 묶음 안은 편집 순, 1면 게재분에 '1면' 표시", () => {
    const body = archiveEditionBody(input);
    const heads = [...body.matchAll(/<h3 id="c-([a-z]+)">/g)].map((m) => m[1]);
    expect(heads).toEqual(["llm", "agent", "physical", "industry"]);
    expect(body.indexOf('href="/article/2/"')).toBeLessThan(body.indexOf('href="/article/4/"'));
    const front = new Set(frontArticles(edition).map((a) => a.id));
    for (const a of issue) {
      const row = new RegExp(`ed-lr" href="/article/${a.id}/"[^]*?</li>`).exec(body)![0];
      expect(row.includes('<span class="ed-lr-f">1면</span>')).toBe(front.has(a.id));
    }
    expect(body).toContain('<span class="ed-cnt">6건 · 분야별</span>');
    expect(body).toContain(
      '<span class="sg-em">바이라인네트워크<span class="sg-oth"> 외 1곳</span></span>',
    );
    expect(body).toContain(
      '<span class="headline ed-lr-h"><span class="sg-badge"><span aria-hidden="true">PAPER</span>',
    );
  });

  it("호 이동: 있는 방향만, 다음 호만 있으면 오른쪽 칸(ed-pg-n)", () => {
    const body = archiveEditionBody(input);
    expect(body).toContain(
      '<nav class="ed-pg" aria-label="호 이동"><a class="ed-pg-a" href="/edition/2026-10-22/"><span class="ed-pg-l">← 이전 호</span><span class="ed-pg-h">제128호</span><span class="ed-pg-d">10월 22일(목)</span></a></nav>',
    );
    const onlyNext = archiveEditionBody({ ...input, prev: null, next: input.prev });
    expect(onlyNext).toContain(
      '<a class="ed-pg-a ed-pg-n" href="/edition/2026-10-22/"><span class="ed-pg-l">다음 호 →</span>',
    );
  });
});
