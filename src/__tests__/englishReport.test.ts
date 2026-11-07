import { describe, expect, it } from "vitest";
import { englishKpiText } from "../../scripts/lib/englishReport";
import {
  sumEnglishNotes,
  sumEnglishRunCost,
  parseEnglishNotes,
  type EnglishKpi,
} from "@/lib/englishKpi";

const empty: EnglishKpi = {
  hasColumns: true,
  since: null,
  allPublished: 1255,
  overall: { published: 0, english: 0 },
  korea: { published: 0, english: 0 },
  overseas: { published: 0, english: 0 },
  checks: sumEnglishNotes([]),
  runs: [],
  cost: sumEnglishRunCost([]),
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
      costUsd: 0.0543,
      llmCalls: 5,
    },
    {
      id: 142,
      startedAt: "2026-11-04T21:01:00Z",
      status: "success",
      notes: n1,
      coverage: { published: 35, english: 33 },
      costUsd: 0.0721,
      llmCalls: 6,
    },
  ],
  cost: { runs: 2, total: 0.1264, max: 0.0721 },
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
    expect(text).toMatch(/DB 보유율\s+96\.4% \(53\/55건\)/);
    expect(text).toMatch(/한국 매체\s+93\.3% \(14\/15건\)/);
    expect(text).toMatch(/해외 매체\s+97\.5% \(39\/40건\)/);
    expect(text).toMatch(/시작 이전 게재\s+1,255건/);
    expect(text).toMatch(
      /영어 기각 \(notes\)\s+2건 \/ 검사 55건\s+한글 0 · 숫자 1 · 길이 1 \(3\.6%\)/,
    );
    expect(text).toMatch(/한국어 숫자 불일치\s+2건/);
    expect(text).toMatch(/수집 경로 커버리지\s+96\.4% \(53\/55건\)/);
    expect(text).toMatch(/회차 비용\s+평균 \$0\.0632 · 최대 \$0\.0721 \(영어 회차 2회\)/);
    const runs = text.split("최근 2회")[1];
    expect(runs.indexOf("#143")).toBeLessThan(runs.indexOf("#142"));
    expect(runs).toMatch(
      /11\.06 #143\s+영어 20\/20\s+DB 100% \(20\/20건\)\s+\$0\.0543 · 호출 5\s+\(partial\)/,
    );
    expect(runs).toMatch(/11\.05 #142\s+영어 33\/35.*기각 한글 0·숫자 1·길이 1\s+한국어 경고 2/);
  });

  it("영어 없음 = 회차 기각 + notes 밖(백필 기각·본문 없음)으로 나눠 적는다", () => {
    // 게재 100 · 영어 95 · notes 기각 2 → notes 밖 3
    const text = englishKpiText({ ...filled, overall: { published: 100, english: 95 } });
    expect(text).toMatch(/영어 없음\s+5건\s+= 회차 기각 2 \+ notes 밖 3/);
    // 빈자리가 없으면 줄을 생략
    expect(englishKpiText({ ...filled, overall: { published: 55, english: 55 } })).not.toMatch(
      /영어 없음\s+\d+건/,
    );
  });

  it("목표(Phase 8-1) PASS/FAIL 표 — 데이터 없으면 —", () => {
    const text = englishKpiText(filled);
    const targets = text.split("목표 (Phase 8-1):")[1].split("최근")[0];
    expect(targets).toMatch(/PASS 수집 경로 커버리지\s+96\.4%\s+목표 ≥ 95%/);
    expect(targets).toMatch(/FAIL DB 보유율\s+96\.4%\s+목표 ≥ 97\.5%/);
    expect(targets).toMatch(/PASS 회차 비용 평균\s+\$0\.0632\s+목표 ≤ \$0\.08/);
    expect(targets).toMatch(/PASS 회차 비용 최대\s+\$0\.0721\s+목표 ≤ \$0\.10 \(상한\)/);
    // 영어 회차 0회(백필만 있는 상태): 수집 경로·비용은 판정하지 않는다
    const backfillOnly = englishKpiText({
      ...filled,
      checks: sumEnglishNotes([]),
      cost: sumEnglishRunCost([]),
    });
    expect(backfillOnly).toMatch(/—\s+수집 경로 커버리지\s+—/);
    expect(backfillOnly).toMatch(/—\s+회차 비용 평균\s+—/);
    expect(backfillOnly).not.toMatch(/회차 비용\s+평균 \$/);
  });
});
