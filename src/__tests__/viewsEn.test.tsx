import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/components/LocaleProvider";
import type { EditionRef } from "@/lib/db";
import type { ArticleCard, FollowUpEntry } from "@/lib/types";

/*
 * 영어판 데이터 범위(english-version-plan Phase 5-2 "Phase 3에서 넘어온 데이터 틈") — 뷰 로더(src/views/data.ts)와
 * 영어 상세의 한글 새기 막기(ArticleView). 조회 계층(@/lib/db)만 가짜로 바꾸고 목록 카드 변환 등은 실제 함수를 쓴다.
 */

const HANGUL = /[가-힯]/;

const db = vi.hoisted(() => ({
  refs: [] as EditionRef[],
  articles: [] as ArticleCard[],
  issueDates: new Map<number, string>(),
  briefs: [] as { id: number; text: string }[][],
  thread: [] as FollowUpEntry[],
  nameEn: new Map<string, string>(),
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
    getLatestEditionRef: () => db.refs.at(-1) ?? null,
    getFeed: () => db.articles,
    getIssueArticles: (date: string) => db.articles.filter((a) => db.issueDates.get(a.id) === date),
    getIssueDates: () => db.issueDates,
    getEnglishArticleIds: () => db.articles.filter(hasEnglish).map((a) => a.id),
    getIssueBriefs: () => db.briefs,
    getWeekRadarCandidates: () => [],
    getSourcesWithCounts: () => [{ id: "ko-db", name: "DB 집계", count: 99 }],
    getActiveTags: () => ["db-tag", "한글태그"],
    getArchivePlan: () => db.plan,
    getArticle: (id: number) => db.articles.find((a) => a.id === id) ?? null,
    getFollowUpThread: () => db.thread,
    getSourceNameEnMap: () => db.nameEn,
    getLatestPublishedAt: () => null,
  };
});

// 검색 정적 셸의 클라이언트 섬은 props(필터 칩 매체·태그)만 본다.
const search = vi.hoisted(() => ({ props: null as null | { sources: unknown[]; tags: string[] } }));
vi.mock("@/components/SearchClient", () => ({
  SearchClient: (p: { sources: unknown[]; tags: string[] }) => {
    search.props = p;
    return null;
  },
}));

// 홈·호 지면의 클라이언트 섬도 props(= 영어 페이지 RSC 에 실리는 값)만 본다(english-version-plan 5-4).
const islands = vi.hoisted(() => ({
  feed: null as null | Record<string, unknown>,
  edition: null as null | { edition: EditionPayload; weekly: unknown },
}));
vi.mock("@/components/FeedClient", () => ({
  FeedClient: (p: Record<string, unknown>) => {
    islands.feed = p;
    return null;
  },
  FeedFallback: () => null,
}));
vi.mock("@/components/EditionBody", () => ({
  EditionBody: (p: { edition: EditionPayload; weekly: unknown }) => {
    islands.edition = p;
    return null;
  },
}));

import { unpackEdition, type EditionPayload } from "@/lib/editionPayload";
import { ArticleView } from "@/views/ArticleView";
import { EditionView } from "@/views/EditionView";
import { HomeView } from "@/views/HomeView";
import { SearchView } from "@/views/SearchView";
import {
  activeTagsOf,
  loadArticlePage,
  loadEdition,
  loadHome,
  loadSearch,
  localeArchivePlan,
  localeArticleIds,
  localeBrief,
  localeEditionDates,
  localeEditionRefs,
  localeThread,
  sourceOptionsOf,
} from "@/views/data";

function ref(date: string, issueNo: number): EditionRef {
  return { date, issueNo, publishedAt: `${date}T00:00:00+09:00`, cutoff: `${date}T15:00:00Z` };
}

const AITIMES = { id: "aitimes", name: "AI타임스", nameEn: "AI Times", region: "kr" as const };
/** 영어 페이로드의 같은 매체 — name 이 영문명, nameEn 키 없음(englishSource, english-version-plan 5-4). */
const AITIMES_EN = { id: "aitimes", name: "AI Times", region: "kr" as const };
const HN = { id: "hn", name: "Hacker News" };

