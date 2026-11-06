import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIndexShards, contentHash, sourceTableOf } from "../../scripts/lib/indexShards";
import type { FeedOptions } from "@/lib/db";
import { filterAndSortFeed } from "@/lib/feedFilter";
import { buildFeedIndex, toIndexCard } from "@/lib/feedIndex";
import {
  FEED_ROW_FIELDS,
  SEARCH_ROW_FIELDS,
  decodeRow,
  encodeRow,
  indexBuildVersion,
  indexManifestUrl,
  indexShardUrl,
  issueMonthOf,
  loadIndexManifest,
  loadIndexMonths,
  mergeByDefaultOrder,
  resetIndexCache,
  shiftMonth,
  splitRecentMonths,
  type ShardMonth,
} from "@/lib/indexShards";
import type { ArticleCard } from "@/lib/types";

const CATS = ["llm", "agent", "physical", "oss", "research", "industry"];
const SOURCES = [
  { id: "hn", name: "Hacker News", nameEn: undefined },
  { id: "hn_front", name: "Hacker News Front Page", nameEn: undefined },
  { id: "zdnet", name: "지디넷코리아", nameEn: "ZDNet Korea" },
  { id: "gh", name: "GitHub Trending", nameEn: undefined },
];

/** 누적 카드(DB getFeed 모양). 화제·게시 시각 동점이 섞이도록 값을 접는다. */
function card(i: number): ArticleCard {
  const s = SOURCES[i % SOURCES.length];
  return {
    id: i,
    source: s.nameEn ? { id: s.id, name: s.name, nameEn: s.nameEn } : { id: s.id, name: s.name },
    url: `https://x/${i}`,
    titleKo: i % 17 === 0 ? "" : `기사${i}`,
    summaryKo: `요약${i}`,
    titleOriginal: `T${i}`,
    titleEn: `Story ${i}`,
    summaryEn: `Summary ${i}`,
    contentRaw: "본문",
    category: CATS[i % CATS.length],
    format: s.id === "gh" ? "oss" : "news",
    tags: i % 3 === 0 ? ["llm", "agent"] : ["llm"],
    trendingScore: i % 4 === 0 ? 0 : (i * 7) % 60,
    importance: (i % 5) + 1,
    publishedAt: `2026-10-${String(10 + (i % 20)).padStart(2, "0")}T0${i % 3}:00:00Z`,
    related: i % 6 === 0 ? [{ source: "Reuters", url: "https://r", title: "R" }] : [],
    engagement: i % 5 === 0 ? { stars: 100 + i } : undefined,
  };
}

// getFeed() 결과처럼 기본 정렬 순서. 호 날짜는 id 를 셋으로 나눠 세 달에 흩는다(순서 안에서 달이 섞인다).
const cards = filterAndSortFeed(Array.from({ length: 95 }, (_, i) => card(i + 1)));
const issueDates = new Map(
  cards.map((c) => [c.id, ["2026-09-30", "2026-10-01", "2026-11-04"][c.id % 3]]),
);
const sources = sourceTableOf(cards);
/** 한국어 목록의 매체 표(영문명 없음 — buildIndexShards 가 ko 에서 뗀다). */
const koSources = buildIndexShards({
  kind: "feed-index",
  locale: "ko",
  cards,
  issueDates,
  sources,
}).manifest.sources;
const ids = (list: { id: number }[]) => list.map((a) => a.id);

describe("행 인코딩 — 필드 축소 왕복", () => {
  it("홈 색인 행을 되돌리면 toIndexCard 와 같다(원제 폴백·묶음 개수·매체 이름·형식)", () => {
    for (const c of cards) {
      const row = encodeRow(c, "ko", false);
      expect(row).toHaveLength(FEED_ROW_FIELDS.length);
      expect(decodeRow(row, { locale: "ko", sources: koSources })).toEqual(toIndexCard(c));
    }
  });

  it("검색 색인 행은 원제를 더 싣는다", () => {
    const c = card(6);
    const row = encodeRow(c, "ko", true);
    expect(row).toHaveLength(SEARCH_ROW_FIELDS.length);
    expect(decodeRow(row, { locale: "ko", sources: koSources })).toEqual({
      ...toIndexCard(c),
      titleOriginal: "T6",
    });
  });

  it("색인 카드(IndexCard)에서 만들어도 같은 행이다", () => {
    for (const c of cards.slice(0, 20)) {
      expect(encodeRow(toIndexCard(c), "ko", false)).toEqual(encodeRow(c, "ko", false));
    }
  });

  it("행에는 본문·URL·묶음 목록·메트릭·영어가 없다(ko)", () => {
    const json = JSON.stringify(cards.map((c) => encodeRow(c, "ko", true)));
    for (const s of ["본문", "https://", "Reuters", "stars", "Story ", "Summary "])
      expect(json).not.toContain(s);
  });

  it("영어 목록은 제목·요약 칸이 영어이고 영어 필드로 되돌린다(영문 매체명 포함)", () => {
    const c = card(2); // zdnet — 한글 매체명
    const table = Object.fromEntries(sourceTableOf([c]));
    const back = decodeRow(encodeRow(c, "en", true), { locale: "en", sources: table });
    expect(back).toMatchObject({
      titleKo: "",
      summaryKo: "",
      titleEn: "Story 2",
      summaryEn: "Summary 2",
      titleOriginal: "T2",
      source: { id: "zdnet", name: "지디넷코리아", nameEn: "ZDNet Korea" },
    });
  });

  it("영어 행: 태그는 라틴 문자만, 한국어 원제는 빈 칸, 지역은 매체 표에서 되돌린다 — ko 행은 그대로", () => {
    const c: ArticleCard = {
      ...card(2),
      titleOriginal: "한국어 원제",
      tags: ["llm", "에이전트"],
      source: { id: "zdnet", name: "지디넷코리아", nameEn: "ZDNet Korea", region: "kr" },
    };
    const row = encodeRow(c, "en", true);
    expect(row[5]).toEqual(["llm"]);
    expect(row[10]).toBe("");
    expect(/[가-힯]/.test(JSON.stringify(row))).toBe(false);
    const table = Object.fromEntries(sourceTableOf([c]));
    expect(table.zdnet.region).toBe("kr");
    expect(decodeRow(row, { locale: "en", sources: table }).source.region).toBe("kr");
    const ko = encodeRow(c, "ko", true);
    expect(ko[5]).toEqual(["llm", "에이전트"]);
    expect(ko[10]).toBe("한국어 원제");
  });
});

