// @vitest-environment node
/**
 * 재보도 판정의 코드 확인(confirmRepeats) — 실제 회차에서 눈으로 라벨을 붙인 짝을 고정한다.
 * - Phase 7-3 배치 회차(2026-10-31, no-save): 모델이 6건을 뺐는데 1건만 진짜 재보도였다.
 * - Phase 4-3 평가(2026-10-29 풀): 알려진 재보도와 오탐.
 * 텍스트는 그 회차의 가공 제목·요약 첫 문장, 이미 보도함 제목·요약 첫 문장이다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { parseRunNotes, parseRunWarnings } from "../../scripts/lib/baseline";
import type { LlmResult } from "../../scripts/lib/llm";
import {
  confirmRepeats,
  interpretRepeatResult,
  MIN_REPEAT_EVIDENCE,
  rejectNote,
  repeatEvidence,
  repeatNote,
  type RepeatInput,
} from "../../scripts/lib/repeatCheck";
import { contentTokens } from "../../scripts/lib/textTokens";
import type { ReportedHeadline } from "../../scripts/lib/triage";

type Pair = { label: string; today: RepeatInput; reported: ReportedHeadline };

const pair = (
  label: string,
  id: number,
  title: string,
  summary: string,
  reportedTitle: string,
  reportedSummary: string,
): Pair => ({
  label,
  today: { id, title, summary },
  reported: { issueDate: "2026-10-30", title: reportedTitle, summary: reportedSummary },
});

/** 진짜 재보도 — 판정을 받아들여야 한다. */
const TRUE_REPEATS: Pair[] = [
  pair(
    "7-3 #71 구글 우주 위성 TPU",
    71,
    "구글, 우주 위성에서 TPU 활용한 AI 추론 첫 성공",
    "구글이 지구 궤도 위성에서 데이터센터급 TPU로 Gemma 4 AI 모델 추론을 실행하고 결과를 지상으로 전송했다.",
    "구글 우주 데이터센터, TPU로 시 작성 성공",
    "구글의 첫 우주 데이터센터 위성에 탑재된 TPU가 Gemma 4 모델을 실행해 시를 작성했다.",
  ),
  pair(
    "4-3 #60 미스트랄 라지 4 가중치(표기 다름)",
    60,
    "미스트랄, 라지 4 가중치 공개로 정식 출시...기업용 내부 배포 지원",
    "미스트랄 AI가 미스트랄 라지 4의 오픈웨이트 버전을 공개하며 정식 출시했다.",
    "Mistral Large 4 가중치 공개",
    "Mistral이 Large 4 모델의 가중치를 공개했다.",
  ),
  pair(
    "4-3 #130 제미나이4 카본 1위(표기 다름)",
    130,
    "구글 '제미나이4 카본', 글로벌 AI 벤치마크 1위 차지",
    "구글의 최신 프런티어 AI 모델 '제미나이4 카본'이 글로벌 인텔리전스 벤치마크에서 오픈AI·앤트로픽 모델을 제치고 1위에 올랐다.",
    "구글 Gemini 4 Carbon, 독립 평가 1위 달성",
    "구글의 신규 프론티어 모델 Gemini 4 Carbon이 독립 평가에서 1위를 차지했다.",
  ),
  pair(
    "4-3 #48 북미 로봇 주문 24.8%",
    48,
    "북미 산업용 로봇 주문 24.8% 급증…협동로봇 56% 증가",
    "올해 3분기 북미 산업용 로봇 주문이 전년 동기 대비 24.8% 증가해 1만989대, 금액으로 7억 2350만 달러를 기록했다.",
    "북미 로봇 수주, 2026년 Q3 24.8% 증가…자동차 부품업체 수요 급증",
    "2026년 3분기 북미 로봇 수주가 24.8% 증가했으며, 자동차 부품 제조업체의 수요가 거의 2배에 가까워졌다.",
  ),
  pair(
    "4-3 #62 오라클·OpenAI 제휴 확대(주어 뒤바뀜)",
    62,
    "오라클, 오픈AI와 기업 AI 협력 확대",
    "오라클이 오픈AI와의 파트너십을 데이터센터 인프라 제공 수준에서 서비스 협력으로 확대한다.",
    "OpenAI, Oracle과 제휴 확대...ChatGPT에 비즈니스 앱 통합",
    "OpenAI와 Oracle이 제휴를 확대하여 ChatGPT에 비즈니스 애플리케이션과 AI 에이전트를 통합하고 Oracle 신규 서비스를 강화한다.",
  ),
];

