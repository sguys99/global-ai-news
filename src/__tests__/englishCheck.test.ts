import { describe, expect, it } from "vitest";
import {
  ENGLISH_REJECT_REASONS,
  SUMMARY_EN_MAX_WORDS,
  SUMMARY_EN_MIN_WORDS,
  TITLE_EN_MAX_CHARS,
  TITLE_EN_MIN_CHARS,
  checkEnglish,
  checkKoreanNumbers,
  englishCheckNotes,
  findUnsupportedNumbers,
  tallyEnglishChecks,
  type EnglishCheckResult,
} from "../../scripts/lib/englishCheck";

const ev = (title: string, content = "") => ({ title, content });
const passes = (out: string, src: string) => findUnsupportedNumbers(out, ev(src)).length === 0;

/** 길이 검사를 통과하는 요약(숫자 없음, 12단어). */
const SUMMARY =
  "The company announced a new product for enterprise customers and developers this week.";

describe("findUnsupportedNumbers — 0-3 경계 사례 39개", () => {
  // [영어 출력, 근거(원문), 통과해야 하는가] — docs/english-version/phase0/0-3-english-quality.md "경계 사례 39개"
  const cases: [string, string, boolean][] = [
    ["KRW 1 trillion", "1조 원 규모", true],
    ["KRW 1.1 trillion", "1조1000억원", true],
    ["KRW 98.9 billion", "989억 규모 국책과제", true],
    ["KRW 670 billion", "6700억 투자 유치", true],
    ["KRW 1 billion a month", "월 매출 10억 목표", true],
    ["KRW 100 million a month", "월 매출 10억 목표", false],
    ["$465 million", "4억6500만달러(약 6250억원)", true],
    ["$164 million", "약 1억6400만달러", true],
    ["$9 billion", "90억 달러", true],
    ["$90 billion", "$900B AI spending", false],
    ["$900 billion", "$900B AI spending", true],
    ["$1.2 billion", "raised $1.2B", true],
    ["$62.5 million", "$62.5M", true],
    ["1.19 million subscribers", "119만 구독자", true],
    ["50,000 hours", "5만시간 뇌 데이터", true],
    ["167 million to 1.2 billion parameters", "From 167M to 1.2B parameters", true],
    ["a 27B model", "Apriel Voice 27B Preview", true],
    ["27 billion parameters", "Apriel Voice 27B Preview", true],
    ["2.7 billion parameters", "Apriel Voice 27B Preview", false],
    ["GPT-5.1", "GPT-5.1 출시", true],
    ["GPT-5.1", "GPT-5 출시", false],
    ["98.90 on Big Bench Audio", "98.9점", true],
    ["49%", "49 percent", true],
    ["the 16th meeting", "제16회 국가정책조정회의", true],
    ["by 2030", "2030년까지", true],
    ["2,300 square meters", "2300㎡가 넘는", true],
    ["4 agents", "Four Gemini 4 Argon agents", true],
    ["10x faster", "10배 빠르게", true],
    ["$11 million", "raised $11 billion", false], // strict 전용
    ["KRW 5 billion", "5조원 이상 투입", false], // strict 전용
    ["$920 million a month", "월 9억 2천만 달러", true],
    ["$50 million", "5천만 달러 규모", true],
    ["318,000 designs", "31만 8천여 설계", true],
    ["25,000 records", "2만5000개 이상", true],
    ["a 19B model", "a 19-billion-parameter omni-model", true],
    ["10 days", "열흘 만에", true],
    ["155 billion tokens", "155T toks/day", false], // strict 전용
    ["4th generation", "fourth-generation Stretch", true],
    ["$5 trillion", "5조원", false], // 0-3에서는 통과(통화 바꿔치기) — 통화 검사로 기각
  ];
  it.each(cases)("%s ⟵ %s → 통과=%s", (out, src, ok) => {
    expect(passes(out, src)).toBe(ok);
  });

  it("기각 사유에 금액 전체를 보여 준다", () => {
    expect(findUnsupportedNumbers("$11 million", ev("raised $11 billion"))).toEqual(["11 million"]);
    expect(findUnsupportedNumbers("KRW 100 million a month", ev("월 매출 10억"))).toEqual([
      "100 million",
    ]);
    expect(findUnsupportedNumbers("GPT-5.1", ev("GPT-5 출시"))).toEqual(["5.1"]);
  });
});

