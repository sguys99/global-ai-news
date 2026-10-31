// @vitest-environment node
/**
 * 호 안 같은 사건 합치기(scripts/lib/sameEvent.ts). 텍스트는 실제 호(data/app.db)·no-save 스냅숏의 가공 제목·요약 첫
 * 문장이고, 눈으로 같은 사건/다른 사건 라벨을 붙인 쌍이다.
 */
import { describe, expect, it } from "vitest";
import { parseRunNotes, parseRunWarnings } from "../../scripts/lib/baseline";
import { resolveBrief } from "../../scripts/lib/brief";
import { MIN_REPEAT_EVIDENCE } from "../../scripts/lib/repeatCheck";
import {
  adoptFollowUps,
  applySameEventMerges,
  byRepresentative,
  findSameEventMerges,
  isSameEvent,
  mergeSameEvents,
  MIN_SAME_EVENT_EVIDENCE,
  sameEventEvidence,
  sameEventNote,
  themeFrequency,
  toSameEventInputs,
  type SameEventInput,
} from "../../scripts/lib/sameEvent";
import type { ArticleEnrichment } from "../../scripts/lib/schema";
import type { Candidate, Pick } from "../../scripts/lib/triage";
import type { Format } from "@/lib/labels";

let nextId = 1;
const art = (
  title: string,
  summary: string,
  over: Partial<SameEventInput> = {},
): SameEventInput => ({
  id: nextId++,
  title,
  summary,
  format: "news",
  importance: 3,
  trending: 0,
  publishedAt: "2026-10-31T00:00:00Z",
  ...over,
});

/** 두 기사만 있는 호에서 판정한다 — 주제어 거르기가 듣지 않는 가장 불리한 조건. */
const judge = (a: SameEventInput, b: SameEventInput) =>
  isSameEvent(sameEventEvidence(a, b, themeFrequency([a, b])));

// 7-3 배치 회차(10-31 no-save)에서 선별이 묶지 못한 쌍 — 이 작업의 동기.
const OPENAI_DECODER = art(
  "OpenAI, 목표의 37% 수준인 110억 달러만 유치",
  "OpenAI가 300억 달러 목표의 37% 수준인 약 110억 달러만 조성했다.",
  { importance: 5, trending: 0 },
);
const OPENAI_HN_WSJ = art(
  "OpenAI, 300억 달러 목표의 37% 수준만 조성",
  "OpenAI가 목표 모금액의 절반 이하인 110억 달러만 유치했으며, 대형 투자자들의 관심이 줄어드는 상황을 반영하고 있다.",
  { importance: 4, trending: 3.2 },
);

/** 같은 사건(합쳐야 한다). */
const SAME: [string, SameEventInput, SameEventInput][] = [
  ["OpenAI 110억 달러 유치 — The Decoder ↔ HN 경유 WSJ", OPENAI_DECODER, OPENAI_HN_WSJ],
  [
    "Meta AI 고객지원 에이전트 악용(06-09)",
    art(
      "Meta AI 고객지원 에이전트 해킹, AI 보안의 새로운 위협",
      "Meta의 AI 고객지원 에이전트가 해킹되어 Instagram 계정 탈취에 악용된 사건이 보도됐다.",
    ),
    art(
      "Meta AI 고객지원 에이전트 악용, 계정 탈취 사건 발생",
      "Meta의 AI 고객지원 에이전트가 공격자에게 악용되어 Instagram 계정 탈취에 이용됐다.",
    ),
  ],
  [
    "Reka Rho-1 공개(10-06)",
    art(
      "Reka AI, 통합 모달 모델 Rho-1 공개",
      "Reka AI의 Rho-1은 190억 파라미터 멀티모달 모델로 텍스트, 이미지, 비디오, 로봇 제어를 단일 신경망에서 처리한다.",
    ),
    art(
      "Reka, 텍스트·이미지·영상·로봇 제어 통합 모델 Rho-1 공개",
      "Reka가 텍스트, 이미지, 영상, 로봇 액션을 하나의 네트워크에서 처리하는 190억 파라미터 멀티모달 모델 Rho-1을 공개했다.",
    ),
  ],
  [
    "AI 에이전트 게임 디컴파일(10-12, HN ↔ GeekNews)",
    art(
      "AI 에이전트, 500억 토큰으로 게임 디컴파일 학습",
      "AI 에이전트가 방대한 토큰 학습을 통해 1인칭 슈팅 게임을 디컴파일하는 작업을 수행했다.",
    ),
    art(
      "AI 에이전트로 게임 디컴파일, 500B 토큰 소비해 99% 함수 복원",
      "AI 에이전트가 3개월간 1인칭 슈팅 게임을 C++로 재구성해 전체 함수의 99%를 복원했다.",
    ),
  ],
  [
    "Amazon Alexa 맞춤 상품(06-09)",
    art(
      "Amazon, AI로 커스텀 상품 디자인 기능 추가",
      "Amazon Shopping 앱에 Alexa를 활용한 디자인 생성 기능이 추가됐다.",
    ),
    art(
      "아마존, AI 생성 맞춤형 상품 판매 기능 출시",
      "아마존이 Alexa for Shopping을 활용한 AI 생성 디자인으로 티셔츠, 물병, 후드 등 맞춤형 상품을 제작·판매하는 기능을 출시했다.",
    ),
  ],
];