/** 모델이 재보도로 본 오탐 — 판정을 기각해야 한다. */
const FALSE_REPEATS: Pair[] = [
  pair(
    "7-3 #50 OpenAI 110억 달러 유치 ↔ OpenAI 지원 회사 ADT 인수",
    50,
    "OpenAI, 목표의 37% 수준인 110억 달러만 유치",
    "OpenAI가 300억 달러 목표의 37% 수준인 약 110억 달러만 조성했다.",
    "OpenAI 지원 스라이브홀딩스, 153억 달러에 ADT 인수",
    "OpenAI가 지원하는 스라이브홀딩스가 ADT를 153억 달러에 인수한다.",
  ),
  pair(
    "7-3 #41 OpenAI 목표의 37% 조성 ↔ 같은 R48",
    41,
    "OpenAI, 300억 달러 목표의 37% 수준만 조성",
    "OpenAI가 목표 모금액의 절반 이하인 110억 달러만 유치했으며, 대형 투자자들의 관심이 줄어드는 상황을 반영하고 있다.",
    "OpenAI 지원 스라이브홀딩스, 153억 달러에 ADT 인수",
    "OpenAI가 지원하는 스라이브홀딩스가 ADT를 153억 달러에 인수한다.",
  ),
  pair(
    "7-3 #4 구글 AI 모드 검색 수익 감소 ↔ 방미통위 인앱결제 과징금",
    4,
    "구글, AI 모드로 검색 수익 15% 감소 발생 인정",
    "구글이 AI 모드 도입으로 검색 매출이 15% 감소해 5백억 달러 손실이 발생했음을 인정했다.",
    "방미통위, 구글·애플 인앱결제 강제에 637억원 과징금",
    "방송미디어통신위원회가 구글과 애플의 부당한 인앱결제 강제에 총 637억원의 과징금을 부과하기로 결정했다.",
  ),
  pair(
    "7-3 #2 MS 자발적 퇴직 ↔ 코히어 캐나다 투자",
    2,
    "마이크로소프트, 직원 25% 대상 자발적 퇴직금 제안",
    "마이크로소프트가 약 6만 명의 직원(전체 인력의 25%)을 대상으로 자발적 퇴직금을 제안했다.",
    "코히어, 캐나다 정부로부터 1.5조원 투자 유치",
    "캐나다 AI 기업 코히어가 자국 정부로부터 최대 16억 캐나다달러(약 1.5조원) 투자를 받는다.",
  ),
  pair(
    "7-3 #29 알트먼 AI 수학 연구 ↔ 액시엄 수학 정리 검증",
    29,
    "알트먼, AI 수학 연구에 수억 달러 투입 밝혀",
    "샘 알트먼 OpenAI CEO가 AI 기반 수학 연구에 수억 달러의 컴퓨팅 자원을 투입했다고 공개했다.",
    "액시엄, 수학 史상 가장 거대한 정리 기계 검증 완수",
    "수학 AI 스타트업 액시엄이 유한 단순군 분류(CFSG)의 전체 증명을 컴퓨터로 검증 완료했다.",
  ),
  pair(
    "4-3 #152 구글 Gemini Agent 소비자 제공 ↔ OpenAI ChatGPT 기능 통합",
    152,
    "구글, Gemini Agent 기능을 올해 안에 일반 소비자에 제공",
    "구글이 기업용 Gemini Agent의 핵심 기능을 올해 중에 일반 소비자도 이용 가능하도록 할 계획이다.",
    "OpenAI, 올해 중 ChatGPT 대화·업무 기능 통합",
    "OpenAI가 올해 안에 ChatGPT의 일반 대화 기능과 작업 자동화 기능(ChatGPT Work)을 통합할 계획이다.",
  ),
  pair(
    "4-3 #1 앤트로픽 자기 평가 안전 기술 ↔ 앤트로픽 전문가 착각 연구",
    1,
    "앤트로픽, 클로드의 자기 평가 안전 기술 도입…유해 사용 78% 탐지",
    "앤트로픽이 클로드가 이용자와 나눈 대화의 위험성을 스스로 평가하는 '자기 평가' 기술을 실제 서비스에 적용했다.",
    "AI 에이전트 의견을 전문가가 자신의 것으로 착각, 앤트로픽 연구",
    "앤트로픽 연구에서 50명 전문가에게 동전 던지기로 설정된 AI 에이전트의 의견을 제시했을 때, 전문가들이 최대 86%까지 따랐고 대부분 그것이 자신의 결론이라고 믿었다.",
  ),
  pair(
    "4-3 #152 제미나이 에이전트 소비자 제공 ↔ Android Studio 에이전트 개방(회사·제품만 겹침)",
    152,
    "구글, 제미나이 에이전트 기능을 연내 일반 이용자에 제공",
    "구글이 기업용 '제미나이 에이전트'의 핵심 기능을 올해 안에 소비자에게 제공한다.",
    "Google, Android Studio에 40개 이상의 AI 에이전트 통합 지원",
    "Google이 Android Studio를 서드파티 AI 에이전트에 개방했다.",
  ),
  pair(
    "4-3 #110 Claude 투자 효과 분석 도구 ↔ Claude 법률 도구(다른 도구)",
    110,
    "앤트로픽, 기업용 Claude에 AI 투자 효과 분석 도구 추가",
    "앤트로픽이 Claude Enterprise에 스마트 보고서, 인앱 설문조사, 팀 공동 예산 관리 기능을 추가했다.",
    "Anthropic, Claude로 계약서 검토·법률 조사 자동화 도구 출시",
    "Anthropic이 법무팀의 계약서 검토와 법률 조사를 자동화하는 Claude for Legal 도구를 출시했다.",
  ),
];

