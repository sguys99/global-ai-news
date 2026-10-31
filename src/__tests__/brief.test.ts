import { describe, expect, it } from "vitest";
import { parseRunNotes } from "../../scripts/lib/baseline";
import {
  BRIEF_LINE_MAX_CHARS,
  BRIEF_OUTPUT_TOKENS,
  briefNote,
  cleanBriefText,
  numbersIn,
  resolveBrief,
  serializeBrief,
} from "../../scripts/lib/brief";
import { triageSchema } from "../../scripts/lib/schema";
import { buildTriageRequest, estimateTriageTokens, type Pick } from "../../scripts/lib/triage";
import type { Candidate } from "../../scripts/lib/triage";

const pick = (index: number, duplicates: number[] = [], importance = 4): Pick => ({
  index,
  importance,
  duplicates,
});

describe("cleanBriefText", () => {
  it("공백을 정리하고 앞 목록 기호·말미 마침표를 뗀다", () => {
    expect(cleanBriefText("  1. 애크미,  400B 오픈 모델 '푸-2' 공개.  ")).toBe(
      "애크미, 400B 오픈 모델 '푸-2' 공개",
    );
    expect(cleanBriefText("- 베타로보틱스, 휴머노이드 양산 착수")).toBe(
      "베타로보틱스, 휴머노이드 양산 착수",
    );
    expect(cleanBriefText("① 감마, 추론 칩 공개 계획 발표")).toBe("감마, 추론 칩 공개 계획 발표");
  });

  it("본문 숫자·기호로 시작하는 줄은 건드리지 않는다", () => {
    expect(cleanBriefText("2.5배 빨라진 추론 엔진, 오픈소스로 공개")).toBe(
      "2.5배 빨라진 추론 엔진, 오픈소스로 공개",
    );
    expect(cleanBriefText("3D 생성 모델 '루멘' 가중치 공개")).toBe(
      "3D 생성 모델 '루멘' 가중치 공개",
    );
  });

  it("한글이 없거나 너무 짧거나 길면 버린다(자르지 않는다)", () => {
    expect(cleanBriefText("Acme releases Foo-2 open model")).toBeNull();
    expect(cleanBriefText("투자 유치")).toBeNull();
    expect(cleanBriefText("가".repeat(BRIEF_LINE_MAX_CHARS))).toBe(
      "가".repeat(BRIEF_LINE_MAX_CHARS),
    );
    expect(cleanBriefText("가".repeat(BRIEF_LINE_MAX_CHARS + 1))).toBeNull();
    expect(cleanBriefText(undefined)).toBeNull();
    expect(cleanBriefText(42)).toBeNull();
  });
});

/** 게재 선정의 한국어 가공 텍스트(제목·요약) — 기사 대조·수치 대조의 근거. */
const ARTICLES: Record<number, [string, string]> = {
  3: [
    "애크미, 400B 오픈 웨이트 모델 '푸-2' 공개",
    "애크미가 4,000억 파라미터 모델 푸-2 가중치를 공개했다.",
  ],
  5: [
    "베타로보틱스, 휴머노이드 양산 위해 3억 달러 유치",
    "베타로보틱스가 시리즈 C로 3억 달러를 모았다.",
  ],
  11: ["감마칩, 추론 전용 반도체 '감마-X' 발표", "감마칩이 데이터센터용 추론 칩을 내놓았다."],
  12: [
    "델타, 코딩 에이전트 '델타코드' 오픈소스 공개",
    "델타가 터미널 코딩 에이전트를 MIT 라이선스로 풀었다.",
  ],
};
const LINES: Record<number, string> = {
  3: "애크미, 400B 오픈 웨이트 모델 '푸-2' 공개",
  5: "베타로보틱스, 휴머노이드 양산에 3억 달러 유치",
  11: "감마칩, 추론 전용 반도체 '감마-X' 발표",
  12: "델타, 터미널 코딩 에이전트 '델타코드' 공개",
};
const evidence = (ids: number[] = [3, 5, 11, 12]) =>
  new Map(ids.map((i) => [i, { title: ARTICLES[i][0], summary: ARTICLES[i][1] }]));
const line = (id: number, about = id) => ({ id, text: LINES[about] });