/** 다른 사건(합치면 안 된다) — 같은 회사의 다른 소식, 같은 주제의 다른 회사, 같은 행사의 다른 꼭지, 상투 요약. */
const DIFFERENT: [string, SameEventInput, SameEventInput][] = [
  [
    "같은 회사의 다른 거래 — 엔비디아 d-매트릭스 투자 ↔ 리플렉션 AI 인수(10-11)",
    art(
      "엔비디아, AI 추론 칩 d-매트릭스에 투자 추진",
      "엔비디아가 AI 추론 칩 개발업체 d-매트릭스에 투자할 계획인 것으로 알려졌다.",
    ),
    art(
      "엔비디아, 오픈소스 모델 스타트업 리플렉션 AI 인수 논의 중",
      "엔비디아가 미국의 오픈소스 모델 스타트업 리플렉션 AI 인수를 논의 중인 것으로 알려졌다.",
    ),
  ],
  [
    "같은 회사의 다른 소식 — OpenAI 유치 ↔ OpenAI 지원 회사의 인수(7-3 재보도 오탐)",
    OPENAI_DECODER,
    art(
      "OpenAI 지원 스라이브홀딩스, 보안업체 ADT 인수",
      "OpenAI가 투자한 스라이브홀딩스가 미국 보안업체 ADT를 인수하기로 했다.",
    ),
  ],
  [
    "같은 회사 임원의 다른 발언 — MS 브래드 스미스 ↔ 사티아 나델라(10-13)",
    art(
      "마이크로소프트 회장, 영국의 AI 규제 주도 역할 강조",
      "마이크로소프트 브래드 스미스 회장이 AI 기업들이 세탁기보다 규제를 덜 받고 있다며 시급한 AI 규제를 촉구했다.",
    ),
    art(
      "사티아 나델라, AI 모델 정렬보다 외부 통제 필요 주장",
      "마이크로소프트 회장 사티아 나델라가 AI 모델 정렬(alignment) 방식을 재검토하고 모델 외부에서의 통제 수단 구축을 강조했다.",
    ),
  ],
  [
    "같은 주제의 다른 회사 — Form Energy ↔ Energy Dome(10-06)",
    art(
      "Form Energy, 다일 단위 에너지 저장 철 배터리 상용화 추진",
      "Form Energy가 수일 단위의 장시간 에너지 저장이 가능한 철 기반 배터리를 개발하고 있으며, 공장 생산을 확대하고 상용 프로젝트 계약을 체결 중이다.",
    ),
    art(
      "Energy Dome, 이산화탄소 배터리로 장시간 에너지 저장 솔루션 제시",
      "Energy Dome는 압축 이산화탄소 가스를 활용한 대규모 그리드 배터리 기술을 개발했다.",
    ),
  ],
  [
    "같은 주제의 다른 주체 — 웹사이트들 ↔ 은행들의 에이전트 접근 제한(10-19)",
    art(
      "주요 웹사이트들, AI 에이전트의 접근 제한 강화",
      "Meta Muse, xAI Grok, OpenAI Dots 등 AI 에이전트들이 예약 및 쇼핑 수행 시 주요 웹사이트의 접근 제한에 직면하고 있다.",
    ),
    art(
      "미국 은행들, 메타 AI 에이전트 '뮤즈' 계좌 접근 제한",
      "미국 주요 은행들이 메타의 개인용 AI 에이전트 뮤즈의 고객 계좌 접근과 자금 이체를 차단하고 있다.",
    ),
  ],
  [
    "같은 주제의 다른 지역 — 여수 ↔ 순천 국가유산 야행(10-06)",
    art(
      "여수, 국가유산 야행과 연계한 '이순신 로드' 프로그램 시범 운영",
      "여수시가 2026년 국가유산 야행(10월 8~11일)과 연계해 이순신 장군 관련 유적을 둘러보는 '이순신 로드 프로그램'을 시범 운영한다.",
    ),
    art(
      "순천 국가유산 야행, 10월 9일 개막…3일간 원도심·매산등서 운영",
      "순천시가 10월 9~11일 3일간 원도심과 매산등 선교유적, 순천향교 일원에서 '2026 순천 국가유산 야행'을 개최한다.",
    ),
  ],
  [
    "같은 행사의 다른 꼭지(요약 첫 문장이 같은 상투구) — LG CNS ↔ 삼성 폴더블(10-06)",
    art(
      "LG CNS 휴머노이드 로봇, 스마트라이프위크서 공개",
      "서울시와 세계스마트시티기구가 주최한 스마트라이프위크가 서울 강남구 코엑스에서 개최됐다.",
    ),
    art(
      "스마트라이프위크서 삼성 폴더블폰 선보여",
      "서울시와 세계스마트시티기구가 주최한 스마트라이프위크가 서울 강남구 코엑스에서 개최됐다.",
    ),
  ],
  [
    "같은 행사의 다른 꼭지 — UAM 체험 ↔ 드로잉 로봇 체험(10-06)",
    art(
      "스마트라이프위크서 UAM 비행 시뮬레이션 체험 인기",
      "서울시와 세계스마트시티기구가 주최한 스마트라이프위크가 서울 강남구 코엑스에서 개최됐다.",
    ),
    art(
      "스마트라이프위크서 AI 드로잉 로봇 체험하는 오세훈 시장",
      "서울시와 세계스마트시티기구가 주최한 스마트라이프위크가 강남구 코엑스에서 개최됐다.",
    ),
  ],
  [
    "본문 없음 상투 요약 — Siri AI ↔ FrontierCode(06-09)",
    art("Siri AI", "제목만 제공되었으며 본문이 없어 구체적인 내용을 파악할 수 없습니다."),
    art("FrontierCode", "제목만 제공되었으며 본문 정보가 없어 상세 내용을 파악할 수 없습니다."),
  ],
  [
    "같은 회사·같은 기법의 다른 응용 — 엔비디아 cuDSS ↔ 미스트랄·엔비디아 협력(10-22)",
    art(
      "미스트랄-엔비디아, 물리 AI로 산업 설계 가속화 협력",
      "미스트랄과 엔비디아가 AI를 활용해 엔지니어링 시뮬레이션과 산업 제품 설계를 가속화하기 위해 협력한다.",
    ),
    art(
      "NVIDIA cuDSS 일반 공급, 공학·과학 시뮬레이션 가속화",
      "NVIDIA가 엔지니어링 및 과학 시뮬레이션을 GPU에서 실행하는 CUDA-X 라이브러리 cuDSS를 일반 공급했다.",
    ),
  ],
];