describe("findUnsupportedNumbers — 계획 1-4·추가 경계", () => {
  it("버전 번호·모델 크기는 하이픈으로 붙은 채로 맞춘다", () => {
    expect(passes("Gemma 4 26B-A4B", "Built on Gemma 4 26B-A4B")).toBe(true);
    expect(passes("Llama-3.1-8B", "Llama-3.1-8B released")).toBe(true);
    expect(passes("GPT-5", "GPT-5.1 출시")).toBe(false); // 근거에 5 단독 숫자는 없다(5.1)
  });

  it("띄운 한 글자는 단위가 아니다(5 m), 붙여 쓴 K·M·B·T 는 단위다", () => {
    expect(passes("5 m", "5 m long")).toBe(true);
    expect(passes("a 128K context", "128k tokens")).toBe(true);
    expect(passes("$2 bn", "$2 billion")).toBe(true);
    expect(passes("$2 bn", "$2 million")).toBe(false);
  });

  it("천은 뒤에 한글이 오면 단위가 아니다(천안), 수량 접미면 단위다(천여)", () => {
    expect(passes("29 in Cheonan", "29일 충남 천안 종근당에서")).toBe(true);
    expect(passes("3,000 robots", "3천여 대 로봇")).toBe(true);
  });

  it("근거 쪽 수 단어 + scale·배수·'a week'를 숫자로 친다", () => {
    expect(passes("3 million AI chips", "ordered more than three million AI chips")).toBe(true);
    expect(passes("1 million tokens", "up to one million tokens of context")).toBe(true);
    expect(passes("17 met the criteria", "Seventeen met the criteria")).toBe(true);
    expect(passes("3x signups", "Stack Overflow for Agents triples signups")).toBe(true);
    expect(passes("2x faster", "roughly twice as fast")).toBe(true);
    expect(passes("1 week after", "a week after the filing")).toBe(true);
    expect(passes("4 million", "four billion")).toBe(false);
  });

  it("띄어 쓴 단위 없는 사슬 끝: 2만 5000 = 25,000 이면서 10억 2023년의 10억도 근거다", () => {
    expect(passes("25,000 people", "2만 5000명이 참석")).toBe(true);
    expect(passes("KRW 1 billion", "매출 10억 2023년 대비")).toBe(true);
  });

  it("영어 달 이름은 영어 출력의 근거가 아니다", () => {
    expect(passes("6 robots", "launching in June")).toBe(false);
  });
});

describe("findUnsupportedNumbers — 통화", () => {
  it("달러 금액은 근거에 $·달러·USD·dollar 가 있어야 한다", () => {
    expect(findUnsupportedNumbers("$5 trillion", ev("5조원"))).toEqual(["USD(통화)"]);
    expect(passes("5 billion dollars", "50억 달러")).toBe(true);
    expect(passes("USD 5 billion", "5 billion dollars")).toBe(true);
    expect(passes("US$5 billion", "50억 달러 규모")).toBe(true);
  });

  it("원화 금액은 근거에 원·KRW·won 이 있거나 외화 표기 없는 만·억·조 금액이 있어야 한다", () => {
    expect(passes("KRW 1 billion", "월 매출 10억 목표")).toBe(true); // 원 생략(한국 매체 관행)
    expect(passes("KRW 5 trillion", "5 trillion won")).toBe(true);
    expect(findUnsupportedNumbers("KRW 465 million", ev("4억6500만달러 조달"))).toEqual([
      "KRW(통화)",
    ]);
  });

  it("유로 등 다른 통화는 숫자만 본다", () => {
    expect(passes("€5 million", "raises €5 million")).toBe(true);
  });
});