describe("resolveBrief — 게재된 선정의 줄만 남긴다", () => {
  const picks = [pick(3, [7, 9]), pick(5), pick(11), pick(12)];

  it("앞에서부터 3줄, 대표 선정의 풀 번호로", () => {
    const r = resolveBrief([line(3), line(5), line(11), line(12)], picks, evidence());
    expect(r.lines.map((l) => l.index)).toEqual([3, 5, 11]);
    expect(r).toMatchObject({
      submitted: 4,
      invalid: 0,
      unpublished: 0,
      mismatched: 0,
      repaired: 0,
    });
  });

  it("묶음(duplicates) 번호는 대표 선정으로 풀고, 같은 선정을 가리키는 둘째 줄은 버린다", () => {
    const r = resolveBrief([line(7, 3), line(3), line(5)], picks, evidence());
    expect(r.lines.map((l) => l.index)).toEqual([3, 5]);
    expect(r.lines[0].text).toBe(LINES[3]);
  });

  it("빠진 선정(재보도 제외·가공 실패)·고르지 않은 후보 번호의 줄을 버리고 예비 줄로 채운다", () => {
    // 5번은 재보도 검사로 빠졌다(게재 맵에 없음), 40번은 고르지 않은 후보
    const r = resolveBrief(
      [line(3), line(5), { id: 40, text: LINES[11] }, line(11), line(12)],
      picks,
      evidence([3, 11, 12]),
    );
    expect(r.lines.map((l) => l.index)).toEqual([3, 11, 12]);
    expect(r.unpublished).toBe(2);
  });

  it("번호 착오: 다른 기사 내용을 쓴 줄은 버린다(2026-10-31 실측 — 로보택시 줄에 중기부 기사 번호)", () => {
    const r = resolveBrief(
      [
        line(3),
        { id: 5, text: LINES[11] },
        { id: 12, text: "에타, 뮌헨서 로보택시 시범 운행 시작" },
        line(11),
      ],
      picks,
      evidence(),
    );
    expect(r.mismatched).toBe(2);
    expect(r.lines.map((l) => l.index)).toEqual([3, 11]);
  });

  it("수치 불일치: 기사에 없는 숫자(단위 환산 오류)가 있는 줄은 그 기사의 가공 제목으로 바꾼다", () => {
    const r = resolveBrief(
      [
        { id: 5, text: "베타로보틱스, 휴머노이드 양산에 30억 달러 유치" }, // 기사는 3억 달러
        line(3),
        line(11),
      ],
      picks,
      evidence(),
    );
    expect(r.repaired).toBe(1);
    expect(r.lines).toEqual([
      { index: 5, text: ARTICLES[5][0] },
      { index: 3, text: LINES[3] },
      { index: 11, text: LINES[11] },
    ]);
    expect(briefNote(r)).toBe(
      "세 줄 요약 3줄(제출 3줄 — 미게재 0·기사 불일치 0·형식 오류 0줄 제외, 수치 불일치 1줄은 가공 제목으로)",
    );
  });

  it("representativeOf: 같은 사건으로 합쳐져 사라진 선정의 줄은 남은 대표 기사로 옮긴다", () => {
    // 11번 선정이 가공 뒤 3번에 합쳐졌다(게재 맵에 11 없음) — 11을 가리키는 줄은 3번 내용과 맞을 때만 3번 줄이 된다
    const merged = (i: number) => (i === 11 ? 3 : i);
    const r = resolveBrief(
      [{ id: 11, text: LINES[3] }, line(5), line(12)],
      picks,
      evidence([3, 5, 12]),
      merged,
    );
    expect(r.lines.map((l) => l.index)).toEqual([3, 5, 12]);
    expect(resolveBrief([line(11), line(5)], picks, evidence([3, 5, 12])).unpublished).toBe(1);
  });

  it("형식이 틀린 줄(영문·초과 길이)은 invalid 로 센다", () => {
    const r = resolveBrief(
      [{ id: 3, text: "Acme releases Foo-2 open model" }, line(5), line(11)],
      picks,
      evidence(),
    );
    expect(r.invalid).toBe(1);
    expect(r.lines.map((l) => l.index)).toEqual([5, 11]);
  });

  it("남은 줄이 2줄 미만이면 요약 없음(fail-open)", () => {
    const r = resolveBrief([line(3), line(5)], picks, evidence([3]));
    expect(r.lines).toEqual([]);
    expect(briefNote(r)).toBe("세 줄 요약 생략: 남은 줄 1/2(미게재 1·기사 불일치 0·형식 오류 0)");
  });

  it("출력이 없거나 배열이 아니면 빈 결과 — throw 하지 않는다", () => {
    expect(resolveBrief(undefined, picks, evidence()).lines).toEqual([]);
    expect(resolveBrief(null, picks, evidence()).lines).toEqual([]);
    expect(
      resolveBrief("x" as unknown as { id: number; text: string }[], picks, evidence()).lines,
    ).toEqual([]);
    expect(
      resolveBrief(
        [null, { id: 1.5, text: LINES[3] }] as unknown as { id: number; text: string }[],
        picks,
        evidence(),
      ).lines,
    ).toEqual([]);
    expect(resolveBrief([line(3), line(5)], picks, new Map()).lines).toEqual([]);
    expect(briefNote(resolveBrief([], picks, evidence()))).toBe("세 줄 요약 생략: 출력 없음");
  });
});

