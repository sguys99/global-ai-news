import { describe, expect, it } from "vitest";
import {
  OG_DEFAULT_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  editionMetadata,
  editionShare,
  hasArticleThumbnail,
  hasEditionThumbnail,
  ogEditionImagePath,
  shareMetadata,
} from "@/lib/site";
import { buildEdition } from "@/lib/edition";
import type { ArticleCard } from "@/lib/types";

let seq = 0;
function card(p: Partial<ArticleCard>): ArticleCard {
  seq += 1;
  return {
    id: seq,
    source: { id: "hn", name: "Hacker News" },
    url: "https://x",
    titleKo: `기사${seq}`,
    summaryKo: "",
    titleOriginal: `T${seq}`,
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-07-01T00:00:00Z",
    ...p,
  };
}

// 2026-10-05 21:00 UTC = 2026-10-06 06:00 KST (화요일) — cron 발행 시각
const info = { issueNo: 42, publishedAt: "2026-10-05T21:00:00Z" };
/** DB 최신 호 날짜 — info(KST 10월 6일) 자신이 최신 호인 경우. */
const LATEST = "2026-10-06";

describe("editionShare — 홈 공유 문구", () => {
  it("제목 = 리드 헤드라인, 설명 = 제호·KST 발행일·호수 + 서브 헤드라인", () => {
    const lead = card({ id: 7, titleKo: "리드 기사" });
    const seconds = [card({ titleKo: "서브1" }), card({ titleKo: "", titleOriginal: "Sub2" })];
    expect(editionShare({ lead, seconds }, info)).toEqual({
      title: "리드 기사",
      description: `${SITE_NAME} 10월 6일(화) 제42호 — 서브1 · Sub2`,
      version: "42-7",
    });
  });

  it("서브가 없으면 발행 정보만, 발행 이력이 없으면 제호만", () => {
    const lead = card({ titleKo: "리드" });
    expect(editionShare({ lead, seconds: [] }, info).description).toBe(
      `${SITE_NAME} 10월 6일(화) 제42호`,
    );
    expect(editionShare({ lead, seconds: [] }, { issueNo: 0, publishedAt: null }).description).toBe(
      SITE_NAME,
    );
  });

  it("리드가 없으면 사이트 기본 문구", () => {
    expect(editionShare({ lead: null, seconds: [] }, info)).toMatchObject({
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    });
  });
});

describe("shareMetadata", () => {
  it("기본 썸네일 + website, 경로가 없으면 og:url 생략", () => {
    const m = shareMetadata({ title: "t", description: "d" });
    expect(m.openGraph).toMatchObject({
      type: "website",
      url: undefined,
      locale: "ko_KR",
      images: [{ url: OG_DEFAULT_IMAGE, width: 1200, height: 600 }],
    });
    // X 는 twitter:title·description·image 가 없으면 og:* 로 대체한다 — og 값을 다시 적지 않는다(Phase 4-1).
    // images: [] 는 Next 가 og 이미지를 twitter:image 로 자동 채우지 않게 하는 표시다(title·description 은 Next 가 채운다).
    expect(m.twitter).toEqual({ card: "summary_large_image", images: [] });
  });

  it("버전이 있으면 이미지 URL에 캐시 무효화 쿼리", () => {
    const m = shareMetadata({
      title: "t",
      description: "d",
      path: "/",
      image: { path: ogEditionImagePath("2026-10-06"), alt: "a", version: "42-7" },
    });
    expect(m.openGraph).toMatchObject({
      url: "/",
      images: [{ url: "/og/edition/2026-10-06.png?v=42-7", alt: "a" }],
    });
  });

  it("기사는 type=article + 게시 시각·분야·태그", () => {
    const m = shareMetadata({
      title: "t",
      description: "d",
      path: "/article/3/",
      article: { publishedTime: "2026-10-06T00:00:00Z", section: "에이전트", tags: ["mcp"] },
    });
    expect(m.openGraph).toMatchObject({
      type: "article",
      url: "/article/3/",
      publishedTime: "2026-10-06T00:00:00Z",
      section: "에이전트",
      tags: ["mcp"],
    });
  });
});

