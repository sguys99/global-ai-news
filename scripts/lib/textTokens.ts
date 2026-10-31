/**
 * 재보도 확인용 내용어 토큰. 오늘 기사와 이미 보도함 기사가 "같은 사건"이라면 주체·대상·수치 같은 내용어를
 * 둘 이상 함께 쓴다는 가정으로, 모델의 재보도 판정을 코드로 한 번 더 확인할 때 쓴다(repeatCheck.confirmRepeats).
 *
 * - 한글: 끝 조사(복합 조사 포함)와 "하다" 활용 어미(했다·하며·한 …)를 뗀다 — "공개했다"·"공개로" → 공개.
 * - 숫자: 단위가 붙은 수는 한 토큰(1위·110억·3분기), 한글 뒤에 붙은 숫자는 띄운다("제미나이4" → 제미나이 / 4).
 *   숫자 1자는 버린다.
 * - 영문: 모델명·버전은 한 토큰(gpt-5.5, k3.1), 숫자 없는 하이픈 합성어는 나눈다(openai-backed → openai / backed).
 *   3자 미만 영문은 버린다.
 * - 고유명: 표기·번역만 다른 이름과 그 회사의 대표 제품을 한 키로 모은다(ENTITY_GROUPS — OpenAI·오픈AI·ChatGPT
 *   → openai, 구글·Gemini·제미나이 → google). "같은 회사"는 증거 한 개로만 센다.
 * - 사건을 가르지 못하는 일반어(AI·투자·유치·발표·출시·달러·올해 …)와 연도는 뺀다(GENERIC_TOKENS).
 *
 * kpi baseline 의 titleTokens(이틀 연속 중복 휴리스틱)와는 목적이 달라 따로 둔다 — 그쪽 수치를 바꾸지 않는다.
 */

/**
 * 같은 주체로 보는 이름 묶음. 첫 이름이 정규 키다. 회사의 대표 제품도 회사 키로 모은다 — "구글 + 제미나이"가
 * 겹쳐도 증거는 하나다(같은 회사의 다른 발표를 재보도로 보지 않게).
 */
const ENTITY_GROUPS: readonly (readonly string[])[] = [
  ["openai", "오픈ai", "오픈에이아이", "chatgpt", "챗gpt", "챗지피티"],
  ["google", "구글", "gemini", "제미나이", "제미니", "gemma", "젬마", "deepmind", "딥마인드"],
  ["anthropic", "앤트로픽", "엔트로픽", "claude", "클로드"],
  ["microsoft", "마이크로소프트", "마소", "copilot", "코파일럿"],
  ["meta", "메타", "llama", "라마"],
  ["apple", "애플"],
  ["amazon", "아마존", "aws"],
  ["nvidia", "엔비디아", "nemotron", "네모트론"],
  ["oracle", "오라클"],
  ["mistral", "미스트랄"],
  ["cohere", "코히어"],
  ["deepseek", "딥시크"],
  ["alibaba", "알리바바", "qwen", "큐웬", "큐원", "통의천문"],
  ["moonshot", "문샷", "kimi", "키미"],
  ["xai", "grok", "그록"],
  ["tesla", "테슬라"],
  ["perplexity", "퍼플렉시티"],
  ["samsung", "삼성", "삼성전자"],
  ["naver", "네이버"],
  ["kakao", "카카오"],
  ["huggingface", "허깅페이스"],
  ["unitree", "유니트리"],
  ["intel", "인텔"],
  ["softbank", "소프트뱅크"],
  ["salesforce", "세일즈포스"],
  ["adobe", "어도비"],
];

export const ENTITY_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  ENTITY_GROUPS.flatMap((names) => names.map((n) => [n, names[0]])),
);

/** 정규 고유명 키(회사). 재보도 확인에서 회사는 몇 개가 겹치든 증거 한 개로 센다(repeatEvidence). */
export const ENTITY_KEYS: ReadonlySet<string> = new Set(ENTITY_GROUPS.map((names) => names[0]));

/**
 * 상대가 있는 사건(제휴·계약·인수·투자). 두 회사가 함께 겹치고 두 기사 모두 이런 사건을 다룰 때만 회사 겹침을
 * 증거 두 개로 센다 — "A, B와 제휴 확대" ↔ "B, A와 협력 확대". 원문 텍스트에 직접 맞춘다.
 */
export const RELATION_PATTERN =
  /제휴|협력|파트너십|계약|인수|합병|투자|partner|deal|acquir|merger|invest/i;

/**
 * 사건을 가르지 못하는 일반어(정규화 뒤 형태). "같은 회사 + 일반어 하나" 겹침이 재보도 오탐의 대부분이었다
 * (Phase 7-3: OpenAI 투자 유치 ↔ OpenAI 지원 회사의 인수, AI 수학 연구 투자 ↔ 수학 정리 검증).
 * 이 피드에서 늘 나오는 분야어(로봇·학습·데이터·월드 모델·멀티모달 …)도 주제가 비슷할 뿐이라 뺀다.
 */
