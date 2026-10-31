// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { parseRunNotes } from "../../scripts/lib/baseline";
import { approxTokens, outputFormatTokens } from "../../scripts/lib/cost";
import type { LlmResult, LlmRunner } from "../../scripts/lib/llm";
import {
  attachReportedSummaries,
  buildRepeatRequest,
  dropRepeats,
  estimateRepeatTokens,
  firstSentence,
  interpretRepeatResult,
  repeatFormat,
  repeatNote,
  resolveRepeats,
  runRepeatCheck,
  toRepeatInputs,
  type RepeatInput,
} from "../../scripts/lib/repeatCheck";
import type { ArticleEnrichment } from "../../scripts/lib/schema";
import type { Pick, ReportedHeadline } from "../../scripts/lib/triage";

function message(
  text: string,
  stop_reason: Anthropic.Message["stop_reason"] = "end_turn",
): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 30 },
  } as unknown as Anthropic.Message;
}

const ok = (output: unknown): LlmResult => ({
  message: message(JSON.stringify(output)),
  batch: true,
});

const reported: ReportedHeadline[] = [
  { issueDate: "2026-10-30", title: "Mistral Large 4 가중치 공개" },
  { issueDate: "2026-10-29", title: "북미 로봇 수주, 3분기 24.8% 증가" },
  { issueDate: "2026-10-28", title: "OpenAI, Oracle과 제휴 확대" },
];

const inputs: RepeatInput[] = [
  {
    id: 60,
    title: "미스트랄, 라지 4 가중치 공개로 정식 출시",
    summary:
      "미스트랄 AI가 미스트랄 라지 4의 오픈웨이트 버전을 공개했다. 기업이 직접 내려받아 쓸 수 있다.",
  },
  { id: 48, title: "북미 산업용 로봇 주문 24.8% 증가", summary: "3분기 주문이 1.2배 늘었다." },
  { id: 7, title: "앤트로픽, 신규 모델 공개", summary: "앤트로픽이 새 모델을 공개했다" },
];

const enrichment = (title: string): ArticleEnrichment => ({
  title_ko: title,
  summary_ko: `${title} 요약.`,
  category: "industry",
  tags: ["x"],
});

describe("firstSentence", () => {
  it("첫 마침표(뒤에 공백·끝) 까지 — 소수점·버전의 점은 자르지 않는다", () => {
    expect(firstSentence("주문이 1.2배 늘었다. 협동로봇은 56% 증가했다.")).toBe(
      "주문이 1.2배 늘었다.",
    );
    expect(firstSentence("v4.1 플래시가 나왔다")).toBe("v4.1 플래시가 나왔다");
    expect(firstSentence("가".repeat(200), 10)).toBe(`${"가".repeat(10)}…`);
  });
});

