# Phase 1-4 `--no-save` 실제 1회 검토 보고서

작성 2026-11-04 · 모델 `claude-haiku-4-5`(Batches API) · 스냅숏 `data/eval/run-2026-11-04T03-24-57-889Z.json`(git 제외) · 로그 사본은 세션 스크래치패드(커밋 안 함)

## 요약

- **비용 $0.0551**(상한 $0.1). 선별 $0.0142 · 가공 $0.0331 · 재보도 $0.0079, 호출 5회. 예산 때문에 빠진 묶음은 없다. 이번 회차는 25건만 골랐다. 35건 회차로 늘려 잡아도 **약 $0.072**라 상한 아래다(아래 비용 표).
- **영어 가공 24/24건(100%), 기각 0건**(한글 0·길이 0·숫자 0). 기각이 없으니 검사기 오탐도 0이다. 검사를 통과한 출력 24건을 다시 읽었는데, 숫자 오류가 그대로 통과한 경우(미탐)도 없었다.
- **기사별 판정: 정상 15 · 사소한 문제 9 · 사실·숫자 오류 0.** 0-3 2차에서 나온 오류 두 유형(원화 10배 단위·주체 바꿔치기)은 다시 나오지 않았다. 다만 이번 회차에는 **원화 금액·한국 인명·한국 기관이 하나도 없었다**(아래 "검증하지 못한 것"). 한국 매체 기사 5건은 모두 해외 소식(OpenAI·중국 해킹·하이얼·칭화대·RAI)이었다.
- 사소한 문제는 세 갈래다. ① 귀속이 흐려짐: 언론사의 해석을 회사 발언으로 씀, 보고서 출처(CrowdStrike) 누락, 논문의 "평가 조건" 단서 누락. ② 저장소 [토픽]을 기능으로 씀, 저장소 자화자찬("easiest way")을 사실로 씀. ③ 낱말 뉘앙스(세우고 → lifting, AI-driven의 수식 대상). 숫자 오류는 없다.
- **한국어 쪽 회귀 신호 하나: 논문 요약이 길어졌다.** 논문 summary_ko 평균은 207자다. 최근 DB 논문 40건은 138자, 10-31 스냅숏은 132자였다. 최대 311자, 4문장짜리도 1건 있다. 뉴스(113자, DB 105자)와 저장소(95자, DB 95자)는 그대로다. title_ko 평균은 37.9자(DB 34.7자)이고 최대 59자로 `max(60)` 직전이었다. 넘으면 묶음 10건이 함께 버려진다(1-2 "남은 일"). 표본이 논문 6건뿐이라 단정은 못 한다. 배포 후 3일 관찰 항목으로 둔다.
- **용어집 선택 버그 1건을 고쳤다(파일만).** 키 `보스턴다이나믹스`는 본문의 `보스턴 다이나믹스`(띄어 씀)와 맞지 않는다. `keyPattern`은 키에 있는 공백과 한글↔라틴 경계에서만 띄어쓰기를 허용하기 때문이다. 모델은 Boston Dynamics를 맞게 썼지만 용어집 항목은 실리지 않았다. 여러 낱말로 된 외래 이름 9개를 띄어 쓴 키로 바꿨다(띄어 쓴 키는 붙여 쓴 본문에도 맞는다). english.md에는 두 줄을 더했다(아래 "프롬프트 변경").

## 실행

- `PATH=$HOME/.nvm/versions/node/v24.13.0/bin:$PATH npm run collect -- --no-save`를 1회 돌렸다(재시도 없음, exit 0, 약 11분).
- 실행 시각은 12:24 KST다. 06:00 정식 수집 뒤라 수집 685건 중 신규 후보가 138건뿐이었다(풀 138/180). 최근 3개 호 제목 89건을 "이미 보도함"으로 제외해 선정은 25건이었다. 재보도 검사가 1건(CUA-Master, 11-04 호와 같은 논문)을 빼서 **게재는 24건**이다. 같은 사건 합침은 0건, 세 줄 요약은 3줄이다.
- `data/app.db`는 그대로다. md5 `c17f5622…`가 실행 전후 같고 `git status data/`도 깨끗하다.
- 로컬 DB에는 영어 컬럼(`articles.title_en·summary_en`, `sources.region·name_en`)이 없다. `--no-save`는 이 컬럼들 없이 끝까지 돌았다. readonly로 열고, persist·syncSources를 건너뛰기 때문이다.