describe("호 월", () => {
  it("호 날짜(KST) → 'YYYY-MM'", () => {
    expect(issueMonthOf("2026-11-04")).toBe("2026-11");
  });

  it("shiftMonth — 해 넘김", () => {
    expect(shiftMonth("2026-11", -2)).toBe("2026-09");
    expect(shiftMonth("2026-01", -2)).toBe("2025-11");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  const m = (month: string, count = 1): ShardMonth => ({ month, count, v: month });

  it("최근 N개월 = 최신 달 포함 N개 달력 월(빈 달도 센다)", () => {
    const months = [m("2026-11"), m("2026-10"), m("2026-07"), m("2026-06")];
    const { recent, older, since } = splitRecentMonths(months, 3);
    expect(since).toBe("2026-09");
    expect(recent.map((x) => x.month)).toEqual(["2026-11", "2026-10"]);
    expect(older.map((x) => x.month)).toEqual(["2026-07", "2026-06"]);
  });

  it("지난 달이 없으면 older 는 비고, 목록이 비면 since 도 없다", () => {
    expect(splitRecentMonths([m("2026-11")], 3).older).toEqual([]);
    expect(splitRecentMonths([], 3)).toEqual({ recent: [], older: [], since: null });
  });
});

describe("buildIndexShards — 목록·조각", () => {
  const built = buildIndexShards({
    kind: "search-index",
    locale: "ko",
    cards,
    issueDates,
    sources,
  });

  it("최신 달 먼저, 건수 합 = 누적, 조각은 각자 기본 정렬 순", () => {
    expect(built.manifest.months.map((x) => x.month)).toEqual(["2026-11", "2026-10", "2026-09"]);
    expect(built.manifest.months.reduce((n, x) => n + x.count, 0)).toBe(cards.length);
    expect(built.manifest.total).toBe(cards.length);
    for (const s of built.shards) {
      const order = ids(cards).filter((id) => s.rows.some((r) => r[0] === id));
      expect(s.rows.map((r) => r[0])).toEqual(order);
    }
  });

  it("조각 해시는 내용이 같으면 같고, 바뀌면 바뀐다(지난 달 조각의 캐시 키가 빌드마다 바뀌지 않는다)", () => {
    const again = buildIndexShards({
      kind: "search-index",
      locale: "ko",
      cards: [...cards, { ...card(200), id: 200 }],
      issueDates: new Map([...issueDates, [200, "2026-11-05"]]),
      sources,
    });
    const v = (b: typeof built, month: string) =>
      b.manifest.months.find((x) => x.month === month)!.v;
    expect(v(again, "2026-09")).toBe(v(built, "2026-09"));
    expect(v(again, "2026-10")).toBe(v(built, "2026-10"));
    expect(v(again, "2026-11")).not.toBe(v(built, "2026-11"));
    expect(contentHash("a")).toMatch(/^[0-9a-f]{10}$/);
  });

  it("매체 표는 쓰인 매체만, 영문명은 en 목록에만", () => {
    expect(Object.keys(built.manifest.sources).sort()).toEqual(["gh", "hn", "hn_front", "zdnet"]);
    expect(built.manifest.sources.zdnet).toEqual({ name: "지디넷코리아", format: "news" });
    const en = buildIndexShards({ kind: "search-index", locale: "en", cards, issueDates, sources });
    expect(en.manifest.sources.zdnet.nameEn).toBe("ZDNet Korea");
  });

  it("호 날짜가 없는 기사는 빌드를 멈춘다", () => {
    expect(() =>
      buildIndexShards({ kind: "feed-index", locale: "ko", cards, issueDates: new Map(), sources }),
    ).toThrow(/호 날짜/);
  });

  const allBack = mergeByDefaultOrder(
    built.shards.map((s) => s.rows.map((r) => decodeRow(r, built.manifest))),
  );

  it("조각을 기본 정렬로 합치면 빌드 시점 누적 순서가 그대로 되살아난다(동점 포함)", () => {
    expect(ids(allBack)).toEqual(ids(cards));
    expect(ids(allBack)).toEqual(ids(buildFeedIndex(cards)));
  });

  const cases: FeedOptions[] = [
    {},
    { sort: "latest" },
    { sort: "importance" },
    { category: "physical" },
    { tag: "agent", sort: "importance" },
    { source: "hn_front" },
  ];
  it.each(cases)("필터·정렬 %o: 합친 조각으로 거른 결과 = 누적 카드 전체로 거른 결과", (opts) => {
    const list = sourcesList();
    expect(ids(filterAndSortFeed(allBack, opts, list))).toEqual(
      ids(filterAndSortFeed(cards, opts, list)),
    );
  });
});

function sourcesList() {
  return SOURCES.map((s) => ({ id: s.id, name: s.name, count: 1 }));
}

describe("주소·받기", () => {
  const built = buildIndexShards({ kind: "feed-index", locale: "ko", cards, issueDates, sources });

  beforeEach(() => resetIndexCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    resetIndexCache();
  });

  it("주소: 목록은 빌드 버전, 조각은 내용 해시(dev 는 basePath 없음)", () => {
    expect(indexBuildVersion("2026-11-04", 1277)).toBe("2026-11-04-1277");
    expect(indexBuildVersion(undefined, 0)).toBe("none-0");
    expect(indexManifestUrl("search-index", "ko", "2026-11-04-1277")).toBe(
      "/search-index/ko/manifest.json?v=2026-11-04-1277",
    );
    expect(indexShardUrl("feed-index", "en", { month: "2026-11", count: 1, v: "abc" })).toBe(
      "/feed-index/en/2026-11.json?v=abc",
    );
  });

  function serve() {
    return vi.fn(async (url: string) => {
      const file = url.split("?")[0].split("/").pop()!;
      if (file === "manifest.json") return new Response(JSON.stringify(built.manifest));
      const s = built.shards.find((x) => `${x.month}.json` === file);
      return s ? new Response(JSON.stringify(s.rows)) : new Response("nf", { status: 404 });
    });
  }

  it("같은 URL 은 한 번만 받고, 조각들을 함께 받아 기본 정렬로 합친다", async () => {
    const fetchMock = serve();
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([
      loadIndexManifest("feed-index", "ko", "v1"),
      loadIndexManifest("feed-index", "ko", "v1"),
    ]);
    expect(b).toBe(a);
    const recent = await loadIndexMonths(a, a.months.slice(0, 2));
    expect(ids(recent)).toEqual(
      ids(cards).filter((id) => ["2026-11-04", "2026-10-01"].includes(issueDates.get(id)!)),
    );
    const all = await loadIndexMonths(a, a.months);
    expect(ids(all)).toEqual(ids(cards));
    // 목록 1 + 조각 3(두 번째 loadIndexMonths 는 앞의 두 조각을 캐시에서).
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("HTTP 오류·다른 형식 판은 실패로 보고, 다음 호출이 다시 요청한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...built.manifest, schema: 2 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...built.manifest, fields: ["id"] })))
      .mockResolvedValueOnce(new Response(JSON.stringify(built.manifest)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadIndexManifest("feed-index", "ko", "v")).rejects.toThrow("404");
    await expect(loadIndexManifest("feed-index", "ko", "v")).rejects.toThrow("unexpected shape");
    await expect(loadIndexManifest("feed-index", "ko", "v")).rejects.toThrow("unexpected shape");
    await expect(loadIndexManifest("feed-index", "ko", "v")).resolves.toMatchObject({
      kind: "feed-index",
    });
    // 다른 종류의 목록도 받지 않는다.
    vi.stubGlobal("fetch", serve());
    await expect(loadIndexManifest("search-index", "ko", "v")).rejects.toThrow("unexpected shape");
  });

  it("조각 하나가 실패하면 전체가 실패하고, 다시 부르면 실패한 조각만 다시 받는다", async () => {
    const ok = serve();
    let failOnce = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("2026-09") && failOnce) {
        failOnce = false;
        throw new TypeError("Failed to fetch");
      }
      return ok(url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const manifest = await loadIndexManifest("feed-index", "ko", "v");
    await expect(loadIndexMonths(manifest, manifest.months)).rejects.toThrow("Failed to fetch");
    const all = await loadIndexMonths(manifest, manifest.months);
    expect(all).toHaveLength(cards.length);
    // 목록 1 + 조각 3 + 실패한 조각 재요청 1.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
