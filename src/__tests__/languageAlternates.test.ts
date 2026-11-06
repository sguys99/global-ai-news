import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";
import type { EditionRef } from "@/lib/db";
import type { ArticleCard } from "@/lib/types";

/*
 * 언어판 짝(english-version-plan 5-3 — 6-2 hreflang 중 ko·en 짝만 먼저): src/views/data.ts `languageAlternates` 의
 * 존재 규칙, `withLanguageAlternates` 병합, 보관 지면 머리(hreflang)·머리 띠 언어 전환 링크.
 * 조회 계층(@/lib/db)만 가짜로 바꾼다(viewsEn.test 와 같은 방식).
 */

const db = vi.hoisted(() => ({
  refs: [] as EditionRef[],
  articles: [] as ArticleCard[],
  issueDates: new Map<number, string>(),
  plan: {
    latestEditionDate: null as string | null,
    liveArticleIds: [] as number[],
    archivedArticleIds: [] as number[],
    liveEditionDates: [] as string[],
    archivedEditionDates: [] as string[],
  },
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const { hasEnglish } = await import("@/lib/articleText");
  return {
    ...(await importOriginal<typeof import("@/lib/db")>()),
    getEditionRefs: () => db.refs,
    getIssueArticles: (date: string) => db.articles.filter((a) => db.issueDates.get(a.id) === date),
    getIssueDates: () => db.issueDates,
    getEnglishArticleIds: () => db.articles.filter(hasEnglish).map((a) => a.id),
    getArchivePlan: () => db.plan,
    getArticle: (id: number) => db.articles.find((a) => a.id === id) ?? null,
  };
});

import { renderArchiveArticle, renderArchiveEdition, type BuildAssets } from "@/lib/archivePage";
import { buildEdition } from "@/lib/edition";
import { withLanguageAlternates } from "@/lib/pageMetadata";
import { shareMetadata } from "@/lib/site";
import { languageAlternates, localeArchivePlan } from "@/views/data";

function ref(date: string, issueNo: number): EditionRef {
  return { date, issueNo, publishedAt: `${date}T00:00:00+09:00`, cutoff: `${date}T15:00:00Z` };
}

function card(id: number, p: Partial<ArticleCard> = {}): ArticleCard {
  return {
    id,
    source: { id: "hn", name: "Hacker News" },
    url: `https://x/${id}`,
    titleKo: `기사${id}`,
    summaryKo: `요약${id}`,
    titleOriginal: `T${id}`,
    titleEn: `Story ${id}`,
    summaryEn: `Summary ${id}.`,
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-11-03T00:00:00Z",
    related: [],
    ...p,
  };
}

const noEnglish = { titleEn: "", summaryEn: "" };

beforeEach(() => {
  // 06-01: 보관 호(영어 기사 1 + 영어 없는 2), 11-02: 영어 없는 기사만, 11-03: 영어 3·영어 없는 4
  db.refs = [ref("2026-06-01", 1), ref("2026-11-02", 2), ref("2026-11-03", 3)];
  db.articles = [card(1), card(2, noEnglish), card(3), card(4, noEnglish), card(5, noEnglish)];
  db.issueDates = new Map([
    [1, "2026-06-01"],
    [2, "2026-06-01"],
    [5, "2026-11-02"],
    [3, "2026-11-03"],
    [4, "2026-11-03"],
  ]);
  db.plan = {
    latestEditionDate: "2026-11-03",
    liveArticleIds: [3, 4, 5],
    archivedArticleIds: [1, 2],
    liveEditionDates: ["2026-11-02", "2026-11-03"],
    archivedEditionDates: ["2026-06-01"],
  };
});

const PAIR = (path: string) => ({ ko: path, en: `/en${path}` });

describe("languageAlternates — 두 언어판이 모두 있을 때만 짝", () => {
  it("홈·검색은 늘 짝", () => {
    expect(languageAlternates({ kind: "home" })).toEqual({ ko: "/", en: "/en/" });
    expect(languageAlternates({ kind: "search" })).toEqual(PAIR("/search/"));
  });

  it("기사: 영어 본문이 있으면 짝, 없으면 null(한국어판에 en hreflang 없음)", () => {
    expect(languageAlternates({ kind: "article", id: 3 })).toEqual(PAIR("/article/3/"));
    expect(languageAlternates({ kind: "article", id: 4 })).toBeNull();
    // 공개되지 않은(없는) 기사
    expect(languageAlternates({ kind: "article", id: 999 })).toBeNull();
  });

  it("기사: 영어 제목만 있고 요약이 없으면(hasEnglish 거짓) 짝이 없다", () => {
    db.articles.push(card(6, { summaryEn: " " }));
    expect(languageAlternates({ kind: "article", id: 6 })).toBeNull();
  });

  it("호: 영어 기사가 1건 이상이면 짝, 영어 기사가 없는 호는 null", () => {
    expect(languageAlternates({ kind: "edition", date: "2026-11-03" })).toEqual(
      PAIR("/edition/2026-11-03/"),
    );
    expect(languageAlternates({ kind: "edition", date: "2026-11-02" })).toBeNull();
  });

  it("보관 대상도 같은 주소에 가벼운 지면이 있으므로 짝이 있다(영어가 있을 때)", () => {
    expect(languageAlternates({ kind: "article", id: 1 })).toEqual(PAIR("/article/1/"));
    expect(languageAlternates({ kind: "article", id: 2 })).toBeNull();
    expect(languageAlternates({ kind: "edition", date: "2026-06-01" })).toEqual(
      PAIR("/edition/2026-06-01/"),
    );
  });

  it("영어판 경로 계획(live + 보관)과 정확히 같은 기준이다", () => {
    const en = localeArchivePlan("en");
    const ko = localeArchivePlan("ko");
    const enIds = new Set([...en.liveArticleIds, ...en.archivedArticleIds]);
    const enDates = new Set([...en.liveEditionDates, ...en.archivedEditionDates]);
    for (const id of [...ko.liveArticleIds, ...ko.archivedArticleIds])
      expect(languageAlternates({ kind: "article", id }) !== null, `article ${id}`).toBe(
        enIds.has(id),
      );
    for (const date of [...ko.liveEditionDates, ...ko.archivedEditionDates])
      expect(languageAlternates({ kind: "edition", date }) !== null, `edition ${date}`).toBe(
        enDates.has(date),
      );
  });
});

describe("withLanguageAlternates", () => {
  it("짝이 없으면 같은 객체 그대로(한국어 metadata 무변화)", () => {
    const meta: Metadata = { title: "x", alternates: { canonical: "/article/4/" } };
    expect(withLanguageAlternates(meta, null)).toBe(meta);
  });

  it("기존 alternates(canonical·RSS)를 지키고 languages 만 얹는다", () => {
    const meta: Metadata = {
      title: "x",
      alternates: {
        canonical: "/article/3/",
        types: { "application/rss+xml": [{ url: "/feed.xml", title: "AI Daybook" }] },
      },
    };
    const out = withLanguageAlternates(meta, PAIR("/article/3/"));
    expect(out.alternates).toEqual({
      canonical: "/article/3/",
      types: { "application/rss+xml": [{ url: "/feed.xml", title: "AI Daybook" }] },
      languages: { ko: "/article/3/", en: "/en/article/3/", "x-default": "/en/article/3/" },
    });
    expect(meta.alternates).not.toHaveProperty("languages");
  });

  it("alternates 가 없던 metadata 에는 languages 만(x-default = 영어 주소)", () => {
    expect(withLanguageAlternates({ title: "y" }, PAIR("/search/"))).toEqual({
      title: "y",
      alternates: { languages: { ko: "/search/", en: "/en/search/", "x-default": "/en/search/" } },
    });
  });

  it("og:locale 이 있으면 상대 언어판 og:locale:alternate 를 같이 단다 — 짝이 없으면 달지 않는다", () => {
    const ko = shareMetadata({ title: "t", description: "d", path: "/article/3/" });
    expect(withLanguageAlternates(ko, PAIR("/article/3/")).openGraph).toMatchObject({
      locale: "ko_KR",
      alternateLocale: ["en_US"],
    });
    expect(withLanguageAlternates(ko, null).openGraph).not.toHaveProperty("alternateLocale");
    const en = shareMetadata({ title: "t", description: "d", path: "/article/3/", locale: "en" });
    expect(withLanguageAlternates(en, PAIR("/article/3/")).openGraph).toMatchObject({
      locale: "en_US",
      alternateLocale: ["ko_KR"],
    });
    // 입력 객체는 바꾸지 않는다
    expect(en.openGraph).not.toHaveProperty("alternateLocale");
  });
});

describe("보관 지면 — hreflang 짝과 머리 띠 언어 전환 링크", () => {
  const ASSETS: BuildAssets = {
    htmlClass: "v",
    viewportTags: [],
    iconTags: [],
    fontPreloadTags: [],
    stylesheets: [],
  };
  const issue = { ref: ref("2026-06-01", 1), count: 2 };

  it("한국어 보관 기사(영어 있음): en·ko hreflang + `EN` 링크가 같은 기사 영어판", () => {
    const html = renderArchiveArticle(
      {
        article: card(1),
        issue,
        issueDate: "2026-06-01",
        languages: languageAlternates({ kind: "article", id: 1 }),
      },
      ASSETS,
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="ko" href="http://localhost:3000/article/1/">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="en" href="http://localhost:3000/en/article/1/">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="http://localhost:3000/en/article/1/">',
    );
    // 상대 언어판이 있으니 og:locale:alternate — Next 와 같은 자리(og:image 다음, og:type 앞)
    expect(html).toMatch(
      /<meta property="og:image:type" content="image\/png"><meta property="og:locale:alternate" content="en_US"><meta property="og:type" content="article">/,
    );
    expect(html).toMatch(
      /<a class="sh-ln" href="\/en\/article\/1\/" lang="en" hreflang="en"[^>]*>EN<\/a>/,
    );
  });

  it("한국어 보관 기사(영어 없음): hreflang 없음, `EN` 링크는 영어 홈", () => {
    const html = renderArchiveArticle(
      {
        article: card(2, noEnglish),
        issue,
        issueDate: "2026-06-01",
        languages: languageAlternates({ kind: "article", id: 2 }),
      },
      ASSETS,
    );
    expect(html).not.toContain('hreflang="en" href="http');
    expect(html).not.toMatch(/<link rel="alternate" hreflang/);
    expect(html).not.toContain("og:locale:alternate");
    expect(html).toContain('<meta property="og:locale" content="ko_KR">');
    expect(html).toMatch(/<a class="sh-ln" href="\/en\/" lang="en" hreflang="en"[^>]*>EN<\/a>/);
  });

  it("영어 보관 호: ko hreflang + `한국어`(lang=ko) 링크가 같은 호 한국어판", () => {
    const edition = buildEdition([card(1)]);
    const html = renderArchiveEdition(
      {
        ref: ref("2026-06-01", 1),
        edition,
        brief: [],
        prev: null,
        next: null,
        latestEditionDate: "2026-11-03",
        languages: languageAlternates({ kind: "edition", date: "2026-06-01" }),
      },
      ASSETS,
      "en",
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="ko" href="http://localhost:3000/edition/2026-06-01/">',
    );
    // 영어 보관 호: 자기 canonical·x-default(영어)·영어 공유 메타, 보관 호는 썸네일 창 밖 → 영어 기본 썸네일
    expect(html).toContain(
      '<link rel="canonical" href="http://localhost:3000/en/edition/2026-06-01/">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="http://localhost:3000/en/edition/2026-06-01/">',
    );
    expect(html).toContain(
      '<meta property="og:url" content="http://localhost:3000/en/edition/2026-06-01/">',
    );
    expect(html).toContain('<meta property="og:locale" content="en_US">');
    expect(html).toContain('<meta property="og:locale:alternate" content="ko_KR">');
    expect(html).toContain(
      '<meta property="og:image" content="http://localhost:3000/og/en/default.png">',
    );
    expect(html).toContain('<meta property="og:title" content="Story 1">');
    expect(html).toMatch(
      /<a class="sh-ln" href="\/edition\/2026-06-01\/" lang="ko" hreflang="ko" aria-label="한국어로 읽기" title="한국어로 읽기">한국어<\/a>/,
    );
  });
});
