import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  categorySlug,
  formatDate,
  formatLongDate,
  formatShortDate,
  shortSourceName,
} from "@/lib/labels";

describe("labels — 날짜는 KST 고정", () => {
  // 2026-10-03 23:42 UTC = 2026-10-04 08:42 KST (일요일)
  const iso = "2026-10-03T23:42:08.711Z";

  it("UTC 자정을 넘긴 시각도 KST 날짜로 표기한다", () => {
    expect(formatShortDate(iso)).toBe("10.04");
    expect(formatDate(iso)).toBe("2026.10.04");
    expect(formatLongDate(iso)).toBe("2026년 10월 4일 일요일");
  });

  it("잘못된 입력은 빈 문자열", () => {
    expect(formatDate("not-a-date")).toBe("");
  });
});

describe("labels — 카테고리·소스", () => {
  it("카테고리 표시명·슬러그, 미정의 값은 원문/etc", () => {
    expect(categoryLabel("Language Models")).toBe("언어 모델");
    expect(categoryLabel("Unknown")).toBe("Unknown");
    expect(categorySlug("연구·논문")).toBe("research");
    expect(categorySlug("Unknown")).toBe("etc");
  });

  it("소스 축약명", () => {
    expect(shortSourceName("GitHub (topic:llm)")).toBe("GitHub");
    expect(shortSourceName("Hacker News")).toBe("Hacker News");
  });
});
