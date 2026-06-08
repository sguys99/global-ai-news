// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceConfig } from "../../scripts/lib/collect/rss";

const src: SourceConfig = {
  id: "reddit_localllama",
  name: "r/LocalLLaMA",
  kind: "reddit",
  url: "r/LocalLLaMA",
  enabled: 1,
};

const tokenResponse = {
  ok: true,
  status: 200,
  json: async () => ({ access_token: "tok123", expires_in: 3600 }),
};

const listingResponse = (children: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ data: { children } }),
});

// 모듈 레벨 토큰 캐시를 매 테스트마다 초기화하기 위해 fresh import 한다.
async function freshModule() {
  vi.resetModules();
  return import("../../scripts/lib/collect/reddit");
}

beforeEach(() => {
  process.env.REDDIT_CLIENT_ID = "id";
  process.env.REDDIT_CLIENT_SECRET = "secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.REDDIT_CLIENT_ID;
  delete process.env.REDDIT_CLIENT_SECRET;
});

describe("parseSubreddit", () => {
  it("슬러그와 전체 URL 모두에서 서브레딧을 추출한다", async () => {
    const { parseSubreddit } = await freshModule();
    expect(parseSubreddit("r/LocalLLaMA")).toBe("LocalLLaMA");
    expect(parseSubreddit("https://reddit.com/r/OpenAI/")).toBe("OpenAI");
  });
});

describe("fetchReddit", () => {
  it("토큰 발급 후 글을 RawItem 으로 매핑한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(
        listingResponse([
          {
            data: {
              title: "Post 1",
              url: "https://ext.link/1",
              created_utc: 1735689600,
              ups: 200,
              num_comments: 40,
            },
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchReddit } = await freshModule();
    const items = await fetchReddit(src);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://ext.link/1",
      title: "Post 1",
      engagement: { ups: 200, num_comments: 40 },
    });
    expect(fetchMock.mock.calls[0][0]).toContain("access_token");
    expect(fetchMock.mock.calls[1][0]).toContain("/r/LocalLLaMA/top");
  });

  it("stickied 글은 스킵한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse)
        .mockResolvedValueOnce(
          listingResponse([
            {
              data: {
                title: "pinned",
                created_utc: 1735689600,
                stickied: true,
              },
            },
          ]),
        ),
    );
    const { fetchReddit } = await freshModule();
    expect(await fetchReddit(src)).toHaveLength(0);
  });

  it("자격증명이 없으면 throw 한다", async () => {
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
    const { fetchReddit } = await freshModule();
    await expect(fetchReddit(src)).rejects.toThrow("REDDIT_CLIENT_ID/SECRET not configured");
  });
});
