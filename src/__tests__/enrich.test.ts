// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  articleFields,
  buildEnrichRequests,
  CHUNK_SIZE,
  enrichFormat,
  estimateEnrichTokens,
  resolveEnrichments,
  readCategoryGuide,
  readFewShot,
  splitTopics,
  type EnrichInput,
} from "../../scripts/lib/enrich";
import { approxTokens, outputFormatTokens } from "../../scripts/lib/cost";
import { articleEnrichmentSchema, CATEGORIES } from "../../scripts/lib/schema";
import { FORMAT_LABELS, FORMATS, type Format } from "../../src/lib/labels";

const input = (id: number, format: Format = "news"): EnrichInput => ({
  id,
  sourceName: "TechCrunch",
  format,
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

  it("기사 블록에 [형식] 줄이 id 바로 다음에 실린다(형식별 요약 가이드 선택용)", () => {
    const [chunk] = buildEnrichRequests([input(1, "oss"), input(2, "model"), input(3)], "m");
    const user = chunk.request.params.messages[0].content as string;
    expect(user).toContain("### id=1\n[형식] 오픈소스\n[출처] TechCrunch\n[제목] Title 1");
    expect(user).toContain("### id=2\n[형식] 모델\n");
    expect(user).toContain("### id=3\n[형식] 뉴스\n");
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

  it("입력 추정치에 구조화 출력 스키마 몫이 든다", () => {
    const [one] = buildEnrichRequests([input(1)], "m");
    const text =
      (one.request.params.system as string) +
      one.request.params.messages.map((m) => m.content).join("");
    expect(estimateEnrichTokens(one).input).toBe(
      approxTokens(text) + outputFormatTokens(enrichFormat),
    );
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

  it("Physical AI 최우선·규칙 우선순위가 분야 정의에 명시된다", () => {
    const guide = readCategoryGuide();
    expect(guide).toContain("Physical AI 최우선");
    expect(guide).toContain("번호가 앞선 규칙이 우선");
  });

  it("agent 는 에이전트 자체가 주제일 때만 — 에이전트가 쓰거나 겨냥한 도구는 agent 가 아니다", () => {
    const guide = readCategoryGuide();
    expect(guide).toContain("주제가 **에이전트 자체**일 때만 `agent`");
    expect(guide).toContain("에이전트가 **쓰는** 도구나 에이전트를 **겨냥한** 도구");
    const [chunk] = buildEnrichRequests([input(1)], "m");
    expect(chunk.request.params.system as string).toContain(
      "에이전트가 쓰거나 에이전트를 겨냥한 도구(보안 스캐너·영상 엔진 등) 저장소와 그 밖의 저장소 → `oss`",
    );
  });

  it("리포 가이드: [토픽]만 보고 기능·연동을 단정하지 않는다", () => {
    const [chunk] = buildEnrichRequests([input(1)], "m");
    const system = chunk.request.params.system as string;
    expect(system).toContain('[토픽]만 보고 "~를 활용한다·지원한다"고 쓰지 않는다');
    expect(system).toContain("[토픽]은 분야·태그를 고르는 단서일 뿐 기능·연동의 근거가 아니다");
  });

  it("시스템 프롬프트에 형식과 분야의 관계·형식별 요약 가이드가 실린다", () => {
    const [chunk] = buildEnrichRequests([input(1)], "m");
    const system = chunk.request.params.system as string;
    expect(system).toContain("## 형식과 분야");
    expect(system).toContain("## 형식별 요약 가이드");
    for (const f of FORMATS) expect(system).toContain(`- **${FORMAT_LABELS[f]}**`);
  });
});

describe("few-shot 예시", () => {
  const fewshot = readFewShot();

  it("6건이고 4개 형식을 모두 다루며, 출력은 가공 스키마(새 분야 키)를 통과한다", () => {
    expect(fewshot).toHaveLength(6);
    expect(new Set(fewshot.map((ex) => ex.input.format))).toEqual(new Set(FORMATS));
    for (const ex of fewshot) {
      expect(FORMATS).toContain(ex.input.format);
      expect(CATEGORIES).toContain(ex.output.category);
      expect(ex.output.title_ko.length).toBeLessThanOrEqual(60);
      expect(articleEnrichmentSchema.safeParse(ex.output).success).toBe(true);
    }
  });

  it("Physical AI 뉴스·GitHub 저장소·HF 모델 예시가 있다", () => {
    const pairs = fewshot.map((ex) => `${ex.input.format}:${ex.output.category}`);
    expect(pairs).toContain("news:physical");
    expect(pairs).toContain("oss:oss");
    expect(pairs).toContain("model:llm");
  });

  it("예시 입력은 실제 기사 블록과 같은 모양([형식] 줄 포함)으로 시스템 프롬프트에 실린다", () => {
    const [chunk] = buildEnrichRequests([input(1)], "m");
    const system = chunk.request.params.system as string;
    for (const [i, ex] of fewshot.entries())
      expect(system).toContain(
        `### 예시 ${i + 1}\n입력:\n[형식] ${FORMAT_LABELS[ex.input.format]}\n[출처] ${ex.input.source}\n`,
      );
  });
});

describe("GitHub 토픽 분리 ([토픽] 줄)", () => {
  const TOPIC_NOTE = "(분류·태그용 키워드 — 기능·지원 근거 아님)";

  it("splitTopics: 끝의 `· topics: a, b` 만 떼어 낸다", () => {
    expect(splitTopics("A video engine, made for agents. · topics: agents, mcp, wgpu")).toEqual({
      body: "A video engine, made for agents.",
      topics: "agents, mcp, wgpu",
    });
    // 설명 없이 토픽만(githubSummary 는 구분자 없이 "topics: …" 로 시작한다).
    expect(splitTopics("topics: llm, rag")).toEqual({ body: "", topics: "llm, rag" });
    // 토픽 없음·설명 안의 문구·슬러그가 아닌 꼬리는 그대로.
    expect(splitTopics("Plain description")).toEqual({ body: "Plain description", topics: null });
    expect(splitTopics("We discuss topics: Safety and Alignment")).toEqual({
      body: "We discuss topics: Safety and Alignment",
      topics: null,
    });
  });

  it("articleFields: 토픽이 있으면 [제목] 다음 [토픽] 줄, [본문]은 설명만", () => {
    expect(
      articleFields("oss", "GitHub Trending", "a/b", "Video engine. · topics: agents, mcp"),
    ).toBe(
      `[형식] 오픈소스\n[출처] GitHub Trending\n[제목] a/b\n[토픽] agents, mcp ${TOPIC_NOTE}\n[본문]\nVideo engine.`,
    );
    expect(articleFields("oss", "S", "a/b", "topics: llm")).toBe(
      `[형식] 오픈소스\n[출처] S\n[제목] a/b\n[토픽] llm ${TOPIC_NOTE}\n[본문]\n(본문 없음)`,
    );
  });

  it("articleFields: 토픽이 없으면 [토픽] 줄이 없다(뉴스·논문 등)", () => {
    expect(articleFields("news", "S", "T", "Body")).toBe(
      "[형식] 뉴스\n[출처] S\n[제목] T\n[본문]\nBody",
    );
  });

  it("가공 요청과 few-shot 리포 예시 모두 [토픽] 줄로 실린다", () => {
    const repo: EnrichInput = {
      ...input(7, "oss"),
      item: { ...input(7).item, contentRaw: "Desc here · topics: ai-agents, mcp" },
    };
    const [chunk] = buildEnrichRequests([repo], "m");
    const user = chunk.request.params.messages[0].content as string;
    expect(user).toContain(`[토픽] ai-agents, mcp ${TOPIC_NOTE}\n[본문]\nDesc here`);
    expect(user).not.toContain("topics:");

    const system = chunk.request.params.system as string;
    const ossExample = readFewShot().find((ex) => ex.input.format === "oss")!;
    const { body, topics } = splitTopics(ossExample.input.content);
    expect(topics).not.toBeNull();
    expect(system).toContain(`[토픽] ${topics} ${TOPIC_NOTE}\n[본문]\n${body}`);
    expect(system).not.toContain("· topics:");
  });
});
