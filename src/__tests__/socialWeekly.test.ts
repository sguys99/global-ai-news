// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ArticleCard } from "@/lib/types";
import type { WeeklyRadar } from "@/lib/weeklyRadar";
import {
  eventKeyFromThreads,
  latestSundayIssue,
  resolveWeek,
  sameEventTitle,
  selectKoreaHighlights,
  selectWeekLeads,
  toSocialRadar,
  toSocialStory,
  type SocialStory,
} from "../../scripts/lib/social/select";
import {
  assertNoHangul,
  buildDrafts,
  buildHackerNews,
  buildLinkedIn,
  buildReddit,
  buildXThread,
  enArticleUrl,
  firstSentence,
  LINKEDIN_WORDS,
  truncateWords,
  weekLabel,
  weekRange,
  withUtm,
  wordCount,
  X_LIMIT,
  xLength,
  type SocialKit,
} from "../../scripts/lib/social/text";
import { fitList, fitSansWords, planPortrait } from "../../scripts/lib/social/cards";

/*
 * 주간 SNS 키트(english-version-plan 8-2) — 선정·글자 수·UTM·한글 없음 불변식. 카드는 배치 계산(fitList·planPortrait)만 본다.
 */

const SITE = "https://sguys99.github.io/global-ai-news";

function story(id: number, over: Partial<SocialStory> = {}): SocialStory {
  return {
    id,
    title: `Story ${id} headline about something`,
    summary: `Summary of story ${id}. Second sentence here.`,
    source: "AI Times",
    korea: true,
    koreaSubject: true,
    category: "industry",
    format: "news",
    importance: 3,
    trendingScore: 0,
    publishedAt: "2026-10-28T00:00:00Z",
    issueDate: "2026-10-28",
    url: `https://www.aitimes.com/news/${id}`,
    ...over,
  };
}

const WEEK = {
  start: "2026-10-26",
  end: "2026-11-01",
  dates: [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ],
  partial: false,
  through: "2026-11-01",
};

function kit(over: Partial<SocialKit> = {}): SocialKit {
  return {
    site: SITE,
    week: WEEK,
    issueNos: { first: 132, last: 138 },
    counts: { stories: 167, korean: 54 },
    sourceCount: 43,
    korea: [1, 2, 3, 4, 5].map((id) => story(id)),
    leads: [story(9, { korea: false, source: "The Verge" })],
    radar: [
      {
        rank: 1,
        id: 20,
        title: "Orkas coordinates agents",
        format: "oss",
        category: "agent",
        source: "GitHub",
        ident: "Orkas-AI/Orkas",
        stats: ["★ 6,071"],
        issueDate: "2026-10-27",
      },
      {
        rank: 2,
        id: 21,
        title: "PDRVLA integrates physical dynamics",
        format: "paper",
        category: "physical",
        source: "HF Papers",
        ident: "arXiv 2610.37381",
        issueDate: "2026-10-28",
      },
    ],
    ...over,
  };
}

describe("주 고르기", () => {
  const dates = [
    "2026-10-25",
    "2026-10-26",
    "2026-10-28",
    "2026-11-01",
    "2026-11-02",
    "2026-11-07",
  ];

  it("가장 최근 일요일 호", () => {
    expect(latestSundayIssue(dates)).toBe("2026-11-01");
    expect(latestSundayIssue(["2026-11-02"])).toBeNull();
  });

  it("전체 주는 기사가 있는 날만, 일요일이 아니면 오류", () => {
    const w = resolveWeek("2026-11-01", dates);
    expect(w).toMatchObject({
      start: "2026-10-26",
      end: "2026-11-01",
      partial: false,
      through: "2026-11-01",
    });
    expect(w.dates).toEqual(["2026-10-26", "2026-10-28", "2026-11-01"]);
    expect(() => resolveWeek("2026-10-31", dates)).toThrow(/일요일/);
  });

  it("일요일 호가 없으면 --partial 일 때만 최신 호까지", () => {
    expect(() => resolveWeek("2026-11-08", dates)).toThrow(/--partial/);
    const w = resolveWeek("2026-11-08", dates, { partial: true });
    expect(w).toMatchObject({
      partial: true,
      through: "2026-11-07",
      dates: ["2026-11-02", "2026-11-07"],
    });
    expect(() => resolveWeek("2026-11-15", dates, { partial: true })).toThrow(/호가 없습니다/);
  });
});

