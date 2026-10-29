// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGithub,
  fetchHf,
  fetchHfModels,
  fetchHn,
  formatParams,
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

describe("fetchGithub", () => {
  it("repo 를 RawItem 으로 정규화하고 stars 를 engagement 에 넣는다", async () => {
    mockFetch({
      items: [
        {
          html_url: "https://github.com/x/y",
          full_name: "x/y",
          description: "An <b>LLM</b> tool",
          stargazers_count: 999,
          pushed_at: "2026-01-02T00:00:00Z",
        },
      ],
    });
    const items = await fetchGithub(src("github"));
    expect(items[0]).toMatchObject({
      url: "https://github.com/x/y",
      title: "x/y",
      contentRaw: "An LLM tool",
      engagement: { stars: 999 },
    });
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
