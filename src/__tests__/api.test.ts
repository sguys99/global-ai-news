// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGithub,
  fetchHf,
  fetchHfModels,
  fetchHn,
  formatParams,
  parseGithubTrending,
} from "../../scripts/lib/collect/api";
import type { SourceConfig } from "../../scripts/lib/collect/rss";

const src = (kind: string): SourceConfig => ({
  id: kind,
  name: kind,
  kind,
  url: "https://example.com",
  enabled: 1,
});

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchHn", () => {
  it("hits 를 RawItem 으로 정규화하고 engagement(points/comments) 를 채운다", async () => {
    mockFetch({
      hits: [
        {
          objectID: "1",
          title: "AI story",
          url: "https://news.site/a",
          points: 120,
          num_comments: 30,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const items = await fetchHn(src("hn"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://news.site/a",
      title: "AI story",
      engagement: { points: 120, num_comments: 30 },
    });
  });

  it("url 이 없으면 HN 퍼머링크로 대체한다", async () => {
    mockFetch({
      hits: [{ objectID: "42", title: "Ask HN", created_at: "2026-01-01T00:00:00Z" }],
    });
    const items = await fetchHn(src("hn"));
    expect(items[0].url).toBe("https://news.ycombinator.com/item?id=42");
  });

  it("title 누락 항목은 스킵한다", async () => {
    mockFetch({ hits: [{ objectID: "1", created_at: "2026-01-01T00:00:00Z" }] });
    expect(await fetchHn(src("hn"))).toHaveLength(0);
  });

  it("HTTP 오류 시 throw", async () => {
    mockFetch({}, false, 503);
    await expect(fetchHn(src("hn"))).rejects.toThrow("HN HTTP 503");
  });
});

describe("fetchGithub — Search API", () => {
  const searchSrc = (url: string): SourceConfig => ({ ...src("github"), url });
  const calledUrl = () => new URL(String(vi.mocked(fetch).mock.calls[0][0]));

  it("source.url 의 q 에 7일 생성 창을 붙이고 sort·order·per_page 기본값을 채운다", async () => {
    mockFetch({ items: [] });
    await fetchGithub(
      searchSrc("https://api.github.com/search/repositories?q=topic:ai-agents,mcp+stars:>=10"),
    );
    const url = calledUrl();
    expect(url.origin + url.pathname).toBe("https://api.github.com/search/repositories");
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    expect(url.searchParams.get("q")).toBe(`topic:ai-agents,mcp stars:>=10 created:>${since}`);
    expect(url.searchParams.get("sort")).toBe("stars");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("per_page")).toBe("30");
  });

  it("url 에 적은 sort·per_page 는 덮어쓰지 않는다", async () => {
    mockFetch({ items: [] });
    await fetchGithub(
      searchSrc("https://api.github.com/search/repositories?q=topic:llm&sort=updated&per_page=10"),
    );
    const url = calledUrl();
    expect(url.searchParams.get("sort")).toBe("updated");
    expect(url.searchParams.has("order")).toBe(false);
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  it("q 가 없으면 호출 없이 실패한다(쿼리 하드코딩 폴백 없음)", async () => {
    mockFetch({ items: [] });
    await expect(
      fetchGithub(searchSrc("https://api.github.com/search/repositories")),
    ).rejects.toThrow("GitHub 검색 쿼리 없음");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("repo 를 RawItem 으로 정규화하고 stars·language 를 engagement 에, 토픽을 contentRaw 에 넣는다", async () => {
    mockFetch({
      items: [
        {
          html_url: "https://github.com/x/y",
          full_name: "x/y",
          description: "An <b>LLM</b> tool",
          stargazers_count: 999,
          language: "Python",
          topics: ["llm", "rag"],
          pushed_at: "2026-01-02T00:00:00Z",
        },
        {
          html_url: "https://github.com/x/bare",
          full_name: "x/bare",
          description: null,
          language: null,
          pushed_at: "2026-01-02T00:00:00Z",
        },
      ],
    });
    const [item, bare] = await fetchGithub(
      searchSrc("https://api.github.com/search/repositories?q=topic:llm"),
    );
    expect(item).toMatchObject({
      url: "https://github.com/x/y",
      title: "x/y",
      contentRaw: "An LLM tool · topics: llm, rag",
      engagement: { stars: 999, language: "Python" },
    });
    expect(bare.contentRaw).toBeUndefined();
    expect(bare.engagement).toEqual({ stars: 0 });
  });

  it("HTTP 오류 시 throw", async () => {
    mockFetch({}, false, 422);
    await expect(
      fetchGithub(searchSrc("https://api.github.com/search/repositories?q=topic:llm")),
    ).rejects.toThrow("GitHub HTTP 422");
  });
});

/** github.com/trending 의 저장소 블록 한 개(실제 마크업에서 속성·SVG 를 줄인 것). */
const trendingRow = (o: {
  name: string;
  desc?: string;
  lang?: string;
  stars?: string;
  today?: string;
}) => `
  <article class="Box-row">
    <h2 class="h3 lh-condensed">
      <a data-hydro-click="{}" href="/${o.name}" class="Link"><svg class="octicon octicon-repo"><path d="M2"></path></svg>
        <span class="text-normal">${o.name.split("/")[0]} /</span> ${o.name.split("/")[1]}</a>
    </h2>
    ${o.desc !== undefined ? `<p class="col-9 color-fg-muted my-1 tmp-pr-4">\n      ${o.desc}\n    </p>` : ""}
    <div class="f6 color-fg-muted mt-2">
      ${o.lang ? `<span class="d-inline-block"><span class="repo-language-color"></span>\n  <span itemprop="programmingLanguage">${o.lang}</span>\n</span>` : ""}
      <a href="/${o.name}/stargazers" class="Link Link--muted d-inline-block"><svg aria-label="star" class="octicon octicon-star"><path d="M8"></path></svg>
        ${o.stars ?? "0"}</a>
      <a href="/${o.name}/forks" class="Link"><svg aria-label="fork"><path d="M5"></path></svg>
        281</a>
      ${o.today ? `<span class="d-inline-block float-sm-right"><svg class="octicon octicon-star"><path d="M8"></path></svg>\n        ${o.today} stars today\n</span>` : ""}
    </div>
  </article>`;

describe("parseGithubTrending", () => {
  it("이름·설명·언어·누적 스타·오늘 스타(Δstars)를 읽는다", () => {
    const html =
      "<main>" +
      trendingRow({
        name: "JetBrains/thinkrail",
        desc: "Vibe code with pi &amp; friends",
        lang: "TypeScript",
        stars: "5,545",
        today: "1,068",
      }) +
      trendingRow({ name: "x/bare" }) +
      "</main>";
    expect(parseGithubTrending(html)).toEqual([
      {
        fullName: "JetBrains/thinkrail",
        description: "Vibe code with pi & friends",
        language: "TypeScript",
        stars: 5545,
        starsToday: 1068,
      },
      {
        fullName: "x/bare",
        description: undefined,
        language: undefined,
        stars: 0,
        starsToday: undefined,
      },
    ]);
  });

  it("저장소 블록이 없으면 빈 배열", () => {
    expect(parseGithubTrending("<html><body>no trending</body></html>")).toEqual([]);
  });
});

describe("fetchGithub — Trending", () => {
  const trendingSrc: SourceConfig = {
    ...src("github"),
    id: "github_trending",
    url: "https://github.com/trending?since=daily",
  };

  /** 트렌딩 페이지는 HTML, /repos/{name} 은 토픽 JSON(topics 맵에 없으면 404)을 돌려준다. */
  function mockTrending(html: string, topics: Record<string, string[]>, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.startsWith("https://github.com/trending")) {
          return { ok: status === 200, status, text: async () => html };
        }
        const name = url.replace("https://api.github.com/repos/", "");
        const found = Object.hasOwn(topics, name);
        return {
          ok: found,
          status: found ? 200 : 404,
          json: async () => ({ topics: topics[name] }),
          body: { cancel: async () => {} },
        };
      }),
    );
  }

  it("오늘 스타·언어를 engagement 에, 저장소 토픽을 contentRaw 에 싣는다", async () => {
    mockTrending(
      trendingRow({
        name: "HKUDS/DeepTutor",
        desc: "DeepTutor: Lifelong Personalized Tutoring.",
        lang: "Python",
        stars: "48,836",
        today: "2,371",
      }),
      { "HKUDS/DeepTutor": ["ai-agents", "rag"] },
    );
    const [item] = await fetchGithub(trendingSrc);
    expect(item).toMatchObject({
      sourceId: "github_trending",
      url: "https://github.com/HKUDS/DeepTutor",
      title: "HKUDS/DeepTutor",
      contentRaw: "DeepTutor: Lifelong Personalized Tutoring. · topics: ai-agents, rag",
      engagement: { stars: 48836, stars_today: 2371, language: "Python" },
    });
    expect(Number.isNaN(new Date(item.publishedAt).getTime())).toBe(false);
  });

  it("토픽 조회가 실패해도 저장소는 남긴다", async () => {
    mockTrending(trendingRow({ name: "a/b", desc: "An AI tool", stars: "10", today: "3" }), {});
    const [item] = await fetchGithub(trendingSrc);
    expect(item.contentRaw).toBe("An AI tool");
    expect(item.engagement).toEqual({ stars: 10, stars_today: 3 });
  });

  it("저장소를 하나도 못 읽으면 마크업 변경으로 보고 실패한다", async () => {
    mockTrending("<html>changed markup</html>", {});
    await expect(fetchGithub(trendingSrc)).rejects.toThrow("GitHub Trending 파싱 0건");
  });

  it("HTTP 오류 시 throw", async () => {
    mockTrending("", {}, 429);
    await expect(fetchGithub(trendingSrc)).rejects.toThrow("GitHub Trending HTTP 429");
  });
});

describe("fetchHf", () => {
  it("daily_papers 를 RawItem 으로 정규화한다", async () => {
    mockFetch([
      {
        publishedAt: "2026-01-01T00:00:00Z",
        paper: { id: "2401.00001", title: "A paper", summary: "내용", upvotes: 12 },
      },
    ]);
    const items = await fetchHf(src("hf"));
    expect(items[0]).toMatchObject({
      url: "https://huggingface.co/papers/2401.00001",
      title: "A paper",
      contentRaw: "내용",
      engagement: { ups: 12 },
    });
  });

  it("paper.id 누락 항목은 스킵한다", async () => {
    mockFetch([{ publishedAt: "2026-01-01T00:00:00Z", paper: { title: "x" } }]);
    expect(await fetchHf(src("hf"))).toHaveLength(0);
  });

  it("약 2일치 목록(limit=100)을 받아 hf.minUpvotes 미만은 버린다", async () => {
    mockFetch([
      { publishedAt: "2026-01-01T00:00:00Z", paper: { id: "2401.00001", title: "a", upvotes: 10 } },
      { publishedAt: "2026-01-01T00:00:00Z", paper: { id: "2401.00002", title: "b", upvotes: 9 } },
    ]);
    const items = await fetchHf(src("hf"));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://huggingface.co/api/daily_papers?limit=100",
    );
    // configs/paper-filter.json 의 hf.minUpvotes(10) 기준
    expect(items.map((i) => i.url)).toEqual(["https://huggingface.co/papers/2401.00001"]);
  });
});

