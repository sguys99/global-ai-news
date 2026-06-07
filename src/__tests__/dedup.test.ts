import { describe, expect, it } from "vitest";
import { dedupKey, normalizeUrl } from "../../scripts/lib/dedup";

describe("normalizeUrl", () => {
  it("소문자화한다", () => {
    expect(normalizeUrl("HTTPS://Example.COM/Path")).toBe(
      "https://example.com/path",
    );
  });

  it("utm_* / ref 트래킹 쿼리를 제거한다", () => {
    expect(
      normalizeUrl("https://example.com/a?utm_source=x&ref=y&id=1"),
    ).toBe("https://example.com/a?id=1");
  });

  it("트레일링 슬래시를 제거한다", () => {
    expect(normalizeUrl("https://example.com/a/")).toBe(
      "https://example.com/a",
    );
  });

  it("쿼리 순서와 무관하게 동일하게 정규화한다", () => {
    expect(normalizeUrl("https://example.com/a?b=2&a=1")).toBe(
      normalizeUrl("https://example.com/a?a=1&b=2"),
    );
  });
});

describe("dedupKey", () => {
  it("정규화 결과가 같으면 동일한 키", () => {
    expect(dedupKey("https://example.com/a/?utm_source=x")).toBe(
      dedupKey("https://EXAMPLE.com/a"),
    );
  });

  it("다른 URL 은 다른 키", () => {
    expect(dedupKey("https://example.com/a")).not.toBe(
      dedupKey("https://example.com/b"),
    );
  });

  it("sha256 16진 64자", () => {
    expect(dedupKey("https://example.com/a")).toMatch(/^[0-9a-f]{64}$/);
  });
});
