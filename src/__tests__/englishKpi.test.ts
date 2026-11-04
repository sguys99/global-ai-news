import { describe, expect, it } from "vitest";
import {
  ENGLISH_REJECT_REASONS,
  englishCheckNotes,
  tallyEnglishChecks,
  type EnglishCheckResult,
} from "../../scripts/lib/englishCheck";
import {
  ENGLISH_REJECT_KEYS,
  coverageRate,
  parseEnglishNotes,
  percentText,
  rejectBreakdownText,
  rejectTotal,
  sumEnglishNotes,
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