describe("fetchHfModels", () => {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const hfModelsSrc: SourceConfig = {
    ...src("hf_models"),
    url: "https://huggingface.co/api/models?sort=trendingScore&limit=30",
  };

  it("source.url 에 expand[] 필드를 붙여 1회만 호출한다", async () => {
    mockFetch([]);
    await fetchHfModels(hfModelsSrc);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const called = new URL(String(fetchMock.mock.calls[0][0]));
    expect(called.searchParams.get("sort")).toBe("trendingScore");
    expect(called.searchParams.get("limit")).toBe("30");
    expect(called.searchParams.getAll("expand[]")).toEqual(
      expect.arrayContaining(["createdAt", "likes", "downloads", "trendingScore", "safetensors"]),
    );
  });

  it("모델을 RawItem 으로 정규화하고 신호·표시 메타를 engagement 에 싣는다", async () => {
    const createdAt = daysAgo(3);
    mockFetch([
      {
        id: "Qwen/Qwen3-8B",
        createdAt,
        likes: 746,
        downloads: 7412,
        trendingScore: 736,
        pipeline_tag: "text-generation",
        library_name: "transformers",
        tags: ["transformers", "safetensors", "license:apache-2.0", "region:us"],
        safetensors: { total: 8_190_735_360 },
      },
    ]);
    const [item] = await fetchHfModels(hfModelsSrc);
    expect(item).toEqual({
      sourceId: "hf_models",
      url: "https://huggingface.co/Qwen/Qwen3-8B",
      title: "Qwen/Qwen3-8B",
      contentRaw: "text-generation · transformers · 8.2B · apache-2.0",
      publishedAt: createdAt,
      engagement: {
        likes: 746,
        downloads: 7412,
        hf_trending: 736,
        pipeline_tag: "text-generation",
        params: 8_190_735_360,
      },
    });
  });

  it("생성 30일이 지난 모델과 id·createdAt 누락 모델은 제외한다", async () => {
    mockFetch([
      { id: "fresh/model", createdAt: daysAgo(29), likes: 10 },
      { id: "old/model", createdAt: daysAgo(31), likes: 9000 },
      { id: "no/date", likes: 50 },
      { id: "bad/date", createdAt: "not-a-date" },
      { id: "  ", createdAt: daysAgo(1) },
      { createdAt: daysAgo(1), likes: 5 },
    ]);
    const items = await fetchHfModels(hfModelsSrc);
    expect(items.map((i) => i.title)).toEqual(["fresh/model"]);
  });

  it("메타 필드가 없으면 0·생략으로 채우고 contentRaw 는 비운다", async () => {
    mockFetch([{ id: "x/bare", createdAt: daysAgo(1) }]);
    const [item] = await fetchHfModels(hfModelsSrc);
    expect(item.contentRaw).toBeUndefined();
    expect(item.engagement).toEqual({ likes: 0, downloads: 0, hf_trending: 0 });
  });

  it("GGUF 리포는 gguf.total 을 쓰고, 파생 모델은 원본을 밝히며, license:other 는 생략한다", async () => {
    mockFetch([
      {
        id: "unsloth/flint-GGUF",
        createdAt: daysAgo(2),
        pipeline_tag: "text-generation",
        tags: [
          "gguf",
          "base_model:RecursiveSI/flint",
          "base_model:quantized:RecursiveSI/flint",
          "license:other",
        ],
        gguf: { total: 39_785_287_456 },
      },
    ]);
    const [item] = await fetchHfModels(hfModelsSrc);
    expect(item.contentRaw).toBe("text-generation · 40B · base: RecursiveSI/flint (quantized)");
    expect(item.engagement?.params).toBe(39_785_287_456);
  });

  it("HTTP 오류 시 throw", async () => {
    mockFetch({}, false, 429);
    await expect(fetchHfModels(hfModelsSrc)).rejects.toThrow("HuggingFace models HTTP 429");
  });
});

describe("formatParams", () => {
  it("파라미터 수를 B/M/T 단위로 줄여 쓴다(10 미만은 소수 1자리)", () => {
    expect(formatParams(763_205_315_794)).toBe("763B");
    expect(formatParams(1_728_801_536)).toBe("1.7B");
    expect(formatParams(4_000_000_000)).toBe("4B");
    expect(formatParams(859_922_360)).toBe("860M");
    expect(formatParams(1_200_000_000_000)).toBe("1.2T");
  });

  it("없거나 1M 미만이면 표기하지 않는다", () => {
    expect(formatParams(undefined)).toBeUndefined();
    expect(formatParams(0)).toBeUndefined();
    expect(formatParams(500_000)).toBeUndefined();
  });
});
