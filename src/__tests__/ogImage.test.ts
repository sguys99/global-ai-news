import { describe, expect, it } from "vitest";
import {
  balancedLineEm,
  editionDateline,
  editionKicker,
  enArticleFit,
  enLeadFit,
  fitHeadline,
  fitWords,
  formatMix,
  issueCountLabel,
  latinCharEm,
  typographicApostrophes,
  wrapWords,
} from "@/lib/ogImage";
import type { Format } from "@/lib/labels";

describe("fitWords — 공유 썸네일 헤드라인 어절 맞춤", () => {
  it("줄 수 안에 들어가면 어절을 그대로 둔다", () => {
    // 한글 0.93em × 4 + 공백 → 한 줄 10em 이면 "가나다라" 2개가 한 줄, 총 2줄
    expect(fitWords("가나다라 마바사아 자차카타", 10, 2)).toEqual([
      "가나다라",
      "마바사아",
      "자차카타",
    ]);
  });

  it("넘치면 마지막 줄 끝 어절에 말줄임을 붙인다(뜻이 바뀌는 무표시 절단 방지)", () => {
    // 2번째 줄 "안경 사용 일시 금지"(8.22em) 에 "…" 가 안 들어가 "금지"를 빼고 "일시…"
    expect(fitWords("노르웨이 공공장소 안경 사용 일시 금지 추진", 9, 2)).toEqual([
      "노르웨이",
      "공공장소",
      "안경",
      "사용",
      "일시…",
    ]);
  });

  it("말줄임 자리가 없으면 마지막 줄에서 어절을 더 뺀다", () => {
    // 2번째 줄 "가나 다라"(3.98em) + "…"(0.86em) 은 4.5em 을 넘는다 → "가나…"
    expect(fitWords("가나다라 가나 다라 마바", 4.5, 2)).toEqual(["가나다라", "가나…"]);
  });

  it("공백 연속·앞뒤 공백은 무시한다", () => {
    expect(fitWords("  A  B ", 10, 1)).toEqual(["A", "B"]);
  });
});

describe("formatMix — 호 썸네일 형식 구성", () => {
  const issue = (...formats: Format[]) => formats.map((format) => ({ format }));

  it("FORMATS 순으로 형식별 건수를 잇고 0건 형식은 뺀다", () => {
    expect(formatMix(issue("paper", "news", "oss", "news", "paper", "news"))).toBe(
      "뉴스 3 · 저장소 1 · 논문 2",
    );
  });

  it("전부 뉴스면 '이번 호 N건'과 같은 말이라 빈 문자열", () => {
    expect(formatMix(issue("news", "news"))).toBe("");
    expect(formatMix([])).toBe("");
  });

  it("미정의 형식 값은 뉴스로 센다", () => {
    expect(formatMix([{ format: "blog" as Format }, { format: "model" }])).toBe("뉴스 1 · 모델 1");
  });
});

describe("호 썸네일 문구 — 마스트헤드와 같은 '이번 호'", () => {
  it("키커는 '1면' + 리드 분야(지난 호 공유에도 맞는 말), '오늘'을 쓰지 않는다", () => {
    expect(editionKicker({ category: "industry" })).toEqual(["1면", "산업·정책"]);
    expect(editionKicker({ category: "" })).toEqual(["1면"]);
    expect(editionKicker({ category: "industry" }).join(" ")).not.toContain("오늘");
  });

  it("호 기사 수는 '이번 호 N건'", () => {
    expect(issueCountLabel(25)).toBe("이번 호 25건");
  });

  it("형식 구성은 화면 표시명(저장소)이고 프롬프트용 '오픈소스'가 아니다", () => {
    expect(formatMix([{ format: "news" }, { format: "oss" }])).toBe("뉴스 1 · 저장소 1");
  });
});

describe("balancedLineEm — 헤드라인 균형 줄바꿈", () => {
  // 2026-10-31 호 리드: 60px·1072px(17.87em) 에서 앞으로 채우면 "…1.5조원 투자 / 유치" 로 한 어절만 넘어갔다.
  const title = "코히어, 캐나다 정부로부터 1.5조원 투자 유치";
  const em = 1072 / 60;

  it("줄 수는 그대로 두고 상자를 좁혀 마지막 줄 외톨이 어절을 없앤다", () => {
    expect(wrapWords(title, em)).toEqual([
      ["코히어,", "캐나다", "정부로부터", "1.5조원", "투자"],
      ["유치"],
    ]);
    const w = balancedLineEm(title, em, 3);
    expect(w).toBeLessThan(em);
    expect(wrapWords(title, w)).toEqual([
      ["코히어,", "캐나다", "정부로부터"],
      ["1.5조원", "투자", "유치"],
    ]);
    // 말줄임 없이 전부 담긴다.
    expect(fitWords(title, w, 3).join(" ")).toBe(title);
  });

  it("한 줄 제목·말줄임되는 제목은 원래 폭 그대로", () => {
    expect(balancedLineEm("짧은 제목", 17, 3)).toBe(17);
    expect(balancedLineEm("가나다라 가나 다라 마바", 4.5, 2)).toBe(4.5);
  });

  it("폭을 넘지 않는다", () => {
    expect(balancedLineEm("가나다 라마바 사아자 차카타 파하", 9, 3)).toBeLessThanOrEqual(9);
  });
});

