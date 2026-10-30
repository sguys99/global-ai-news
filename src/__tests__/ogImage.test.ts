import { describe, expect, it } from "vitest";
import { fitWords, formatMix } from "@/lib/ogImage";
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
      "뉴스 3 · 오픈소스 1 · 논문 2",
    );
  });

  it("전부 뉴스면 '오늘 N건'과 같은 말이라 빈 문자열", () => {
    expect(formatMix(issue("news", "news"))).toBe("");
    expect(formatMix([])).toBe("");
  });

  it("미정의 형식 값은 뉴스로 센다", () => {
    expect(formatMix([{ format: "blog" as Format }, { format: "model" }])).toBe("뉴스 1 · 모델 1");
  });
});
