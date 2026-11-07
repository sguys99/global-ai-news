import { describe, expect, it } from "vitest";
import {
  ENGLISH_REJECT_REASONS,
  englishCheckNotes,
  tallyEnglishChecks,
  type EnglishCheckResult,
} from "../../scripts/lib/englishCheck";
import {
  ENGLISH_REJECT_KEYS,
  ENGLISH_TARGETS,
  coverageRate,
  englishGap,
  englishTargetRows,
  parseEnglishNotes,
  percentText,
  rejectBreakdownText,
  rejectTotal,
  sumEnglishNotes,
  sumEnglishRunCost,
  type EnglishKpi,
} from "@/lib/englishKpi";

const ok: EnglishCheckResult = { ok: true };
const no = (reason: "hangul" | "number" | "length"): EnglishCheckResult => ({
  ok: false,
  reason,
  detail: [],
});

describe("parseEnglishNotes", () => {
  it("영어 가공·기각·한국어 숫자 불일치 줄을 읽는다(문구 그대로)", () => {
    const notes =
      "techcrunch_ai: 20건(신규 9); 선정 35건(같은 사건으로 묶인 기사 4건); 영어 가공 33/35건; 영어 기각 2건(한글 0·숫자 1·길이 1); 한국어 숫자 불일치 2건(900억 달러·27억); LLM batch 호출 6회, $0.0612";
    expect(parseEnglishNotes(notes)).toEqual({
      checked: 35,
      passed: 33,
      rejected: { hangul: 0, number: 1, length: 1 },
      koreanMismatch: 2,
    });
  });

  it("기각·불일치 줄이 없으면 0, 영어 가공 줄이 없으면 null", () => {
    expect(parseEnglishNotes("영어 가공 20/20건")).toEqual({
      checked: 20,
      passed: 20,
      rejected: { hangul: 0, number: 0, length: 0 },
      koreanMismatch: 0,
    });
    expect(parseEnglishNotes("선정 28건; 재보도 제외 2건(후속 보도 유지 1건)")).toBeNull();
    expect(parseEnglishNotes(null)).toBeNull();
    expect(parseEnglishNotes("")).toBeNull();
  });

  it("scripts/lib/englishCheck.ts 의 notes 빌더와 형식이 맞는다(왕복)", () => {
    const tally = tallyEnglishChecks(
      [ok, ok, ok, no("hangul"), no("number"), no("number"), no("length")],
      [["900억 달러"], [], ["27억; 3"], []],
    );
    const notes = ["선정 7건", ...englishCheckNotes(tally), "LLM batch 호출 6회"].join("; ");
    expect(parseEnglishNotes(notes)).toEqual({
      checked: 7,
      passed: 3,
      rejected: { hangul: 1, number: 2, length: 1 },
      koreanMismatch: 2,
    });
    // 검사 0건이면 줄이 없다 → null
    expect(parseEnglishNotes(englishCheckNotes(tallyEnglishChecks([])).join("; "))).toBeNull();
  });

  it("기각 사유 키가 englishCheck.ts 와 같은 집합이다", () => {
    expect([...ENGLISH_REJECT_KEYS].sort()).toEqual([...ENGLISH_REJECT_REASONS].sort());
  });
});

describe("집계·표기", () => {
  it("sumEnglishNotes 는 null(영어 줄 없는 회차)을 건너뛰고 합산한다", () => {
    const s = sumEnglishNotes([
      parseEnglishNotes("영어 가공 33/35건; 영어 기각 2건(한글 0·숫자 1·길이 1)"),
      null,
      parseEnglishNotes(
        "영어 가공 20/21건; 영어 기각 1건(한글 1·숫자 0·길이 0); 한국어 숫자 불일치 3건(a)",
      ),
    ]);
    expect(s).toEqual({
      runs: 2,
      checked: 56,
      passed: 53,
      rejected: { hangul: 1, number: 1, length: 1 },
      koreanMismatch: 3,
    });
    expect(rejectTotal(s.rejected)).toBe(3);
    expect(rejectBreakdownText(s.rejected)).toBe("한글 1 · 숫자 1 · 길이 1");
  });

  it("percentText·coverageRate — 분모 0은 —/null, 소수 0은 뗀다", () => {
    expect(percentText(33, 35)).toBe("94.3%");
    expect(percentText(10, 10)).toBe("100%");
    expect(percentText(0, 0)).toBe("—");
    expect(coverageRate({ published: 0, english: 0 })).toBeNull();
    expect(coverageRate({ published: 4, english: 3 })).toBe(0.75);
  });
});

