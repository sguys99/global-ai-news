import { beforeEach, describe, expect, it, vi } from "vitest";
import { articleEnrichmentSchema } from "../../scripts/lib/schema";
import type { RawItem } from "@/lib/types";

// AI SDK 를 모킹해 실제 API 호출 없이 가공/재시도 로직만 검증한다.
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: () => ({ model: "mock" }),
}));
vi.mock("ai", () => ({ generateObject: vi.fn() }));

import { generateObject } from "ai";
import { enrichArticle } from "../../scripts/lib/enrich";

const mockGen = vi.mocked(generateObject);

const item: RawItem = {
  sourceId: "s",
  url: "https://example.com/a",
  title: "Sample title",
  contentRaw: "Some content",
  publishedAt: new Date("2026-01-01").toISOString(),
};

const validObject = {
  title_ko: "샘플 제목",
  summary_ko: "요약입니다.",
  category: "Agents",
  tags: ["agent", "llm"],
  importance: 3,
};

const ok = {
  object: validObject,
  usage: { promptTokens: 1200, completionTokens: 150 },
};

beforeEach(() => {
  mockGen.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("enrichArticle", () => {
  it("정상 출력 시 enrichment + usage 를 매핑해 반환한다", async () => {
    mockGen.mockResolvedValueOnce(ok as never);
    const result = await enrichArticle(item);
    expect(result?.enrichment).toEqual(validObject);
    expect(result?.usage).toEqual({ inputTokens: 1200, outputTokens: 150 });
    expect(mockGen).toHaveBeenCalledTimes(1);
  });

  it("1회 실패 후 재시도에 성공하면 결과를 반환한다", async () => {
    mockGen
      .mockRejectedValueOnce(new Error("schema validation failed"))
      .mockResolvedValueOnce(ok as never);
    const result = await enrichArticle(item);
    expect(result?.enrichment).toEqual(validObject);
    expect(mockGen).toHaveBeenCalledTimes(2);
  });

  it("2회 모두 실패하면 null 을 반환한다(throw 하지 않음)", async () => {
    mockGen.mockRejectedValue(new Error("api error"));
    const result = await enrichArticle(item);
    expect(result).toBeNull();
    expect(mockGen).toHaveBeenCalledTimes(2);
  });
});

describe("articleEnrichmentSchema", () => {
  it("category enum 외 값은 검증 실패", () => {
    const bad = { ...validObject, category: "Invalid Category" };
    expect(articleEnrichmentSchema.safeParse(bad).success).toBe(false);
  });

  it("tags 는 1~5개만 허용", () => {
    expect(articleEnrichmentSchema.safeParse({ ...validObject, tags: [] }).success).toBe(false);
    expect(
      articleEnrichmentSchema.safeParse({
        ...validObject,
        tags: ["a", "b", "c", "d", "e", "f"],
      }).success,
    ).toBe(false);
  });

  it("정상 객체는 통과", () => {
    expect(articleEnrichmentSchema.safeParse(validObject).success).toBe(true);
  });
});