describe("editionMetadata — 홈·호 고정 링크 공유 메타", () => {
  it("호 고정 링크: og:url = 그 경로, 썸네일 = 그날(KST) 1면 + 버전", () => {
    const lead = card({ id: 7, titleKo: "리드" });
    const m = editionMetadata({ lead, seconds: [] }, info, "/edition/2026-10-06/", LATEST);
    expect(m.openGraph).toMatchObject({
      title: "리드",
      url: "/edition/2026-10-06/",
      images: [{ url: "/og/edition/2026-10-06.png?v=42-7", alt: "10월 6일(화) 1면: 리드" }],
    });
  });

  it("리드가 없으면 홈 경로 + 기본 썸네일", () => {
    const m = editionMetadata({ lead: null, seconds: [] }, info, "/", LATEST);
    expect(m.openGraph).toMatchObject({ url: "/", images: [{ url: OG_DEFAULT_IMAGE }] });
  });

  it("og:url 은 넘긴 경로 그대로 — 홈은 홈 자신(다른 페이지로 스크랩을 넘기지 않음)", () => {
    const lead = card({ id: 7, titleKo: "리드" });
    expect(editionMetadata({ lead, seconds: [] }, info, "/", LATEST).openGraph).toMatchObject({
      url: "/",
      images: [{ url: "/og/edition/2026-10-06.png?v=42-7" }],
    });
  });
});

describe("hasArticleThumbnail — 최근 7일 기사만 전용 썸네일", () => {
  const latest = "2026-10-08T00:00:00Z";

  it("최신 게시 시각 기준 7일 이내만 true", () => {
    expect(hasArticleThumbnail("2026-10-01T00:00:00Z", latest)).toBe(true);
    expect(hasArticleThumbnail("2026-09-30T23:59:59Z", latest)).toBe(false);
  });

  it("기준 시각이 없으면 false", () => {
    expect(hasArticleThumbnail("2026-10-08T00:00:00Z", null)).toBe(false);
  });
});

describe("hasEditionThumbnail — 최신 호 날짜 기준 30일(KST 날짜 30개)만 전용 썸네일", () => {
  const latest = "2026-11-04";

  it("최신 호와 그 앞 29일까지 true, 30일 전부터 false", () => {
    expect(hasEditionThumbnail("2026-11-04", latest)).toBe(true);
    expect(hasEditionThumbnail("2026-11-01", latest)).toBe(true);
    expect(hasEditionThumbnail("2026-10-06", latest)).toBe(true); // 29일 전 — 창의 첫 날
    expect(hasEditionThumbnail("2026-10-05", latest)).toBe(false); // 30일 전
    expect(hasEditionThumbnail("2026-07-01", latest)).toBe(false);
  });

  it("월·연 경계도 달력 날짜로 센다", () => {
    expect(hasEditionThumbnail("2026-12-03", "2027-01-01")).toBe(true);
    expect(hasEditionThumbnail("2026-12-02", "2027-01-01")).toBe(false);
  });

  it("기준 날짜가 없거나 기준보다 뒤 날짜면 false", () => {
    expect(hasEditionThumbnail("2026-11-04", null)).toBe(false);
    expect(hasEditionThumbnail("2026-11-05", latest)).toBe(false);
  });
});

describe("editionMetadata — 썸네일 기간 밖 호는 생성되지 않는 PNG 대신 기본 썸네일", () => {
  const lead = card({ id: 7, titleKo: "리드" });
  const imageUrl = (latestEditionDate: string | null) => {
    const m = editionMetadata(
      { lead, seconds: [] },
      info,
      "/edition/2026-10-06/",
      latestEditionDate,
    );
    return (m.openGraph as { images: { url: string }[] }).images[0].url;
  };

  it("29일 뒤 최신 호 기준: 아직 그날 1면 썸네일", () => {
    expect(imageUrl("2026-11-04")).toBe("/og/edition/2026-10-06.png?v=42-7");
  });

  it("30일·31일 뒤 최신 호 기준: 기본 썸네일", () => {
    expect(imageUrl("2026-11-05")).toBe(OG_DEFAULT_IMAGE);
    expect(imageUrl("2026-11-06")).toBe(OG_DEFAULT_IMAGE);
    const m = editionMetadata({ lead, seconds: [] }, info, "/", "2026-11-06");
    // 제목·og:url 은 기간과 무관하게 그날 1면 그대로
    expect(m.openGraph).toMatchObject({ title: "리드", url: "/" });
  });

  it("최신 호 날짜를 모르면(null) 기본 썸네일", () => {
    expect(imageUrl(null)).toBe(OG_DEFAULT_IMAGE);
  });
});

