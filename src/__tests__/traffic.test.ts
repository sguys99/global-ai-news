// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  classifyPath,
  counterUrl,
  fetchApiTraffic,
  fetchPublicTraffic,
  mergeStats,
  parseCount,
  parseTrafficArgs,
  referrerChannel,
  sitemapPaths,
  summarizeTraffic,
  trafficWindow,
  type ArchiveInfo,
  type FetchLike,
} from "../../scripts/lib/traffic";
import { trafficMarkdown, windowText } from "../../scripts/lib/trafficReport";

// 2026-11-07 13:30 KST
const NOW = new Date("2026-11-07T04:30:00Z");
const week = trafficWindow({ days: 7, now: NOW });

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe("parseTrafficArgs", () => {
  it("기본값·기간·플래그", () => {
    expect(parseTrafficArgs([])).toEqual({
      days: 14,
      since: null,
      ci: false,
      json: false,
      forcePublic: false,
    });
    expect(parseTrafficArgs(["7", "--ci", "--json", "--public"])).toMatchObject({
      days: 7,
      ci: true,
      json: true,
      forcePublic: true,
    });
    expect(parseTrafficArgs(["--since", "2026-11-05"]).since).toBe("2026-11-05");
  });

  it("잘못된 값은 던진다", () => {
    expect(() => parseTrafficArgs(["--since", "11/05"])).toThrow(/YYYY-MM-DD/);
    expect(() => parseTrafficArgs(["--since"])).toThrow(/YYYY-MM-DD/);
    expect(() => parseTrafficArgs(["0"])).toThrow(/1~366/);
    expect(() => parseTrafficArgs(["--days=3"])).toThrow(/알 수 없는 인자/);
  });
});

describe("trafficWindow", () => {
  it("기본: 어제까지 꽉 찬 KST N일(정시 UTC 경계)", () => {
    expect(week.start.toISOString()).toBe("2026-10-30T15:00:00.000Z");
    expect(week.end.toISOString()).toBe("2026-11-06T15:00:00.000Z");
    expect([week.startDate, week.endDate, week.untilNow, week.days]).toEqual([
      "2026-10-31",
      "2026-11-06",
      false,
      7,
    ]);
    expect(windowText(week)).toBe("2026-10-31 ~ 2026-11-06 (KST 7일)");
  });

  it("--since: 그 날 0시(KST)부터 다음 정시까지", () => {
    const w = trafficWindow({ days: 14, since: "2026-11-05", now: NOW });
    expect(w.start.toISOString()).toBe("2026-11-04T15:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-07T05:00:00.000Z");
    expect([w.endDate, w.untilNow, w.days]).toEqual(["2026-11-07", true, 3]);
    expect(windowText(w)).toBe("2026-11-05 ~ 지금 (KST, 3일째)");
  });
});

describe("classifyPath", () => {
  const archive: ArchiveInfo = {
    latestEditionDate: "2026-11-07",
    archivedArticleIds: new Set([12]),
  };

  it("언어판·페이지 종류", () => {
    expect(classifyPath("/global-ai-news/")).toEqual({ lang: "ko", kind: "home" });
    expect(classifyPath("/global-ai-news")).toEqual({ lang: "ko", kind: "home" });
    expect(classifyPath("/global-ai-news/en/")).toEqual({ lang: "en", kind: "home" });
    expect(classifyPath("/global-ai-news/en")).toEqual({ lang: "en", kind: "home" });
    expect(classifyPath("/global-ai-news/search/?q=x")).toEqual({ lang: "ko", kind: "search" });
    expect(classifyPath("/global-ai-news/en/search/")).toEqual({ lang: "en", kind: "search" });
    expect(classifyPath("/global-ai-news/edition/2026-11-06/")).toEqual({
      lang: "ko",
      kind: "edition",
    });
    expect(classifyPath("/global-ai-news/en/article/1395")).toEqual({
      lang: "en",
      kind: "article",
    });
    expect(classifyPath("/global-ai-news/feed.xml")).toEqual({ lang: "ko", kind: "other" });
    expect(classifyPath("/global-ai-news/english/")).toEqual({ lang: "ko", kind: "other" });
    expect(classifyPath("/")).toEqual({ lang: "outside", kind: "other" });
    expect(classifyPath("/global-ai-newsx/")).toEqual({ lang: "outside", kind: "other" });
  });

  it("보관 지면: 호는 날짜(90일), 기사는 보관 목록", () => {
    expect(classifyPath("/global-ai-news/edition/2026-08-09/", archive).kind).toBe("archive");
    expect(classifyPath("/global-ai-news/edition/2026-08-10/", archive).kind).toBe("edition");
    expect(classifyPath("/global-ai-news/en/article/12/", archive)).toEqual({
      lang: "en",
      kind: "archive",
    });
    expect(classifyPath("/global-ai-news/article/13/", archive).kind).toBe("article");
    // 기사 보관 목록을 모르면(DB 없음) 기사로 둔다
    expect(
      classifyPath("/global-ai-news/article/12/", { ...archive, archivedArticleIds: null }).kind,
    ).toBe("article");
  });
});

