// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  feedToRawItems,
  fetchRss,
  parseFeedDate,
  type SourceConfig,
} from "../../scripts/lib/collect/rss";

const src: SourceConfig = {
  id: "feed",
  name: "Feed",
  kind: "rss",
  url: "https://example.com",
  enabled: 1,
};
const NOW = Date.parse("2026-10-05T00:00:00Z");
const kr: SourceConfig = { ...src, id: "aitimes", region: "kr" };

describe("parseFeedDate", () => {
  const iso = (raw: string, region?: "kr") => parseFeedDate(raw, region)?.toISOString();

  it("시간대 없는 ndsoft 형식(AI타임스·로봇신문 pubDate)은 한국 매체면 KST(+09:00)로 읽는다", () => {
    // 2026-11-06 AI타임스 RSS 원문 — 기사 페이지 article:published_time 은 2026-11-06T09:00:00+09:00
    expect(iso("2026-11-06 09:00:00", "kr")).toBe("2026-11-06T00:00:00.000Z");
    expect(iso("2026-11-06 05:54:41", "kr")).toBe("2026-11-05T20:54:41.000Z");
    expect(iso(" 2026-11-06 09:17:36 ", "kr")).toBe("2026-11-06T00:17:36.000Z");
    expect(iso("2026-11-06T09:00", "kr")).toBe("2026-11-06T00:00:00.000Z");
    expect(iso("2026-11-06", "kr")).toBe("2026-11-05T15:00:00.000Z");
  });

  it("시간대 없는 값은 해외 소스면 실행 환경과 무관하게 UTC 로 읽는다", () => {
    expect(iso("2026-11-06 09:00:00")).toBe("2026-11-06T09:00:00.000Z");
    expect(iso("Fri, 6 Nov 2026 09:33:03")).toBe("2026-11-06T09:33:03.000Z");
    expect(iso("Fri, 6 Nov 2026 09:33:03", "kr")).toBe("2026-11-06T00:33:03.000Z");
  });

  it("시간대가 적힌 값은 지역과 무관하게 그대로 해석한다", () => {
    // 전자신문·바이라인네트워크·GeekNews 원문
    expect(iso("Fri, 6 Nov 2026 09:33:03 +0900", "kr")).toBe("2026-11-06T00:33:03.000Z");
    expect(iso("Thu, 05 Nov 2026 21:29:58 +0000", "kr")).toBe("2026-11-05T21:29:58.000Z");
    expect(iso("2026-11-06T08:49:21+09:00")).toBe("2026-11-05T23:49:21.000Z");
    expect(iso("Sun, 04 Oct 2026 06:00:00 GMT", "kr")).toBe("2026-10-04T06:00:00.000Z");
    expect(iso("2026-11-06T00:00:00.000Z", "kr")).toBe("2026-11-06T00:00:00.000Z");
  });

  it("해석할 수 없으면 null", () => {
    expect(parseFeedDate("어제", "kr")).toBeNull();
    expect(parseFeedDate("")).toBeNull();
  });
});

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

  it("한국 매체의 시간대 없는 pubDate 는 rss-parser isoDate(실행 환경 시간대) 대신 KST 로 읽는다", () => {
    // UTC 러너에서 rss-parser 가 만든 isoDate(9시간 미래)를 무시한다.
    const items = feedToRawItems(
      {
        items: [
          {
            link: "https://www.aitimes.com/news/articleView.html?idxno=1",
            title: "기사",
            pubDate: "2026-10-04 17:50:00",
            isoDate: "2026-10-04T17:50:00.000Z",
          },
        ],
      },
      kr,
      NOW,
    );
    expect(items[0].publishedAt).toBe("2026-10-04T08:50:00.000Z");
  });

  it("수집 시각보다 1시간 넘게 미래인 발행 시각은 수집 시각으로 깎는다", () => {
    const items = feedToRawItems(
      {
        items: [
          { link: "https://a.com/soon", title: "soon", pubDate: "2026-10-05T00:30:00Z" },
          { link: "https://a.com/future", title: "future", pubDate: "2026-10-05T09:00:00Z" },
        ],
      },
      src,
      NOW,
    );
    expect(items.map((i) => i.publishedAt)).toEqual([
      "2026-10-05T00:30:00.000Z",
      "2026-10-05T00:00:00.000Z",
    ]);
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

  it("ndsoft 형식 피드(AI타임스)를 파싱하면 pubDate 를 KST 로 저장한다", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel><title>AI타임스</title>
        <lastBuildDate>2026-10-04 09:17:36</lastBuildDate>
        <item><title>새 소식</title><link>https://www.aitimes.com/news/articleView.html?idxno=2</link>
          <pubDate>2026-10-04 09:00:00</pubDate></item>
      </channel></rss>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(xml)));
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      const items = await fetchRss(kr);
      expect(items[0].publishedAt).toBe("2026-10-04T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("실패 응답은 본문을 정리(cancel)한 뒤 Status code 로 reject 한다 — 열린 소켓이 프로세스를 붙잡지 않게", async () => {
    const res = new Response("<html>forbidden</html>", { status: 403 });
    const cancel = vi.spyOn(res.body!, "cancel");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    await expect(fetchRss(src)).rejects.toThrow("Status code 403");
    expect(cancel).toHaveBeenCalled();
  });
});
