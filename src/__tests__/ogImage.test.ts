import { describe, expect, it } from "vitest";
import {
  balancedLineEm,
  editionKicker,
  fitWords,
  formatMix,
  issueCountLabel,
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