describe("checkEnglish", () => {
  const evidence = ev("OpenAI raises $11 billion of its $30 billion target", "");

  it("통과", () => {
    expect(
      checkEnglish(
        {
          titleEn: "OpenAI raises $11 billion of its $30 billion target",
          summaryEn: `OpenAI raised $11 billion, short of its $30 billion goal. ${SUMMARY}`,
        },
        evidence,
      ),
    ).toEqual({ ok: true });
  });

  it("① 한글이 섞이면 기각(자모 포함)", () => {
    expect(
      checkEnglish(
        { titleEn: "OpenAI raises funds from 소프트뱅크 group", summaryEn: SUMMARY },
        evidence,
      ),
    ).toEqual({ ok: false, reason: "hangul", detail: ["title"] });
    expect(
      checkEnglish(
        { titleEn: "OpenAI raises funds from investors", summaryEn: `${SUMMARY} ㅋ` },
        evidence,
      ),
    ).toEqual({ ok: false, reason: "hangul", detail: ["summary"] });
  });

  it("② 길이 범위(경계 포함)", () => {
    const ok = (titleEn: string, summaryEn: string) =>
      checkEnglish({ titleEn, summaryEn }, evidence).ok;
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(ok("x".repeat(TITLE_EN_MIN_CHARS), SUMMARY)).toBe(true);
    expect(ok("x".repeat(TITLE_EN_MAX_CHARS), SUMMARY)).toBe(true);
    expect(ok("x".repeat(TITLE_EN_MIN_CHARS - 1), SUMMARY)).toBe(false);
    expect(ok("x".repeat(TITLE_EN_MAX_CHARS + 1), SUMMARY)).toBe(false);
    expect(ok("A sufficiently long headline", words(SUMMARY_EN_MIN_WORDS))).toBe(true);
    expect(ok("A sufficiently long headline", words(SUMMARY_EN_MAX_WORDS))).toBe(true);
    expect(ok("A sufficiently long headline", words(SUMMARY_EN_MIN_WORDS - 1))).toBe(false);
    expect(ok("A sufficiently long headline", words(SUMMARY_EN_MAX_WORDS + 1))).toBe(false);
    expect(checkEnglish({ titleEn: "Short", summaryEn: "Too short." }, evidence)).toEqual({
      ok: false,
      reason: "length",
      detail: ["title 5자", "summary 2단어"],
    });
  });

  it("빠진 필드는 길이 기각", () => {
    expect(checkEnglish({ titleEn: null, summaryEn: undefined }, evidence)).toMatchObject({
      ok: false,
      reason: "length",
    });
  });

  it("③ 숫자가 근거에 없으면 기각 — 제목·요약을 함께 모은다", () => {
    expect(
      checkEnglish(
        {
          titleEn: "OpenAI raises $11 million of its $30 billion target",
          summaryEn: `OpenAI raised $11 million from 12 investors. ${SUMMARY}`,
        },
        evidence,
      ),
    ).toEqual({ ok: false, reason: "number", detail: ["11 million", "12"] });
  });

  it("검사 순서: 한글 → 길이 → 숫자", () => {
    expect(checkEnglish({ titleEn: "소식 $1", summaryEn: "x" }, evidence)).toMatchObject({
      reason: "hangul",
    });
    expect(checkEnglish({ titleEn: "$1", summaryEn: "x" }, evidence)).toMatchObject({
      reason: "length",
    });
  });

  it("한국어 요약을 근거로 쓰지 않는다 — 같은 단위 오류를 세탁하지 않는다(1301)", () => {
    // 원문 $900B, KO "900억 달러"(오류). 영어가 $90 billion 이면 원문만으로 기각된다.
    expect(
      checkEnglish(
        { titleEn: "Anthropic reveals $90 billion AI spending commitments", summaryEn: SUMMARY },
        ev("Anthropic reveals $900B AI spending commitments ahead of IPO"),
      ),
    ).toMatchObject({ ok: false, reason: "number", detail: ["90 billion"] });
  });
});