describe("공유 메타 회귀 — Phase 5 지면(buildEdition)에서도 리드·서브만 쓴다", () => {
  // 슬롯마다 제목을 구분해 설명에 무엇이 섞였는지 정확히 본다.
  function issue() {
    const news = [
      "llm",
      "agent",
      "industry",
      "llm",
      "agent",
      "industry",
      "physical",
      "research",
    ].map((category, i) =>
      card({ category, importance: 5 - Math.floor(i / 2), trendingScore: 9 - i }),
    );
    const nonNews = [
      card({ format: "oss", importance: 5, trendingScore: 80 }),
      card({ format: "model", importance: 5 }),
      card({ format: "paper", importance: 5 }),
      card({ format: "paper", importance: 4 }),
    ];
    return [...news, ...nonNews].map((a) => ({ ...a, titleKo: `제목-${a.id}` }));
  }
  const parts = (description: string) => description.split(" — ")[1]?.split(" · ") ?? [];

  it("제목 = 리드, 설명 = 서브 3건(표시 순) — 브리핑·레이더·화제 제목은 새지 않는다", () => {
    const e = buildEdition(issue());
    expect(e.briefs).toHaveLength(3);
    expect(e.radar).toHaveLength(4);
    const share = editionShare(e, info);
    expect(share.title).toBe(e.lead!.titleKo);
    expect(parts(share.description)).toEqual(e.seconds.map((a) => a.titleKo));
    for (const a of [...e.briefs, ...e.radar]) expect(share.description).not.toContain(a.titleKo);
    // 화제 1위(비뉴스, 리드보다 화제 지수가 높음)도 공유 문구에 오르지 않는다
    expect(e.trending[0].format).toBe("oss");
    expect(share.title).not.toBe(e.trending[0].titleKo);
    expect(share.version).toBe(`42-${e.lead!.id}`);
  });

  it("editionMetadata 는 Edition 전체를 받아도 리드·서브로만 og 를 채운다(twitter 는 og 값을 다시 적지 않는다)", () => {
    const e = buildEdition(issue());
    const m = editionMetadata(e, info, "/edition/2026-10-06/", LATEST);
    const { title, description } = editionShare({ lead: e.lead, seconds: e.seconds }, info);
    expect(m.openGraph).toMatchObject({ title, description });
    expect(m.twitter).toEqual({ card: "summary_large_image", images: [] });
  });

  it("입력 순서를 섞어도 제목·설명·버전이 같다", () => {
    const xs = issue();
    const one = editionShare(buildEdition(xs), info);
    const two = editionShare(buildEdition([...xs].reverse()), info);
    const three = editionShare(buildEdition([...xs.slice(5), ...xs.slice(0, 5)]), info);
    expect(two).toEqual(one);
    expect(three).toEqual(one);
  });

  it("비뉴스만 있는 호: 리드 = 비뉴스 1위, 서브가 없어 설명은 발행 정보만, 썸네일은 그날 1면", () => {
    const xs = [
      card({ format: "paper", importance: 4, titleKo: "논문" }),
      card({ format: "oss", importance: 5, titleKo: "저장소" }),
    ];
    const e = buildEdition(xs);
    expect(editionShare(e, info)).toMatchObject({
      title: "저장소",
      description: `${SITE_NAME} 10월 6일(화) 제42호`,
    });
    expect(editionMetadata(e, info, "/", LATEST).openGraph).toMatchObject({
      title: "저장소",
      images: [{ url: `/og/edition/2026-10-06.png?v=42-${xs[1].id}` }],
    });
  });

  it("빈 호: 사이트 기본 문구 + 기본 썸네일", () => {
    const e = buildEdition([]);
    expect(editionShare(e, info)).toMatchObject({
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    });
    expect(editionMetadata(e, info, "/", LATEST).openGraph).toMatchObject({
      images: [{ url: OG_DEFAULT_IMAGE }],
    });
  });
});