describe("buildRepeatRequest", () => {
  it("이미 보도함은 `R번호 | MM-DD | 제목`, 오늘 기사는 `번호 | 제목 | 요약 첫 문장`", () => {
    const req = buildRepeatRequest(inputs, reported, "claude-haiku-4-5");
    expect(req.id).toBe("repeat-check");
    expect(req.params.model).toBe("claude-haiku-4-5");
    expect(req.params.output_config?.format?.type).toBe("json_schema");
    const user = req.params.messages[0].content as string;
    expect(user).toContain("이미 보도함 3건과 오늘 게재 예정 3건을 대조하세요.");
    expect(user).toContain(
      "## 이미 보도함\nR1 | 10-30 | Mistral Large 4 가중치 공개\nR2 | 10-29 | 북미 로봇 수주, 3분기 24.8% 증가\nR3 | 10-28 | OpenAI, Oracle과 제휴 확대",
    );
    expect(user).toContain(
      "## 오늘 게재 예정\n60 | 미스트랄, 라지 4 가중치 공개로 정식 출시 | 미스트랄 AI가 미스트랄 라지 4의 오픈웨이트 버전을 공개했다.\n48 | ",
    );
    // 첫 문장만 — 둘째 문장은 싣지 않는다.
    expect(user).not.toContain("내려받아");
    expect(req.params.max_tokens).toBeGreaterThanOrEqual(200 + 3 * 24);
  });

  it("시스템 프롬프트: 재보도·후속 보도 구분과 R번호 숫자 출력", () => {
    const system = buildRepeatRequest(inputs, reported, "m").params.system as string;
    expect(system).toContain("**repeats**");
    expect(system).toContain("**followups**");
    expect(system).toContain("발표했던 모델의 실제 출시·가중치 공개");
    expect(system).toContain("R12 → 12");
    expect(system).toContain("주체만 같은 기사");
    // 7-3 오탐 대응: 회사·주제·단어 하나만 겹치는 짝과, 한쪽 기사만 설명하는 event 를 막는다.
    expect(system).toContain("주제·단어만 겹치는 기사");
    expect(system).toContain("두 제목을 모두 그대로 설명하는 구절");
    expect(system).toContain("`event`");
  });

  it("추정 토큰: 시스템+유저 + 구조화 출력 스키마, 출력은 짝 몇 건 몫", () => {
    const req = buildRepeatRequest(inputs, reported, "m");
    const est = estimateRepeatTokens(req, inputs.length);
    const user = req.params.messages[0].content as string;
    expect(est.input).toBe(
      approxTokens((req.params.system as string) + user) + outputFormatTokens(repeatFormat),
    );
    expect(est.output).toBeGreaterThan(0);
    expect(estimateRepeatTokens(req, 40).output).toBeGreaterThan(est.output);
  });

  it("toRepeatInputs: 가공된 선정만, 선정 순서대로", () => {
    const picks: Pick[] = [
      { index: 5, importance: 4, duplicates: [] },
      { index: 2, importance: 3, duplicates: [] },
      { index: 9, importance: 3, duplicates: [] },
    ];
    const enriched = new Map([
      [9, enrichment("구")],
      [5, enrichment("오")],
    ]);
    expect(toRepeatInputs(picks, (i) => enriched.get(i))).toEqual([
      { id: 5, title: "오", summary: "오 요약." },
      { id: 9, title: "구", summary: "구 요약." },
    ]);
  });
});

describe("resolveRepeats", () => {
  it("요청에 없던 id·범위 밖 R번호는 버리고, 한 기사는 처음 짝만", () => {
    const v = resolveRepeats(
      {
        repeats: [
          { id: 60, reported: 1 },
          { id: 60, reported: 3 }, // 같은 기사 두 번 — 처음 짝만
          { id: 99, reported: 1 }, // 요청에 없던 id
          { id: 48, reported: 0 }, // R0 없음
          { id: 7, reported: 4 }, // R4 없음(3건)
        ],
        followups: [{ id: 48, reported: 7 }], // 범위 밖
      },
      [60, 48, 7],
      3,
    );
    expect(v).toEqual({ repeats: [{ id: 60, reported: 1 }], followups: [] });
  });

  it("repeats·followups 양쪽에 적힌 기사는 빼지 않는다(후속 보도로 센다)", () => {
    const v = resolveRepeats(
      {
        repeats: [
          { id: 60, reported: 1 },
          { id: 48, reported: 2 },
        ],
        followups: [{ id: 60, reported: 1 }],
      },
      [60, 48],
      3,
    );
    expect(v.repeats).toEqual([{ id: 48, reported: 2 }]);
    expect(v.followups).toEqual([{ id: 60, reported: 1 }]);
  });

  it("notes: `재보도 제외 N건(후속 보도 유지 M건)` — 둘 다 0 이면 null, kpi baseline 파싱과 겹치지 않는다", () => {
    expect(repeatNote({ repeats: [], followups: [] })).toBeNull();
    expect(repeatNote({ repeats: [{ id: 1, reported: 1 }], followups: [] })).toBe(
      "재보도 제외 1건",
    );
    const note = repeatNote({
      repeats: [
        { id: 1, reported: 1 },
        { id: 2, reported: 2 },
      ],
      followups: [{ id: 3, reported: 3 }],
    })!;
    expect(note).toBe("재보도 제외 2건(후속 보도 유지 1건)");
    const notes = `aitimes: 10건(신규 8); 선별 풀: 후보 200건 중 180건; 선정 33건(같은 사건으로 묶인 기사 5건); ${note}; 재보도 검사 실패(전부 게재): batch errored; 논문 분야 쏠림: Physical AI 5/8`;
    expect(parseRunNotes(notes)).toEqual({
      sources: { aitimes: { fetched: 10, fresh: 8, cap: null, error: null } },
      poolCandidates: 200,
      poolSize: 180,
      picks: 33,
      grouped: 5,
    });
  });
});