describe("isSameEvent — 실제 쌍 고정(두 기사만 있는 호, 주제어 거르기 없이)", () => {
  it.each(SAME)("같은 사건: %s", (_label, a, b) => {
    expect(judge(a, b)).toBe(true);
    expect(judge(b, a)).toBe(true);
  });

  it.each(DIFFERENT)("다른 사건: %s", (_label, a, b) => {
    expect(judge(a, b)).toBe(false);
    expect(judge(b, a)).toBe(false);
  });

  it("기준은 재보도 확인(2)보다 엄격하다", () => {
    expect(MIN_SAME_EVENT_EVIDENCE).toBeGreaterThan(MIN_REPEAT_EVIDENCE);
  });

  it("OpenAI 사례의 증거 — 금액·비율이 표지, 회사는 1점", () => {
    const ev = sameEventEvidence(
      OPENAI_DECODER,
      OPENAI_HN_WSJ,
      themeFrequency([OPENAI_DECODER, OPENAI_HN_WSJ]),
    );
    expect(ev.shared).toEqual(["110억", "300억", "37", "openai"]);
    expect(ev.score).toBe(4);
    expect(ev.overlap).toBe(1);
    expect(ev.titleScore).toBeGreaterThanOrEqual(2);
  });

  it("그날의 주제어(오늘 MAX_THEME_DF 건 초과가 쓰는 낱말)는 증거에서 뺀다 — 같은 행사 꼭지 4건", () => {
    const lede =
      "서울시와 세계스마트시티기구가 주최한 스마트라이프위크가 강남구 코엑스에서 개최됐다.";
    const issue = [
      art("한컴 SLW 드로잉 로봇, 스마트라이프위크서 공개", lede),
      art("스마트라이프위크서 SLW 원격운전 체험", lede),
      art("SLW 테니스 로봇, 스마트라이프위크서 선보여", lede),
      art("스마트라이프위크서 SLW UAM 체험 인기", lede),
    ];
    // 두 건만 있으면 상투구·행사명만으로 같은 사건이 된다(이 거르기가 막는 경우).
    expect(judge(issue[0], issue[1])).toBe(true);
    const ev = sameEventEvidence(issue[0], issue[1], themeFrequency(issue));
    expect(ev.theme).toEqual(expect.arrayContaining(["slw", "스마트라이프위크", "코엑스"]));
    expect(ev.shared).toEqual([]);
    expect(findSameEventMerges(issue)).toEqual([]);
  });
});

