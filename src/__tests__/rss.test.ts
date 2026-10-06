// @vitest-environment node
import { describe, expect, it } from "vitest";
import { feedToRawItems, type SourceConfig } from "../../scripts/lib/collect/rss";

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
