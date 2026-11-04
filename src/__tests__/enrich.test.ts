// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  articleFields,
  buildEnrichRequests,
  CHUNK_SIZE,
  emptyEnrichGuardTally,
  enrichEvidence,
  enrichFormat,
  enrichGuardNotes,
  estimateEnrichTokens,
  guardEnrichment,
  inputExcerpt,
  MAX_INPUT_CHARS,
  readCategoryGuide,
  readEnglishGuide,
  readFewShot,
  resolveEnglish,
  resolveEnrichments,
  splitTopics,
  TITLE_KO_HARD_LIMIT,
  TITLE_KO_LIMIT,
  type EnrichInput,
} from "../../scripts/lib/enrich";
import { approxTokens, outputFormatTokens } from "../../scripts/lib/cost";
import { dropRepeats } from "../../scripts/lib/repeatCheck";
import { applySameEventMerges } from "../../scripts/lib/sameEvent";
import type { Pick } from "../../scripts/lib/triage";
import { parseEnglishNotes } from "../../src/lib/englishKpi";
import {
  articleEnrichmentSchema,
  CATEGORIES,
  enrichBatchParseSchema,
} from "../../scripts/lib/schema";
import { FORMAT_LABELS, FORMATS, type Format } from "../../src/lib/labels";
import { PROMPTS_DIR } from "../../src/lib/paths";

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
  title_en: "Sample headline for the English edition",
  summary_en: "A sample English summary.",
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

  it("출력 상한은 기사 수에 비례한다 — 영어 필드 몫까지 10건 묶음 5,700토큰", () => {
    const [one] = buildEnrichRequests([input(1)], "m");
    const [ten] = buildEnrichRequests(
      Array.from({ length: 10 }, (_, i) => input(i)),
      "m",
    );
    expect(ten.request.params.max_tokens).toBeGreaterThan(one.request.params.max_tokens);
    expect(one.request.params.max_tokens).toBe(200 + 550);
    expect(ten.request.params.max_tokens).toBe(200 + 10 * 550);
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

describe("영어 규칙·용어집", () => {
  const korean = (id: number, title: string, body: string): EnrichInput => ({
    ...input(id),
    sourceName: "AI타임스",
    item: { ...input(id).item, title, contentRaw: body },
  });

  it("시스템 프롬프트에 영어 규칙(english.md)과 성씨·계급 고정 표가 실리고, 용어집 항목 전체는 싣지 않는다", () => {
    const [chunk] = buildEnrichRequests([input(1)], "m");
    const system = chunk.request.params.system as string;
    expect(system).not.toContain("{{ENGLISH}}");
    expect(system).toContain("## 영어 제목·요약 (title_en·summary_en)");
    expect(system).toContain(readEnglishGuide());
    const rules = readFileSync(path.join(PROMPTS_DIR, "english.md"), "utf-8").trim();
    expect(readEnglishGuide().startsWith(rules)).toBe(true);
    expect(system).toContain("- Military ranks: 대장 → General");
    expect(system).toContain("- Family names (usual spellings): 김 Kim");
    expect(system).not.toContain("앤트로픽 → Anthropic");
    // 문자열 치환 패턴(`$&` 등)에 금액이 깨지지 않는다.
    expect(system).toContain("$900 billion");
  });

  it("english.md 는 용어집이 유저 메시지 [용어집] 블록에 있다고 가리킨다", () => {
    const guide = readEnglishGuide();
    expect(guide).toContain("[용어집]");
    expect(guide).not.toContain("glossary below");
  });

  it("시스템 프롬프트는 묶음 내용과 무관하게 같다", () => {
    const [a] = buildEnrichRequests([input(1)], "m");
    const [b] = buildEnrichRequests([korean(2, "앤트로픽, 새 모델", "국감에서 방통위가")], "m");
    expect(a.request.params.system).toBe(b.request.params.system);
  });

  it("묶음 입력에 키가 나온 용어집 항목만 유저 메시지 끝 [용어집] 블록으로 붙는다", () => {
    const [chunk] = buildEnrichRequests(
      [input(1), korean(2, "앤트로픽, 클로드 신모델 공개", "과기정통부는 3일 밝혔다.")],
      "m",
    );
    const user = chunk.request.params.messages[0].content as string;
    const block = user.slice(user.indexOf("### [용어집]"));
    expect(user.indexOf("### [용어집]")).toBeGreaterThan(user.indexOf("### id=2"));
    expect(block).toContain("- 앤트로픽 → Anthropic");
    expect(block).toContain("- 클로드 → Claude");
    expect(block).toContain(
      "- 과학기술정보통신부 · 과기정통부 → Ministry of Science and ICT (MSIT)",
    );
    expect(block).not.toContain("오픈AI");
    expect(chunk.glossaryEntries).toBe(block.split("\n- ").length - 1);
  });

  it("출처 매체명은 용어집 대조에 쓰지 않고, 고른 항목이 없으면 블록이 없다", () => {
    const [chunk] = buildEnrichRequests([{ ...input(1), sourceName: "네이버 블로그" }], "m");
    expect(chunk.request.params.messages[0].content as string).not.toContain("[용어집]");
    expect(chunk.glossaryEntries).toBe(0);
  });

  it("용어집 블록도 입력 추정치에 든다", () => {
    const plain = buildEnrichRequests([korean(1, "새 모델", "본문")], "m")[0];
    const named = buildEnrichRequests([korean(1, "앤트로픽 새 모델", "본문")], "m")[0];
    expect(estimateEnrichTokens(named).input).toBeGreaterThan(estimateEnrichTokens(plain).input);
  });
});

describe("영어 근거·저장값", () => {
  it("enrichEvidence: 원문 제목 + 모델에 준 발췌(MAX_INPUT_CHARS 로 자름, 토픽 꼬리 포함)", () => {
    const long = { ...input(1).item, contentRaw: "x".repeat(MAX_INPUT_CHARS + 50) };
    expect(enrichEvidence(long)).toEqual({
      title: "Title 1",
      content: "x".repeat(MAX_INPUT_CHARS),
    });
    expect(inputExcerpt({ ...long, contentRaw: undefined })).toBe("");
    const repo = { ...input(1).item, contentRaw: "Desc · topics: llm, gpt-4" };
    expect(enrichEvidence(repo).content).toBe("Desc · topics: llm, gpt-4");
  });
});

describe("resolveEnglish — 영어 품질 검사(Phase 1-3) 연결", () => {
  const OK_TITLE = "OpenAI raises $11 billion of its $30 billion target";
  const OK_SUMMARY =
    "OpenAI raised $11 billion, short of its $30 billion goal. The company plans to spend it on compute.";
  const evidence = { title: OK_TITLE, content: "OpenAI raised $11 billion, short of $30 billion." };
  const article = (id: number, over: Partial<typeof enrichment> = {}) => ({
    id,
    enrichment: {
      ...enrichment,
      title_ko: "오픈AI, 300억 달러 목표 중 110억 달러 조달",
      summary_ko: "오픈AI가 110억 달러를 조달했다.",
      title_en: OK_TITLE,
      summary_en: OK_SUMMARY,
      ...over,
    },
    evidence,
  });

  it("통과하면 앞뒤 공백만 다듬어 저장하고, 기각하면 그 기사의 영어만 둘 다 null", () => {
    const out = resolveEnglish([
      article(1, { title_en: `  ${OK_TITLE} `, summary_en: `${OK_SUMMARY}\n` }),
      article(2, { title_en: "OpenAI raises funds from 소프트뱅크 group" }),
      article(3, { title_en: "OpenAI raises $11 million of its $30 billion target" }),
      article(4, { summary_en: "  " }),
      article(5, { title_en: "" }),
    ]);
    expect(out.status).toBe("ok");
    expect(out.fields.get(1)).toEqual({ titleEn: OK_TITLE, summaryEn: OK_SUMMARY });
    for (const id of [2, 3, 4, 5]) {
      expect(out.fields.get(id)).toEqual({ titleEn: null, summaryEn: null });
    }
    expect(out.checks.get(1)?.english).toEqual({ ok: true });
    expect(out.checks.get(2)?.english).toEqual({ ok: false, reason: "hangul", detail: ["title"] });
    expect(out.checks.get(3)?.english).toEqual({
      ok: false,
      reason: "number",
      detail: ["11 million"],
    });
    expect(out.checks.get(4)?.english).toMatchObject({ ok: false, reason: "length" });
    expect(out.checks.get(5)?.english).toMatchObject({ ok: false, reason: "length" });
    expect(out.tally).toMatchObject({
      checked: 5,
      passed: 1,
      rejected: { hangul: 1, number: 1, length: 2 },
    });
    expect(out.notes).toEqual(["영어 가공 1/5건", "영어 기각 4건(한글 1·숫자 1·길이 2)"]);
  });

  it("한국어 숫자 불일치는 경고만 — 한국어·영어 저장값은 그대로이고 notes 에 센다", () => {
    const out = resolveEnglish([
      article(1),
      article(2, { summary_ko: "오픈AI가 11억 달러를 조달했다." }),
    ]);
    expect(out.fields.get(2)).toEqual({ titleEn: OK_TITLE, summaryEn: OK_SUMMARY });
    expect(out.checks.get(1)?.koreanNumbers).toEqual([]);
    expect(out.checks.get(2)?.koreanNumbers).toEqual(["11억"]);
    expect(out.notes).toEqual(["영어 가공 2/2건", "한국어 숫자 불일치 1건(11억)"]);
  });

  it("notes 는 KPI 파서(englishKpi)가 그대로 읽고, 항목 안에 notes 구분자 `;`가 없다", () => {
    const out = resolveEnglish([
      article(1),
      article(2, { title_en: "Short" }),
      article(3, { summary_ko: "오픈AI가 11억 달러를; 조달했다." }),
    ]);
    for (const note of out.notes) expect(note).not.toContain(";");
    expect(parseEnglishNotes(["선정 3건", ...out.notes, "LLM batch 호출 6회"].join("; "))).toEqual({
      checked: 3,
      passed: 2,
      rejected: { hangul: 0, number: 0, length: 1 },
      koreanMismatch: 1,
    });
  });

  it("검사 대상 M = 최종 게재분 — 재보도로 뺀 기사·같은 사건으로 합쳐진 기사는 세지 않는다(collect.ts ④-5 입력)", () => {
    const picks: Pick[] = [0, 1, 2, 3].map((index) => ({ index, importance: 3, duplicates: [] }));
    const enriched = new Map([0, 1, 2, 3].map((i) => [i, article(i).enrichment]));
    // 3 은 재보도, 1 은 0 에 합쳐진다.
    const afterRepeat = dropRepeats(picks, enriched, [3]);
    const merged = applySameEventMerges(afterRepeat.picks, afterRepeat.enriched, [
      {
        representative: 0,
        merged: 1,
        shared: [],
        theme: [],
        score: 9,
        overlap: 1,
        titleShared: [],
        titleScore: 9,
      },
    ]);
    const out = resolveEnglish(
      [...merged.enriched].map(([id, e]) => ({ id, enrichment: e, evidence })),
    );
    expect([...out.fields.keys()]).toEqual([0, 2]);
    expect(out.tally?.checked).toBe(2);
    expect(out.notes[0]).toBe("영어 가공 2/2건");
  });

  it("게재분이 없으면 notes 도 없다", () => {
    const out = resolveEnglish([]);
    expect(out).toMatchObject({ status: "ok", notes: [] });
    expect(out.fields.size).toBe(0);
  });

  it("영어 검사가 예외를 내면 throw 하지 않고 전부 영어 없이 — `영어 검사 실패(영어 비움): …`", () => {
    const out = resolveEnglish([
      article(1),
      // 구조화 출력을 벗어난 값(문자열이 아님)
      article(2, { title_en: 42 as unknown as string }),
    ]);
    expect(out.status).toBe("failed");
    expect(out.fields.get(1)).toEqual({ titleEn: null, summaryEn: null });
    expect(out.fields.get(2)).toEqual({ titleEn: null, summaryEn: null });
    expect(out.tally).toBeNull();
    expect(out.checks.size).toBe(0);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toMatch(/^영어 검사 실패\(영어 비움\): \S/);
    expect(out.notes[0]).not.toContain(";");
    expect(parseEnglishNotes(out.notes.join("; "))).toBeNull();
  });

  it("한국어 숫자 검사가 예외를 내도 영어 검사 결과는 그대로다(경고만 생략)", () => {
    const out = resolveEnglish([article(1), article(2, { summary_ko: 7 as unknown as string })]);
    expect(out.status).toBe("ok");
    expect(out.fields.get(2)).toEqual({ titleEn: OK_TITLE, summaryEn: OK_SUMMARY });
    expect(out.checks.get(2)?.koreanNumbers).toEqual([]);
    expect(out.notes[0]).toBe("영어 가공 2/2건");
    expect(out.notes[1]).toMatch(/^한국어 숫자 검사 실패: /);
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

  it("기사별 확인: 한 기사가 제약을 어겨도 같은 묶음의 나머지는 그대로 남는다", () => {
    const tally = emptyEnrichGuardTally();
    const out = resolveEnrichments(
      {
        articles: [
          { id: 1, ...enrichment },
          { id: 2, ...enrichment, title_ko: "가".repeat(TITLE_KO_HARD_LIMIT + 1) },
          { id: 3, ...enrichment, category: "Nope" },
          { id: 4, ...enrichment, title_ko: "나".repeat(72) },
          { id: 5, ...enrichment, tags: ["a", "b", "c", "d", "e", "f", "g"] },
        ],
      },
      [1, 2, 3, 4, 5],
      tally,
    );
    expect([...out.keys()]).toEqual([1, 4, 5]);
    expect(out.get(1)).toEqual(enrichment);
    expect(out.get(4)?.title_ko).toBe("나".repeat(72));
    expect(out.get(5)?.tags).toEqual(["a", "b", "c", "d", "e"]);
    expect(tally).toEqual({
      titleOver: 1,
      titleOverMax: 72,
      titleRejected: 1,
      categoryRejected: 1,
      tagsTrimmed: 1,
    });
  });

  it("tally 는 묶음마다 누적되고, 기각된 첫 결과 뒤의 같은 id 는 받지 않는다", () => {
    const tally = emptyEnrichGuardTally();
    const long = "가".repeat(TITLE_KO_HARD_LIMIT + 5);
    const a = resolveEnrichments(
      {
        articles: [
          { id: 1, ...enrichment, title_ko: long },
          { id: 1, ...enrichment },
        ],
      },
      [1],
      tally,
    );
    const b = resolveEnrichments(
      { articles: [{ id: 11, ...enrichment, title_ko: "다".repeat(65) }] },
      [11],
      tally,
    );
    expect(a.size).toBe(0);
    expect([...b.keys()]).toEqual([11]);
    expect(tally.titleRejected).toBe(1);
    expect(tally.titleOver).toBe(1);
    expect(tally.titleOverMax).toBe(65);
  });
});

describe("guardEnrichment — 묶음 대신 기사별로 거르는 가공 제약", () => {
  it("정상 출력(제목 60자·분야 키·태그 1~5개)은 값을 바꾸지 않는다", () => {
    for (const e of [
      enrichment,
      { ...enrichment, title_ko: "가".repeat(TITLE_KO_LIMIT), tags: ["a", "b", "c", "d", "e"] },
      ...readFewShot().map((ex) => ex.output),
    ]) {
      const r = guardEnrichment(e);
      expect(r).toEqual({ ok: true, enrichment: e, titleOver: false, tagsTrimmed: false });
      if (r.ok) expect(r.enrichment.tags).toBe(e.tags);
    }
  });

  it(`제목 ${TITLE_KO_LIMIT + 1}~${TITLE_KO_HARD_LIMIT}자는 자르지 않고 게재, 넘으면 그 기사만 기각`, () => {
    const over = guardEnrichment({ ...enrichment, title_ko: "가".repeat(TITLE_KO_HARD_LIMIT) });
    expect(over.ok && over.titleOver).toBe(true);
    expect(over.ok && over.enrichment.title_ko.length).toBe(TITLE_KO_HARD_LIMIT);
    expect(
      guardEnrichment({ ...enrichment, title_ko: "가".repeat(TITLE_KO_HARD_LIMIT + 1) }),
    ).toEqual({ ok: false, reason: "title" });
  });

  it("분야: 대소문자·공백만 맞춰 주고, 6개 키 밖(구 값 포함)은 기각", () => {
    const r = guardEnrichment({ ...enrichment, category: " Physical " });
    expect(r.ok && r.enrichment.category).toBe("physical");
    for (const category of ["Nope", "Agents", "Language Models", ""]) {
      expect(guardEnrichment({ ...enrichment, category })).toEqual({
        ok: false,
        reason: "category",
      });
    }
  });

  it("태그: 5개를 넘으면 정규화·중복 제거 뒤 앞 5개(저장 normalizeTags 와 같은 결과), 0개는 그대로", () => {
    const r = guardEnrichment({ ...enrichment, tags: ["LLM", "llm", "b", "c", "d", "e", "f"] });
    expect(r.ok && r.tagsTrimmed).toBe(true);
    expect(r.ok && r.enrichment.tags).toEqual(["llm", "b", "c", "d", "e"]);
    const none = guardEnrichment({ ...enrichment, tags: [] });
    expect(none.ok && none.enrichment.tags).toEqual([]);
    expect(none.ok && none.tagsTrimmed).toBe(false);
  });

  it("enrichGuardNotes: 해당 항목만, 항목 안에 notes 구분자 `;`가 없다", () => {
    expect(enrichGuardNotes(emptyEnrichGuardTally())).toEqual([]);
    const notes = enrichGuardNotes({
      titleOver: 2,
      titleOverMax: 74,
      titleRejected: 1,
      categoryRejected: 1,
      tagsTrimmed: 3,
    });
    expect(notes).toEqual([
      "한국어 제목 길이 초과 1건(80자 초과, 재시도)",
      "분야 값 오류 1건(재시도)",
      "한국어 제목 60자 초과 2건(게재, 최장 74자)",
      "태그 5개 초과 3건(앞 5개만)",
    ]);
    for (const n of notes) expect(n).not.toContain(";");
  });
});

describe("스키마 검증", () => {
  it("영어 필드는 필수지만 길이·한글을 스키마로 막지 않는다(묶음 전체가 버려지지 않게 — 코드 검사가 기사별로 거른다)", () => {
    expect(articleEnrichmentSchema.safeParse({ ...enrichment, title_en: undefined }).success).toBe(
      false,
    );
    expect(
      articleEnrichmentSchema.safeParse({ ...enrichment, title_en: "x".repeat(300) }).success,
    ).toBe(true);
    expect(
      articleEnrichmentSchema.safeParse({ ...enrichment, summary_en: "한글 요약" }).success,
    ).toBe(true);
    const required = (
      enrichFormat.schema as { properties: { articles: { items: { required: string[] } } } }
    ).properties.articles.items.required;
    expect(required).toEqual(expect.arrayContaining(["title_en", "summary_en"]));
  });

  it("enrichFormat.parse 는 형태(필드·타입)만 검증한다 — 제약 위반 기사 하나로 묶음이 버려지지 않는다", () => {
    const ok = JSON.stringify({ articles: [{ id: 3, ...enrichment }] });
    expect(enrichFormat.parse(ok).articles[0].id).toBe(3);
    const overLimit = JSON.stringify({
      articles: [
        { id: 1, ...enrichment },
        {
          id: 2,
          ...enrichment,
          title_ko: "가".repeat(120),
          category: "Nope",
          tags: [],
        },
        { id: 3, ...enrichment, tags: ["a", "b", "c", "d", "e", "f"] },
      ],
    });
    expect(enrichFormat.parse(overLimit).articles.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(enrichBatchParseSchema.safeParse(JSON.parse(overLimit)).success).toBe(true);
    // 형태가 틀리면(필드 누락·타입 오류·JSON 아님) 여전히 묶음 실패
    const noTitle: Partial<typeof enrichment> = { ...enrichment };
    delete noTitle.title_ko;
    expect(() =>
      enrichFormat.parse(JSON.stringify({ articles: [{ id: 3, ...noTitle }] })),
    ).toThrow();
    expect(() =>
      enrichFormat.parse(JSON.stringify({ articles: [{ id: 3.5, ...enrichment }] })),
    ).toThrow();
    expect(() => enrichFormat.parse("{not json")).toThrow();
  });

  it("모델에 보내는 JSON 스키마는 엄격한 계약 그대로 — 60자·태그 1~5개·분야 enum 이 보인다", () => {
    const item = (
      enrichFormat.schema as {
        properties: {
          articles: {
            items: {
              properties: Record<string, { description?: string; minItems?: number }>;
            };
          };
        };
      }
    ).properties.articles.items.properties;
    expect(item.title_ko.description).toContain(`{maxLength: ${TITLE_KO_LIMIT}}`);
    expect(item.tags.description).toContain("{maxItems: 5}");
    expect(item.tags.minItems).toBe(1);
    expect(item.category.description).toContain(JSON.stringify(CATEGORIES));
  });

  it("계약 스키마(few-shot·타입 기준): category enum 외 값·태그 0개/6개·제목 61자는 실패", () => {
    expect(
      articleEnrichmentSchema.safeParse({ ...enrichment, title_ko: "가".repeat(61) }).success,
    ).toBe(false);
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

  it("모든 예시에 영어 제목·요약이 있고 english.md 형식을 따른다(한글 없음·제목 100자 이내·마침표 없음)", () => {
    for (const ex of fewshot) {
      const { title_en, summary_en } = ex.output;
      expect(title_en.length).toBeGreaterThan(20);
      expect(title_en.length).toBeLessThanOrEqual(100);
      expect(title_en).not.toMatch(/[.!?]$/);
      expect(title_en + summary_en).not.toMatch(/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/);
      expect(summary_en.split(/\s+/).length).toBeLessThanOrEqual(60);
    }
  });

  it("한국 매체 예시가 1건 이상 있고, 원화는 KRW + scale 단어로 쓴다", () => {
    const korean = fewshot.filter((ex) => /[가-힣]/.test(ex.input.title));
    expect(korean.length).toBeGreaterThanOrEqual(1);
    expect(
      korean.some((ex) =>
        /KRW \d+(\.\d+)? (thousand|million|billion|trillion)/.test(ex.output.summary_en),
      ),
    ).toBe(true);
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