export const GENERIC_TOKENS: ReadonlySet<string> = new Set(
  // 영문 기능어·흔한 동사·명사
  (
    "the and for with from into how what why its are has have had that this your you our their now all can " +
    "will more than about after over not but out get gets via using use used based just new first also " +
    "says said report reports reportedly launches launch launched releases release released announces announced " +
    "introduces introducing unveils debuts raises raise raised funding billion million trillion percent " +
    "ai llm llms model models agent agents agentic data open source tool tools update app apps company " +
    "startup startups users user system systems platform service services feature features team teams " +
    "research paper papers github arxiv ainews " +
    // 한글 일반어 — 분야·행위·금액 단위·시점·수식어
    "인공지능 생성형 모델 에이전트 기술 서비스 기능 도구 플랫폼 시스템 솔루션 프레임워크 " +
    "기업 기업용 기업들 회사 스타트업 업계 시장 산업 정부 국내 글로벌 세계 연구진 " +
    "투자 유치 조성 펀딩 자금 인수 매각 계약 제휴 협력 파트너십 " +
    "발표 출시 공개 연구 개발 도입 지원 제공 활용 강화 확대 추진 계획 통합 적용 확보 운영 추가 " +
    "건설 구축 생산 제작 설립 출범 시작 판매 제안 인정 차지 제시 소개 포함 결정 판단 해결 개선 향상 " +
    "성공 달성 성능 기록 증가 감소 예정 전망 가능 목표 최대 규모 비용 사용 문제 방법 결합 " +
    "달러 억 조 원 억원 억달러 수억 수십억 수조 " +
    "올해 연내 내년 이번 최근 지난 현지시간 오늘 최초 처음 신규 새로운 최신 안에 중에 실시간 " +
    "일반 사용자 이용자 고객 기반 위해 통해 관련 대상 이후 이상 수준 자체 스스 " +
    "있다 있는 있게 하는 중이다 에서 위한 대한 통한 따른 갖춘 작업 주장 " +
    "미국 한국 중국 " +
    // 이 피드의 분야어(주제만 같은 기사를 가르지 못함)
    "로봇 로봇용 휴머노이드 피지컬 학습 데이터 월드 멀티모달 오픈 오픈소스 오픈웨이트 파라미터 " +
    "추론 생성 자동 자동화 언어 행동 조작 벤치마크 평가 분석 코딩 코드 보안 인프라 음성 대화 " +
    "텍스트 영상 이미지 인식 표현 " +
    "code robot robots robotics humanoid physical world multimodal vision language action learning benchmark"
  ).split(" "),
);

/** 한글 끝 조사(긴 것부터). 두 번까지 뗀다 — "정부로부터" → 정부. */
const KO_PARTICLE =
  /(에서는|에서도|으로는|으로도|에게서|이라는|이라고|에서|에게|으로|부터|까지|처럼|보다|라는|과의|와의|에는|로는|은|는|이|가|을|를|의|에|로|와|과|도|만)$/;
/** "하다"·"되다" 활용 어미(긴 것부터). 조사를 뗀 뒤 한 번 더 뗀다 — "발생했음을" → 발생. */
const KO_VERB_ENDING =
  /(했으며|했다고|한다고|하기로|하도록|했다|한다|했고|했음|하며|하고|하여|하는|하기|해서|된다|됐다|되는|되며|됐고|이다|이며|였다|된|한|할|인|해|하|됨|함)$/;

/** 끝을 떼되, 남는 것이 2자 미만이면 떼지 않는다("평가"·"피해"·"제한" 보호). */
function stripEnd(t: string, re: RegExp): string {
  const s = t.replace(re, "");
  return s.length >= 2 ? s : t;
}

function normalizeToken(raw: string): string | null {
  const known = ENTITY_ALIASES[raw];
  if (known) return known;
  let t = raw;
  if (/^\d/.test(t) && /[가-힣]$/.test(t)) {
    // 단위 붙은 수: "1위를" → 1위, "4의" → 4(1자라 버림).
    t = t.replace(KO_PARTICLE, "");
  } else if (/[가-힣]/.test(t)) {
    for (let i = 0; i < 2 && t.length >= 3; i += 1) t = stripEnd(t, KO_PARTICLE);
    t = stripEnd(t, KO_VERB_ENDING);
  }
  t = ENTITY_ALIASES[t] ?? t;
  if (/^[가-힣]+$/.test(t)) return t.length >= 2 ? t : null;
  if (/^[\d.]+$/.test(t)) return t.length >= 2 ? t : null;
  return t.length >= 3 || /\d/.test(t) ? t : null;
}

/** 텍스트 → 내용어 토큰(일반어·연도 제외). 여러 텍스트를 한 집합으로 모을 때는 contentTokensOf. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>();
  const flat = text
    .toLowerCase()
    .replace(/[’'`]s\b/g, "")
    .replace(/([가-힣])(\d)/g, "$1 $2");
  for (const [match] of flat.matchAll(
    /\d+(?:\.\d+)?[가-힣]+|[a-z0-9][a-z0-9.+-]*[a-z0-9+]|[a-z0-9]|[가-힣][가-힣a-z0-9]*/g,
  )) {
    // 하이픈은 버전·모델명(gpt-5.5)에서만 붙여 두고, 숫자 없는 합성어(openai-backed)는 나눈다.
    for (const raw of /\d/.test(match) ? [match] : match.split("-")) {
      const t = normalizeToken(raw);
      if (!t || GENERIC_TOKENS.has(t) || /^(19|20)\d\d$/.test(t)) continue;
      out.add(t);
    }
  }
  return out;
}

export function contentTokensOf(texts: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const text of texts) if (text) for (const t of contentTokens(text)) out.add(t);
  return out;
}

/** 두 집합이 함께 가진 토큰(정렬). */
export function sharedTokens(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((t) => b.has(t)).sort();
}