function card(id: number, p: Partial<ArticleCard> = {}): ArticleCard {
  return {
    id,
    source: HN,
    url: `https://x/${id}`,
    titleKo: `기사${id}`,
    summaryKo: `요약${id}`,
    titleOriginal: `T${id}`,
    titleEn: `Story ${id}`,
    summaryEn: `Summary ${id}.`,
    category: "agent",
    format: "news",
    tags: ["llm", "에이전트"],
    trendingScore: 50 - id,
    importance: 3,
    publishedAt: "2026-11-03T00:00:00Z",
    related: [],
    ...p,
  };
}

const noEnglish = { titleEn: "", summaryEn: "" };

beforeEach(() => {
  db.refs = [ref("2026-11-02", 1), ref("2026-11-03", 2), ref("2026-11-04", 3)];
  db.articles = [
    // 11-02: 한국 매체 영어 기사(한국어 원제·한글 발췌·한글 묶인 보도)
    card(1, {
      source: AITIMES,
      category: "physical",
      titleOriginal: "한국어 원제",
      contentRaw: "한국어 원문 발췌",
      related: [
        { source: "전자신문 AI", url: "https://e", title: "한글 보도 제목" },
        { source: "Reuters", url: "https://r", title: "Reuters headline" },
        { source: "어느 매체", url: "https://z", title: "한글만" },
      ],
    }),
    // 11-03: 영어 없음 → 영어판에 이 호가 없다
    card(2, noEnglish),
    // 11-04: 영어 2건 + 영어 없음 1건
    card(3, { importance: 5 }),
    card(4, { source: AITIMES, tags: ["robotics"] }),
    card(5, noEnglish),
  ];
  db.issueDates = new Map([
    [1, "2026-11-02"],
    [2, "2026-11-03"],
    [3, "2026-11-04"],
    [4, "2026-11-04"],
    [5, "2026-11-04"],
  ]);
  db.briefs = [
    [
      { id: 3, text: "셋째 기사 한 줄" },
      { id: 4, text: "넷째 기사 한 줄" },
      { id: 5, text: "영어 없는 기사 한 줄" },
    ],
  ];
  db.thread = [];
  db.nameEn = new Map([["전자신문 AI", "Electronic Times AI"]]);
  db.plan = {
    latestEditionDate: "2026-11-04",
    liveArticleIds: [2, 3, 4, 5],
    archivedArticleIds: [1],
    liveEditionDates: ["2026-11-03", "2026-11-04"],
    archivedEditionDates: ["2026-11-02"],
  };
});