describe("기사 고르기", () => {
  it("영어가 없는 기사는 싣지 않고, 매체는 영문명", () => {
    const base = {
      id: 1,
      source: { id: "aitimes", name: "AI타임스", nameEn: "AI Times", region: "kr" as const },
      url: "https://x",
      titleKo: "제목",
      summaryKo: "요약",
      titleOriginal: "원제",
      category: "industry",
      format: "news" as const,
      tags: [],
      trendingScore: 0,
      importance: 3,
      publishedAt: "2026-10-28T00:00:00Z",
    } satisfies ArticleCard;
    expect(
      toSocialStory({ ...base, titleEn: "", summaryEn: "" }, "2026-10-28", () => true),
    ).toBeNull();
    const s = toSocialStory(
      { ...base, titleEn: "Title", summaryEn: "Summary." },
      "2026-10-28",
      () => true,
    )!;
    expect(s).toMatchObject({
      title: "Title",
      summary: "Summary.",
      source: "AI Times",
      korea: true,
    });
    expect(() =>
      assertNoHangul({ s: JSON.stringify(s).replace(/"url":"[^"]*"/, "") }),
    ).not.toThrow();
  });

  it("한국 매체만, 한국 주제 먼저 → 중요도 → 화제, 최대 5", () => {
    const picked = selectKoreaHighlights([
      story(1, { importance: 5, koreaSubject: false, title: "OpenAI ships model" }),
      story(2, { importance: 3, title: "Naver signs cloud deal" }),
      story(3, { importance: 4, title: "Samsung opens chip lab" }),
      story(4, { importance: 5, korea: false, title: "Nvidia earnings beat" }),
      story(5, { importance: 4, trendingScore: 50, title: "SK Hynix HBM supply grows" }),
    ]);
    expect(picked.map((s) => s.id)).toEqual([5, 3, 2, 1]);
    const many = Array.from({ length: 8 }, (_, i) =>
      story(i + 1, { title: `Distinct topic ${i} alpha${i} beta${i}` }),
    );
    expect(selectKoreaHighlights(many)).toHaveLength(5);
  });

  it("한 사건은 한 번 — 후속 보도 타임라인·제목 내용어", () => {
    const eventOf = eventKeyFromThreads([
      [10, 11],
      [11, 12],
    ]);
    expect([10, 11, 12, 13].map(eventOf)).toEqual([10, 10, 10, 13]);
    const picked = selectKoreaHighlights(
      [
        story(10, { importance: 5, title: "Kakao opens agent platform" }),
        story(12, { importance: 4, title: "Something unrelated in title" }),
        story(13, {
          importance: 4,
          title: "Naver signs $9 billion infrastructure deal with Brookfield",
        }),
        story(14, {
          importance: 3,
          title: "Brookfield and Naver sign $9 billion infrastructure deal",
        }),
      ],
      eventOf,
    );
    expect(picked.map((s) => s.id)).toEqual([10, 13]);
  });

  it("같은 사건 제목 판정 — 회사 하나만 겹치면 다른 사건", () => {
    expect(sameEventTitle("Samsung unveils new HBM4 chip", "Samsung launches Galaxy phone")).toBe(
      false,
    );
    expect(
      sameEventTitle(
        "LG AI Research releases Exaone 4.5 reasoning model",
        "Exaone 4.5 reasoning model released by LG AI Research",
      ),
    ).toBe(true);
  });

  it("이 주의 리드는 하이라이트와 다른 사건만, 편집 순", () => {
    const highlights = [
      story(1, { title: "Naver signs $9 billion infrastructure deal with Brookfield" }),
    ];
    const leads = selectWeekLeads(
      [
        story(1),
        story(2, {
          importance: 5,
          korea: false,
          title: "Brookfield signs $9 billion infrastructure deal with Naver",
        }),
        story(3, { importance: 4, korea: false, title: "Mistral releases weights" }),
        story(4, { importance: 5, korea: false, title: "OpenAI raises funding" }),
      ],
      highlights,
    );
    expect(leads.map((s) => s.id)).toEqual([4, 3]);
  });

  it("레이더: 영어 제목 있는 항목만, 밴드 순위 그대로", () => {
    const item = (id: number, titleEn?: string) => ({
      id,
      title: "제목",
      ...(titleEn ? { titleEn } : {}),
      format: "oss" as const,
      category: "oss",
      source: { name: "GitHub" },
      url: "https://github.com/a/b",
      issueDate: "2026-10-27",
    });
    const radar = {
      start: "2026-10-26",
      end: "2026-11-01",
      items: [item(1, "One"), item(2), item(3, "Three")],
      candidates: 3,
      formats: [],
    } satisfies WeeklyRadar;
    const rows = toSocialRadar(radar, () => ({ ident: "a/b", stats: ["★ 1"] }));
    expect(rows.map((r) => [r.rank, r.title, r.ident])).toEqual([
      [1, "One", "a/b"],
      [3, "Three", "a/b"],
    ]);
    expect(toSocialRadar(null)).toEqual([]);
  });
});

describe("주소·글자 수", () => {
  it("utm_source 를 달고 기존 쿼리는 둔다", () => {
    expect(enArticleUrl(SITE, 12, "x")).toBe(`${SITE}/en/article/12/?utm_source=x`);
    expect(withUtm("https://a.b/c/?q=1#h", "reddit")).toBe(
      "https://a.b/c/?q=1&utm_source=reddit#h",
    );
    expect(withUtm("https://a.b/?utm_source=x", "hn")).toBe("https://a.b/?utm_source=hn");
  });

  it("X 가중 길이: 링크 23, 한글·…·→ 2, en dash·’ 1, 도메인은 최소 23", () => {
    expect(xLength(`a ${enArticleUrl(SITE, 1234, "x")}`)).toBe(2 + 23);
    expect(xLength("한국")).toBe(4);
    expect(xLength("Oct 26 – Nov 1’s")).toBe(16);
    expect(xLength("…→")).toBe(4);
    expect(xLength("see Character.ai now")).toBe(4 + 23 + 4);
  });

  it("첫 문장 — 약어(U.S.)·소수점에서 끊지 않는다", () => {
    expect(firstSentence("The U.S. firm raised $2.5 billion. It plans more.")).toBe(
      "The U.S. firm raised $2.5 billion.",
    );
    expect(firstSentence("No split here")).toBe("No split here");
  });

  it("낱말 경계 말줄임", () => {
    expect(truncateWords("alpha beta gamma, delta", 18, (s) => s.length)).toBe("alpha beta gamma…");
    expect(truncateWords("short", 10, (s) => s.length)).toBe("short");
  });

  it("주 기간 표기", () => {
    expect(weekRange("2026-11-02", "2026-11-08")).toBe("Nov 2–8, 2026");
    expect(weekRange("2026-10-26", "2026-11-01")).toBe("Oct 26 – Nov 1, 2026");
    expect(weekRange("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(
      weekLabel({
        ...WEEK,
        start: "2026-11-02",
        end: "2026-11-08",
        partial: true,
        through: "2026-11-07",
      }),
    ).toBe("Week of Nov 2–8, 2026 (through Saturday)");
  });
});

describe("글 초안", () => {
  const longTitle =
    "Korea's Ministry of Science and ICT announces a sweeping multi-year national program to build sovereign AI foundation models with Naver, LG AI Research, SK Telecom, Upstage and NC AI";
  const longSummary =
    "The Ministry of Science and ICT said on Tuesday that five consortia led by Naver Cloud, LG AI Research, SK Telecom, Upstage and NC AI will receive GPUs, data and funding over three years to build Korean foundation models that rival global frontier systems in reasoning and coding. A second sentence follows.";

  it("X: 모든 글 ≤ 280, 링크는 utm_source=x, 아주 긴 제목도 넘치지 않는다", () => {
    const posts = buildXThread(
      kit({ korea: [story(1, { title: longTitle, summary: longSummary }), story(2), story(3)] }),
    );
    expect(posts).toHaveLength(5);
    for (const p of posts) expect(xLength(p)).toBeLessThanOrEqual(X_LIMIT);
    expect(posts[0]).toContain(`${SITE}/en/edition/2026-11-01/?utm_source=x`);
    expect(posts[1]).toMatch(/^1\/3 /);
    expect(posts[2]).toContain("Summary of story 2.");
    expect(posts.at(-1)).toContain("Orkas-AI/Orkas");
  });

  it("X: 부분 주는 영어 홈으로", () => {
    const posts = buildXThread(
      kit({ week: { ...WEEK, end: "2026-11-08", partial: true, through: "2026-11-07" } }),
    );
    expect(posts[0]).toContain(`${SITE}/en/?utm_source=x`);
    expect(posts[0]).toContain("so far");
  });

  it("LinkedIn: 250 낱말 이하(긴 요약은 뒤에서부터 뗀다), utm_source=linkedin", () => {
    const text = buildLinkedIn(
      kit({
        korea: [1, 2, 3, 4, 5].map((id) => story(id, { title: longTitle, summary: longSummary })),
      }),
    );
    expect(wordCount(text)).toBeLessThanOrEqual(LINKEDIN_WORDS.max);
    expect(text).toContain("utm_source=linkedin");
    expect(text).toMatch(/1\. .+ \(AI Times\)\n/);
  });

  it("Reddit: 원문 링크가 먼저, 관계 공개, utm_source=reddit", () => {
    const { title, body } = buildReddit(kit());
    expect(title.length).toBeLessThanOrEqual(300);
    expect(body.indexOf("https://www.aitimes.com/news/1")).toBeLessThan(
      body.indexOf(`${SITE}/en/article/1/?utm_source=reddit`),
    );
    expect(body).toMatch(/Disclosure: I made AI Daybook/);
  });

  it("HN: 제목 80자 이하, utm_source=hn, 추천 부탁 없음", () => {
    const hn = buildHackerNews(kit());
    expect(hn.regular.title.length).toBeLessThanOrEqual(80);
    expect(hn.showHn.title).toMatch(/^Show HN: /);
    expect(hn.showHn.title.length).toBeLessThanOrEqual(80);
    expect(hn.regular.url).toBe(`${SITE}/en/?utm_source=hn`);
    expect(hn.comment).not.toMatch(/upvote/i);
    expect(hn.comment).toContain("43 RSS and API sources");
  });

  it("영어 출력에 한글이 섞이면 실패한다", () => {
    expect(() => buildDrafts(kit(), { showHn: true })).not.toThrow();
    expect(() => buildDrafts(kit({ korea: [story(1, { title: "네이버 deal" })] }))).toThrow(/한글/);
  });
});

describe("카드 배치", () => {
  const long =
    "South Korea plans KRW 147.7 billion robot spending for 2027, including 200 humanoid units for public service pilots across the country";

  it("목록 크기: 말줄임 없이 들어가는 가장 큰 크기, 안 되면 작은 크기에서 자른다", () => {
    const short = fitList(["Short title", "Another short one"], 600, 400, [30, 26, 22], 2, 50);
    expect(short.size).toBe(30);
    expect(short.clipped).toBe(0);
    const tight = fitList(Array(5).fill(long), 600, 300, [30, 26, 22], 2, 50);
    expect(tight.size).toBe(22);
    expect(tight.clipped).toBeGreaterThan(0);
  });

  it("세로 카드: 목록이 먼저, 레이더는 2행 이상 들어갈 때만", () => {
    const five = planPortrait(Array(5).fill(long), 6);
    expect(five.fit.height).toBeLessThanOrEqual(1350);
    expect([0, 2, 3]).toContain(five.radarRows);
    const two = planPortrait(["Short title one", "Short title two"], 6);
    expect(two.radarRows).toBe(3);
  });

  it("산세리프 단락: 줄을 넘으면 마지막 줄을 … 로 맺는다", () => {
    const words = fitSansWords(`${long} ${long}`, 400, 20, 2);
    expect(words.at(-1)).toMatch(/…$/);
    expect(fitSansWords("Fits easily.", 400, 20, 2)).toEqual(["Fits", "easily."]);
  });
});