describe("summarizeTraffic", () => {
  const paths = [
    { path: "/global-ai-news/", count: 6 },
    { path: "/global-ai-news/edition/2026-11-06/", count: 4 },
    { path: "/global-ai-news/article/7/", count: 1 },
    { path: "/global-ai-news/en/", count: 3 },
    { path: "/global-ai-news/en/article/7/", count: 2 },
    { path: "/blog/", count: 1 },
    { path: "/global-ai-news/search/", count: 0 },
  ];

  it("언어판·종류 합, 영어 비율, 목록 밖", () => {
    const s = summarizeTraffic(paths, 20);
    expect(s.byLang).toEqual({ ko: 11, en: 5, outside: 1 });
    expect(s.pathSum).toBe(17);
    expect(s.unlisted).toBe(3);
    expect(s.enShare).toBeCloseTo(5 / 16);
    expect(s.byKind.ko).toMatchObject({ home: 6, edition: 4, article: 1, search: 0 });
    expect(s.byKind.en).toMatchObject({ home: 3, article: 2 });
    expect(s.topPages.ko.map((p) => p.count)).toEqual([6, 4, 1]);
    expect(s.topPages.en[0].path).toBe("/global-ai-news/en/");
  });

  it("합계를 모르면 경로 합, 방문 없으면 비율 없음", () => {
    expect(summarizeTraffic(paths, null)).toMatchObject({ total: 17, unlisted: null });
    expect(summarizeTraffic([], 0).enShare).toBeNull();
  });
});

describe("작은 도우미", () => {
  it("referrerChannel — 공유 태그·리퍼러 도메인", () => {
    expect(referrerChannel("hn")).toBe("Hacker News");
    expect(referrerChannel("news.ycombinator.com")).toBe("Hacker News");
    expect(referrerChannel("old.reddit.com")).toBe("Reddit");
    expect(referrerChannel("x")).toBe("X");
    expect(referrerChannel("t.co")).toBe("X");
    expect(referrerChannel("linkedin")).toBe("LinkedIn");
    expect(referrerChannel("lnkd.in")).toBe("LinkedIn");
    expect(referrerChannel("Google")).toBe("Google");
    expect(referrerChannel("example.com")).toBeNull();
  });

  it("parseCount·mergeStats·counterUrl", () => {
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount("1 234")).toBe(1234);
    expect(parseCount(undefined)).toBe(0);
    expect(
      mergeStats([
        [{ id: "KR", name: "South Korea", count: 2 }],
        [
          { id: "US", name: "United States", count: 3 },
          { id: "KR", name: "South Korea", count: 2 },
        ],
      ]),
    ).toEqual([
      { id: "KR", name: "South Korea", count: 4 },
      { id: "US", name: "United States", count: 3 },
    ]);
    expect(counterUrl("/global-ai-news/en/", week, "https://x.goatcounter.com")).toBe(
      "https://x.goatcounter.com/counter/%2Fglobal-ai-news%2Fen%2F.json?start=2026-10-31&end=2026-11-06",
    );
    const since = trafficWindow({ days: 1, since: "2026-11-05", now: NOW });
    expect(counterUrl("TOTAL", since, "https://x.goatcounter.com")).toBe(
      "https://x.goatcounter.com/counter/TOTAL.json?start=2026-11-05",
    );
  });
});

