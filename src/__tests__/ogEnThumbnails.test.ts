import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditionRef } from "@/lib/db";
import type { ArticleCard } from "@/lib/types";

/*
 * 영어 공유 썸네일(og/en, english-version-plan 6-2) 생성 목록 불변식 — 영어 페이지 메타가 가리키는 PNG 와 같은 판정이다.
 *  - 호: 영어 기사가 1건 이상인 호(localeEditionRefs("en")) ∩ 한국어판과 같은 30일 창(기준 = DB 최신 호 날짜 — 영어 최신 호 아님).
 *  - 기사: 영어판 기사(hasEnglish) ∩ 한국어판과 같은 7일 창(기준 = 최신 게시 시각) = views/data `articleThumbnail(a, "en")`.
 * DB 조회 계층만 가짜로 바꿔 라우트의 generateStaticParams·GET 을 그대로 부른다(렌더러는 가짜).
 */

const DAY_MS = 24 * 3600 * 1000;
/** 2026-09-26 ~ 2026-11-04 매일 1호(40호). */
const refs: EditionRef[] = Array.from({ length: 40 }, (_, i) => {
  const date = new Date(Date.parse("2026-09-26T00:00:00Z") + i * DAY_MS).toISOString().slice(0, 10);
  return {
    date,
    issueNo: i + 1,
    publishedAt: new Date(Date.parse(`${date}T06:00:00+09:00`)).toISOString(),
    cutoff: new Date(Date.parse(`${date}T00:00:00+09:00`) + DAY_MS).toISOString(),
  };
});
/** 영어 기사가 없는 호 — 창 안(10-20)과 DB 최신 호(11-04). 최신 호에 영어가 없어도 창 기준은 11-04 다. */
const NO_ENGLISH = new Set(["2026-10-20", "2026-11-04"]);

function card(id: number, date: string, english: boolean, region?: "kr"): ArticleCard {
  return {
    id,
    source: {
      id: region ? "aitimes" : "hn",
      name: region ? "AI타임스" : "Hacker News",
      ...(region ? { nameEn: "AI Times", region } : {}),
    },
    url: "https://x",
    titleKo: `제목 ${id}`,
    summaryKo: "요약",
    titleOriginal: "T",
    ...(english
      ? { titleEn: `Title ${id}`, summaryEn: "Summary" }
      : { titleEn: "", summaryEn: "" }),
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 5 - (id % 3),
    publishedAt: `${date}T03:00:00Z`,
  };
}

/** 호마다 2건: 영어 있는 기사(짝수 id, 영어 없는 호는 없음) + 영어 없는 한국 매체 기사(홀수 id). */
const articles: ArticleCard[] = refs.flatMap((r, i) => [
  card(i * 2 + 2, r.date, !NO_ENGLISH.has(r.date)),
  card(i * 2 + 1, r.date, false, "kr"),
]);
const issueDates = new Map(articles.map((a) => [a.id, a.publishedAt.slice(0, 10)]));

vi.mock("@/lib/db", () => ({
  getEditionRefs: () => refs,
  getLatestEditionRef: () => refs.at(-1) ?? null,
  getIssueDates: () => issueDates,
  getEnglishArticleIds: () => articles.filter((a) => a.titleEn && a.summaryEn).map((a) => a.id),
  getIssueArticles: (date: string) => articles.filter((a) => issueDates.get(a.id) === date),
  getFeed: () => [...articles].reverse(),
  getLatestPublishedAt: () =>
    articles
      .map((a) => a.publishedAt)
      .sort()
      .at(-1) ?? null,
  getArticle: (id: number) => articles.find((a) => a.id === id) ?? null,
}));
vi.mock("@/lib/ogImage", () => ({
  editionImage: vi.fn(async () => new Response("png")),
  articleImage: vi.fn(async () => new Response("png")),
}));

import {
  GET as enArticleGet,
  generateStaticParams as enArticleParams,
} from "@/app/og/en/article/[file]/route";
import {
  GET as enEditionGet,
  generateStaticParams as enEditionParams,
} from "@/app/og/en/edition/[file]/route";
import { generateStaticParams as koArticleParams } from "@/app/og/article/[file]/route";
import { generateStaticParams as koEditionParams } from "@/app/og/edition/[file]/route";
import { articleImage, editionImage } from "@/lib/ogImage";
import { hasArticleThumbnail, hasEditionThumbnail, ogArticleImagePath } from "@/lib/site";
import { articleThumbnail, localeEditionRefs } from "@/views/data";

