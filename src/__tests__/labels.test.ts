import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  categorySlug,
  formatDate,
  formatDateTime,
  formatLongDate,
  formatMonthDay,
  formatRelativeKst,
  formatShortDate,
  kstDateKey,
  shortSourceName,
} from "@/lib/labels";

describe("labels — 날짜는 KST 고정", () => {
  // 2026-10-03 23:42 UTC = 2026-10-04 08:42 KST (일요일)
  const iso = "2026-10-03T23:42:08.711Z";

  it("UTC 자정을 넘긴 시각도 KST 날짜로 표기한다", () => {
    expect(formatShortDate(iso)).toBe("10.04");
    expect(formatDate(iso)).toBe("2026.10.04");
    expect(formatLongDate(iso)).toBe("2026년 10월 4일 일요일");
    expect(formatMonthDay(iso)).toBe("10월 4일(일)");
    expect(kstDateKey(iso)).toBe("2026-10-04");
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

describe("labels — 상대 시각 (KST 고정)", () => {
  // 기준: 2026-10-26T21:00Z = 2026-10-27 06:00 KST (호 발행 시각)
  const now = "2026-10-26T21:00:00Z";

  it("1분 미만·시계 오차로 미래인 시각은 '방금'", () => {
    expect(formatRelativeKst("2026-10-26T20:59:30Z", now)).toBe("방금");
    expect(formatRelativeKst(now, now)).toBe("방금");
    expect(formatRelativeKst("2026-10-26T21:05:00Z", now)).toBe("방금");
  });

  it("1시간 미만은 'N분 전'(내림)", () => {
    expect(formatRelativeKst("2026-10-26T20:59:00Z", now)).toBe("1분 전");
    expect(formatRelativeKst("2026-10-26T20:00:01Z", now)).toBe("59분 전");
  });

  it("24시간 미만은 'N시간 전'(내림) — KST 날짜가 바뀌어도 시간 우선", () => {
    expect(formatRelativeKst("2026-10-26T20:00:00Z", now)).toBe("1시간 전");
    expect(formatRelativeKst("2026-10-26T11:30:00Z", now)).toBe("9시간 전");
    expect(formatRelativeKst("2026-10-25T21:00:01Z", now)).toBe("23시간 전");
  });

  it("24시간 이상이고 KST 달력상 전날이면 '어제 HH:mm'", () => {
    // 2026-10-26 01:00 KST (어제), 정확히 29시간 전
    expect(formatRelativeKst("2026-10-25T16:00:00Z", now)).toBe("어제 01:00");
    // 2026-10-26 00:05 KST — 자정 직후도 0 채움
    expect(formatRelativeKst("2026-10-25T15:05:00Z", now)).toBe("어제 00:05");
  });

  it("'어제'는 UTC가 아닌 KST 날짜로 판정한다", () => {
    // 기준 2026-10-26T16:00Z = 10/27 01:00 KST (UTC로는 10/26)
    const lateNight = "2026-10-26T16:00:00Z";
    // 10/25T15:30Z = 10/26 00:30 KST → KST 전날
    expect(formatRelativeKst("2026-10-25T15:30:00Z", lateNight)).toBe("어제 00:30");
    // 10/25T14:30Z = 10/25 23:30 KST → KST 이틀 전(UTC로는 전날이지만 '어제' 아님)
    expect(formatRelativeKst("2026-10-25T14:30:00Z", lateNight)).toBe("10.25");
  });

  it("그 이전은 같은 해 'M.D', 다른 해 'YYYY.M.D'(0 채움 없음)", () => {
    expect(formatRelativeKst("2026-10-24T03:00:00Z", now)).toBe("10.24");
    expect(formatRelativeKst("2026-03-05T03:00:00Z", now)).toBe("3.5");
    expect(formatRelativeKst("2025-12-31T03:00:00Z", now)).toBe("2025.12.31");
    // UTC로는 2025년이지만 KST로는 2026-01-01
    expect(formatRelativeKst("2025-12-31T15:30:00Z", now)).toBe("1.1");
  });

  it("연말연시 경계: 1/1 기준 12/31은 '어제'", () => {
    const newYear = "2027-01-01T03:00:00Z"; // 2027-01-01 12:00 KST
    expect(formatRelativeKst("2026-12-31T00:00:00Z", newYear)).toBe("어제 09:00");
    expect(formatRelativeKst("2026-12-30T00:00:00Z", newYear)).toBe("2026.12.30");
  });

  it("now 는 ISO·epoch ms·Date 모두 받는다", () => {
    const ms = Date.parse(now);
    expect(formatRelativeKst("2026-10-26T18:00:00Z", ms)).toBe("3시간 전");
    expect(formatRelativeKst("2026-10-26T18:00:00Z", new Date(ms))).toBe("3시간 전");
  });

  it("잘못된 입력은 빈 문자열", () => {
    expect(formatRelativeKst("not-a-date", now)).toBe("");
    expect(formatRelativeKst("2026-10-26T18:00:00Z", "nope")).toBe("");
  });

  it("formatDateTime — 'YYYY.MM.DD HH:mm' KST(24시간제)", () => {
    expect(formatDateTime("2026-10-03T23:42:08.711Z")).toBe("2026.10.04 08:42");
    expect(formatDateTime("2026-10-25T15:05:00Z")).toBe("2026.10.26 00:05");
    expect(formatDateTime("2026-10-26T03:30:00Z")).toBe("2026.10.26 12:30");
    expect(formatDateTime("not-a-date")).toBe("");
  });
});
