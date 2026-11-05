import { describe, expect, it, vi } from "vitest";
import type { EditionRef } from "@/lib/db";
import type { ArticleCard } from "@/lib/types";

/*
 * 호 썸네일 기간(Phase 4-1) 불변식: 홈·호 고정 링크 메타의 og:image 는 og/edition/[file] 이 실제로 만드는
 * PNG 이거나 기본 썸네일이다 — 생성 목록과 참조가 같은 판정(hasEditionThumbnail)·같은 기준(최신 호 날짜)을 쓴다.
 * DB 조회 계층만 가짜로 바꿔 라우트의 generateStaticParams·generateMetadata 를 그대로 부른다.
 */

const DAY_MS = 24 * 3600 * 1000;
/** 2026-09-20 ~ 2026-11-04 매일 1호(46호) — 30일 창 밖 호가 16개. */
const refs: EditionRef[] = Array.from({ length: 46 }, (_, i) => {
  const date = new Date(Date.parse("2026-09-20T00:00:00Z") + i * DAY_MS).toISOString().slice(0, 10);
  return {
    date,
    issueNo: i + 1,
    // 06:00 KST 발행 = 전날 21:00 UTC
    publishedAt: new Date(Date.parse(`${date}T06:00:00+09:00`)).toISOString(),
    cutoff: new Date(Date.parse(`${date}T00:00:00+09:00`) + DAY_MS).toISOString(),
  };
});

function lead(date: string): ArticleCard {
  return {
    id: Number(date.replaceAll("-", "")),
    source: { id: "hn", name: "Hacker News" },
    url: "https://x",
    titleKo: `리드 ${date}`,
    summaryKo: "",
    titleOriginal: "T",
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 5,
    publishedAt: `${date}T00:00:00Z`,
  };
}

vi.mock("@/lib/db", () => ({
  getEditionRefs: () => refs,
  getLatestEditionRef: () => refs.at(-1) ?? null,
  getIssueArticles: (date: string) => [lead(date)],
  getIssueBriefs: () => [],
}));
vi.mock("@/lib/ogImage", () => ({ editionImage: vi.fn() }));
vi.mock("@/views/EditionView", () => ({ EditionView: () => null }));
vi.mock("@/views/HomeView", () => ({ HomeView: () => null }));

import { generateMetadata as homeMetadata } from "@/app/(ko)/page";
import { generateMetadata as editionPageMetadata } from "@/app/(ko)/edition/[date]/page";
import { generateStaticParams as ogEditionParams } from "@/app/og/edition/[file]/route";
import { OG_DEFAULT_IMAGE } from "@/lib/site";

const ogImageUrl = (m: { openGraph?: unknown }) =>
  (m.openGraph as { images: { url: string }[] }).images[0].url.replace(/\?.*$/, "");

describe("og 호 썸네일 — 최근 30일만 생성, 참조는 생성분 또는 기본 썸네일", () => {
  const generated = new Set(ogEditionParams().map((p) => `/og/edition/${p.file}`));

  it("생성 목록 = 최신 호(11-04)와 앞 29일 = 10-06 ~ 11-04 30개", () => {
    expect(generated.size).toBe(30);
    expect(generated.has("/og/edition/2026-11-04.png")).toBe(true);
    expect(generated.has("/og/edition/2026-10-06.png")).toBe(true);
    expect(generated.has("/og/edition/2026-10-05.png")).toBe(false);
  });

  it("모든 호 고정 링크의 og:image 는 생성된 PNG 이거나 기본 썸네일", async () => {
    let defaults = 0;
    for (const ref of refs) {
      const url = ogImageUrl(
        await editionPageMetadata({ params: Promise.resolve({ date: ref.date }) }),
      );
      if (url === OG_DEFAULT_IMAGE) defaults += 1;
      else expect(generated).toContain(url);
    }
    expect(defaults).toBe(16);
  });

  it("창 경계: 10-06 호는 그날 1면, 10-05(30일 전)·그 이전 호는 기본 썸네일", async () => {
    const urlOf = async (date: string) =>
      ogImageUrl(await editionPageMetadata({ params: Promise.resolve({ date }) }));
    expect(await urlOf("2026-10-06")).toBe("/og/edition/2026-10-06.png");
    expect(await urlOf("2026-10-05")).toBe(OG_DEFAULT_IMAGE);
    expect(await urlOf("2026-09-20")).toBe(OG_DEFAULT_IMAGE);
  });

  it("홈은 최신 호 썸네일(생성분)", () => {
    expect(ogImageUrl(homeMetadata())).toBe("/og/edition/2026-11-04.png");
  });
});
