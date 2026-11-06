import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditionRef } from "@/lib/db";
import type { ArticleCard } from "@/lib/types";

/*
 * 사이트맵 입력(views/data.ts `loadSitemapInput`) → 조각 계획(seo.ts `planSitemaps`)의 hreflang 이 페이지 머리 hreflang
 * (`languageAlternates` → site.ts `hreflangLanguages`)과 줄마다 같은지(english-version-plan 6-2). 조회 계층(@/lib/db)만 가짜.
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
    getSitemapArticles: () =>
      db.articles.map((a) => ({ id: a.id, collectedAt: `${db.issueDates.get(a.id)}T00:00:00Z` })),
  };
});

import { planSitemaps, type SitemapEntry } from "@/lib/seo";
import { SITE_URL, hreflangLanguages } from "@/lib/site";
import { type AlternatePage, languageAlternates, loadSitemapInput } from "@/views/data";

const ref = (date: string, issueNo: number): EditionRef => ({
  date,
  issueNo,
  publishedAt: `${date}T00:00:00+09:00`,
  cutoff: `${date}T15:00:00Z`,
});

const card = (id: number, p: Partial<ArticleCard> = {}): ArticleCard => ({
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
});

const noEnglish = { titleEn: "", summaryEn: "" };

beforeEach(() => {
  // 2025-12-31: 영어 기사 1(보관), 2026-06-01: 영어 없는 2만(보관), 11-02: 영어 없는 5, 11-03: 영어 3·영어 없는 4
  db.refs = [
    ref("2025-12-31", 1),
    ref("2026-06-01", 2),
    ref("2026-11-02", 3),
    ref("2026-11-03", 4),
  ];
  db.articles = [card(1), card(2, noEnglish), card(3), card(4, noEnglish), card(5, noEnglish)];
  db.issueDates = new Map([
    [1, "2025-12-31"],
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
    archivedEditionDates: ["2025-12-31", "2026-06-01"],
  };
});

/** 사이트맵 줄의 언어 접두어 없는 경로 → 페이지 종류. */
function pageOf(path: string): AlternatePage {
  const p = path.replace(/^\/en(?=\/)/, "");
  const article = /^\/article\/(\d+)\/$/.exec(p);
  if (article) return { kind: "article", id: Number(article[1]) };
  const edition = /^\/edition\/([\d-]+)\/$/.exec(p);
  if (edition) return { kind: "edition", date: edition[1] };
  return p === "/search/" ? { kind: "search" } : { kind: "home" };
}

const absPair = (pair: Record<"ko" | "en", string>) => ({
  ko: `${SITE_URL}${pair.ko}`,
  en: `${SITE_URL}${pair.en}`,
});

describe("사이트맵 hreflang = 페이지 hreflang", () => {
  const files = () => planSitemaps(loadSitemapInput());
  const all = (): SitemapEntry[] => files().flatMap((f) => f.entries);

  it("조각: pages · 연도별 ko·en(영어 없는 해는 en 조각 없음)", () => {
    expect(files().map((f) => f.name)).toEqual([
      "pages.xml",
      "ko-2025.xml",
      "en-2025.xml",
      "ko-2026.xml",
      "en-2026.xml",
    ]);
  });

  it("줄마다 xhtml:link = hreflangLanguages(languageAlternates(page)) — 짝이 없으면 둘 다 없다", () => {
    const entries = all();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      const pair = languageAlternates(pageOf(e.path));
      expect(e.alternates ?? null, e.path).toEqual(pair ? hreflangLanguages(absPair(pair)) : null);
    }
  });

  it("영어 URL 은 영어판 경로 계획(live + 보관)과 같다 — 영어 없는 기사·호는 영어 조각에 없다", () => {
    const en = all()
      .map((e) => e.path)
      .filter((p) => p.startsWith("/en/"));
    expect(en).toEqual([
      "/en/",
      "/en/search/",
      "/en/edition/2025-12-31/",
      "/en/article/1/",
      "/en/edition/2026-11-03/",
      "/en/article/3/",
    ]);
  });
});