describe("checkEnglish — 0-3 실제 출력 회귀(까다로운 것만)", () => {
  const samples: {
    id: string;
    title: string;
    content: string;
    en: [string, string];
    ok: boolean;
  }[] = [
    {
      id: "1303 원화 금액 사슬",
      title: "애질리티 로보틱스, SPAC 합병 통해 4억6500만달러 조달",
      content:
        "SPAC과의 합병을 통해 약 4억6500만달러(약 6250억원)의 자금을 조달하고 나스닥 상장을 추진한다. 조달 자금은 처칠 캐피털 XI 신탁 계좌 약 1억6400만달러, 폭스콘이 주도하는 사모투자",
      en: [
        "Agility Robotics raises $465 million in SPAC merger ahead of Nasdaq listing",
        "Agility Robotics announced a SPAC merger with Churchill Capital Corp XI to raise $465 million and pursue a Nasdaq listing. The funding includes $164 million from Churchill Capital's trust account and investments led by Foxconn through a private investment in public equity.",
      ],
      ok: true,
    },
    {
      id: "1324 r1 원 생략 금액",
      title: "119만 유튜버 긱블, 캐릭터 로봇 시장 출사표…“월 매출 10억 목표”",
      content:
        "119만 구독자를 보유한 유튜버 '긱블'이 캐릭터 로봇 산업에 새롭게 뛰어든다. 올해 7월부터",
      en: [
        "YouTuber Geekble enters character robot market targeting KRW 1 billion monthly revenue",
        "Geekble, a YouTuber with 1.19 million subscribers, launched character robot business under new company name Luddynamics starting July.",
      ],
      ok: true,
    },
    {
      id: "1324 r2 10배 단위 오류",
      title: "119만 유튜버 긱블, 캐릭터 로봇 시장 출사표…“월 매출 10억 목표”",
      content:
        "119만 구독자를 보유한 유튜버 '긱블'이 캐릭터 로봇 산업에 새롭게 뛰어든다. 올해 7월부터",
      en: [
        "YouTuber Geekble enters character robot market with KRW 100 million monthly revenue target",
        "Geekble, a YouTuber with 1.19 million subscribers, is launching a character robot business under the company name Luddynamics starting July this year.",
      ],
      ok: false,
    },
    {
      id: "1321 점수·모델 크기",
      title: "Apriel Voice 27B Preview: An Open Model for Speech, Reasoning, and Tool Use",
      content:
        "Built on the post-trained Gemma 4 26B-A4B checkpoint. In thinking mode, Apriel Voice achieves a score of 98.90 on Big Bench Audio, 81.13 on Speech-BFCL, and a task success rate of 65.51% on τ-Voice, with a mean latency of 1.91 seconds.",
      en: [
        "Apriel Voice 27B Preview, speech-language model for reasoning and tool use",
        "Apriel Voice 27B Preview is an open speech-language model built on Gemma 4 26B-A4B that processes speech and generates responses and tool calls. The model achieves 98.90 on Big Bench Audio and 81.13 on Speech-BFCL, with a mean latency of 1.91 seconds in thinking mode.",
      ],
      ok: true,
    },
    {
      id: "1250 조원·연도·회차",
      title: "중기부, 2030년까지 스마트제조혁신에 5조원 이상 투입…중소제조 피지컬 AI 확산 본격화",
      content: "29일 충남 천안 종근당에서 열린 국무총리 주재 제16회 국가정책조정회의에서",
      en: [
        "South Korea to invest KRW 5 trillion in smart manufacturing through 2030",
        "The Ministry of SMEs and Startups announced it will invest over KRW 5 trillion through 2030 in smart manufacturing innovation, it said at the 16th policy meeting on the 29th.",
      ],
      ok: true,
    },
    {
      id: "1309 ㎡",
      title: "獨 뉴라 로보틱스-뮌헨공대, ‘피지컬 AI 로봇 훈련센터’ 개관",
      content: "이 시설은 2300㎡가 넘는 규모로,",
      en: [
        "NEURA Robotics and Technical University of Munich open physical AI training center",
        "NEURA Robotics and Technical University of Munich opened TUM RoboGym, a 2,300-square-meter joint research and training facility near Munich Airport.",
      ],
      ok: true,
    },
  ];
  it.each(samples)("$id", ({ title, content, en, ok }) => {
    expect(checkEnglish({ titleEn: en[0], summaryEn: en[1] }, { title, content }).ok).toBe(ok);
  });
});

