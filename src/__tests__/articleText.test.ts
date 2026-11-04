import { describe, expect, it } from "vitest";
import { hasEnglish, headlineOf, sourceNameOf, summaryOf } from "@/lib/articleText";
import { shortSourceName } from "@/lib/labels";
import type { ArticleCard, IndexCard } from "@/lib/types";

const card = (over: Partial<ArticleCard> = {}): ArticleCard => ({
  id: 1,
  source: { id: "techcrunch", name: "TechCrunch AI" },
  url: "https://techcrunch.com/x",
  titleKo: "오픈AI, 잠금 모드 출시",
  summaryKo: "오픈AI가 잠금 모드를 내놨다.",
  titleOriginal: "OpenAI launches Lockdown Mode",
  titleEn: "OpenAI launches lockdown mode",
  summaryEn: "OpenAI released a lockdown mode for ChatGPT.",
  category: "llm",
  format: "news",
  tags: [],
  trendingScore: 0,
  importance: 3,
  publishedAt: "2026-11-03T00:00:00Z",
  ...over,
});

const korean = card({
  source: { id: "aitimes", name: "AI타임스", nameEn: "AI Times", region: "kr" },
  titleOriginal: "네이버, 하이퍼클로바X 새 버전 공개",
});

describe("articleText — ko 는 지금 컴포넌트 식과 같다", () => {
  it("제목: titleKo || titleOriginal", () => {
    expect(headlineOf(card())).toBe("오픈AI, 잠금 모드 출시");
    expect(headlineOf(card({ titleKo: "" }))).toBe("OpenAI launches Lockdown Mode");
    expect(headlineOf(card({ titleKo: "" }), "ko")).toBe("OpenAI launches Lockdown Mode");
    // 색인 카드(원제 없음 — 만들 때 원제 폴백을 titleKo 에 넣었다)
    const idx = { titleKo: "원제 폴백" } as Pick<IndexCard, "titleKo">;
    expect(headlineOf(idx)).toBe("원제 폴백");
    expect(headlineOf({ titleKo: "" })).toBe("");
  });

  it("요약: summaryKo", () => {
    expect(summaryOf(card())).toBe("오픈AI가 잠금 모드를 내놨다.");
    expect(summaryOf(card({ summaryKo: "" }))).toBe("");
  });

  it("매체: shortSourceName(name), full 이면 name", () => {
    expect(sourceNameOf(card())).toBe(shortSourceName("TechCrunch AI"));
    expect(sourceNameOf(card(), "ko", { full: true })).toBe("TechCrunch AI");
    expect(sourceNameOf(korean)).toBe("AI타임스");
  });
});

describe("articleText — en 은 한국어 가공 텍스트로 폴백하지 않는다", () => {
  it("제목: titleEn", () => {
    expect(headlineOf(card(), "en")).toBe("OpenAI launches lockdown mode");
  });

  it("제목 폴백: 영어가 없으면 라틴 원제, 한국어 원제면 빈 문자열", () => {
    expect(headlineOf(card({ titleEn: "" }), "en")).toBe("OpenAI launches Lockdown Mode");
    expect(headlineOf(card({ titleEn: undefined }), "en")).toBe("OpenAI launches Lockdown Mode");
    expect(headlineOf({ ...korean, titleEn: "" }, "en")).toBe("");
    expect(headlineOf({ titleKo: "원제 폴백" }, "en")).toBe("");
  });

  it("요약 폴백: 영어가 없으면 빈 문자열(summaryKo 를 쓰지 않는다)", () => {
    expect(summaryOf(card(), "en")).toBe("OpenAI released a lockdown mode for ChatGPT.");
    expect(summaryOf(card({ summaryEn: "" }), "en")).toBe("");
    expect(summaryOf(card({ summaryEn: undefined }), "en")).toBe("");
  });

  it("매체: 영문 매체명", () => {
    expect(sourceNameOf(korean, "en")).toBe("AI Times");
    expect(sourceNameOf(korean, "en", { full: true })).toBe("AI Times");
    expect(sourceNameOf(card(), "en")).toBe("TechCrunch");
    expect(
      sourceNameOf(
        { source: { name: "HuggingFace 트렌딩 모델", nameEn: "HuggingFace Trending Models" } },
        "en",
      ),
    ).toBe("Hugging Face");
  });
});

describe("articleText — hasEnglish", () => {
  it("영어 제목과 요약이 둘 다 있어야 참", () => {
    expect(hasEnglish(card())).toBe(true);
    expect(hasEnglish(card({ titleEn: "" }))).toBe(false);
    expect(hasEnglish(card({ summaryEn: "" }))).toBe(false);
    expect(hasEnglish(card({ titleEn: "  ", summaryEn: "x" }))).toBe(false);
    expect(hasEnglish(card({ titleEn: undefined, summaryEn: undefined }))).toBe(false);
  });

  it("목록용 카드(영어 필드를 뗀 것)는 거짓 — 판정은 떼기 전에 한다", () => {
    const list: Omit<ArticleCard, "titleEn" | "summaryEn"> = card({
      titleEn: undefined,
      summaryEn: undefined,
    });
    // 영어 필드가 없는 타입(SearchIndexEntry 등)을 넘기면 타입 오류다 — 목록용 카드로 판정하는 실수를 막는다.
    // @ts-expect-error 공통 속성 없음
    expect(hasEnglish(list)).toBe(false);
  });
});
