// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGithub, fetchHf, fetchHn } from "../../scripts/lib/collect/api";
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