describe("checkKoreanNumbers", () => {
  it("billion→억 10배 오류를 경고한다(0-3 부록 1301·1321·1054)", () => {
    expect(
      checkKoreanNumbers(
        { titleKo: "Anthropic, IPO 앞두고 AI 투자 900억 달러 공약", summaryKo: "" },
        ev("Anthropic reveals $900B AI spending commitments ahead of IPO"),
      ),
    ).toEqual(["900억"]);
    expect(
      checkKoreanNumbers(
        { titleKo: "Apriel Voice 27B 공개", summaryKo: "27억 파라미터 규모의 음성-언어 모델" },
        ev("Apriel Voice 27B Preview"),
      ),
    ).toEqual(["27억"]);
    expect(
      checkKoreanNumbers(
        { titleKo: "DeepSeek, 하루 1,550억 토큰 처리", summaryKo: "" },
        ev("155T toks/day"),
      ),
    ).toEqual(["1,550억"]);
  });

  it("맞게 옮긴 금액은 통과", () => {
    expect(
      checkKoreanNumbers(
        { titleKo: "Anthropic, AI 투자 9,000억 달러 공약", summaryKo: "270억 파라미터 모델" },
        ev("Anthropic reveals $900B AI spending", "Apriel Voice 27B Preview"),
      ),
    ).toEqual([]);
  });

  it("월 표기는 영어 달 이름을 근거로 친다(6월 ← June)", () => {
    expect(
      checkKoreanNumbers(
        { titleKo: "6월 출시", summaryKo: "9월 15일 공개 예정이며 1월에 정식 출시한다." },
        ev("Launching in June", "Preview on Sept. 15, general availability in January"),
      ),
    ).toEqual([]);
    expect(
      checkKoreanNumbers({ titleKo: "7월 출시", summaryKo: "" }, ev("Launching in June")),
    ).toEqual(["7"]);
  });

  it("원문에 없는 파생 숫자는 경고(게재는 막지 않는다 — 반환만)", () => {
    expect(
      checkKoreanNumbers(
        { titleKo: "기업 74%, AI 지출 현황 파악 못해", summaryKo: "기업의 26%만 가시성 확보" },
        ev("Only 26 percent of companies have full visibility into AI costs"),
      ),
    ).toEqual(["74"]);
  });

  it("원화로 바꾼 달러 금액은 통화 경고(1055)", () => {
    expect(
      checkKoreanNumbers(
        { titleKo: "OpenAI, 1.25조 원 가치 평가", summaryKo: "" },
        ev("OpenAI at a $1.25T valuation"),
      ),
    ).toEqual(["KRW(통화)"]);
  });
});

describe("tallyEnglishChecks · englishCheckNotes", () => {
  const ok: EnglishCheckResult = { ok: true };
  const reject = (reason: (typeof ENGLISH_REJECT_REASONS)[number]): EnglishCheckResult => ({
    ok: false,
    reason,
    detail: [],
  });

  it("집계와 notes 문구", () => {
    const t = tallyEnglishChecks(
      [ok, ok, ok, reject("number"), reject("length"), reject("number")],
      [[], ["900억"], [], ["27억", "3"], []],
    );
    expect(t).toEqual({
      checked: 6,
      passed: 3,
      rejected: { hangul: 0, length: 1, number: 2 },
      koreanMismatched: 2,
      koreanExamples: ["900억", "27억"],
    });
    expect(englishCheckNotes(t)).toEqual([
      "영어 가공 3/6건",
      "영어 기각 3건(한글 0·숫자 2·길이 1)",
      "한국어 숫자 불일치 2건(900억·27억)",
    ]);
  });

  it("기각·불일치가 없으면 그 줄을 빼고, 검사한 기사가 없으면 빈 배열", () => {
    expect(englishCheckNotes(tallyEnglishChecks([ok, ok]))).toEqual(["영어 가공 2/2건"]);
    expect(englishCheckNotes(tallyEnglishChecks([]))).toEqual([]);
  });

  it("예시는 앞 3개까지, notes 구분자(;)를 쓰지 않는다", () => {
    const t = tallyEnglishChecks([ok], [["1억"], ["2억"], ["3;억"], ["4억"]]);
    const [, korean] = englishCheckNotes(t);
    expect(korean).toBe("한국어 숫자 불일치 4건(1억·2억·3 억)");
    expect(korean).not.toContain(";");
  });
});