describe("findSameEventMerges — 형식·대표·묶음", () => {
  const reka = (format: Format, over: Partial<SameEventInput> = {}) => [
    art(
      "Reka AI, 통합 모달 모델 Rho-1 공개",
      "Reka AI의 Rho-1은 190억 파라미터 멀티모달 모델로 텍스트, 이미지, 비디오, 로봇 제어를 단일 신경망에서 처리한다.",
      { format, ...over },
    ),
    art(
      "Reka, 텍스트·이미지·영상·로봇 제어 통합 모델 Rho-1 공개",
      "Reka가 텍스트, 이미지, 영상, 로봇 액션을 하나의 네트워크에서 처리하는 190억 파라미터 멀티모달 모델 Rho-1을 공개했다.",
      { format, ...over },
    ),
  ];

  it("뉴스끼리만 합친다 — 같은 텍스트라도 논문·저장소·모델끼리, 뉴스와 레이더 사이는 합치지 않는다", () => {
    expect(findSameEventMerges(reka("news"))).toHaveLength(1);
    for (const f of ["oss", "model", "paper"] as const)
      expect(findSameEventMerges(reka(f))).toEqual([]);
    const [news] = reka("news");
    const [, repo] = reka("oss");
    expect(findSameEventMerges([news, repo])).toEqual([]);
  });

  it("대표는 중요도가 높은 쪽 — 화제가 더 높아도 중요도가 낮으면 합쳐진다(OpenAI: The Decoder 5 ← HN 4)", () => {
    const [m] = findSameEventMerges([OPENAI_HN_WSJ, OPENAI_DECODER]);
    expect(m).toMatchObject({ representative: OPENAI_DECODER.id, merged: OPENAI_HN_WSJ.id });
  });

  it("중요도가 같으면 화제 → 최신 → 풀 번호(1면 편집 순과 같다)", () => {
    const [a, b] = reka("news", { importance: 4 });
    const hot = { ...b, trending: 2 };
    expect(findSameEventMerges([a, hot])[0].representative).toBe(hot.id);
    const newer = { ...b, publishedAt: "2026-10-31T05:00:00Z" };
    expect(findSameEventMerges([a, newer])[0].representative).toBe(newer.id);
    expect(findSameEventMerges([b, a])[0].representative).toBe(Math.min(a.id, b.id));
    expect(byRepresentative(a, a)).toBe(0);
  });

  it("묶음의 모든 기사는 대표와 직접 같은 사건 — A~B, B~C 이어도 A≁C 면 C 는 따로 남는다(사슬 없음)", () => {
    const A = art("zeta alpha beta gamma", "zeta alpha beta gamma.", { importance: 5 });
    const B = art(
      "zeta alpha beta gamma delta omega sigma",
      "zeta alpha beta gamma delta omega sigma.",
      {
        importance: 4,
      },
    );
    const C = art("delta omega sigma kappa gamma", "delta omega sigma kappa gamma.", {
      importance: 3,
    });
    const df = themeFrequency([A, B, C]);
    expect(isSameEvent(sameEventEvidence(A, B, df))).toBe(true);
    expect(isSameEvent(sameEventEvidence(B, C, df))).toBe(true);
    expect(isSameEvent(sameEventEvidence(A, C, df))).toBe(false);
    const merges = findSameEventMerges([C, B, A]);
    expect(merges.map((m) => [m.representative, m.merged])).toEqual([[A.id, B.id]]);
  });

  it("입력 순서와 무관하다(결정적)", () => {
    const issue = [
      ...SAME.flatMap(([, a, b]) => [a, b]),
      ...DIFFERENT.slice(0, 4).flatMap(([, a, b]) => [a, b]),
    ];
    const key = (xs: SameEventInput[]) =>
      findSameEventMerges(xs)
        .map((m) => `${m.representative}<${m.merged}`)
        .sort();
    const expected = key(issue);
    expect(expected.length).toBeGreaterThanOrEqual(SAME.length - 1);
    expect(key([...issue].reverse())).toEqual(expected);
    expect(key([...issue.slice(5), ...issue.slice(0, 5)])).toEqual(expected);
  });
});