describe("interpretRepeatResult (실패에 열림)", () => {
  it("검증된 응답 → 짝과 notes", () => {
    const out = interpretRepeatResult(
      ok({
        repeats: [{ id: 60, reported: 1, event: "미스트랄 라지 4 가중치 공개" }],
        followups: [],
      }),
      inputs,
      reported,
    );
    expect(out).toEqual({
      status: "ok",
      repeats: [{ id: 60, reported: 1, event: "미스트랄 라지 4 가중치 공개" }],
      followups: [],
      rejected: [],
      note: "재보도 제외 1건",
      rejectNote: null,
    });
  });

  it("응답 없음·오류·스키마 불일치·토큰 한도 → 아무것도 빼지 않고 실패 note", () => {
    const cases: [LlmResult | undefined, RegExp][] = [
      [undefined, /응답 검증 실패/],
      [{ message: null, error: "batch errored", batch: true }, /batch errored/],
      [{ message: message('{"repeats":"x"}'), batch: false }, /응답 검증 실패/],
      // event 누락도 스키마 불일치.
      [
        { message: message('{"repeats":[{"id":60,"reported":1}],"followups":[]}'), batch: false },
        /응답 검증 실패/,
      ],
      [
        {
          message: message('{"repeats":[{"id":60,"reported":1}],"followups":[]}', "max_tokens"),
          batch: false,
        },
        /응답 검증 실패/,
      ],
    ];
    for (const [result, reason] of cases) {
      const out = interpretRepeatResult(result, inputs, reported);
      expect(out.status).toBe("failed");
      expect(out.repeats).toEqual([]);
      expect(out.note).toMatch(/^재보도 검사 실패\(전부 게재\): /);
      expect(out.note).toMatch(reason);
    }
  });
});