describe("contentTokens — 재보도 확인용 내용어", () => {
  it("조사·'하다' 어미를 떼고, 표기만 다른 회사·대표 제품을 한 키로 모은다", () => {
    // "추론"은 분야어라 빠지고, "실행했다" → 실행.
    expect([...contentTokens("구글이 우주 위성에서 TPU로 추론을 실행했다")]).toEqual([
      "google",
      "우주",
      "위성",
      "tpu",
      "실행",
    ]);
    expect(contentTokens("오픈AI와 ChatGPT")).toEqual(new Set(["openai"]));
    expect(contentTokens("제미나이4 카본")).toEqual(new Set(["google", "카본"]));
    expect(contentTokens("Anthropic, Claude로")).toEqual(new Set(["anthropic"]));
  });

  it("단위 붙은 수·모델 버전은 한 토큰, 숫자 없는 하이픈 합성어는 나눈다, 숫자 1자·연도는 버린다", () => {
    expect(contentTokens("1위를 차지, 110억 달러, 3분기 24.8%")).toEqual(
      new Set(["1위", "110억", "3분기", "24.8"]),
    );
    expect(contentTokens("GPT-6 Astra와 Kimi K3.1")).toEqual(
      new Set(["gpt-6", "astra", "moonshot", "k3.1"]),
    );
    expect(contentTokens("OpenAI-backed Thrive acquires ADT in 2026")).toEqual(
      new Set(["openai", "backed", "thrive", "acquires", "adt"]),
    );
    expect(contentTokens("라지 4의 가중치")).toEqual(new Set(["라지", "가중치"]));
  });

  it("일반어·분야어(AI·투자·유치·발표·로봇·학습 …)는 증거가 아니다", () => {
    expect(contentTokens("AI 투자 유치 발표, 로봇 학습 데이터 공개")).toEqual(new Set());
    // 2자 명사는 어미처럼 보여도 그대로 둔다(평가·피해).
    expect(contentTokens("피해 규모")).toEqual(new Set(["피해"]));
  });
});

describe("repeatEvidence / confirmRepeats — 라벨 붙인 실제 짝", () => {
  it.each(TRUE_REPEATS.map((p) => [p.label, p] as const))(
    "진짜 재보도는 받아들인다: %s",
    (_label, p) => {
      expect(repeatEvidence(p.today, p.reported).score).toBeGreaterThanOrEqual(MIN_REPEAT_EVIDENCE);
    },
  );

  it.each(FALSE_REPEATS.map((p) => [p.label, p] as const))("오탐은 기각한다: %s", (_label, p) => {
    expect(repeatEvidence(p.today, p.reported).score).toBeLessThan(MIN_REPEAT_EVIDENCE);
  });

  it("회사는 몇 개가 겹쳐도 증거 하나 — 상대가 있는 사건(제휴·인수·투자)일 때만 둘", () => {
    const today: RepeatInput = {
      id: 1,
      title: "OpenAI·앤트로픽, 캘리포니아주에 AI 규제 강화 촉구",
      summary: "두 회사가 주 의회에 서한을 보냈다.",
    };
    const other: ReportedHeadline = {
      issueDate: "2026-10-29",
      title: "OpenAI·앤트로픽, 미 중간선거 앞두고 AI 악용 감시 강화",
    };
    expect(repeatEvidence(today, other)).toEqual({ shared: ["anthropic", "openai"], score: 1 });
    const oracle = TRUE_REPEATS.find((p) => p.today.id === 62)!;
    expect(repeatEvidence(oracle.today, oracle.reported)).toEqual({
      shared: ["openai", "oracle"],
      score: 2,
    });
  });

  it("짝 목록을 받아들인 것과 기각한 것(겹친 내용어 포함)으로 나눈다 — 짝의 기사·R번호가 없으면 기각", () => {
    const tp = TRUE_REPEATS[0];
    const fp = FALSE_REPEATS[0];
    const { confirmed, rejected } = confirmRepeats(
      [
        { id: 71, reported: 1, event: "구글 우주 위성 TPU 추론" },
        { id: 50, reported: 2, event: "OpenAI 자금 조성" },
        { id: 99, reported: 1 },
      ],
      [tp.today, fp.today],
      [tp.reported, fp.reported],
    );
    expect(confirmed).toEqual([{ id: 71, reported: 1, event: "구글 우주 위성 TPU 추론" }]);
    expect(rejected).toEqual([
      { id: 50, reported: 2, event: "OpenAI 자금 조성", shared: ["openai"] },
      { id: 99, reported: 1, shared: [] },
    ]);
  });
});