describe("Phase 8-1 지표", () => {
  // 2026-11-07 실측 모양: 백필 뒤 영어 없음 14 + 수집 기각 2
  const n142 = parseEnglishNotes("영어 가공 21/22건; 영어 기각 1건(한글 0·숫자 1·길이 0)");
  const n143 = parseEnglishNotes("영어 가공 21/22건; 영어 기각 1건(한글 0·숫자 1·길이 0)");
  const n144 = parseEnglishNotes("영어 가공 20/20건");
  const kpi: EnglishKpi = {
    hasColumns: true,
    since: "2026-06-07T00:00:00Z",
    allPublished: 1319,
    overall: { published: 1319, english: 1303 },
    korea: { published: 364, english: 363 },
    overseas: { published: 955, english: 940 },
    checks: sumEnglishNotes([n142, n143, n144]),
    runs: [],
    cost: sumEnglishRunCost([
      { notes: null, costUsd: 0.0435 }, // 영어판 이전 회차(#141)는 비용에 넣지 않는다
      { notes: n142, costUsd: 0.0559 },
      { notes: n143, costUsd: 0.0517 },
      { notes: n144, costUsd: 0.0543 },
    ]),
  };

  it("sumEnglishRunCost 는 영어 회차만 합산한다(평균은 total/runs)", () => {
    expect(kpi.cost.runs).toBe(3);
    expect(kpi.cost.total).toBeCloseTo(0.1619, 6);
    expect(kpi.cost.max).toBe(0.0559);
    expect(sumEnglishRunCost([])).toEqual({ runs: 0, total: 0, max: 0 });
  });

  it("englishGap: 영어 없음 = 회차 기각 + notes 밖(백필 기각·본문 없음)", () => {
    expect(englishGap(kpi)).toEqual({ missing: 16, collectRejected: 2, outsideNotes: 14 });
    // 기각 뒤 재시도로 영어가 생겨 notes 기각이 빈자리보다 많아도 음수가 되지 않는다
    expect(englishGap({ ...kpi, overall: { published: 10, english: 9 } }).outsideNotes).toBe(0);
  });

  it("englishTargetRows: 목표 대비 PASS/FAIL, 데이터 없으면 null", () => {
    const rows = englishTargetRows(kpi);
    expect(rows.map((r) => [r.label, r.value, r.pass])).toEqual([
      ["수집 경로 커버리지", "96.9%", true],
      ["DB 보유율", "98.8%", true],
      ["회차 비용 평균", "$0.0540", true],
      ["회차 비용 최대", "$0.0559", true],
    ]);
    // 경계: 목표값과 같으면 PASS
    const atTarget = englishTargetRows({
      ...kpi,
      overall: { published: 1000, english: 975 },
      checks: { ...kpi.checks, checked: 20, passed: 19 },
      cost: { runs: 1, total: ENGLISH_TARGETS.avgRunCostUsd, max: ENGLISH_TARGETS.maxRunCostUsd },
    });
    expect(atTarget.every((r) => r.pass === true)).toBe(true);
    const failing = englishTargetRows({
      ...kpi,
      overall: { published: 100, english: 97 },
      checks: { ...kpi.checks, checked: 20, passed: 18 },
      cost: { runs: 2, total: 0.17, max: 0.11 },
    });
    expect(failing.map((r) => r.pass)).toEqual([false, false, false, false]);
    expect(rows.map((r) => r.target)).toEqual(["≥ 95%", "≥ 97.5%", "≤ $0.08", "≤ $0.10 (상한)"]);
    const none = englishTargetRows({
      ...kpi,
      overall: { published: 0, english: 0 },
      checks: sumEnglishNotes([]),
      cost: sumEnglishRunCost([]),
    });
    expect(none.map((r) => [r.value, r.pass])).toEqual([
      ["—", null],
      ["—", null],
      ["—", null],
      ["—", null],
    ]);
  });
});