describe("runRepeatCheck", () => {
  const opts = { remainingUsd: 1, batch: true };

  it("이미 보도함이나 검사할 기사가 없으면 호출하지 않는다(note 없음)", async () => {
    const runner = { run: vi.fn() };
    for (const [ins, rep] of [
      [[], reported],
      [inputs, []],
    ] as const) {
      const out = await runRepeatCheck(runner, [...ins], [...rep], "m", opts);
      expect(out).toEqual({
        status: "skipped",
        repeats: [],
        followups: [],
        rejected: [],
        note: null,
        rejectNote: null,
      });
    }
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("추정 비용이 남은 한도를 넘으면 호출하지 않고 note 만 남긴다", async () => {
    const runner = { run: vi.fn() };
    const out = await runRepeatCheck(runner, inputs, reported, "claude-haiku-4-5", {
      remainingUsd: 0.000001,
      batch: true,
    });
    expect(out.status).toBe("skipped");
    expect(out.note).toMatch(/^재보도 검사 생략: 비용 한도 초과 예상/);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("요청 1건을 러너로 보내고 판정을 돌려준다", async () => {
    const runner = {
      run: vi.fn<LlmRunner["run"]>(
        async () =>
          new Map([
            [
              "repeat-check",
              ok({
                repeats: [{ id: 48, reported: 2, event: "북미 로봇 주문 24.8%" }],
                followups: [{ id: 60, reported: 1, event: "라지 4" }],
              }),
            ],
          ]),
      ),
    };
    const out = await runRepeatCheck(runner, inputs, reported, "m", opts);
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(runner.run.mock.calls[0][0]).toHaveLength(1);
    expect(out.repeats).toEqual([{ id: 48, reported: 2, event: "북미 로봇 주문 24.8%" }]);
    expect(out.note).toBe("재보도 제외 1건(후속 보도 유지 1건)");
  });

  it("러너가 throw 해도 실패로 돌려 전부 게재한다", async () => {
    const runner = {
      run: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    const out = await runRepeatCheck(runner, inputs, reported, "m", opts);
    expect(out).toMatchObject({ status: "failed", repeats: [] });
    expect(out.note).toContain("network down");
  });
});

describe("dropRepeats (collect 저장 의미)", () => {
  const picks: Pick[] = [
    { index: 0, importance: 5, duplicates: [3, 4] },
    { index: 1, importance: 4, duplicates: [] },
    { index: 2, importance: 3, duplicates: [5] },
  ];
  const enriched = new Map([
    [0, enrichment("a")],
    [1, enrichment("b")],
    [2, enrichment("c")],
  ]);

  it("재보도 선정을 게재 목록·가공 결과에서 빼고, 뺀 선정을 돌려준다", () => {
    const out = dropRepeats(picks, enriched, [0, 99]);
    expect(out.picks.map((p) => p.index)).toEqual([1, 2]);
    expect([...out.enriched.keys()]).toEqual([1, 2]);
    expect(out.dropped.map((p) => p.index)).toEqual([0]);
    // 원본은 그대로.
    expect(picks).toHaveLength(3);
    expect(enriched.size).toBe(3);
  });

  it("뺀 선정과 그 묶음은 남은 선정 어디에도 없다 → persist 가 미선정처럼 seen_items 로 보낸다(재심사 행은 삭제)", () => {
    const out = dropRepeats(picks, enriched, [0]);
    const judged = new Set(out.picks.flatMap((p) => [p.index, ...p.duplicates]));
    for (const i of [0, 3, 4]) expect(judged.has(i)).toBe(false);
    expect(judged).toEqual(new Set([1, 2, 5]));
  });

  it("재보도가 없으면 그대로", () => {
    const out = dropRepeats(picks, enriched, []);
    expect(out.picks).toEqual(picks);
    expect(out.dropped).toEqual([]);
    expect(out.enriched.size).toBe(3);
  });
});

describe("attachReportedSummaries", () => {
  const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

  it("호 날짜(KST)·제목이 같은 공개 기사의 요약을 붙이고, 못 찾으면 제목만 둔다", () => {
    const db = new Database(":memory:");
    db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    db.prepare(
      "INSERT INTO sources (id, name, kind, url) VALUES ('s', 'S', 'rss', 'https://s')",
    ).run();
    let n = 0;
    const ins = (createdAt: string, title: string, summary: string | null) =>
      db
        .prepare(
          `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, created_at,
             title_ko, summary_ko) VALUES (?, 's', ?, 'o', '2026-10-01T00:00:00Z', ?, ?, ?)`,
        )
        .run(`k${++n}`, `https://s/${n}`, createdAt, title, summary);

    ins("2026-10-29 21:00:00", "같은 제목", "10-30 호 요약."); // 21:00 UTC = 10-30 06:00 KST
    ins("2026-10-28 21:00:00", "같은 제목", "10-29 호 요약."); // 같은 제목이라도 다른 호는 섞지 않는다
    ins("2026-10-29 21:00:00", "미가공", null);

    const reported: ReportedHeadline[] = [
      { issueDate: "2026-10-30", title: "같은 제목" },
      { issueDate: "2026-10-30", title: "미가공" },
      { issueDate: "2026-10-30", title: "없는 제목" },
    ];
    expect(attachReportedSummaries(db, reported)).toEqual([
      { issueDate: "2026-10-30", title: "같은 제목", summary: "10-30 호 요약." },
      { issueDate: "2026-10-30", title: "미가공" },
      { issueDate: "2026-10-30", title: "없는 제목" },
    ]);
    db.close();
  });

  it("요약이 있으면 이미 보도함 줄에 `제목 — 요약 첫 문장`으로 싣는다", () => {
    const withSummary: ReportedHeadline[] = [
      {
        issueDate: "2026-10-30",
        title: "구글, 문서 편집 기능",
        summary: "구글이 편집 기능을 냈다. 둘째 문장.",
      },
      { issueDate: "2026-10-29", title: "제목만" },
    ];
    const user = buildRepeatRequest(inputs, withSummary, "m").params.messages[0].content as string;
    expect(user).toContain(
      "R1 | 10-30 | 구글, 문서 편집 기능 — 구글이 편집 기능을 냈다.\nR2 | 10-29 | 제목만",
    );
    expect(user).not.toContain("둘째 문장");
  });
});