const files = (ps: { file: string }[]) => ps.map((p) => p.file);
const req = new Request("http://x");
const ctx = (file: string) => ({ params: Promise.resolve({ file }) });

beforeEach(() => vi.clearAllMocks());

describe("og/en/edition — 영어 호 ∩ 한국어판과 같은 30일 창", () => {
  const en = files(enEditionParams());

  it("창 기준은 DB 최신 호(11-04, 영어 없음) — 10-06 ~ 11-04 중 영어 기사가 있는 호 28개", () => {
    expect(en).toHaveLength(28);
    expect(en).toContain("2026-10-06.png");
    expect(en).toContain("2026-11-03.png");
    expect(en).not.toContain("2026-10-05.png");
    expect(en).not.toContain("2026-10-20.png");
    expect(en).not.toContain("2026-11-04.png");
  });

  it("= 영어 호 고정 링크 날짜 중 hasEditionThumbnail(날짜, DB 최신 호) 인 것 — 영어 호 메타와 같은 판정", () => {
    const latest = refs.at(-1)!.date;
    const expected = localeEditionRefs("en")
      .filter((r) => hasEditionThumbnail(r.date, latest))
      .map((r) => `${r.date}.png`);
    expect(en).toEqual(expected);
  });

  it("영어 호 ⊂ 한국어 호 PNG", () => {
    const ko = new Set(files(koEditionParams()));
    for (const f of en) expect(ko.has(f)).toBe(true);
  });

  it("GET 은 영어판 기사만으로 편집한 1면을 en 으로 그리고, 영어 없는 호는 404", async () => {
    await enEditionGet(req, ctx("2026-11-03.png"));
    expect(editionImage).toHaveBeenCalledTimes(1);
    const [edition, ref, locale] = vi.mocked(editionImage).mock.calls[0];
    expect(locale).toBe("en");
    expect(ref).toMatchObject({ date: "2026-11-03" });
    expect(edition.issue.length).toBeGreaterThan(0);
    expect(edition.issue.every((a) => a.titleEn && a.summaryEn)).toBe(true);
    expect(edition.lead?.titleEn).toBeTruthy();

    const res = await enEditionGet(req, ctx("2026-10-20.png"));
    expect(res.status).toBe(404);
    expect(editionImage).toHaveBeenCalledTimes(1);
  });
});

describe("og/en/article — 영어판 기사 ∩ 한국어판과 같은 7일 창", () => {
  const en = files(enArticleParams());
  const latestPub = articles
    .map((a) => a.publishedAt)
    .sort()
    .at(-1)!;

  it("영어 본문이 있고 최근 7일인 기사만", () => {
    const expected = articles
      .filter((a) => a.titleEn && a.summaryEn && hasArticleThumbnail(a.publishedAt, latestPub))
      .map((a) => `${a.id}.png`)
      .sort();
    expect([...en].sort()).toEqual(expected);
    // 11-04 호는 영어가 없어 창(10-28 ~)의 영어 기사는 10-28 ~ 11-03 호 7건
    expect(en).toHaveLength(7);
  });

  it('영어 상세 메타(articleThumbnail(a, "en"))가 가리키는 PNG 는 모두 생성된다 — 창 밖은 기본 썸네일', () => {
    const generated = new Set(en.map((f) => `/og/en/article/${f}`));
    let defaults = 0;
    for (const a of articles.filter((x) => x.titleEn && x.summaryEn)) {
      const path = articleThumbnail(a, "en");
      if (path === undefined) defaults += 1;
      else {
        expect(path).toBe(ogArticleImagePath(a.id, "en"));
        expect(generated.has(path)).toBe(true);
      }
    }
    expect(defaults).toBeGreaterThan(0);
  });

  it("영어 기사 ⊂ 한국어 기사 PNG", () => {
    const ko = new Set(files(koArticleParams()));
    for (const f of en) expect(ko.has(f)).toBe(true);
  });

  it("GET 은 en 으로 그리고, 영어 없는 기사는 404", async () => {
    const id = Number(en[0].replace(".png", ""));
    await enArticleGet(req, ctx(en[0]));
    expect(vi.mocked(articleImage).mock.calls[0][0].id).toBe(id);
    expect(vi.mocked(articleImage).mock.calls[0][1]).toBe("en");
    const res = await enArticleGet(req, ctx("1.png"));
    expect(res.status).toBe(404);
  });
});
