import { describe, expect, it, vi } from "vitest";
import type { ArticleCard } from "@/lib/types";

/*
 * 영어판 Phase 6-1·6-2 페이지 메타: 한국어 메타는 한국어만, 언어판별 공유 메타(og:locale·영어 썸네일·RSS)·자기 canonical,
 * hreflang x-default(= 영어)·og:locale:alternate 는 짝이 있을 때만, 영어 썸네일 판정(articleThumbnail "en").
 * 조회 계층(@/lib/db)은 최신 게시 시각만 가짜로 바꾼다.
 */

const db = vi.hoisted(() => ({ latestPublishedAt: null as string | null }));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  getLatestPublishedAt: () => db.latestPublishedAt,
}));

import { hasHangul } from "@/lib/labels";
import {
  ENGLISH_SEARCH_METADATA,
  EN_LAYOUT_METADATA,
  KO_LAYOUT_METADATA,
  articlePageMetadata,
  englishArticlePageMetadata,
  englishEditionPageMetadata,
  withLanguageAlternates,
} from "@/lib/pageMetadata";
import {
  SITE_DESCRIPTION,
  SITE_DESCRIPTION_EN,
  SITE_NAME,
  SITE_TITLE,
  editionMetadata,
  editionShare,
  hreflangLanguages,
  shareMetadata,
} from "@/lib/site";
import { articleThumbnail } from "@/views/data";

function card(id: number, p: Partial<ArticleCard> = {}): ArticleCard {
  return {
    id,
    source: { id: "aitimes", name: "AI타임스", region: "kr" },
    url: `https://x/${id}`,
    titleKo: `한국어 제목 ${id}`,
    summaryKo: `한국어 요약 ${id}`,
    titleOriginal: `원제 ${id}`,
    titleEn: `Story ${id}`,
    summaryEn: `Summary ${id}.`,
    category: "physical",
    format: "news",
    tags: ["robotics", "휴머노이드", "Samsung"],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-10-05T21:00:00Z",
    ...p,
  };
}

// 2026-10-05 21:00 UTC = 2026-10-06 06:00 KST(화요일)
const info = { issueNo: 42, publishedAt: "2026-10-05T21:00:00Z" };
const LATEST = "2026-10-06";
const PAIR = (path: string) => ({ ko: path, en: `/en${path}` });

describe("한국어 메타는 한국어만(6-1)", () => {
  it("SITE_TITLE·SITE_DESCRIPTION 에 영어 병기가 없다", () => {
    expect(SITE_TITLE).toBe(`${SITE_NAME} — 오늘의 AI 뉴스 요약`);
    expect(SITE_DESCRIPTION).not.toMatch(/Daily|summarized|news/i);
    expect(KO_LAYOUT_METADATA.title).toBe(SITE_TITLE);
  });

  it("한국어 공유 메타: og:locale ko_KR·한국어 RSS·기본 썸네일, canonical 은 접두어 없는 자기 주소", () => {
    const m = shareMetadata({ title: "t", description: "d", path: "/article/3/" });
    expect(m.openGraph).toMatchObject({
      locale: "ko_KR",
      url: "/article/3/",
      images: [{ url: "/og/default.png" }],
    });
    expect(m.alternates).toEqual({
      canonical: "/article/3/",
      types: { "application/rss+xml": [{ url: "/feed.xml", title: SITE_NAME }] },
    });
  });
});

describe("영어 공유 메타·canonical(6-1·6-2)", () => {
  it("shareMetadata en: og:url·canonical = /en 자기 주소, og:locale en_US, 영어 RSS·기본 썸네일", () => {
    const m = shareMetadata({ title: "t", description: "d", path: "/search/", locale: "en" });
    expect(m.openGraph).toMatchObject({
      locale: "en_US",
      url: "/en/search/",
      images: [{ url: "/og/en/default.png", alt: SITE_NAME }],
    });
    expect(m.alternates).toEqual({
      canonical: "/en/search/",
      types: { "application/rss+xml": [{ url: "/en/feed.xml", title: SITE_NAME }] },
    });
    expect(
      shareMetadata({ title: "t", description: "d", path: "/", locale: "en" }).alternates,
    ).toMatchObject({ canonical: "/en/" });
  });

  it("영어 레이아웃: 영어 기본 공유 메타(canonical 없음)", () => {
    expect(EN_LAYOUT_METADATA.openGraph).toMatchObject({
      locale: "en_US",
      description: SITE_DESCRIPTION_EN,
      images: [{ url: "/og/en/default.png" }],
    });
    expect(EN_LAYOUT_METADATA.alternates?.canonical).toBeUndefined();
  });

  it("영어 검색: `Search AI News — AI Daybook`, canonical /en/search/", () => {
    expect(ENGLISH_SEARCH_METADATA.title).toBe("Search AI News — AI Daybook");
    expect(ENGLISH_SEARCH_METADATA.alternates?.canonical).toBe("/en/search/");
    expect(ENGLISH_SEARCH_METADATA.openGraph).toMatchObject({
      locale: "en_US",
      url: "/en/search/",
    });
  });

  it("영어 기사: 영어 제목·summary_en·영어 분야·라틴 태그만, 썸네일 경로 그대로 — 한글 없음", () => {
    const article = card(9);
    const m = englishArticlePageMetadata(article, "/og/en/article/9.png");
    expect(m.title).toBe("Story 9 — AI Daybook");
    expect(m.description).toBe("Summary 9.");
    expect(m.alternates?.canonical).toBe("/en/article/9/");
    expect(m.openGraph).toMatchObject({
      type: "article",
      title: "Story 9",
      description: "Summary 9.",
      url: "/en/article/9/",
      locale: "en_US",
      publishedTime: article.publishedAt,
      section: "Physical AI",
      tags: ["robotics", "Samsung"],
      images: [{ url: "/og/en/article/9.png", alt: "Story 9" }],
    });
    expect(hasHangul(JSON.stringify(m))).toBe(false);
    // 썸네일이 없으면 영어 기본 썸네일
    expect(englishArticlePageMetadata(article).openGraph).toMatchObject({
      images: [{ url: "/og/en/default.png" }],
    });
  });

  it("영어 기사 + 짝: hreflang ko·en·x-default(영어) + og:locale:alternate ko_KR", () => {
    const m = withLanguageAlternates(englishArticlePageMetadata(card(9)), PAIR("/article/9/"));
    expect(m.alternates?.languages).toEqual({
      ko: "/article/9/",
      en: "/en/article/9/",
      "x-default": "/en/article/9/",
    });
    expect(m.openGraph).toMatchObject({ locale: "en_US", alternateLocale: ["ko_KR"] });
    expect(m.alternates?.canonical).toBe("/en/article/9/");
  });

  it("영어 없는 기사의 한국어판: 짝이 없으면 hreflang·og:locale:alternate 없음", () => {
    const m = withLanguageAlternates(articlePageMetadata(card(4)), null);
    expect(m.alternates).not.toHaveProperty("languages");
    expect(m.openGraph).not.toHaveProperty("alternateLocale");
    expect(m.openGraph).toMatchObject({ locale: "ko_KR", url: "/article/4/" });
  });

  it("hreflangLanguages: x-default 는 영어 주소", () => {
    expect(hreflangLanguages(PAIR("/"))).toEqual({ ko: "/", en: "/en/", "x-default": "/en/" });
  });
});