describe("numbersIn", () => {
  it("쉼표를 뺀 숫자 표기 — 30 과 300 은 다른 수", () => {
    expect([...numbersIn("목표 300억 달러의 37%, 3,000명·1.25조·Figure 04")]).toEqual([
      "300",
      "37",
      "3000",
      "1.25",
      "04",
    ]);
    expect(numbersIn("300억 달러").has("30")).toBe(false);
  });
});

describe("briefNote", () => {
  it("게재 줄 수와 제외 사유를 남기고, kpi baseline 파싱에 영향이 없다", () => {
    const r = resolveBrief(
      [line(3), { id: 99, text: "고르지 않은 후보를 가리키는 줄" }, line(5)],
      [pick(3), pick(5)],
      evidence([3, 5]),
    );
    const note = briefNote(r);
    expect(note).toBe("세 줄 요약 2줄(제출 3줄 — 미게재 1·기사 불일치 0·형식 오류 0줄 제외)");
    expect(parseRunNotes(`선별 풀: 후보 200건 중 180건; 선정 30건; ${note}`)).toMatchObject({
      poolCandidates: 200,
      poolSize: 180,
      picks: 30,
    });
  });
});

describe("serializeBrief", () => {
  const lines = [
    { index: 3, text: "첫째 줄 핵심 요약 문장" },
    { index: 5, text: "둘째 줄 핵심 요약 문장" },
    { index: 11, text: "셋째 줄 핵심 요약 문장" },
  ];

  it("풀 번호를 기사 id 로 바꿔 JSON 으로", () => {
    const json = serializeBrief(
      lines,
      new Map([
        [3, 101],
        [5, 102],
        [11, 103],
      ]),
    );
    expect(JSON.parse(json!)).toEqual([
      { id: 101, text: "첫째 줄 핵심 요약 문장" },
      { id: 102, text: "둘째 줄 핵심 요약 문장" },
      { id: 103, text: "셋째 줄 핵심 요약 문장" },
    ]);
  });

  it("id 를 못 찾은 줄(저장이 무시된 행)은 빼고, 2줄 미만이면 null", () => {
    expect(
      JSON.parse(
        serializeBrief(
          lines,
          new Map([
            [3, 1],
            [11, 3],
          ]),
        )!,
      ),
    ).toHaveLength(2);
    expect(serializeBrief(lines, new Map([[3, 1]]))).toBeNull();
    expect(serializeBrief([], new Map())).toBeNull();
  });
});

describe("선별 스키마·요청의 brief", () => {
  it("brief 줄은 길이 제약 없이 받는다 — 줄 검사 실패가 선별 전체를 버리지 않게", () => {
    const parsed = triageSchema.parse({
      already_reported: [],
      picks: [{ id: 0, importance: 3, duplicates: [] }],
      brief: [
        { id: 0, text: "가".repeat(200) },
        { id: 0, text: "" },
      ],
    });
    expect(parsed.brief).toHaveLength(2);
  });

  it("max_tokens·출력 추정에 brief 몫을 더한다", () => {
    const pool: Candidate[] = [
      {
        item: {
          sourceId: "hn",
          url: "https://a",
          title: "Acme releases Foo-2",
          publishedAt: "2026-10-30T00:00:00Z",
        },
        key: "k",
        score: 0,
        sourceName: "Hacker News",
        format: "news",
      },
    ];
    const req = buildTriageRequest(pool, 35, "m");
    expect(req.params.max_tokens).toBe(1000 + 35 * 60 + BRIEF_OUTPUT_TOKENS * 2);
    expect(estimateTriageTokens(req, 35).output).toBe(35 * 25 + BRIEF_OUTPUT_TOKENS);
  });
});