describe("fetchApiTraffic (가짜 fetch)", () => {
  function apiFetch() {
    const calls: { url: URL; auth: string | null }[] = [];
    let limited = false;
    const fn: FetchLike = async (raw, init) => {
      const url = new URL(raw);
      calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
      const q = url.searchParams;
      switch (url.pathname) {
        case "/api/v0/stats/total":
          return json({ total: 30, total_events: 2 });
        case "/api/v0/stats/hits":
          if (!q.get("exclude_paths")) {
            return json({
              more: true,
              hits: [
                { path: "/global-ai-news/", path_id: 1, count: 10, title: "AI 데이북" },
                { path: "/global-ai-news/en/", path_id: 2, count: 5, title: "AI Daybook" },
                { path: "share-click", path_id: 3, count: 2, event: true },
              ],
            });
          }
          return json({
            more: false,
            hits: [{ path: "/global-ai-news/en/article/9/", path_id: 4, count: 3 }],
          });
        case "/api/v0/stats/locations":
          if (q.get("include_paths")) {
            return json({ stats: [{ id: "US", name: "United States", count: 6 }] });
          }
          return json({
            stats: [
              { id: "KR", name: "South Korea", count: 12 },
              { id: "US", name: "United States", count: 6 },
            ],
          });
        case "/api/v0/stats/toprefs":
          if (!limited) {
            limited = true;
            return json({ error: "rate limited" }, 429, { "X-Rate-Limit-Reset": "2" });
          }
          return json({
            stats: [
              { name: "hn", count: 4, ref_scheme: "c" },
              { name: "news.ycombinator.com", count: 1, ref_scheme: "h" },
            ],
          });
        case "/api/v0/stats/campaigns":
          return json({ stats: [] });
        default:
          return json({ error: "not found" }, 404);
      }
    };
    return { fn, calls };
  }

  it("합계·경로 쪽 넘기기·이벤트 제외·영어판 국가·429 재시도", async () => {
    const { fn, calls } = apiFetch();
    const sleep = vi.fn(async () => {});
    const data = await fetchApiTraffic(week, {
      token: "tok",
      baseUrl: "https://x.goatcounter.com",
      fetch: fn,
      sleep,
      minIntervalMs: 0,
    });

    expect(data.mode).toBe("api");
    expect(data.total).toBe(28);
    expect(data.paths.map((p) => p.path)).toEqual([
      "/global-ai-news/",
      "/global-ai-news/en/",
      "/global-ai-news/en/article/9/",
    ]);
    expect(data.pathsIncomplete).toBe(false);
    expect(data.countries?.[0]).toEqual({ id: "KR", name: "South Korea", count: 12 });
    expect(data.countriesEn).toEqual([{ id: "US", name: "United States", count: 6 }]);
    expect(data.referrers?.[0]).toMatchObject({ name: "hn", refScheme: "c" });
    expect(sleep).toHaveBeenCalledWith(2000);

    expect(calls.every((c) => c.auth === "Bearer tok")).toBe(true);
    const first = calls.find((c) => c.url.pathname === "/api/v0/stats/total")!;
    expect(first.url.searchParams.get("start")).toBe("2026-10-30T15:00:00Z");
    expect(first.url.searchParams.get("end")).toBe("2026-11-06T15:00:00Z");
    const hits = calls.filter((c) => c.url.pathname === "/api/v0/stats/hits");
    expect(hits[1].url.searchParams.get("exclude_paths")).toBe("1,2,3");
    const en = calls.find(
      (c) =>
        c.url.pathname === "/api/v0/stats/locations" && c.url.searchParams.has("include_paths"),
    )!;
    expect(en.url.searchParams.get("include_paths")).toBe("2,4");
  });

  it("401 은 토큰 안내와 함께 던진다", async () => {
    const fn: FetchLike = async () => json({ error: "no API key" }, 401);
    await expect(
      fetchApiTraffic(week, { token: "bad", fetch: fn, sleep: async () => {}, minIntervalMs: 0 }),
    ).rejects.toThrow(/401 — 토큰이 없거나 틀림/);
  });
});