describe("영어 썸네일(og/en) — 실측 폭 표·크기 맞춤", () => {
  const em = latinCharEm(0);

  it("라틴 글자 폭은 Hahmlet 800 실측값(+2% 여유)이고 자간을 더한다", () => {
    expect(em("m")).toBeCloseTo(1.02 * 1.02);
    expect(em("i")).toBeCloseTo(0.37 * 1.02);
    expect(latinCharEm(-0.028)("m")).toBeCloseTo((1.02 - 0.028) * 1.02);
    // 표에 없는 악센트 문자는 넉넉한 기본값
    expect(em("ő")).toBeCloseTo(0.8 * 1.02);
    // 같은 자간이면 같은 함수(캐시)
    expect(latinCharEm(-0.028)).toBe(latinCharEm(-0.028));
  });

  it("한국어 근사(charEm)보다 소문자 영어를 좁게 잰다 — 같은 폭에 더 많이 담는다", () => {
    const title = "OpenAI raises $11 billion of its $30 billion funding target";
    expect(wrapWords(title, 16).length).toBeGreaterThan(wrapWords(title, 16, em).length);
  });

  it("fitHeadline: 말줄임 없이 들어가는 가장 큰 후보, 다 넘치면 가장 작은 후보", () => {
    const fits = [
      { size: 80, maxLines: 2 },
      { size: 60, maxLines: 3 },
    ];
    expect(fitHeadline("Short title", 1072, fits, em)).toEqual({ size: 80, maxLines: 2 });
    const long = "word ".repeat(60).trim();
    expect(fitHeadline(long, 1072, fits, em)).toEqual({ size: 60, maxLines: 3 });
  });

  it("enLeadFit·enArticleFit: 짧은 제목은 크게, 긴 제목(107자)도 줄 수 안에 말줄임 없이", () => {
    const short = "OpenAI acquires Pierre Computer Company";
    const longest =
      "Google DeepMind’s AlphaProof Nexus solves dozens of open math problems, including 56-year-old Erdős problem";
    expect(enArticleFit(short)).toEqual({ size: 84, maxLines: 2 });
    const art = enArticleFit(longest);
    expect(wrapWords(longest, 1072 / art.size, latinCharEm(-0.028)).length).toBeLessThanOrEqual(
      art.maxLines,
    );
    expect(enLeadFit("Google releases Gemini 3 Flash")).toEqual({ size: 64, maxLines: 2 });
    const lead = enLeadFit(longest);
    expect(lead.maxLines).toBe(3);
    expect(wrapWords(longest, 1072 / lead.size, latinCharEm(-0.028)).length).toBeLessThanOrEqual(3);
  });

  it("fitWords(영어): 말줄임 앞의 쉼표·마침표를 뗀다", () => {
    expect(fitWords("alpha beta, gamma delta", 7, 1, em)).toEqual(["alpha", "beta…"]);
    // 한국어(charEm)는 기존 그대로 — 쉼표를 두고 말줄임
    expect(fitWords("가나다, 라마바 사아자", 5, 1)).toEqual(["가나다,…"]);
  });

  it("typographicApostrophes: 낱말 안 아포스트로피만 굽힌다", () => {
    expect(typographicApostrophes("The world's AI news, and Korea's")).toBe(
      "The world’s AI news, and Korea’s",
    );
    expect(typographicApostrophes("'quoted' 90's")).toBe("'quoted' 90’s");
  });
});

describe("영어 썸네일 문구 — 영어 마스트헤드·1면과 같은 말, 한글 없음", () => {
  const issue = (...formats: Format[]) => formats.map((format) => ({ format }));

  it("형식 구성은 비뉴스만 센다(영어 귀 둘째 줄), 비뉴스가 없으면 빈 문자열", () => {
    expect(formatMix(issue("news", "oss", "paper", "paper", "model"), "en")).toBe(
      "1 repo · 1 model · 2 papers",
    );
    expect(formatMix(issue("news", "news"), "en")).toBe("");
  });

  it("키커·건수·데이트라인", () => {
    expect(editionKicker({ category: "industry" }, "en")).toEqual([
      "Front page",
      "Industry & Policy",
    ]);
    expect(issueCountLabel(1, "en")).toBe("1 story");
    expect(issueCountLabel(21, "en")).toBe("21 stories");
    expect(editionDateline({ issueNo: 143, publishedAt: "2026-11-05T21:00:00Z" }, "en")).toBe(
      "Friday, November 6, 2026  ·  No. 143",
    );
    // 한국어는 기존 표기 그대로
    expect(editionDateline({ issueNo: 143, publishedAt: "2026-11-05T21:00:00Z" })).toBe(
      "2026년 11월 6일 금요일  ·  제 143호",
    );
    const en = [
      ...editionKicker({ category: "oss" }, "en"),
      issueCountLabel(3, "en"),
      formatMix(issue("oss", "model", "paper"), "en"),
      editionDateline({ issueNo: 1, publishedAt: "2026-11-05T21:00:00Z" }, "en"),
    ].join(" ");
    expect(en).not.toMatch(/[가-힣]/);
  });
});
