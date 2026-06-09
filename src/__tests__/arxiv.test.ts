// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseArxivAtom, parseCategory } from "../../scripts/lib/collect/arxiv";
import { matchesAllowlist } from "../../scripts/lib/collect/scholar";

describe("parseCategory", () => {
  it("카테고리 슬러그를 그대로 추출", () => {
    expect(parseCategory("cs.CL")).toBe("cs.CL");
  });
  it("전체 URL 에서도 추출", () => {
    expect(parseCategory("https://arxiv.org/list/cs.AI/recent")).toBe("cs.AI");
  });
  it("형식이 아니면 throw", () => {
    expect(() => parseCategory("not-a-category")).toThrow();
  });
});

describe("matchesAllowlist", () => {
  const allow = ["Google", "Stanford University", "OpenAI"];

  it("단일어 토큰은 국가 접미사를 무시하고 완전 일치", () => {
    expect(matchesAllowlist(["Google (United States)"], allow)).toBe(true);
  });
  it("다단어 토큰은 부분 포함 매칭", () => {
    expect(matchesAllowlist(["Stanford University (United States)"], allow)).toBe(true);
  });
  it("단일어 토큰의 오탐 방지(부분 문자열 불일치)", () => {
    expect(matchesAllowlist(["Googleplex Research Institute"], allow)).toBe(false);
  });
  it("일치 소속이 없으면 false", () => {
    expect(matchesAllowlist(["Some Unknown University"], allow)).toBe(false);
  });
  it("소속/allowlist 가 비면 false", () => {
    expect(matchesAllowlist([], allow)).toBe(false);
    expect(matchesAllowlist(["Google"], [])).toBe(false);
    expect(matchesAllowlist(undefined, allow)).toBe(false);
  });
});

describe("parseArxivAtom", () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2404.19756v2</id>
    <title>KAN: Kolmogorov-Arnold
      Networks</title>
    <summary>We propose a new
      architecture.</summary>
    <published>2024-04-30T18:00:00Z</published>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2404.09384v3</id>
    <title>Generative transformations &amp; patterns</title>
    <summary>The emergence of prompting.</summary>
    <published>2024-04-14T23:45:23Z</published>
  </entry>
</feed>`;

  it("entry 들을 id/title/summary/published 로 파싱", () => {
    const out = parseArxivAtom(xml);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("2404.19756"); // 버전 접미사 제거
    expect(out[0].title).toBe("KAN: Kolmogorov-Arnold Networks"); // 줄바꿈 정리
    expect(out[0].summary).toBe("We propose a new architecture.");
    expect(out[0].publishedAt).toBe("2024-04-30T18:00:00.000Z");
  });

  it("XML 엔티티를 복원", () => {
    const out = parseArxivAtom(xml);
    expect(out[1].title).toBe("Generative transformations & patterns");
  });

  it("entry 가 없으면 빈 배열", () => {
    expect(parseArxivAtom("<feed></feed>")).toEqual([]);
  });
});
