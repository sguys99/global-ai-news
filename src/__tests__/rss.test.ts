// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { feedToRawItems, fetchRss, type SourceConfig } from "../../scripts/lib/collect/rss";

const src: SourceConfig = {
  id: "feed",
  name: "Feed",
  kind: "rss",
  url: "https://example.com",
  enabled: 1,
};
const NOW = Date.parse("2026-10-05T00:00:00Z");

describe("feedToRawItems", () => {
  it("7일 기간 창 밖의 항목은 제외한다", () => {
    const items = feedToRawItems(
      {
        items: [
          { link: "https://a.com/new", title: "new", isoDate: "2026-10-04T00:00:00Z" },
          { link: "https://a.com/old", title: "old", isoDate: "2026-09-20T00:00:00Z" },
        ],
      },
      src,
      NOW,
    );
    expect(items.map((i) => i.url)).toEqual(["https://a.com/new"]);
  });

  it("항목 날짜가 없으면 채널 pubDate 로 대체하고, 둘 다 없으면 스킵한다", () => {
    const withFeedDate = feedToRawItems(
      {
        pubDate: "Sun, 04 Oct 2026 06:00:00 GMT",
        items: [{ link: "https://github.com/a/b", title: "a/b" }],
      },
      src,
      NOW,
    );
    expect(withFeedDate).toHaveLength(1);
    expect(withFeedDate[0].publishedAt).toBe("2026-10-04T06:00:00.000Z");

    expect(
      feedToRawItems({ items: [{ link: "https://github.com/a/b", title: "a/b" }] }, src, NOW),
    ).toEqual([]);
  });
});

describe("fetchRss", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 로 받은 피드 본문을 파싱해 RawItem 으로 정규화한다", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel><title>Feed</title>
        <item><title>새 소식</title><link>https://a.com/new</link>
          <pubDate>${new Date().toUTCString()}</pubDate></item>
      </channel></rss>`;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const items = await fetchRss(src);
    expect(fetchMock).toHaveBeenCalledWith(
      src.url,
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourceId: "feed",
      url: "https://a.com/new",
      title: "새 소식",
    });
  });

  it("실패 응답은 본문을 정리(cancel)한 뒤 Status code 로 reject 한다 — 열린 소켓이 프로세스를 붙잡지 않게", async () => {
    const res = new Response("<html>forbidden</html>", { status: 403 });
    const cancel = vi.spyOn(res.body!, "cancel");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    await expect(fetchRss(src)).rejects.toThrow("Status code 403");
    expect(cancel).toHaveBeenCalled();
  });
});
