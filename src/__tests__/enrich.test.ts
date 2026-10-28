// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEnrichRequests,
  CHUNK_SIZE,
  enrichFormat,
  estimateEnrichTokens,
  resolveEnrichments,
  readCategoryGuide,
  type EnrichInput,
} from "../../scripts/lib/enrich";
import { articleEnrichmentSchema, CATEGORIES } from "../../scripts/lib/schema";

const input = (id: number): EnrichInput => ({
  id,
  sourceName: "TechCrunch",
  item: {
    sourceId: "techcrunch_ai",
    url: `https://example.com/${id}`,
    title: `Title ${id}`,
    contentRaw: `Body ${id}`,
    publishedAt: "2026-10-06T00:00:00Z",
  },
});

const enrichment = {
  title_ko: "샘플 제목",
  summary_ko: "요약입니다.",
  category: "agent" as const,
  tags: ["agent", "llm"],
};

describe("buildEnrichRequests", () => {
  it(`기사를 ${CHUNK_SIZE}건씩 묶어 요청을 만들고, 순서와 id 를 유지한다`, () => {
    const chunks = buildEnrichRequests(
      Array.from({ length: 25 }, (_, i) => input(i + 100)),
      "claude-haiku-4-5",
    );
    expect(chunks.map((c) => c.ids.length)).toEqual([10, 10, 5]);
    expect(chunks[0].ids[0]).toBe(100);
    expect(chunks.map((c) => c.request.id)).toEqual(["enrich-0", "enrich-1", "enrich-2"]);

    const { params } = chunks[2].request;
    expect(params.model).toBe("claude-haiku-4-5");
    expect(params.output_config?.format?.type).toBe("json_schema");
    const user = params.messages[0].content as string;
    expect(user).toContain("### id=120");
    expect(user).toContain("[출처] TechCrunch");
    expect(user).not.toContain("### id=119");
  });

  it("출력 상한은 기사 수에 비례한다", () => {
    const [one] = buildEnrichRequests([input(1)], "m");
    const [ten] = buildEnrichRequests(
      Array.from({ length: 10 }, (_, i) => input(i)),
      "m",
    );
    expect(ten.request.params.max_tokens).toBeGreaterThan(one.request.params.max_tokens);
  });

  it("시스템 프롬프트는 요청당 한 번 — 기사 수가 늘어도 입력 추정치는 기사 몫만 는다", () => {
    const [one] = buildEnrichRequests([input(1)], "m");
    const [ten] = buildEnrichRequests(
      Array.from({ length: 10 }, (_, i) => input(i)),
      "m",
    );
    const a = estimateEnrichTokens(one);
    const b = estimateEnrichTokens(ten);
    expect(b.input).toBeLessThan(a.input * 2);
    expect(b.output).toBe(a.output * 10);
  });
});

describe("resolveEnrichments", () => {
  it("요청한 id 만, id 당 첫 결과만 취하고 id 필드는 떼어 낸다", () => {
    const out = resolveEnrichments(
      {
        articles: [
          { id: 1, ...enrichment },
          { id: 1, ...enrichment, title_ko: "중복" },
          { id: 99, ...enrichment },
        ],
      },
      [1, 2],
    );
    expect([...out.keys()]).toEqual([1]);
    expect(out.get(1)).toEqual(enrichment);
  });
});

describe("스키마 검증", () => {
  it("enrichFormat.parse 는 구조화 출력 JSON 을 검증한다", () => {
    const ok = JSON.stringify({ articles: [{ id: 3, ...enrichment }] });
    expect(enrichFormat.parse(ok).articles[0].id).toBe(3);
    const bad = JSON.stringify({ articles: [{ id: 3, ...enrichment, category: "Nope" }] });
    expect(() => enrichFormat.parse(bad)).toThrow();
  });

  it("category enum 외 값·태그 0개/6개는 실패", () => {
    expect(articleEnrichmentSchema.safeParse({ ...enrichment, category: "X" }).success).toBe(false);
    // 분야 개편 전 구 값은 더 이상 출력 enum 이 아니다
    expect(articleEnrichmentSchema.safeParse({ ...enrichment, category: "Agents" }).success).toBe(
      false,
    );
    expect(articleEnrichmentSchema.safeParse({ ...enrichment, tags: [] }).success).toBe(false);
    expect(
      articleEnrichmentSchema.safeParse({ ...enrichment, tags: ["a", "b", "c", "d", "e", "f"] })
        .success,
    ).toBe(false);
    expect(articleEnrichmentSchema.safeParse(enrichment).success).toBe(true);
  });
});

describe("분야 정의 프롬프트", () => {
  it("시스템 프롬프트에 분야 정의(categories.md)가 치환돼 6개 키가 모두 실린다", () => {
    const [chunk] = buildEnrichRequests([input(1)], "m");
    const system = chunk.request.params.system as string;
    expect(system).not.toContain("{{CATEGORIES}}");
    expect(system).toContain(readCategoryGuide());
    for (const key of CATEGORIES) expect(readCategoryGuide()).toContain(`**${key}**`);
  });

  it("few-shot 예시 출력은 가공 스키마(새 분야 키)를 통과한다", () => {
    const fewshot = JSON.parse(
      readFileSync(path.join(process.cwd(), "configs/prompts/enrich.fewshot.json"), "utf-8"),
    ) as { output: unknown }[];
    for (const ex of fewshot)
      expect(articleEnrichmentSchema.safeParse(ex.output).success).toBe(true);
  });
});
