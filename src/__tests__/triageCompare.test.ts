// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import { summarizePicks, pickRows } from "../../scripts/lib/evalRun";
import { triageLine, type Candidate, type Pick } from "../../scripts/lib/triage";
import {
  buildLegacyTriageRequest,
  columnsTable,
  compareTable,
  DEFAULT_MAX_COST,
  DEFAULT_REV,
  knownRepeats,
  LEGACY_MAX_PICKS,
  legacyTriageFormat,
  legacyTriageLine,
  parseCompareArgs,
  pickOverlap,
  quotaWarnings,
  reportedHits,
  titleTokens,
} from "../../scripts/triage-compare";

function cand(p: Partial<Candidate> & { title?: string; content?: string } = {}): Candidate {
  return {
    item: {
      sourceId: "s",
      url: "https://x",
      title: p.title ?? "Acme releases Foo-2",
      contentRaw: p.content,
      publishedAt: "2026-10-29T03:00:00Z",
    },
    key: "k",
    score: p.score ?? 0,
    sourceName: p.sourceName ?? "TechCrunch",
    format: p.format ?? "news",
    topic: p.topic,
  };
}

describe("개편 전 선별 요청 재현", () => {
  it("줄 형식은 지금 형식에서 형식 열만 뺀 것(096de4e 형식)", () => {
    const c = cand({ format: "oss", score: 42, content: "  a\n b  " });
    expect(legacyTriageLine(c, 3)).toBe(
      "3 | TechCrunch | 10-29 | 화제 42 | Acme releases Foo-2 | a b",
    );
    const current = triageLine(c, 3).split(" | ");
    current.splice(1, 1);
    expect(legacyTriageLine(c, 3)).toBe(current.join(" | "));
    expect(legacyTriageLine(cand(), 0)).toBe(
      "0 | TechCrunch | 10-29 | - | Acme releases Foo-2 | -",
    );
  });

  it("유저 메시지는 지시 한 줄 + 후보 줄뿐(할당·이미 보도함 없음), 최대 30건", () => {
    const pool = [cand(), cand({ title: "B" })];
    const req = buildLegacyTriageRequest(pool, LEGACY_MAX_PICKS, "claude-haiku-4-5", "OLD SYSTEM");
    expect(req.params.system).toBe("OLD SYSTEM");
    expect(req.params.max_tokens).toBe(1000 + 30 * 60);
    expect(req.params.messages[0].content).toBe(
      `오늘 후보 2건 중 최대 30건을 고르세요.\n\n${legacyTriageLine(pool[0], 0)}\n${legacyTriageLine(pool[1], 1)}`,
    );
    expect(req.params.messages[0].content).not.toMatch(/오늘 할당|이미 보도함/);
  });

  it("개편 전 출력 스키마는 already_reported 없이 picks 만 — 지금 스키마와 따로 둔다", () => {
    const req = buildLegacyTriageRequest([cand()], LEGACY_MAX_PICKS, "m", "OLD");
    expect(req.params.output_config?.format).toBe(legacyTriageFormat);
    const schema = legacyTriageFormat.schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(["picks"]);
    expect(
      legacyTriageFormat.parse(
        JSON.stringify({ picks: [{ id: 0, importance: 3, duplicates: [] }] }),
      ).picks,
    ).toHaveLength(1);
  });
});

describe("--current 3열 집계", () => {
  it("columnsTable 은 열 수만큼 칸을 만들고 덧붙인 행을 뒤에 싣는다", () => {
    const pool = [cand(), cand({ format: "model" })];
    const picks: Pick[] = [{ index: 1, importance: 4, duplicates: [] }];
    const s = summarizePicks(pickRows(pool, picks));
    const table = columnsTable(
      [
        { label: "A", summary: s, enriched: false, hits: 0 },
        { label: "B", summary: s, enriched: true, hits: 1 },
        { label: "C", summary: s, enriched: true, hits: 2 },
      ],
      [["비용", "$1", "$2", "$3"]],
    );
    const lines = table.split("\n");
    expect(lines[0]).toBe("| 항목 | A | B | C |");
    expect(lines[1]).toBe("|---|---|---|---|");
    expect(table).toContain("| 모델 | 1 | 1 | 1 |");
    expect(table).toContain("| Physical AI (가공 분야) | — (미가공) | 0 | 0 |");
    expect(lines.at(-1)).toBe("| 비용 | $1 | $2 | $3 |");
  });

  it("quotaWarnings 는 collect 와 같은 미달·초과 판정(가공 분야 우선, 없으면 topic)", () => {
    const pool = [
      ...Array.from({ length: 10 }, () => cand()),
      ...Array.from({ length: 10 }, () => cand({ topic: "physical" })),
      cand({ format: "model" }),
    ];
    // maxPicks 4 → Physical AI 상한 max(3, 1) = 3. topic physical 4건 선정 → 초과, 모델 0 → 미달.
    const rows = [10, 11, 12, 13].map((i) => ({
      importance: 3,
      format: pool[i].format,
      topic: pool[i].topic,
    }));
    expect(quotaWarnings(pool, rows, 4)).toBe(
      "할당 미달: 비뉴스 0/1, 모델 0/1 / 할당 초과: Physical AI 4/3",
    );
    // 가공 분야가 있으면 그걸로 센다
    const relabeled = rows.map((r) => ({ ...r, category: "industry" as const }));
    expect(quotaWarnings(pool, relabeled, 4)).toBe(
      "할당 미달: 비뉴스 0/1, 모델 0/1, Physical AI 0/3",
    );
  });

  it("knownRepeats 는 대표로 다시 고른 번호만(묶음은 세지 않는다)", () => {
    const picks: Pick[] = [
      { index: 60, importance: 5, duplicates: [57] },
      { index: 3, importance: 3, duplicates: [] },
    ];
    expect(knownRepeats(picks, [60, 57, 130])).toEqual([60]);
  });
});