describe("호 목록·경로 목록", () => {
  it("영어판 호 목록은 영어 기사가 있는 호만, 호수는 한국어판 번호 그대로", () => {
    expect(localeEditionRefs("ko").map((r) => r.date)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
    expect(localeEditionRefs("en").map((r) => [r.date, r.issueNo])).toEqual([
      ["2026-11-02", 1],
      ["2026-11-04", 3],
    ]);
  });

  it("영어 호 이동은 영어 기사가 없는 호를 건너뛰고, 그 호의 고정 링크는 없다", () => {
    const data = loadEdition("en", "2026-11-04")!;
    expect(data.ref.issueNo).toBe(3);
    expect(data.prev?.date).toBe("2026-11-02");
    expect(data.next).toBeNull();
    expect(data.edition.issue.map((a) => a.id).sort()).toEqual([3, 4]);
    expect(loadEdition("en", "2026-11-03")).toBeNull();
    // 한국어판은 그대로 바로 앞 호
    expect(loadEdition("ko", "2026-11-04")!.prev?.date).toBe("2026-11-03");
  });

  it("경로 목록: 보관 대상은 빼고, 영어판은 영어 기사·영어 기사가 있는 호만", () => {
    expect(localeArticleIds("ko")).toBe(db.plan.liveArticleIds);
    expect(localeArticleIds("en")).toEqual([3, 4]);
    expect(localeEditionDates("ko")).toBe(db.plan.liveEditionDates);
    expect(localeEditionDates("en")).toEqual(["2026-11-04"]);
  });

  it("영어 보관 계획 = 같은 계획(같은 최신 호)을 영어판 범위로 — 경로 목록과 빌드 후처리가 같은 함수", () => {
    expect(localeArchivePlan("ko")).toBe(db.plan);
    expect(localeArchivePlan("en")).toEqual({
      latestEditionDate: "2026-11-04",
      liveArticleIds: [3, 4],
      archivedArticleIds: [1],
      liveEditionDates: ["2026-11-04"],
      archivedEditionDates: ["2026-11-02"],
    });
    expect(localeArticleIds("en")).toEqual(localeArchivePlan("en").liveArticleIds);
  });
});

describe("홈·검색 로더 — 영어판", () => {
  it("이번 호 카드는 영어 목록 카드(한국어 가공 텍스트 없음, 라틴 태그, 매체 영문명·지역)", () => {
    const { feed, index } = loadHome("en");
    expect(feed.editionInfo.issueNo).toBe(3);
    expect(feed.issueArticles.map((a) => a.id).sort()).toEqual([3, 4]);
    const four = feed.issueArticles.find((a) => a.id === 4)!;
    expect(four).toMatchObject({
      titleKo: "",
      summaryKo: "",
      titleEn: "Story 4",
      summaryEn: "Summary 4.",
      source: AITIMES_EN,
      tags: ["robotics"],
    });
    expect(feed.issueArticles.find((a) => a.id === 3)!.tags).toEqual(["llm"]);
    // 색인 첫 페이지도 영어 카드, 누적 건수는 영어 기사 수
    expect(index.indexTotal).toBe(3);
    expect(index.indexHead.every((c) => c.titleKo === "" && c.titleEn)).toBe(true);
    expect(index.indexHead.find((c) => c.id === 1)!.source).toEqual(AITIMES_EN);
    expect(HANGUL.test(JSON.stringify(index.indexHead))).toBe(false);
    expect(HANGUL.test(JSON.stringify(feed.issueArticles))).toBe(false);
  });

  it("세 줄 요약은 같은 줄 id 의 영어 제목, 영어 없는 줄은 뺀다", () => {
    const { feed } = loadHome("en");
    expect(feed.brief.map((l) => l.text).sort()).toEqual(["Story 3", "Story 4"]);
    expect(localeBrief("en", [{ id: 3, text: "한 줄" }], [{ id: 3, titleEn: "Story 3" }])).toEqual(
      [],
    );
    const ko = [{ id: 3, text: "한 줄" }];
    expect(localeBrief("ko", ko, [])).toBe(ko);
  });

  it("필터 칩: 매체는 영어 기사로 센 수 + 영문명·지역, 태그는 라틴 문자만", () => {
    const { feed } = loadHome("en");
    expect(feed.sources).toEqual([
      { id: "aitimes", name: "AI Times", region: "kr", count: 2 },
      { id: "hn", name: "Hacker News", count: 1 },
    ]);
    expect(feed.tags).toEqual(["llm", "robotics"]);
    const search = loadSearch("en");
    expect(search.sources).toEqual(feed.sources);
    expect(search.tags).toEqual(feed.tags);
    expect(search.indexVersion).toBe("2026-11-04-3");
  });

  it("한국어판은 DB 집계 그대로, 목록 카드에 영어 필드가 없다", () => {
    const { feed, index } = loadHome("ko");
    expect(feed.sources).toEqual([{ id: "ko-db", name: "DB 집계", count: 99 }]);
    expect(feed.tags).toEqual(["db-tag", "한글태그"]);
    expect(feed.issueArticles).toHaveLength(3);
    expect(feed.issueArticles.every((a) => !("titleEn" in a) && a.titleKo)).toBe(true);
    expect(feed.brief.map((l) => l.text)).toContain("셋째 기사 한 줄");
    expect(index.indexTotal).toBe(5);
    expect(loadSearch("ko").tags).toEqual(["db-tag", "한글태그"]);
  });

  it("activeTagsOf·sourceOptionsOf — 동률은 이름·id 순", () => {
    const list = [card(1, { tags: ["b", "a"] }), card(2, { tags: ["a", "b", "한글"] })];
    expect(activeTagsOf(list, "en")).toEqual(["a", "b"]);
    expect(activeTagsOf(list, "ko", 2)).toEqual(["a", "b"]);
    expect(sourceOptionsOf([card(1, { source: { id: "z", name: "Z" } }), card(2)])).toEqual([
      { id: "hn", name: "Hacker News", count: 1 },
      { id: "z", name: "Z", count: 1 },
    ]);
  });
});

describe("상세 로더 — 영어판", () => {
  const entry = (id: number, relation: FollowUpEntry["relation"], titleEn?: string) => ({
    id,
    titleKo: `기사${id}`,
    titleOriginal: `T${id}`,
    sourceName: "AI타임스",
    sourceNameEn: "AI Times",
    issuedAt: "2026-11-02T00:00:00Z",
    relation,
    ...(titleEn ? { titleEn } : {}),
  });

  it("사건 타임라인: 영어판은 영어 페이지가 있는 기사만, 한국어판은 영어 필드를 뗀다", () => {
    const thread = [entry(9, "earlier"), entry(1, "current", "Story 1"), entry(4, "later", "S4")];
    expect(localeThread("en", thread).map((e) => e.id)).toEqual([1, 4]);
    const ko = localeThread("ko", thread);
    expect(ko.map((e) => e.id)).toEqual([9, 1, 4]);
    expect(ko.every((e) => !("titleEn" in e) && !("sourceNameEn" in e))).toBe(true);
  });

  it("영어 상세: 영어 없는 기사는 null, 묶인 보도는 영문 매체명·한글 제목 비움·둘 다 비면 뺀다", () => {
    expect(loadArticlePage("en", 2)).toBeNull();
    db.thread = [entry(9, "earlier"), entry(1, "current", "Story 1")];
    const page = loadArticlePage("en", 1)!;
    expect(page.thread.map((e) => e.id)).toEqual([1]);
    expect(page.article.related).toEqual([
      { source: "Electronic Times AI", url: "https://e", title: "", koreanTitle: true },
      { source: "Reuters", url: "https://r", title: "Reuters headline" },
    ]);
    // 한국어판 상세는 묶인 보도를 그대로 둔다
    expect(loadArticlePage("ko", 1)!.article.related).toHaveLength(3);
  });
});

describe("ArticleView — 영어 상세의 한글 새기 막기", () => {
  // 영어 레이아웃처럼 클라이언트 섬(같은 분야 기사)이 컨텍스트로 언어를 읽게 감싼다.
  const en = ({ children }: { children: ReactNode }) => (
    <LocaleProvider locale="en">{children}</LocaleProvider>
  );

  /** 화면 글자(구조화 데이터 스크립트와 lang="ko" 로 표시한 원제는 뺀다). */
  function visibleText(container: HTMLElement): string {
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, [lang="ko"]').forEach((el) => el.remove());
    return clone.textContent ?? "";
  }

  it("한국어 원제는 'Original article in Korean' 표지와 lang=ko 로 병기, 한글 발췌는 숨기고, 묶인 보도는 매체명만", () => {
    const { container } = render(<ArticleView locale="en" id={1} />, { wrapper: en });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Story 1");
    const original = container.querySelector('[lang="ko"]')!;
    expect(original.textContent).toBe("한국어 원제");
    expect(original.parentElement!.textContent).toContain("Original article in Korean");
    expect(original.parentElement!.hasAttribute("lang")).toBe(false);
    expect(screen.queryByText("Original excerpt")).toBeNull();
    expect(screen.queryByText("한국어 원문 발췌")).toBeNull();
    const coverage = screen.getByRole("heading", {
      name: "Also reported by 2 outlets",
    }).parentElement!;
    expect(within(coverage).getByText("Electronic Times AI")).toBeInTheDocument();
    expect(within(coverage).getByText("Reuters headline")).toBeInTheDocument();
    expect(HANGUL.test(visibleText(container))).toBe(false);
  });

  it("라틴 원제는 예전처럼 lang=en 한 줄, 영어 발췌는 그대로", () => {
    db.articles[2] = card(3, { titleOriginal: "Original T3", contentRaw: "English excerpt." });
    const { container } = render(<ArticleView locale="en" id={3} />, { wrapper: en });
    expect(container.querySelector('p[lang="en"]')?.textContent).toBe("Original T3");
    expect(screen.getByText("English excerpt.")).toBeInTheDocument();
    expect(screen.queryByText("Original article in Korean")).toBeNull();
  });

  it("한국어판은 바뀌지 않는다 — 원제는 lang=en 한 줄, 발췌·묶인 보도 제목이 그대로", () => {
    const { container } = render(<ArticleView locale="ko" id={1} />);
    expect(container.querySelector('p[lang="en"]')?.textContent).toBe("한국어 원제");
    expect(container.querySelector('[lang="ko"]')).toBeNull();
    expect(screen.getByText("한국어 원문 발췌")).toBeInTheDocument();
    expect(screen.getByText("한글 보도 제목")).toBeInTheDocument();
    expect(screen.getByText("전자신문 AI")).toBeInTheDocument();
  });

  it("영어 상세 시안(en-article): KOREA · 분야 머리, 원제 들임 단락, 한국어 보도 안내, 원문 언어 안내, 구조화 데이터 없음", () => {
    const { container } = render(<ArticleView locale="en" id={1} />, { wrapper: en });
    // 머리 줄: KOREA(스크린리더 Korean outlet) + 점 + 분야 키커
    const mark = container.querySelector(".sg-region")!;
    expect(mark.textContent).toBe("KOREAKorean outlet");
    expect(mark.nextElementSibling?.className).toContain("sg-dot");
    expect(mark.parentElement!.textContent).toContain("Physical AI");
    // 원제: 라벨 + lang=ko 원제(왼쪽 헤어라인 들임 단락)
    const orig = container.querySelector(".ar-orig")!;
    expect(orig.querySelector(".ar-orig-l")?.textContent).toBe("Original article in Korean");
    expect(orig.querySelector('.ar-orig-t[lang="ko"]')?.textContent).toBe("한국어 원제");
    // 한국어 제목만 있는 묶인 보도 → 안내 + 원문 주소·언어
    const report = container.querySelector(".ar-cov-k")!;
    expect(report.textContent).toBe("Korean-language reporte · in Korean");
    // 원문 버튼 옆(데스크톱)과 모바일 바 아래 원문 언어 안내
    const notes = container.querySelectorAll(".ar-ctan");
    expect(notes).toHaveLength(2);
    expect(notes[0].textContent).toBe("x · in Korean");
    expect(container.querySelector(".ar-ctaw .ar-cta")).not.toBeNull();
    expect(container.querySelector(".ar-barn .ar-mcta")).not.toBeNull();
    // 영어 구조화 데이터(6-2) — 영어 값만(한국어 원제·한글 없음), 영어 주소
    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(ld).not.toBeNull();
    expect(JSON.parse(ld!.innerHTML)).toMatchObject({
      inLanguage: "en",
      url: expect.stringMatching(/\/en\/article\//),
    });
    expect(ld!.innerHTML).not.toMatch(HANGUL);
    // 한글은 lang=ko 원제 한 곳뿐
    const ko = [...container.querySelectorAll("*")].filter(
      (el) => el.children.length === 0 && HANGUL.test(el.textContent ?? ""),
    );
    expect(ko.map((el) => el.getAttribute("lang"))).toEqual(["ko"]);
  });

  it("해외 매체 영어 상세: KOREA·원문 언어 안내 없음, 원문 버튼은 예전 모양 그대로", () => {
    const { container } = render(<ArticleView locale="en" id={3} />, { wrapper: en });
    // 기사 자신의 머리·바이라인에는 KOREA 가 없다(아래 "More in …" 관련 기사 바이라인은 한국 매체면 붙는다).
    expect(container.querySelector("article > header .sg-region")).toBeNull();
    expect(container.querySelector(".ar-ctan")).toBeNull();
    expect(container.querySelector(".ar-ctaw")).toBeNull();
    expect(container.querySelector("a.ar-cta")).not.toBeNull();
    expect(container.querySelector(".ar-bar")?.className).toBe("ar-bar");
  });

  it("한국어판 상세에는 영어판 요소가 없고 구조화 데이터는 그대로", () => {
    const { container } = render(<ArticleView locale="ko" id={1} />);
    for (const sel of [".sg-region", ".ar-orig", ".ar-cov-k", ".ar-ctan", ".ar-ctaw", ".ar-barn"])
      expect(container.querySelector(sel)).toBeNull();
    expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
  });
});

describe("SearchView — 영어 검색 정적 셸(/en/search/)", () => {
  it("머리가 영어이고, 클라이언트 섬에는 영어 기사로 센 매체(영문명·지역)와 라틴 태그만 넘긴다", () => {
    const { container } = render(<SearchView locale="en" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Find stories");
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(HANGUL.test(container.textContent ?? "")).toBe(false);
    expect(search.props!.tags).toEqual(["llm", "robotics"]);
    expect(search.props!.sources).toEqual([
      { id: "aitimes", name: "AI Times", region: "kr", count: 2 },
      { id: "hn", name: "Hacker News", count: 1 },
    ]);
  });
});

describe("HomeView·EditionView — 영어 섬 props(= 영어 RSC)에 한글·영어 없는 기사가 없다(5-4)", () => {
  /** 섬 props 에 실린 기사 id 전부(카드 배열·색인 머리). */
  const idsIn = (cards: unknown): number[] =>
    Array.isArray(cards) ? cards.map((c: { id: number }) => c.id) : [];

  it("영어 홈: 이번 호·색인 머리에 영어 없는 기사(2·5)가 없고, props 에 한글이 없고, 구조화 데이터는 영어 WebSite", () => {
    islands.feed = null;
    const { container } = render(<HomeView locale="en" />);
    const feed = islands.feed!;
    expect(idsIn(feed.issueArticles).sort()).toEqual([3, 4]);
    expect([...idsIn(feed.issueArticles), ...idsIn(feed.indexHead)]).not.toContain(2);
    expect([...idsIn(feed.issueArticles), ...idsIn(feed.indexHead)]).not.toContain(5);
    expect(HANGUL.test(JSON.stringify(feed))).toBe(false);
    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(ld!.innerHTML)).toMatchObject({ "@type": "WebSite", inLanguage: "en" });
    expect(ld!.innerHTML).not.toMatch(HANGUL);
  });

  it("한국어 홈은 그대로 — 영어 없는 기사도 싣고 WebSite 구조화 데이터가 있다", () => {
    islands.feed = null;
    const { container } = render(<HomeView locale="ko" />);
    expect(idsIn(islands.feed!.issueArticles).sort()).toEqual([3, 4, 5]);
    expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
  });

  it("영어 호: 지면 페이로드는 영어 기사만, 한글 없음(매체 표 포함), 머리에도 한글·구조화 데이터 없음", () => {
    islands.edition = null;
    // 클라이언트 조각(공유 버튼)은 영어 레이아웃의 LocaleProvider 로 문구를 고른다.
    const { container } = render(<EditionView locale="en" date="2026-11-04" />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <LocaleProvider locale="en">{children}</LocaleProvider>
      ),
    });
    const payload = islands.edition!.edition;
    expect(
      unpackEdition(payload, "en")
        .issue.map((a) => a.id)
        .sort(),
    ).toEqual([3, 4]);
    expect(payload.sources.aitimes).toEqual({ name: "AI Times", format: "news", region: "kr" });
    expect(JSON.stringify(islands.edition)).not.toMatch(HANGUL);
    expect(container.textContent ?? "").not.toMatch(HANGUL);
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
  });

  it("한국어 호 페이로드는 한국어 매체명 그대로(바이트 보존)", () => {
    islands.edition = null;
    render(<EditionView locale="ko" date="2026-11-04" />);
    const payload = islands.edition!.edition;
    expect(
      unpackEdition(payload, "ko")
        .issue.map((a) => a.id)
        .sort(),
    ).toEqual([3, 4, 5]);
    expect(payload.sources.aitimes).toEqual({ name: "AI타임스", format: "news" });
  });
});