## 비용

| 단계   | 호출 | 입력 토큰 | 출력 토큰 | 실지불(batch) |
| ------ | ---: | --------: | --------: | ------------: |
| 선별   |    1 |    24,905 |       695 |       $0.0142 |
| 가공   |    3 |    29,833 |     7,265 |       $0.0331 |
| 재보도 |    1 |    15,315 |        85 |       $0.0079 |
| 합계   |    5 |    70,053 |     8,045 |   **$0.0551** |

- **가공 단가 비교(영어 전 → 후):** 10-31 스냅숏(영어 전)은 28건·3호출에 입력 21,385·출력 4,948토큰, $0.0231이었다(기사당 $0.00082). 이번에는 25건에 $0.0331이다(기사당 $0.00132, **+61%**).
  - 출력은 기사당 177 → 291토큰이다. 1-2 추정용 320토큰보다 낮아 추정이 보수적이다.
  - 입력은 호출당 7.1k → 9.9k토큰이다(english.md·고정 표 +2.8k, 용어집 블록 0~3항목).
- **35건 회차 환산:** 가공 4호출이면 입력 약 30.9k(고정) + 35 × 266 ≈ 40k, 출력 35 × 291 ≈ 10.2k로 **약 $0.046**이다. 선별(풀 180건)은 약 $0.018, 재보도는 약 $0.009로 잡으면 **합계 약 $0.072**다.
  - 1-2 추정(선별 + 가공 $0.065, 재보도 제외)과 맞는다. 상한까지 약 $0.028 남는다.
  - 최근 정식 회차(11-01~11-04)는 $0.041~$0.055였으니 영어로 약 +$0.016 늘어난다.
- 가공 시스템 프롬프트는 이제 Haiku 4.5 캐시 하한(4,096토큰)을 넘는다. Phase 9 캐싱 후보의 근거가 더 커졌다(호출당 고정 입력 약 7.7k).

## 영어 커버리지·검사

- notes: `영어 가공 24/24건`, `한국어 숫자 불일치 1건(25)`. 영어 기각 줄은 없다(0건).
- **기각 0건 → 검사기 오탐 0건.** 통과 24건을 손으로 다시 대조해도, 근거에 없는 숫자가 통과한 미탐은 없었다. 대표 대조:
  - `12억명` → `1.2 billion` ✓
  - `3조 2,000억 달러` → `$3.2 trillion` ✓ (한글로 쓴 달러 금액)
  - `$360 million`·`$130 million` ✓
  - `25.07%`·`55.90%`·`70.70%` ✓ (영어는 원문 소수점을 유지했다)
  - `15kg`(원제) ✓, `3분기` → `Q3` ✓