describe("pickOverlap", () => {
  const p = (index: number, duplicates: number[] = []): Pick => ({
    index,
    importance: 3,
    duplicates,
  });

  it("같은 대표 수와, 상대 선정(대표·묶음)에 든 수를 센다", () => {
    const oldPicks = [p(1), p(2), p(3)];
    const newPicks = [p(1), p(4, [2]), p(5)];
    expect(pickOverlap(oldPicks, newPicks)).toEqual({
      common: 1, // 1
      oldCoveredByNew: 2, // 1, 2(새 4번의 묶음)
      newCoveredByOld: 1, // 1
    });
  });
});

describe("compareTable", () => {
  it("형식·비뉴스·Physical AI·중요도·이미 보도함 행을 나란히 싣는다", () => {
    const pool = [cand(), cand({ format: "paper", topic: "physical" })];
    const picks: Pick[] = [
      { index: 0, importance: 5, duplicates: [] },
      { index: 1, importance: 4, duplicates: [] },
    ];
    const oldS = summarizePicks(pickRows(pool, picks.slice(0, 1)));
    const newS = summarizePicks(
      pickRows(pool, picks, {
        1: { title_ko: "t", summary_ko: "s", category: "physical", tags: [] },
      }),
    );
    const table = compareTable(oldS, newS, { old: 0, new: 1 }, "096de4e");
    expect(table).toContain("| 항목 | 개편 전(096de4e) | 개편 후 |");
    expect(table).toContain("| 논문 | 0 | 1 |");
    expect(table).toContain("| 비뉴스 합계 | 0 | 1 |");
    expect(table).toContain("| Physical AI (소스 topic) | 0 | 1 |");
    expect(table).toContain("| Physical AI (가공 분야) | — (미가공) | 1 |");
    expect(table).toContain("| 중요도 5:4:3:2:1 | 5:1 4:0 3:0 2:0 1:0 | 5:1 4:1 3:0 2:0 1:0 |");
    expect(table).toContain("| 이미 보도함 유사 (휴리스틱) | 0 | 1 |");
  });
});

describe("이미 보도함 유사 휴리스틱", () => {
  it("titleTokens: 불용어·짧은 영문 제외, 버전 토큰 유지, 한글 끝 조사 하나 제거", () => {
    const t = titleTokens("OpenAI releases GPT-5.5 for the new API");
    expect([...t].sort()).toEqual(["api", "gpt-5.5", "openai"]);
    expect(titleTokens("미스트랄은 라지 4를 공개")).toEqual(new Set(["미스트랄", "라지", "4"]));
  });

  const reported = [
    {
      issueDate: "2026-10-29",
      title: "북미 로봇 수주, 2026년 Q3 24.8% 증가…자동차 부품업체 수요 급증",
    },
    { issueDate: "2026-10-29", title: "Kimi K3.1 Pro 공개" },
    { issueDate: "2026-10-28", title: "OpenAI, 새 에이전트 도구 공개" },
    { issueDate: "2026-10-28", title: "OpenAI, 학계와 협력" },
    { issueDate: "2026-10-28", title: "OpenAI, Oracle 제휴" },
  ];

  it("드문 토큰 2개 이상을 공유하면 유사", () => {
    const hits = reportedHits(
      ["북미 산업용 로봇 주문 24.8% 증가…자동차 부품·반도체가 견인"],
      reported,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].headline).toBe(reported[0].title);
    expect(hits[0].shared).toEqual(expect.arrayContaining(["북미", "24.8", "자동차"]));
  });

  it("숫자 섞인 모델명·버전 토큰 하나만 겹쳐도 유사", () => {
    expect(reportedHits(["Moonshot ships K3.1 weights"], reported)[0]?.headline).toBe(
      "Kimi K3.1 Pro 공개",
    );
  });

  it("여러 제목에 흔한 토큰(openai — 3건)만 겹치면 유사가 아니다", () => {
    expect(reportedHits(["OpenAI hires a new CFO"], reported)).toEqual([]);
  });
});

describe("parseCompareArgs", () => {
  it("스냅숏 경로(필수)와 --rev(기본 096de4e)", () => {
    expect(parseCompareArgs(["a.json"])).toEqual({
      snapshot: path.resolve("a.json"),
      rev: DEFAULT_REV,
      current: false,
      known: [],
      maxCost: DEFAULT_MAX_COST,
    });
    expect(parseCompareArgs(["--rev", "abc123", "a.json"]).rev).toBe("abc123");
  });

  it("--current · --known · --max-cost", () => {
    expect(
      parseCompareArgs(["a.json", "--current", "--known", "60, 130,48", "--max-cost", "0.2"]),
    ).toMatchObject({ current: true, known: [60, 130, 48], maxCost: 0.2 });
    expect(() => parseCompareArgs(["a.json", "--known", "1,x"])).toThrow(/0 이상 정수/);
    expect(() => parseCompareArgs(["a.json", "--known"])).toThrow(/풀 번호/);
    expect(() => parseCompareArgs(["a.json", "--max-cost", "0"])).toThrow(/0 보다 큰/);
  });

  it("스냅숏이 없거나 둘 이상, 모르는 옵션은 오류", () => {
    expect(() => parseCompareArgs([])).toThrow(/사용법/);
    expect(() => parseCompareArgs(["a.json", "b.json"])).toThrow(/하나만/);
    expect(() => parseCompareArgs(["a.json", "--max"])).toThrow(/알 수 없는 옵션/);
    expect(() => parseCompareArgs(["a.json", "--rev"])).toThrow(/커밋이 필요/);
  });
});
