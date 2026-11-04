import { describe, expect, it } from "vitest";
import { englishKpiText } from "../../scripts/lib/englishReport";
import { sumEnglishNotes, parseEnglishNotes, type EnglishKpi } from "@/lib/englishKpi";

const empty: EnglishKpi = {
  hasColumns: true,
  since: null,
  allPublished: 1255,
  overall: { published: 0, english: 0 },
  korea: { published: 0, english: 0 },
  overseas: { published: 0, english: 0 },
  checks: sumEnglishNotes([]),
  runs: [],
};

const n1 = parseEnglishNotes(
  "영어 가공 33/35건; 영어 기각 2건(한글 0·숫자 1·길이 1); 한국어 숫자 불일치 2건(900억 달러·27억)",
);
const n2 = parseEnglishNotes("영어 가공 20/20건");

const filled: EnglishKpi = {
  hasColumns: true,
  since: "2026-11-04T21:01:00Z",
  allPublished: 1310,
  overall: { published: 55, english: 53 },
  korea: { published: 15, english: 14 },
  overseas: { published: 40, english: 39 },
  checks: sumEnglishNotes([n1, n2]),
  runs: [
    {
      id: 143,
      startedAt: "2026-11-05T21:01:00Z",
      status: "partial",
      notes: n2,
      coverage: { published: 20, english: 20 },
    },
    {
      id: 142,
      startedAt: "2026-11-04T21:01:00Z",
      status: "success",
      notes: n1,
      coverage: { published: 35, english: 33 },
    },
  ],
};

describe("englishKpiText", () => {
  it("영어판 이전이면 '아직 없음'과 백필 대상 규모만(0% 표기 없음)", () => {
    const text = englishKpiText(empty);
    expect(text).toContain("영어판 — 아직 없음");
    expect(text).toContain("지난 게재 1,255건은 영어 없음");
    expect(text).not.toContain("%");
    expect(englishKpiText({ ...empty, hasColumns: false })).toContain("영어 컬럼");
  });

  it("커버리지(전체·한국 매체·해외)·기각 사유·한국어 경고·최근 회차를 적는다", () => {
    const text = englishKpiText(filled);
    // 시작일은 KST 날짜(21:01 UTC = 다음 날 06:01 KST)
    expect(text).toContain("영어판 (2026-11-05 시작 이후 누적, 영어 회차 2회)");
    expect(text).toMatch(/영어 커버리지\s+96\.4% \(53\/55건\)/);
    expect(text).toMatch(/한국 매체\s+93\.3% \(14\/15건\)/);
    expect(text).toMatch(/해외 매체\s+97\.5% \(39\/40건\)/);
    expect(text).toMatch(/시작 이전 게재\s+1,255건/);
    expect(text).toMatch(
      /영어 기각 \(notes\)\s+2건 \/ 검사 55건\s+한글 0 · 숫자 1 · 길이 1 \(3\.6%\)/,
    );
    expect(text).toMatch(/한국어 숫자 불일치\s+2건/);
    const runs = text.split("최근 2회")[1];
    expect(runs.indexOf("#143")).toBeLessThan(runs.indexOf("#142"));
    expect(runs).toMatch(/11\.06 #143\s+영어 20\/20\s+DB 100% \(20\/20건\)\s+\(partial\)/);
    expect(runs).toMatch(/11\.05 #142\s+영어 33\/35.*기각 한글 0·숫자 1·길이 1\s+한국어 경고 2/);
  });
});