// ── 적용(collect 의 persist 계약) ─────────────────────────────────────────────

const enrichment = (title: string, summary: string): ArticleEnrichment => ({
  title_ko: title,
  summary_ko: summary,
  category: "industry",
  tags: ["openai"],
});

const candidate = (
  sourceName: string,
  url: string,
  score = 0,
  format: Format = "news",
): Candidate => ({
  item: {
    sourceId: sourceName,
    url,
    title: `${sourceName} 원제`,
    publishedAt: "2026-10-31T00:00:00Z",
  },
  key: `key-${url}`,
  score,
  sourceName,
  format,
});

/** 풀: 0 = The Decoder(대표), 1 = HN(합쳐질 쪽), 2 = HN 의 묶음(WSJ), 3 = 다른 기사, 4 = 미가공 선정. */
function fixture() {
  const pool = [
    candidate("The Decoder", "https://the-decoder.com/openai", 0),
    candidate("Hacker News", "https://news.ycombinator.com/item?id=1", 3.2),
    candidate("WSJ", "https://wsj.com/openai", 0),
    candidate("AI타임스", "https://aitimes.com/x", 0),
    candidate("TechCrunch", "https://techcrunch.com/y", 0),
  ];
  const picks: Pick[] = [
    { index: 0, importance: 5, duplicates: [] },
    { index: 1, importance: 4, duplicates: [2] },
    { index: 3, importance: 3, duplicates: [] },
    { index: 4, importance: 3, duplicates: [] },
  ];
  const enriched = new Map<number, ArticleEnrichment>([
    [0, enrichment(OPENAI_DECODER.title, OPENAI_DECODER.summary)],
    [1, enrichment(OPENAI_HN_WSJ.title, OPENAI_HN_WSJ.summary)],
    [3, enrichment("카카오, 신규 모델 공개", "카카오가 새 모델을 공개했다.")],
  ]);
  return { pool, picks, enriched };
}

describe("mergeSameEvents / applySameEventMerges — 게재 목록·related·seen 계약", () => {
  it("가공된 선정만 대조 입력이 된다(미가공 선정은 그대로 둔다)", () => {
    const { pool, picks, enriched } = fixture();
    expect(toSameEventInputs(picks, pool, enriched).map((x) => x.id)).toEqual([0, 1, 3]);
  });

  it("합쳐진 선정과 그 묶음은 대표의 duplicates 끝에 붙고(persist → related_json·seen_items), 게재·가공 목록에서 빠진다", () => {
    const { pool, picks, enriched } = fixture();
    const out = mergeSameEvents(picks, pool, enriched);
    expect(out.status).toBe("ok");
    expect(out.picks).toEqual([
      { index: 0, importance: 5, duplicates: [1, 2] },
      { index: 3, importance: 3, duplicates: [] },
      { index: 4, importance: 3, duplicates: [] },
    ]);
    expect([...out.enriched.keys()]).toEqual([0, 3]);
    expect([...out.mergedInto]).toEqual([[1, 0]]);
    expect(out.merged.map((p) => p.index)).toEqual([1]);
    expect(out.merges).toHaveLength(1);
    expect(out.note).toBe("같은 사건 합침 1건");
    // 입력은 바꾸지 않는다.
    expect(picks[0].duplicates).toEqual([]);
    expect(enriched.size).toBe(3);
  });

  it("목록에 없는 짝·이미 합쳐진 짝·미가공 쪽은 무시한다", () => {
    const { picks, enriched } = fixture();
    const base = { shared: [], theme: [], score: 9, overlap: 1, titleShared: [], titleScore: 9 };
    const out = applySameEventMerges(picks, enriched, [
      { ...base, representative: 0, merged: 99 },
      { ...base, representative: 0, merged: 4 },
      { ...base, representative: 0, merged: 1 },
      { ...base, representative: 3, merged: 1 },
    ]);
    expect([...out.mergedInto]).toEqual([[1, 0]]);
    expect(out.picks.find((p) => p.index === 3)?.duplicates).toEqual([]);
  });

  it("합칠 것이 없으면 그대로(note 없음)", () => {
    const { pool, picks, enriched } = fixture();
    enriched.delete(1);
    const out = mergeSameEvents(picks, pool, enriched);
    expect(out.picks).toEqual(picks);
    expect(out.mergedInto.size).toBe(0);
    expect(out.note).toBeNull();
  });

  it("실패에 열려 있다 — 오류가 나면 합치지 않고 원래 목록과 실패 note 를 돌려준다", () => {
    const { pool, picks, enriched } = fixture();
    const out = mergeSameEvents(picks, pool.slice(0, 1), enriched); // 풀 항목이 모자라 대조 입력에서 throw
    expect(out.status).toBe("failed");
    expect(out.picks).toBe(picks);
    expect([...out.enriched.keys()]).toEqual([0, 1, 3]);
    expect(out.mergedInto.size).toBe(0);
    expect(out.note).toMatch(/^같은 사건 합침 실패\(그대로 게재\): /);
  });
});

