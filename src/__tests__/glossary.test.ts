// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  glossaryBlock,
  glossaryTables,
  keyPattern,
  parseGlossary,
  readGlossary,
  selectGlossary,
} from "../../scripts/lib/glossary";

const SAMPLE = `Maintainer note — not a bullet, never sent.

### Government

- 과학기술정보통신부 · 과기정통부 → Ministry of Science and ICT (MSIT)
- 국회 → National Assembly · 국정감사 · 국감 → the National Assembly's annual audit
- Military ranks: 대장 → General · 중장 → Lieutenant General
- Family names (usual spellings): 김 Kim · 이 Lee

### Foreign names

Write the original spelling.

- 그록 → Grok (xAI/SpaceX chatbot) · 그로크 → Groq (AI chip company)
- 마이크로소프트 · MS → Microsoft
- LG AI연구원 → LG AI Research · 클로드 코드 → Claude Code · 오픈AI → OpenAI
`;

describe("parseGlossary", () => {
  const g = parseGlossary(SAMPLE);

  it("`→` 앞의 ` · ` 조각은 같은 이름의 키, 한 줄의 항목 여럿을 나눈다", () => {
    expect(g.entries.map((e) => e.keys)).toEqual([
      ["과학기술정보통신부", "과기정통부"],
      ["국회"],
      ["국정감사", "국감"],
      ["그록"],
      ["그로크"],
      ["마이크로소프트", "MS"],
      ["LG AI연구원"],
      ["클로드 코드"],
      ["오픈AI"],
    ]);
    expect(g.entries[2]).toEqual({
      keys: ["국정감사", "국감"],
      english: "the National Assembly's annual audit",
      line: "국정감사 · 국감 → the National Assembly's annual audit",
    });
  });

  it("`영문 라벨:`로 시작하는 줄은 늘 싣는 표, 글머리가 아닌 줄은 버린다", () => {
    expect(g.tables).toEqual([
      "Military ranks: 대장 → General · 중장 → Lieutenant General",
      "Family names (usual spellings): 김 Kim · 이 Lee",
    ]);
    expect(g.entries.some((e) => e.line.includes("Maintainer"))).toBe(false);
    expect(g.skipped).toEqual([]);
  });

  it("`→` 없이 끝난 키·빈 영문은 skipped 로 모은다", () => {
    expect(parseGlossary("- 네이버 · 카카오\n- 업스테이지 →  \n").skipped).toEqual([
      "네이버 · 카카오",
      "업스테이지 →",
    ]);
  });
});

describe("keyPattern", () => {
  it("한글 키 뒤의 조사는 그대로 걸린다", () => {
    expect(keyPattern("앤트로픽").test("앤트로픽이 새 모델을")).toBe(true);
  });

  it("띄어쓰기 차이(공백·한글↔라틴 경계)를 무시한다", () => {
    expect(keyPattern("LG AI연구원").test("LG AI 연구원은")).toBe(true);
    expect(keyPattern("클로드 코드").test("클로드코드로")).toBe(true);
    expect(keyPattern("오픈AI").test("오픈 AI 가")).toBe(true);
  });

  it("라틴 키는 영숫자 경계를 본다 — 한글 조사·붙은 한글은 경계다", () => {
    const ms = keyPattern("MS");
    expect(ms.test("MS가 투자")).toBe(true);
    expect(ms.test("LMS 플랫폼")).toBe(false);
    expect(ms.test("ms 단위")).toBe(false);
    expect(keyPattern("SK").test("SK하이닉스")).toBe(true);
    expect(keyPattern("KT").test("KTX")).toBe(false);
  });

  it("짧은 한글 키는 긴 낱말 안에서도 걸린다(군더더기 항목은 싸고, 빠진 항목은 비싸다)", () => {
    expect(keyPattern("메타").test("메타버스")).toBe(true);
  });
});

describe("selectGlossary · glossaryBlock", () => {
  const g = parseGlossary(SAMPLE);

  it("입력에 키가 나온 항목만, 파일 순서대로 고른다", () => {
    const picked = selectGlossary(g, "그로크 칩과 과기정통부, 그리고 MS 소식");
    expect(picked.map((e) => e.english)).toEqual([
      "Ministry of Science and ICT (MSIT)",
      "Groq (AI chip company)",
      "Microsoft",
    ]);
  });

  it("헷갈리는 쌍(그록·그로크)은 서로 걸리지 않는다", () => {
    expect(selectGlossary(g, "그록이 답했다").map((e) => e.english)).toEqual([
      "Grok (xAI/SpaceX chatbot)",
    ]);
  });

  it("블록은 `[용어집]` 머리 + 항목 줄, 고른 항목이 없으면 빈 문자열", () => {
    expect(glossaryBlock(selectGlossary(g, "국감에서"))).toBe(
      "[용어집] title_en·summary_en 에 쓸 영문 표기\n- 국정감사 · 국감 → the National Assembly's annual audit",
    );
    expect(glossaryBlock(selectGlossary(g, "OpenAI released a model"))).toBe("");
  });

  it("표는 글머리 줄로 이어 붙인다", () => {
    expect(glossaryTables(g)).toBe(
      "- Military ranks: 대장 → General · 중장 → Lieutenant General\n" +
        "- Family names (usual spellings): 김 Kim · 이 Lee",
    );
  });
});

describe("configs/prompts/glossary.en.md", () => {
  const g = readGlossary();

  it("모든 줄이 해석되고, 성씨·계급 표가 고정 표로 잡힌다", () => {
    expect(g.skipped).toEqual([]);
    expect(g.entries.length).toBeGreaterThan(150);
    expect(g.tables).toHaveLength(2);
    expect(g.tables.some((t) => t.startsWith("Military ranks:"))).toBe(true);
    expect(g.tables.some((t) => t.startsWith("Family names"))).toBe(true);
  });

  it("영문 표기에는 한글이 없다(모델에 한글을 영어로 쓰라고 가르치지 않게)", () => {
    for (const e of g.entries) expect(e.english).not.toMatch(/[가-힣]/);
  });

  it("관리용 머리말은 항목으로 새지 않는다", () => {
    expect(g.entries.some((e) => /Maintainer|scripts\/lib/.test(e.line))).toBe(false);
  });

  it("한국 매체식 표기에서 0-3 핵심 이름을 찾는다", () => {
    const picked = selectGlossary(g, "앤트로픽과 오픈AI, 그로크가 과기정통부와 협약했다").map(
      (e) => e.english,
    );
    expect(picked).toEqual(
      expect.arrayContaining([
        "Anthropic",
        "OpenAI",
        "Groq (AI chip company)",
        "Ministry of Science and ICT (MSIT)",
      ]),
    );
    expect(picked).not.toContain("Grok (xAI/SpaceX chatbot)");
  });
});