describe("영어 호 공유 문구(editionShare en)", () => {
  const lead = card(1);
  const sub = card(2);

  it("머리 `AI Daybook · 날짜 · No. N` + 리드 줄을 뺀 영어 세 줄 요약", () => {
    const brief = [
      { id: 1, text: "Story 1" },
      { id: 2, text: "Story 2" },
      { id: 3, text: "Story 3" },
    ];
    const share = editionShare({ lead, seconds: [sub] }, info, brief, "en");
    expect(share.title).toBe("Story 1");
    expect(share.description).toBe("AI Daybook · Tue, Oct 6, 2026 · No. 42 — Story 2 · Story 3");
    expect(share.version).toBe("42-1");
  });

  it("요약이 없으면 서브 영어 헤드라인, 리드가 없으면 영어 사이트 설명", () => {
    expect(editionShare({ lead, seconds: [sub] }, info, [], "en").description).toBe(
      "AI Daybook · Tue, Oct 6, 2026 · No. 42 — Story 2",
    );
    expect(editionShare({ lead: null, seconds: [] }, info, [], "en")).toMatchObject({
      title: SITE_NAME,
      description: SITE_DESCRIPTION_EN,
    });
  });

  it("editionMetadata en: 창 안이면 /og/en/edition PNG(영어 대체 텍스트), 창 밖이면 영어 기본 썸네일", () => {
    const inside = editionMetadata(
      { lead, seconds: [] },
      info,
      "/edition/2026-10-06/",
      LATEST,
      [],
      "en",
    );
    expect(inside.openGraph).toMatchObject({
      url: "/en/edition/2026-10-06/",
      locale: "en_US",
      images: [
        {
          url: "/og/en/edition/2026-10-06.png?v=42-1",
          alt: "Front page, Tue, Oct 6, 2026: Story 1",
        },
      ],
    });
    expect(inside.alternates?.canonical).toBe("/en/edition/2026-10-06/");
    const outside = editionMetadata({ lead, seconds: [] }, info, "/", "2026-12-01", [], "en");
    expect(outside.openGraph).toMatchObject({
      url: "/en/",
      images: [{ url: "/og/en/default.png" }],
    });
    expect(hasHangul(JSON.stringify(inside))).toBe(false);
  });

  it("englishEditionPageMetadata: 영어 제목 + 설명 = og 설명, canonical /en/edition/…", () => {
    const ref = { date: "2026-10-06", ...info };
    const m = englishEditionPageMetadata(ref, { lead, seconds: [sub] }, LATEST, []);
    expect(m.title).toBe("AI News Briefing — Tuesday, October 6, 2026 (No. 42) — AI Daybook");
    expect(m.description).toBe("AI Daybook · Tue, Oct 6, 2026 · No. 42 — Story 2");
    expect(m.alternates?.canonical).toBe("/en/edition/2026-10-06/");
    expect(m.openGraph).toMatchObject({
      images: [{ url: "/og/en/edition/2026-10-06.png?v=42-1" }],
    });
  });
});

describe("영어 기사 썸네일 판정(articleThumbnail en)", () => {
  it("최신 게시 시각 7일 안이면 /og/en/article PNG, 밖이면 undefined(영어 기본 썸네일)", () => {
    db.latestPublishedAt = "2026-10-08T00:00:00Z";
    expect(articleThumbnail(card(5), "en")).toBe("/og/en/article/5.png");
    expect(articleThumbnail(card(5))).toBe("/og/article/5.png");
    expect(
      articleThumbnail(card(6, { publishedAt: "2026-09-01T00:00:00Z" }), "en"),
    ).toBeUndefined();
    db.latestPublishedAt = null;
    expect(articleThumbnail(card(5), "en")).toBeUndefined();
  });
});