describe("interpretRepeatResult — 7-3 회차의 모델 판정 재현", () => {
  // 7-3 배치 회차의 이미 보도함(필요한 줄만, 순서대로 R1~R5)과 그 회차의 모델 출력.
  const byLabel = (id: number) =>
    [...TRUE_REPEATS, ...FALSE_REPEATS].find((p) => p.today.id === id)!;
  const reported: ReportedHeadline[] = [71, 50, 4, 2, 29].map((id) => byLabel(id).reported);
  const inputs: RepeatInput[] = [71, 50, 41, 4, 2, 29, 34].map((id) =>
    id === 34
      ? {
          id,
          title: "Foundry Robotics, 자동화 공장 구축에 1억 달러 유치",
          summary: "Foundry Robotics가 자동 조립 공장 건설을 위해 1억 달러를 조성했다.",
        }
      : byLabel(id).today,
  );
  const modelOutput = {
    repeats: [
      { id: 71, reported: 1, event: "구글 우주 위성 TPU 추론" },
      { id: 50, reported: 2, event: "OpenAI 자금 조성" },
      { id: 4, reported: 3, event: "구글 인앱결제 규제" },
      { id: 2, reported: 4, event: "코히어 캐나다 투자" },
      { id: 41, reported: 2, event: "OpenAI 자금 조성" },
      { id: 29, reported: 5, event: "AI 수학 정리 검증" },
    ],
    followups: [{ id: 34, reported: 1, event: "자동화 공장 건설" }],
  };
  const result: LlmResult = {
    message: {
      id: "msg",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5",
      content: [{ type: "text", text: JSON.stringify(modelOutput), citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1000, output_tokens: 30 },
    } as unknown as Anthropic.Message,
    batch: true,
  };

  it("6건 중 진짜 재보도 1건만 빼고 오탐 5건은 기각해 싣는다", () => {
    const out = interpretRepeatResult(result, inputs, reported);
    expect(out.status).toBe("ok");
    expect(out.repeats.map((m) => m.id)).toEqual([71]);
    expect(out.rejected.map((m) => m.id)).toEqual([50, 4, 2, 41, 29]);
    expect(out.followups.map((m) => m.id)).toEqual([34]);
    expect(out.note).toBe("재보도 제외 1건(후속 보도 유지 1건)");
    expect(out.rejectNote).toBe("재보도 판정 기각 5건(내용어 겹침 부족)");
  });

  it("notes: 기각 줄은 kpi baseline 이 따로 읽고, 다른 notes 파싱과 겹치지 않는다", () => {
    const out = interpretRepeatResult(result, inputs, reported);
    const notes = `aitimes: 10건(신규 8); 선별 풀: 후보 200건 중 180건; 선정 28건(같은 사건으로 묶인 기사 2건); ${out.note}; ${out.rejectNote}; 할당 초과: Physical AI 10/9`;
    expect(parseRunNotes(notes)).toEqual({
      sources: { aitimes: { fetched: 10, fresh: 8, cap: null, error: null } },
      poolCandidates: 200,
      poolSize: 180,
      picks: 28,
      grouped: 2,
    });
    expect(parseRunWarnings(notes)).toMatchObject({
      repeatDropped: 1,
      repeatFollowups: 1,
      repeatRejected: 5,
      repeatCheckFailed: null,
      quotaOverflow: "Physical AI 10/9",
    });
  });

  it("모두 기각하면 `재보도 제외` 줄은 없고 기각 줄만 남는다", () => {
    const verdict = { repeats: [], followups: [] };
    expect(repeatNote(verdict)).toBeNull();
    expect(rejectNote([])).toBeNull();
    expect(rejectNote([{ id: 1, reported: 1, shared: [] }])).toBe(
      "재보도 판정 기각 1건(내용어 겹침 부족)",
    );
  });
});
