import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  categoryAliases,
  categoryCode,
  categoryLabel,
  categorySlug,
  LEGACY_CATEGORY_MAP,
  normalizeCategory,
  formatDate,
  formatDateTime,
  formatLongDate,
  formatMonthDay,
  formatRelativeKst,
  formatShortDate,
  issueDelayCopy,
  issueDelayDays,
  kstDateKey,
  kstDayDiff,
  shortSourceName,
  FORMAT_DISPLAY_LABELS,
  FORMAT_LABELS,
  FORMATS,
} from "@/lib/labels";
import { CONFIGS_DIR } from "@/lib/paths";
import type { SourceConfig } from "@/lib/types";

const SOURCES_JSON = JSON.parse(
  readFileSync(path.join(CONFIGS_DIR, "sources.json"), "utf-8"),
) as SourceConfig[];

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
  it("분야 6개 키의 순서(= 섹션 순서)", () => {
    expect(CATEGORIES).toEqual(["llm", "agent", "physical", "oss", "research", "industry"]);
  });

  it.each([
    ["llm", "LLM", "LLM"],
    ["agent", "에이전트", "AGT"],
    ["physical", "Physical AI", "PHY"],
    ["oss", "오픈소스·도구", "OSS"],
    ["research", "연구·논문", "RES"],
    ["industry", "산업·정책", "BIZ"],
  ])("분야 키 %s → 표시명 %s · 코드 %s · 슬러그 = 키", (key, label, code) => {
    expect(categoryLabel(key)).toBe(label);
    expect(categoryCode(key)).toBe(code);
    expect(categorySlug(key)).toBe(key);
  });

  it.each([
    ["Language Models", "llm", "LLM", "LLM"],
    ["Agents", "agent", "에이전트", "AGT"],
    ["Dev Tools", "oss", "오픈소스·도구", "OSS"],
    ["MLOps", "oss", "오픈소스·도구", "OSS"],
    ["연구·논문", "research", "연구·논문", "RES"],
    ["산업·정책", "industry", "산업·정책", "BIZ"],
  ])("구 값 %s → 키 %s 로 해석(표시명 %s · 코드 %s)", (legacy, key, label, code) => {
    expect(LEGACY_CATEGORY_MAP[legacy]).toBe(key);
    expect(normalizeCategory(legacy)).toBe(key);
    expect(categoryLabel(legacy)).toBe(label);
    expect(categoryCode(legacy)).toBe(code);
    expect(categorySlug(legacy)).toBe(key);
  });

  it("미정의 값은 원문/빈 코드/etc, 빈 값은 빈 문자열", () => {
    expect(normalizeCategory("Unknown")).toBe("Unknown");
    expect(categoryLabel("Unknown")).toBe("Unknown");
    expect(categoryCode("Unknown")).toBe("");
    expect(categorySlug("Unknown")).toBe("etc");
    expect(categoryLabel("")).toBe("");
    expect(categoryCode("")).toBe("");
    // 프로토타입 키는 분야로 오인하지 않는다
    expect(categoryLabel("toString")).toBe("toString");
  });

  it("분야 별칭 = 키 + 그 키로 흡수된 구 값", () => {
    expect(categoryAliases("oss")).toEqual(["oss", "Dev Tools", "MLOps"]);
    expect(categoryAliases("MLOps")).toEqual(["oss", "Dev Tools", "MLOps"]);
    expect(categoryAliases("physical")).toEqual(["physical"]);
    expect(categoryAliases("Unknown")).toEqual(["Unknown"]);
  });

  it("소스 축약명", () => {
    expect(shortSourceName("GitHub (topic:llm)")).toBe("GitHub");
    expect(shortSourceName("GitHub (topic:ai-agents·mcp)")).toBe("GitHub");
    expect(shortSourceName("GitHub (topic:robotics·embodied-ai)")).toBe("GitHub");
    expect(shortSourceName("Hacker News")).toBe("Hacker News");
  });

  it("Hugging Face 는 공식 표기(띄어쓰기)로 — 논문·모델 피드는 한 매체, 회사 블로그는 따로", () => {
    expect(shortSourceName("HuggingFace Daily Papers")).toBe("Hugging Face");
    expect(shortSourceName("HuggingFace 트렌딩 모델")).toBe("Hugging Face");
    expect(shortSourceName("Hugging Face Blog")).toBe("Hugging Face Blog");
  });

  it("arXiv 카테고리 피드는 한 매체 'arXiv' — 논문을 싣는 다른 매체(HF Papers·Takara)는 따로", () => {
    expect(shortSourceName("arXiv cs.CL (NLP)")).toBe("arXiv");
    expect(shortSourceName("arXiv cs.AI")).toBe("arXiv");
    expect(shortSourceName("arXiv cs.LG (ML)")).toBe("arXiv");
    expect(shortSourceName("arXiv cs.RO (Robotics)")).toBe("arXiv");
    expect(shortSourceName("Takara TLDR")).toBe("Takara TLDR");
  });

  it("configs/sources.json 의 arxiv_* 소스는 모두 축약명이 'arXiv'다(피드 이름이 바뀌면 칩이 다시 갈라진다)", () => {
    const arxiv = SOURCES_JSON.filter((s) => s.id.startsWith("arxiv_"));
    expect(arxiv.length).toBeGreaterThanOrEqual(4);
    for (const s of arxiv) expect(shortSourceName(s.name), s.id).toBe("arXiv");
  });

  it("형식 이름: 프롬프트용(FORMAT_LABELS)은 그대로, 독자 화면용은 oss 를 '저장소'로", () => {
    // FORMAT_LABELS 는 선별·가공 프롬프트 계약(configs/prompts)이라 바뀌면 안 된다.
    expect(FORMAT_LABELS).toEqual({ news: "뉴스", oss: "오픈소스", model: "모델", paper: "논문" });
    expect(FORMAT_DISPLAY_LABELS).toEqual({
      news: "뉴스",
      oss: "저장소",
      model: "모델",
      paper: "논문",
    });
    // 화면 형식명이 분야명(오픈소스·도구 등)과 같은 낱말로 시작하지 않는다 — 귀·이 호의 지면 건수 혼동 방지.
    for (const f of FORMATS) expect(FORMAT_DISPLAY_LABELS[f]).not.toMatch(/오픈소스/);
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

describe("발행 지연 판정 — KST 기준", () => {
  // 호 날짜 2026-10-25(일). KST 10/26 07:59 = 10/25 22:59Z
  it("호 날짜가 오늘이면 안내 없음", () => {
    expect(issueDelayDays("2026-10-27", "2026-10-27T03:00:00Z")).toBe(0);
    expect(issueDelayDays("2026-10-27", "2026-10-27T14:59:00Z")).toBe(0); // 23:59 KST
  });

  it("어제 호는 08:00 KST 전에는 안내하지 않는다", () => {
    expect(issueDelayDays("2026-10-26", "2026-10-26T22:59:00Z")).toBe(0); // 10/27 07:59 KST
  });

  it("어제 호는 08:00 KST 부터 안내한다", () => {
    expect(issueDelayDays("2026-10-26", "2026-10-26T23:00:00Z")).toBe(1); // 10/27 08:00 KST
    expect(issueDelayDays("2026-10-26", "2026-10-27T10:00:00Z")).toBe(1);
  });

  it("이틀 이상 지난 호는 시각과 무관하게 안내한다", () => {
    expect(issueDelayDays("2026-10-25", "2026-10-26T15:00:00Z")).toBe(2); // 10/27 00:00 KST
    expect(issueDelayDays("2026-10-20", "2026-10-26T21:00:00Z")).toBe(7);
  });

  it("미래 호·잘못된 입력은 0", () => {
    expect(issueDelayDays("2026-10-28", "2026-10-27T03:00:00Z")).toBe(0);
    expect(issueDelayDays("2026-10-26", "nope")).toBe(0);
    expect(issueDelayDays("bad", "2026-10-27T03:00:00Z")).toBe(0);
  });

  it("kstDayDiff — 달력 일수 차", () => {
    expect(kstDayDiff("2026-10-25", "2026-10-27")).toBe(2);
    expect(kstDayDiff("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("안내 문구 — 1일: 라벨 '발행 전', 오늘 호가 아직 없고 보고 있는 호를 밝힌다", () => {
    expect(issueDelayCopy("2026-10-29", 1, 135)).toEqual({
      label: "발행 전",
      strong: "10월 30일 금요일 호",
      rest: "는 아직 발행 전입니다 — 지금은 10월 29일 목요일 제135호를 보고 계십니다.",
      short: "10.30(금) 호 발행 전 · 10.29(목) 호를 보는 중",
    });
  });

  it("안내 문구 — 2일 이상: 라벨 '발행 지연', 지연 일수", () => {
    expect(issueDelayCopy("2026-10-28", 2, 134)).toEqual({
      label: "발행 지연",
      strong: "10월 28일 수요일 제134호",
      rest: " 이후 새 호가 나오지 않았습니다 — 발행이 2일째 늦어지고 있습니다.",
      short: "10.28(수) 호 이후 새 호 지연 · 2일째",
    });
    expect(issueDelayCopy("2026-10-28", 3, 134)?.short).toBe(
      "10.28(수) 호 이후 새 호 지연 · 3일째",
    );
  });

  it("안내 문구 — 호수 미상은 '호'로, 월말·연말 다음 날도 KST 달력으로", () => {
    expect(issueDelayCopy("2026-12-31", 1)?.strong).toBe("1월 1일 금요일 호");
    expect(issueDelayCopy("2026-12-31", 1)?.rest).toContain("12월 31일 목요일 호를 보고 계십니다");
    expect(issueDelayCopy("2026-10-28", 2)?.strong).toBe("10월 28일 수요일 호");
  });

  it("안내 문구 — 지연 없음·잘못된 입력은 null", () => {
    expect(issueDelayCopy("2026-10-29", 0, 135)).toBeNull();
    expect(issueDelayCopy("bad", 1, 135)).toBeNull();
  });
});