describe("공개 카운터 모드 (가짜 fetch)", () => {
  it("사이트맵 인덱스 → 조각 → 경로", async () => {
    const xml: Record<string, string> = {
      "https://s/sitemap.xml":
        "<sitemapindex><sitemap><loc>https://s/a.xml</loc></sitemap><sitemap><loc>https://s/b.xml</loc></sitemap></sitemapindex>",
      "https://s/a.xml":
        "<urlset><url><loc>https://sguys99.github.io/global-ai-news/</loc></url><url><loc>https://sguys99.github.io/global-ai-news/en/</loc></url></urlset>",
      "https://s/b.xml":
        "<urlset><url><loc>https://sguys99.github.io/global-ai-news/en/</loc></url><url><loc>https://sguys99.github.io/global-ai-news/en/article/9/</loc></url></urlset>",
    };
    const fn: FetchLike = async (url) =>
      new Response(xml[url] ?? "", { status: xml[url] ? 200 : 404 });
    expect(await sitemapPaths("https://s/sitemap.xml", fn)).toEqual([
      "/global-ai-news/",
      "/global-ai-news/en/",
      "/global-ai-news/en/article/9/",
    ]);
  });

  it("경로마다 카운터, 404 = 0, 실패는 메모", async () => {
    const counts: Record<string, Response | (() => Response)> = {
      TOTAL: json({ count: "1,204", count_unique: "1,204" }),
      "/global-ai-news/": json({ count: "1,200" }),
      "/global-ai-news/en/": json({ count: "0" }, 404),
      "/global-ai-news/en/article/9/": json({ count: "3" }),
      "/global-ai-news/search/": new Response("oops", { status: 500 }),
    };
    const seen: string[] = [];
    const fn: FetchLike = async (raw) => {
      seen.push(raw);
      const name = decodeURIComponent(
        new URL(raw).pathname.replace(/^\/counter\//, "").replace(/\.json$/, ""),
      );
      const r = counts[name];
      return typeof r === "function" ? r() : (r ?? json({ count: "0" }, 404));
    };
    const data = await fetchPublicTraffic(week, {
      fetch: fn,
      sleep: async () => {},
      counterBase: "https://x.goatcounter.com",
      concurrency: 2,
      paths: [
        "/global-ai-news/",
        "/global-ai-news/en/",
        "/global-ai-news/en/article/9/",
        "/global-ai-news/search/",
      ],
    });
    expect(data.mode).toBe("public");
    expect(data.total).toBe(1204);
    expect(data.checked).toBe(4);
    expect([...data.paths].sort((a, b) => b.count - a.count)).toEqual([
      { path: "/global-ai-news/", count: 1200 },
      { path: "/global-ai-news/en/article/9/", count: 3 },
    ]);
    expect(data.pathsIncomplete).toBe(true);
    expect(data.notes.join("\n")).toMatch(/카운터 실패 1건.*\/global-ai-news\/search\/: 500/);
    expect(data.countries).toBeNull();
    expect(seen[0]).toBe(
      "https://x.goatcounter.com/counter/TOTAL.json?start=2026-10-31&end=2026-11-06",
    );

    const md = trafficMarkdown(data, summarizeTraffic(data.paths, data.total));
    expect(md).toContain("공개 카운터 모드(토큰 없음, 주소 4개 조회)");
    expect(md).toContain("토큰 필요(GOATCOUNTER_API_TOKEN — 공개 카운터에는 국가가 없다).");
    expect(md).toContain("| 영어판 `/global-ai-news/en/…` | 3 | 0.2% |");
    expect(md).toContain("| 사이트맵 밖 경로(basePath 밖·옛 주소 등) | 1 | 0.1% |");
  });
});

describe("trafficMarkdown (API)", () => {
  it("언어판 표·종류별·국가(전체·영어판)·유입(태그 굵게)·상위 페이지", async () => {
    const data = {
      mode: "api" as const,
      window: week,
      total: 20,
      paths: [
        { path: "/global-ai-news/", count: 10, title: "AI 데이북" },
        { path: "/global-ai-news/en/", count: 6, title: "AI Daybook" },
        { path: "/global-ai-news/en/edition/2026-11-06/", count: 4, title: "No. 40 | Nov 6" },
      ],
      pathsIncomplete: false,
      countries: [
        { id: "KR", name: "South Korea", count: 12 },
        { id: "US", name: "United States", count: 8 },
      ],
      countriesEn: [{ id: "US", name: "United States", count: 8 }],
      referrers: [
        { name: "hn", count: 5, refScheme: "c" },
        { name: "Google", count: 2, refScheme: "g" },
      ],
      campaigns: [],
      notes: [],
    };
    const md = trafficMarkdown(data, summarizeTraffic(data.paths, data.total));
    expect(md).toContain(
      "기간 2026-10-31 ~ 2026-11-06 (KST 7일) · API 모드 · 방문 20 · 영어판 비율 **50%**(언어판 합 기준)",
    );
    expect(md).toContain("| 한국어판 `/global-ai-news/…` | 10 | 50% |");
    expect(md).toContain("| 호 | 0 | 4 | 100% |");
    expect(md).toContain("| 1 | South Korea (KR) | 12 | 60% |");
    expect(md).toMatch(
      /영어판\(`\/en\/` 경로만\):\n\n\| 순위[^\n]*\n[^\n]*\n\| 1 \| United States \(US\) \| 8 \| 100% \|/,
    );
    expect(md).toContain("| 1 | **hn** | 태그(ref·utm) | Hacker News | 5 |");
    expect(md).toContain("| 4 | `/global-ai-news/en/edition/2026-11-06/` | No. 40 \\| Nov 6 |");
    expect(md).not.toContain("사이트맵 밖");
  });
});