- **한국어 숫자 경고 1건(#126 WorldBridge):** 한국어 요약이 `25.07% → 25%`, `55.90% → 56%`, `70.70% → 71%`로 반올림했다. 경고는 맞다. 값이 틀린 것은 아니고 반올림 유형이다(1-3 분류의 "반올림"). 영어는 정확했다.

## 기사별 판정

판정: 정상 = 고칠 것 없음 · 사소 = 사실은 맞지만 귀속·뉘앙스·문체 문제 · 오류 = 사실·숫자·고유명사가 틀림. kr = `region: kr` 소스, (한) = 한국어 원문이지만 kr 아님(GeekNews).

| #   | 출처(형식)                  | kr   | title_en                                                                                 | 판정 | 비고                                                                                                                                                                                                                                                       |
| --- | --------------------------- | ---- | ---------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | AI타임스 (news)             | kr   | OpenAI says ChatGPT search reaches 20% of Google's volume with 1.2 billion weekly users  | 사소 | 요약 2문장 "The company noted that ChatGPT use is expanding… that rivals traditional search engines" — 원문은 기자의 해석("확대되는 모습이다")이다. 제목은 "돌파"의 단서(more than)가 빠졌다(요약에는 exceeding). 용어집 3항목(OpenAI·ChatGPT·Google) 정확 |
| 35  | GeekNews (news)             | (한) | DeepSeek experiments with autonomous development agent system                            | 정상 | 짧은 본문 → 1문장                                                                                                                                                                                                                                          |
| 0   | TechCrunch AI (news)        |      | Anthropic working on FlashProve system to verify AI model identity                       | 정상 | "is developing", "would let" 유지                                                                                                                                                                                                                          |
| 4   | 전자신문 AI (news)          | kr   | Chinese-linked hackers attack 200+ organizations with AI-powered cyberattacks            | 사소 | 원문은 "크라우드스트라이크 보고서로 드러났다"인데, 영어는 출처 없이 사실로 단정했다. "over 200"·"at least 14" 단서는 유지                                                                                                                                  |
| 25  | MarkTechPost (news)         |      | NVIDIA shows three optimizations that boost Ling-3.0-flash throughput 42.5% on DGX Spark | 정상 | `124B` 표기 유지                                                                                                                                                                                                                                           |
| 16  | GitHub robotics (oss)       |      | Dexsuite, a modular robot simulation framework for dexterous manipulation                | 사소 | 요약 "supporting imitation learning and reinforcement learning for complex robotic hand tasks" — [토픽]을 기능으로 썼다. "complex hand tasks"는 지어낸 말이다. **한국어도 같은 위반**("모방 학습과 강화학습을 활용하여")                                   |
| 39  | HF Daily Papers (paper)     |      | NorthCUA: scaling computer-use agents through experience at scale                        | 사소 | "state-of-the-art among open-source models"에서 "under the reported evaluation settings" 단서가 빠졌다. 요약 62단어                                                                                                                                        |
| 115 | HF Daily Papers (paper)     |      | RoboColosseum evaluates robot policy generalization and adaptation at scale              | 정상 | "no single policy led across all embodiments"는 원문(SO-101은 GR00T, Franka·YAM은 pi0.5 선두)에서 바로 따라 나오는 말이다 — 경계 사례                                                                                                                      |
| 9   | 로봇신문 (news)             | kr   | Haier's AI exoskeleton robots surge 345% in Q3 amid showroom expansion                   | 사소 | 제목에 "sales"가 빠져 "로봇이 345% 급증"으로 읽힌다(요약은 sales). 매체(중국로봇망) 언급 없음                                                                                                                                                              |
| 32  | 로봇신문 (news)             | kr   | Tsinghua, AgiBot propose collective experience learning for robot swarms                 | 정상 | 괄호 병기(AgiBot·INFINIGENCE)를 그대로 씀, 96대 ✓                                                                                                                                                                                                          |
| 37  | GitHub agents (oss)         |      | agenterm, MCP-based remote agent control for computers                                   | 정상 | 제목이 어색하고 "MCP protocol"은 중복 표현(문체만)                                                                                                                                                                                                         |
| 56  | GitHub agents (oss)         |      | Boxery, VM sandboxes for coding agents                                                   | 사소 | "provides the easiest way to…" — 저장소의 자화자찬을 사실로 썼다. 제목 38자(최단)                                                                                                                                                                          |
| 66  | 로봇신문 (news)             | kr   | RAI's Spot robot autonomously manipulates 15kg tires with whole-body control             | 사소 | 원문 "세우고 굴리거나 끄는"인데 "lifting, rolling, and dragging"으로 써서 세우다 ≠ lifting. "RAI's Spot"은 BD 로봇이라 오해 여지가 있다(요약은 Boston Dynamics' Spot으로 정확). 용어집 `보스턴다이나믹스`가 띄어쓰기 차이로 안 실림                        |
| 57  | GitHub llm (oss)            |      | ArgusAI, a multi-agent framework for AI security automation                              | 정상 | 중국어 원문. 한국어 제목 "AI 안전 검증용"은 security → safety 오역(한국어 쪽 사소)                                                                                                                                                                         |
| 63  | Google News humanoid (news) |      | Humanoid robots collaborate with CNC machines in world first                             | 사소 | 본문 = 제목뿐 → 1문장 ✓. "demonstration"을 덧붙였고, 제목은 관사·따옴표 없이 "in world first"                                                                                                                                                              |
| 71  | HF Daily Papers (paper)     |      | ReTrace evaluates recovery behavior in computer-use agents                               | 정상 | 발견 (i)~(iii)을 정확히 반영                                                                                                                                                                                                                               |
| 81  | HF Daily Papers (paper)     |      | CrossSWE benchmarks coding agents on cross-repository development                        | 정상 | 171·165·20·13·58.48%·44.2% ✓, `GPT-6.1 Sol` 표기 유지                                                                                                                                                                                                      |
| 130 | HF Daily Papers (paper)     |      | Unified training algorithm merges foundation model stages into single framework          | 정상 | "while preserving broader capabilities"는 원문에 있다                                                                                                                                                                                                      |
| 126 | HF Daily Papers (paper)     |      | WorldBridge connects video and action predictions for robot task generalization          | 정상 | 소수점 유지. 한국어는 반올림(경고 1건). 요약 67단어(최장)                                                                                                                                                                                                  |
| 1   | The Verge AI (news)         |      | Nexus Mods makes AI disclosure mandatory for mod uploads                                 | 정상 |                                                                                                                                                                                                                                                            |
| 43  | TechCrunch AI (news)        |      | Ballistic Ventures seeks $490M for new AI-driven cybersecurity funds                     | 사소 | 원제는 "AI 주도 사이버보안 붐 속에" 펀드를 모은다는 뜻이다. "AI-driven"이 펀드를 꾸미게 됐다                                                                                                                                                               |
| 60  | TechCrunch AI (news)        |      | Palantir's U.S. commercial revenue surpasses government revenue for first time           | 정상 | 짧은 본문 → 1문장(12단어)                                                                                                                                                                                                                                  |
| 69  | GeekNews (news)             | (한) | U.S. tech giants' AI off-balance-sheet debt surges 90% to $3.2 trillion in six months    | 정상 | `3조 2,000억 달러` → `$3.2 trillion` ✓, "approximately" 유지                                                                                                                                                                                               |
| 45  | MarkTechPost (news)         |      | Soniox STT v6 adds agent text input and echo filtering for voice agents                  | 정상 |                                                                                                                                                                                                                                                            |

형식 기준 점검:

- **한글 유출 0/24.**
- **sentence case 위반 0.**
- **한국 매체 언급 0, 과장어 0.** 금지 목록(revolutionary·groundbreaking·massive·"This shows"·"strengthens" 등)을 grep으로 확인했다.
- **제목 길이:** 38~88자, 평균 69자. 저장소 제목이 짧아 0-3의 46~97자보다 아래로 넓다.
- **요약 길이:** 12~67단어, 평균 37단어. 60단어를 넘은 것은 2건(논문)이다.
- **본문 없음·짧음 → 1문장:** 4건(#63·#60·#35·#0) 모두 지켰다.

## 문제 유형

| 유형                                                      | 이번 사례      | 0-3 대응 유형     | 조치                                                                         |
| --------------------------------------------------------- | -------------- | ----------------- | ---------------------------------------------------------------------------- |
| 귀속 흐려짐 — 기자 해석을 회사 발언으로, 보고서 출처 누락 | #3 · #4        | B(주장 귀속) 변형 | english.md Source 절에 1줄 추가                                              |
| 평가 조건 단서 누락("under the reported settings")        | #39            | D(단서 누락)      | 규칙 있음(자체 평가). 1건이라 추가 안 함                                     |
| 저장소 [토픽]을 기능으로, 자화자찬을 사실로               | #16 · #56      | 새 유형(A 변형)   | english.md summary_en 절에 1줄 추가. 한국어 규칙은 이미 있는데 한국어도 어김 |
| 낱말 뉘앙스·수식 대상                                     | #66 · #43 · #9 | -                 | 규칙으로 막기 어렵다. 관찰만                                                 |
| 덧붙임("demonstration")·관사                              | #63            | A·I               | 경미. 관찰만                                                                 |
| 원화 10배 단위(J)·주체 바꿔치기(K)                        | 없음           | J·K               | J는 이번 회차에 원화 금액이 없어 검증하지 못함. K는 재발 없음                |

### 검증하지 못한 것 (이번 회차에 표본 없음)

- **원화(KRW) 금액 0건**: 억/billion 10배 오류를 실제로 확인하지 못했다. 한글로 쓴 달러 금액 1건(#69)과 `억명` 1건(#3)은 정확했다.
- **한국 인명·계급 0건, 한국 기관·기업 0건**: 용어집 한국 항목, 성씨·계급 표, 로마자 규칙이 쓰이지 않았다. 한국 매체 5건이 모두 해외 소식이었다.
- **모델 형식 0건**(할당 미달 모델 0/1).

→ 배포 후 3일 관찰(1-4 세 번째 항목)에서 이 셋이 나오는 회차를 골라 확인한다. 특히 aitimes·etnews_ai의 투자·매출 기사다.

## 한국어 회귀 점검

| 지표                       | 이번 회차(24건)                                      | 기준                                         |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| title_ko 길이              | 평균 37.9 · 최대 59자                                | DB 최근 300건 평균 34.7 · 최대 55자          |
| summary_ko 길이 — 뉴스     | 평균 113자 (14건)                                    | DB 105자                                     |
| summary_ko 길이 — 저장소   | 평균 95자 (4건)                                      | DB 95자                                      |
| summary_ko 길이 — **논문** | **평균 207자** · 최대 311자 · 2~4문장 (6건)          | DB 최근 논문 40건 138자 · 10-31 스냅숏 132자 |
| 요약이 한국어인가          | 24/24 (한글 비율 0.40~0.75 — 고유명사·수치 몫)       | -                                            |
| 분야                       | 에이전트 7 · Physical AI 7 · 산업 6 · 연구 3 · LLM 1 | -                                            |

- 한국어는 그대로 한국어이고 형식도 깨지지 않았다. 숫자 경고는 1건(반올림)이다.
- 논문 요약 길이 증가는 영어 지시("key numbers", 40~60단어)가 같은 호출의 한국어 요약까지 늘렸을 가능성이 있다. 다만 6건이라 우연일 수도 있다. 프롬프트는 바꾸지 않았다. 한국어 길이 지시는 유료 재실행 없이 검증할 수 없어서다.
- title_ko 최대 59자는 `max(60)` 묶음 실패 위험에 가깝다.
- 분야는 대체로 맞다. 다만 컴퓨터 사용·코딩 에이전트 벤치마크 2건(#71 ReTrace, #81 CrossSWE)이 `research`로 갔다. 경계 규칙(agent > research)대로라면 `agent`다(NorthCUA는 agent). 영어판과 무관하게 전부터 있던 문제로 보인다. #25 MoE 추론 최적화는 `llm`보다 `oss`(서빙 인프라)에 가깝다.

## 검사기(englishCheck) 오탐

- **없음.** 기각 0건이다.
- 통과 24건 중 검사가 따져야 했던 경계 사례는 모두 맞게 통과했다:
  - `Q3` ← `3분기`
  - `200+` ← `200여개`
  - `$490M` ← 원제 `$490M`
  - `$3.2 trillion` ← `3조 2,000억 달러`
  - `1.2 billion` ← `12억명`
  - `Kendall W = 0.24`
  - `GPT-6.1 Sol`
- 검사 범위 밖의 미탐(숫자가 아닌 뉘앙스·귀속 문제)은 위 "사소" 9건이다. 코드 검사로 잡을 대상이 아니다.

## 용어집 선택 버그 (발견·수정)

- **증상:** #66 본문의 `보스턴 다이나믹스`(띄어 씀)에 용어집 키 `보스턴다이나믹스`가 맞지 않았다. 그래서 묶음 1의 `[용어집]` 블록이 0항목이었다(모델은 Boston Dynamics를 맞게 썼다).
- **원인:** `scripts/lib/glossary.ts` `keyPattern`은 키 안의 공백과 한글↔비한글 경계에만 `\s*`를 둔다. 순수 한글 연쇄 안의 띄어쓰기는 허용하지 않는다. 그런데 glossary.en.md 머리말은 "ignoring spaces"라고 잘못 적고 있었다.
- **규모:** 최근 30일 게재 938건에서 키를 띄어쓰기 무시로 대조하면 추가로 걸리는 건 `슈나이더일렉트릭`·`르총크` 각 1건이다(라틴 키 MS·SK는 대조 방식 차이라 제외). 드물지만 외래 복합어 이름은 띄어 쓰는 매체가 있다.
- **수정(파일만, 코드 무변경):** 여러 낱말로 된 이름 키 9개를 띄어 쓴 형태로 바꿨다. 띄어 쓴 키는 `\s*`가 되어 붙여 쓴 본문에도 맞으므로 순수 확장이다.
  - 바꾼 키: `네이버 클라우드`·`카카오 모빌리티`·`두산 로보틱스`·`허깅 페이스`·`슈나이더 일렉트릭`·`보스턴 다이나믹스`·`파이낸셜 타임스`·`월스트리트 저널`·`뉴욕 타임스`
  - 머리말 설명도 실제 동작대로 고쳤다.
  - 확인: `보스턴 다이나믹스의`·`보스턴다이나믹스`·`허깅페이스`·`뉴욕타임스` 모두 선택된다.

## 프롬프트 변경 (적용함)

`configs/prompts/english.md` — 각 1줄, 시스템 프롬프트 약 +80토큰(회차당 +$0.0002 미만).

1. Source 절, "Attribute claims" 다음:
   > Keep the source of a finding the input attributes ("according to a CrowdStrike report"). The outlet's own reading of the news (모습이다, 전망이다) is not the company's statement: do not write "the company noted" for it.
2. summary_en 절, repo 주체 줄 다음:
   > Repo: the [토픽] line is for classification only. Do not turn its keywords into features ("supports reinforcement learning"). The repo's own superlatives ("the easiest way") are its claim: drop them or attribute them.

`configs/prompts/glossary.en.md` — 위 키 9개와 머리말.

확인: `npx vitest run`(Node 24) **76파일 1,001건 통과**. 이 변경은 유료 재실행으로 확인하지 않았다(지시대로 재실행 없음). 배포 후 첫 회차들에서 효과를 본다.

## 권장

1. **1-4 배포를 진행해도 된다.** 비용은 상한 아래(35건 환산 약 $0.072)이고, 영어 커버리지 100%, 오류 0이다.
2. **배포 후 3일 관찰에 더할 항목:**
   - ① 원화 금액·한국 인명이 있는 한국 매체 기사의 영어(이번에 검증하지 못한 J 유형)
   - ② 논문 summary_ko 길이(형식별 평균이 이번처럼 200자 안팎이면 enrich.system.md 논문 가이드에 "2~3문장" 재강조 검토)
   - ③ title_ko 60자 근접·묶음 파싱 실패(`가공 실패·보류`) 여부
   - ④ 새 english.md 두 줄의 효과(귀속·[토픽])
3. **(코드, 선택)** `keyPattern`이 순수 한글 키 안에서도 띄어쓰기를 허용하게 할지 검토한다. 아니면 glossary 테스트에 "여러 낱말 외래 이름 키는 띄어 쓴다" 검사를 추가한다. 지금은 파일 규칙(머리말)으로만 막았다.
4. **(한국어, 영어판과 별개)** 컴퓨터 사용·코딩 에이전트 벤치마크 논문이 `research`로 분류되는 경향이 있다. categories.md 경계 규칙(agent > research)의 예시 보강 후보다.
5. 가공 시스템 프롬프트가 캐시 하한을 넘었으므로 Phase 9 프롬프트 캐싱의 우선순위를 올릴 만하다.