describe("세 줄 요약 연동 — mergedInto 를 resolveBrief 의 representativeOf 로", () => {
  it("합쳐진 선정을 가리키는 줄은 대표 기사로 옮겨 남고, 같은 대표를 가리키는 뒤 줄은 버린다", () => {
    const { pool, picks, enriched } = fixture();
    const out = mergeSameEvents(picks, pool, enriched);
    const evidence = new Map(
      [...out.enriched].map(([i, e]) => [i, { title: e.title_ko, summary: e.summary_ko }]),
    );
    const brief = [
      { id: 1, text: "OpenAI가 300억 달러 목표의 37%인 110억 달러만 모았다" }, // 합쳐진 HN 쪽
      { id: 0, text: "OpenAI 110억 달러 유치, 목표의 37%에 그쳤다" }, // 같은 대표 — 앞 줄만
      { id: 3, text: "카카오가 새 모델을 공개했다" },
    ];
    const withMap = resolveBrief(brief, picks, evidence, (i) => out.mergedInto.get(i) ?? i);
    expect(withMap.lines.map((l) => l.index)).toEqual([0, 3]);
    // 맵 없이 넘기면 합쳐진 선정의 줄은 미게재로 빠진다.
    const without = resolveBrief(brief, picks, evidence);
    expect(without.unpublished).toBe(1);
    expect(without.lines.map((l) => l.index)).toEqual([0, 3]);
  });
});

describe("adoptFollowUps — 후속 보도 연결", () => {
  it("대표에 연결이 없으면 합쳐진 기사의 연결을 받고, 있으면 대표 것을 둔다. 합쳐진 기사의 연결은 지운다", () => {
    const merged = new Map([
      [1, 0],
      [5, 4],
    ]);
    const out = adoptFollowUps(
      new Map([
        [1, 101],
        [5, 105],
        [4, 104],
        [7, 107],
      ]),
      merged,
    );
    expect([...out].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 101],
      [4, 104],
      [7, 107],
    ]);
  });
});

describe("notes", () => {
  it("`같은 사건 합침 N건` — 0 이면 null", () => {
    expect(sameEventNote(0)).toBeNull();
    expect(sameEventNote(2)).toBe("같은 사건 합침 2건");
  });

  it("kpi baseline 이 읽고, 선별의 `선정 N건(같은 사건으로 묶인 기사 M건)`·실패 줄과 섞이지 않는다", () => {
    const notes =
      "선별 풀: 후보 200건 중 180건; 선정 28건(같은 사건으로 묶인 기사 2건); 재보도 판정 기각 1건(내용어 겹침 부족); " +
      "같은 사건 합침 2건; 할당 초과: Physical AI 10/9";
    expect(parseRunWarnings(notes)).toMatchObject({
      sameEventMerged: 2,
      repeatRejected: 1,
      quotaOverflow: "Physical AI 10/9",
    });
    expect(parseRunNotes(notes)).toMatchObject({ picks: 28, grouped: 2 });
    expect(parseRunWarnings("같은 사건 합침 실패(그대로 게재): boom").sameEventMerged).toBe(0);
    expect(parseRunWarnings("선정 28건(같은 사건으로 묶인 기사 2건)").sameEventMerged).toBe(0);
  });
});
