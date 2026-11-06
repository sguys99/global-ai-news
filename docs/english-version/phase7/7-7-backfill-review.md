# Phase 7 백필 영어 재검토 (50건+ · 수집 경로 대조)

작성 2026-11-06 · 대상 DB `data/app.db`(f2f9b49 `chore(data): daily collect 2026-11-05` — 11-06 호까지, 영어 1,283/1,299건) · 저장소 c024ced · 표본·판정 스크립트는 세션 스크래치패드(커밋 안 함) · LLM 호출 없음, DB 쓰기 없음

## 요약

- **백필 54건: 정상 39 · 사소 11 · 오류 4(7.4%).** KOREA 27건은 정상 18 · 사소 5 · 오류 4, 해외 27건은 정상 21 · 사소 6 · 오류 0.
- **수집 경로 20건: 정상 15 · 사소 5 · 오류 0.** 1-4 `--no-save` 24건(정상 15 · 사소 9 · 오류 0)을 합치면 44건 중 오류 0이다.
- **오류 4건은 모두 한국 매체 기사의 고유명사다.** 숫자·금액 오류는 0건이다.
  - #994: 비교 대상 `Seedance 2.5`를 `Sora 2.5`로 바꿨다.
  - #951: 회사 이름 2개를 틀렸다(`Daewon C&T`·`Orcest Roccloud`).
  - #1165: 제논을 `Xenon`으로 썼다. **용어집 항목 자체가 틀렸다.**
  - #696: 기법 영문명을 지어냈다(`Patch Regeneration Inverse`).
- **4건 중 한국어 참고 입력을 따라간 것은 없다.** #994의 한국어 제목은 "시댄스 2.5"로 맞았다. #951·#696은 한국어에 해당 이름이 아예 없다. #1165는 용어집을 따랐다.
  - 2-3에서 본 실패 유형(한국어 오독을 영어가 그대로 옮김)은 이번 표본에서 사소 1건뿐이다. #146은 한국어 요약이 덧붙인 "성능·아키텍처 개선"을 따라갔다.
  - 오류 4건의 원인(용어집 오류·라틴 표기 없는 한국 이름·이름 바꿔치기)은 수집 경로에도 똑같이 있다. 0-3 2차에서도 수집형 입력으로 한국 인명 오류(#1325 "Hyun Dai")가 나왔다.
- **"확실히 높다"고 볼 수 없다.** 오류율은 백필 4/54(7.4%, 95% 구간 2.9~17.6%), 수집 0/20(구간 0~16.1%)이다.
  - Fisher 단측 p는 0.28이고, 1-4를 합쳐 0/44로 비교해도 0.09다. 2-3 표본까지 합친 백필 6/74와 비교해도 p=0.06이다.
  - 오류+사소 비율은 백필 27.8%, 수집 25%(1-4 포함 31.8%)로 차이가 없다.
- **권고 (a): 백필은 그대로 두고 표적 수정만 한다.** `--overwrite` 전체 재생성(약 $0.8)은 이번 오류 4건 중 하나도 확실히 고치지 못한다. 대신 Haiku의 회차 간 변동으로 새 오류를 만들 수 있다(0-3).
- 수정 목록 `configs/backfill/en-fixes-backfill.json`에 **17건 24항목**을 넣었다. 내역은 오류 4건(7항목), 사소 10건(13항목: 이번 표본 9 + DeepMind 표기 스캔 2건), 2-3에서 남은 사소 #871·#609(3항목)다.
  - 각 `from`은 DB 해당 필드에 정확히 한 번 나온다.
  - 바꾼 결과는 한글 0, 제목 20~110자, 요약 8~90단어를 지킨다. 새 숫자는 모두 원문 제목·발췌에 있다.
  - 한국어 쪽 사실 오류는 없어서 `title_ko`·`summary_ko` 항목은 넣지 않았다.

## 표본

- **모집단.**
  - 백필 = 호 날짜(KST, `created_at`)가 11-04 이하이고 영어가 있는 게재 기사 1,241건이다. 11-04 06:00 수집(run 141)은 Phase 1 이전 코드라서 11-04 호도 백필이다.
  - 수집 경로 = notes에 `영어 가공`이 있는 회차 142·143(11-05·11-06 호)의 42건이다. **그 전의 수집 경로 회차는 없다**(11-04 이전 회차 notes에 영어 줄이 없다). 그래서 수집 표본은 다른 에이전트가 전부 읽는 11-05·11-06 호에서 뽑을 수밖에 없었다. 1-4 `--no-save` 24건을 보조 대조군으로 함께 쓴다.
- **제외.** 2-3 표본 20건과 0-3 표본 20건, 합계 40 id를 뺐다. 그래서 백필 후보는 1,201건이다.
- **추출.** `random.Random(20261106)`으로 섞은 순서대로 뽑았다.
  - KOREA(`sources.region='kr'`) 27건: 호 날짜가 겹치지 않게, 소스당 최대 10건. 결과는 AI타임스 10 · 전자신문 9 · 바이라인 7 · 로봇신문 1, 06-09~11-04다.
  - 해외 27건: 뉴스 15건(호 날짜 중복 없음, 소스당 최대 3건), 오픈소스 6건, 논문 6건(형식마다 호 날짜 중복 없음). 06-09~11-04다.
  - 모델 형식은 이번에도 게재 기사가 0건이라 넣지 못했다.
  - 수집 경로 20건: 같은 seed로 섞어 KOREA 4건(그 두 호의 전부)과 해외 16건을 뽑았다.
- 표본 중 #1055는 한국어 수정(ko-number-fixes) 기사다. 2-3 기각·재시도 28건과 겹치는 기사는 없다. 그래서 백필 표본은 사실상 모두 **2-3 규칙 보강 전 프롬프트**(98b589c)로 만든 영어다.
- **판정 방법.** 원제와 `content_raw` 앞 2,000자(모델이 본 발췌, `MAX_INPUT_CHARS`)를 영어와 대조했다. `title_ko`·`summary_ko`는 한국어를 따라갔는지 보려고 함께 읽었다.
  - 의심스러운 4건은 원문 URL을 열어 확인했다. #1165(사명 표기 없음 → genon.ai에서 GenON 확인), #994(Seedance 2.5), #951(5개사 이름), #696(사진 설명의 Patch Rebirth Inversion)이다.
- 판정 기준은 2-3과 같다. 정상 = 고칠 것 없음 · 사소 = 사실은 맞지만 귀속·뉘앙스·형식 문제 · 오류 = 사실·숫자·고유명사가 틀림.

## 기사별 판정

### 백필 — KOREA 27건

| id   | 매체             | 형식 | kr  | 호    | 판정 | 메모                                                                                                                                                                                                                       | title_en (DB 현재)                                                                               |
| ---- | ---------------- | ---- | --- | ----- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 166  | AI타임스         | news | kr  | 06-09 | 정상 | 340억원 → KRW 34 billion ✓, 10개 산학연·LG전자 주관 ✓. 제목 주체를 South Korea로 넓힘(0-3에서도 허용 범위)                                                                                                                 | South Korea invests KRW 34 billion in physical AI core technology development                    |
| 1185 | AI타임스         | news | kr  | 10-29 | 정상 | BlueChip·기능 시제품·공급망 자립 ✓                                                                                                                                                                                         | Anduril and Qualcomm develop BlueChip notebook for U.S. defense                                  |
| 302  | AI타임스         | news | kr  | 07-07 | 정상 | 공모사업명을 영어로 풀어 따옴표에 넣었다(공식 영문명 아님, 경계). 김강희 → Kim Gang-hui                                                                                                                                    | Mokpo Children's Library launches picture-book creation program                                  |
| 1142 | AI타임스         | news | kr  | 10-27 | 사소 | 원제 "아바타 공유도 준비" — 제목 "expands Muse with … avatar sharing"은 출시로 읽힌다. 요약 "is also expanding external tool connections"는 이미 추가한 기능(…추가한 데 이어)이다. 한국어 요약 "확대하며"와 같은 틀 → 수정 | Meta expands Muse with real-time voice chat and avatar sharing                                   |
| 506  | AI타임스         | news | kr  | 10-06 | 정상 | 한전KDN → KEPCO KDN ✓, 박상형 ✓                                                                                                                                                                                            | KEPCO KDN hosts 2026 AI-ICT conference with five power generation companies                      |
| 1218 | 바이라인네트워크 | news | kr  | 10-30 | 정상 | "AI 에이전트 운영 플랫폼에 가까워졌다"(매체 해석)를 원제 "진화"로 받음 — 허용                                                                                                                                              | Oracle evolves AI Data Platform into AI agent operations platform                                |
| 1066 | 바이라인네트워크 | news | kr  | 10-24 | 정상 | 인력 부족·오탐·구독형 AI 도구 ✓                                                                                                                                                                                            | AI-powered cybercrime spreads as law enforcement struggles to respond                            |
| 994  | AI타임스         | news | kr  | 10-22 | 오류 | 원문 "시댄스 2.5"(ByteDance Seedance 2.5)를 제목에서 **Sora 2.5**로 바꿨다. 한국어 제목은 "시댄스 2.5"로 맞다 → 한국어 참고와 무관한 모델 이름 치환 → 수정                                                                 | Fal and Black Forest Labs launch FLUX 3 Max, a video model 22 times faster than Sora 2.5         |
| 887  | AI타임스         | news | kr  | 10-18 | 정상 | 비공개 초안·정부 중단 권한 제한·주법 대체 ✓. 폴리티코 귀속은 없음(경계)                                                                                                                                                    | Anthropic proposes its own AI safety bill to U.S. Congress                                       |
| 621  | AI타임스         | news | kr  | 10-08 | 정상 | 요약 "over 1 trillion" ✓, 27일 가중치 공개 예정 ✓. 제목은 원제처럼 단서 없음                                                                                                                                               | Mistral AI unveils Mistral Large 4, a 1 trillion-parameter open model                            |
| 1276 | AI타임스         | news | kr  | 11-02 | 사소 | `Google Deepmind` — 공식 표기 DeepMind → 수정                                                                                                                                                                              | Google says agent collaboration, not individual model intelligence, drives AI economic change    |
| 749  | 전자신문 AI      | news | kr  | 10-13 | 사소 | "Built on Zhipu AI's GLM-5.2" — 원문은 GLM-5.2를 NVFP4로 돌릴 때 "함께 활용"하는 드래프트 모델이다(기반 모델이 아니다) → 수정                                                                                              | Lablup releases GLM-5.2-NVFP4-DFlash-ko, a draft model accelerating Korean LLM inference         |
| 1238 | 바이라인네트워크 | news | kr  | 10-31 | 정상 | 20일 일부 이용자 공개·우아콘 ✓                                                                                                                                                                                             | Baemin's AI search grapples with non-deterministic answers                                       |
| 951  | AI타임스         | news | kr  | 10-20 | 오류 | 요약의 회사 이름 2개가 틀렸다: 대원씨티에스 → "Daewon C&T"(Daewon CTS), 오케스트로 클라우드 → "Orcest Roccloud"(원문 한 곳의 띄어쓰기 오타 "오케스트 로클라우드"를 음절대로 옮김). 한국어 요약에는 두 이름이 없다 → 수정   | Five companies including FuriosaAI partner to develop sovereign AI full-stack appliance          |
| 1165 | 전자신문 AI      | news | kr  | 10-28 | 오류 | 제논 → **Xenon**. 실제 영문 사명은 GenON(genon.ai). 용어집 `제논 → Xenon` 항목을 그대로 따랐다(용어집 오류 — 수집 경로도 같은 표기를 쓴다) → 수정                                                                          | Xenon launches GenGuard, an enterprise AI guardrail solution for generative AI security          |
| 696  | 전자신문 AI      | news | kr  | 10-11 | 오류 | "패치 재탄생 역변환(PRI)"을 "Patch Regeneration Inverse"로 지어냈다. 기사 사진 설명·논문명은 Patch Rebirth Inversion. 발췌에 영문이 없었다 → 수정                                                                          | Inha University develops knowledge transfer technique without original data                      |
| 836  | 바이라인네트워크 | news | kr  | 10-16 | 정상 | $299·11월 13일·12월 판매 ✓                                                                                                                                                                                                 | Apple introduces HomeView with Siri AI; partners with LG Electronics                             |
| 1254 | 전자신문 AI      | news | kr  | 11-01 | 정상 |                                                                                                                                                                                                                            | Security vendors pivot to automated response as AI-driven attacks accelerate                     |
| 725  | 전자신문 AI      | news | kr  | 10-12 | 정상 | "세계 최초"는 뺐다(보수적) ✓                                                                                                                                                                                               | KIST develops space-oriented AI platform fusing XR, robots, and spatial computing                |
| 866  | 전자신문 AI      | news | kr  | 10-17 | 정상 | 1000 TOPS ✓, 업무협약 → partnership                                                                                                                                                                                        | EdgeAI and EfficientAI partner on 1000 TOPS physical AI semiconductors                           |
| 809  | 전자신문 AI      | news | kr  | 10-15 | 사소 | 제목 "reasoning infrastructure" — 추론 인프라는 inference(요약은 inference). 요약 "Experts emphasize"는 프렌들리AI 대표 1명의 발언이고 "to enable agent-level capabilities"는 원문에 없는 인과 → 수정                      | Physical AI commercialization hinges on frontier models and reasoning infrastructure             |
| 768  | 바이라인네트워크 | news | kr  | 10-14 | 정상 |                                                                                                                                                                                                                            | South Korea's MSIT pushes mandatory AI training data sharing                                     |
| 655  | 전자신문 AI      | news | kr  | 10-09 | 정상 | 오픈라우터 3위 ✓                                                                                                                                                                                                           | VESSL AI provides inference infrastructure for Upstage Solar Pro 4                               |
| 1354 | 로봇신문         | news | kr  | 11-04 | 정상 | 로보월드 2026 출품(3일 발표·4일 개막) — introduced 허용                                                                                                                                                                    | Vectrobotics unveils physical AI vision connecting manufacturing, logistics, and service sectors |
| 1094 | 전자신문 AI      | news | kr  | 10-25 | 사소 | 좌담회 참석자들의 주장을 귀속 없이 사실·당위("South Korea must")로 썼다. 한국어도 같다 → 영어만 수정                                                                                                                       | AI safety emerges as key determinant of industry competitiveness                                 |
| 1029 | 바이라인네트워크 | news | kr  | 10-23 | 정상 |                                                                                                                                                                                                                            | Critical remote code execution vulnerability discovered in PHP                                   |
| 590  | 바이라인네트워크 | news | kr  | 10-07 | 정상 | 연내 3차 평가·내년 공모·GPU ✓                                                                                                                                                                                              | South Korea pursues two-track AI strategy: spreading existing models and frontier investment     |

### 백필 — 해외 뉴스 15건

| id   | 매체                  | 형식 | kr  | 호    | 판정 | 메모                                                                                                                                                                                                                                                  | title_en (DB 현재)                                                                    |
| ---- | --------------------- | ---- | --- | ----- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1315 | MIT Technology Review | news | -   | 11-03 | 정상 | MIT TR 에세이 티저 — "fulfilling … vision"은 원제 "is here"의 틀 안                                                                                                                                                                                   | The agentic web emerges as autonomous agents navigate the internet                    |
| 1283 | The Decoder           | news | -   | 11-02 | 정상 | 12월·토큰 할당 ✓, "likely" 단서 유지                                                                                                                                                                                                                  | OpenAI shifts ChatGPT Plus, Pro, and Business to token-based quotas in December       |
| 1055 | TechCrunch AI         | news | -   | 10-24 | 정상 | $30 billion·$1.25 trillion ✓(2-3 한국어 수정 기사)                                                                                                                                                                                                    | OpenAI pursues $30 billion fundraise at $1.25 trillion valuation ahead of IPO         |
| 146  | Latent Space          | news | -   | 06-09 | 사소 | 발췌는 "Build recap, and new MAI model technical details"뿐인데 "showcasing new performance and architectural improvements"를 붙였다. **한국어 요약이 덧붙인 "성능과 아키텍처 개선사항"을 따라갔다**(이번 표본의 유일한 한국어 참고 경로 사례) → 수정 | Microsoft unveils MAI-Thinking-1 and MAI family models at Build                       |
| 823  | NVIDIA Blog           | news | -   | 10-16 | 사소 | "All three balance intelligence and speed for local agentic workloads" — 원문에서 그 설명은 Bolt 74B-A9B 하나다 → 수정                                                                                                                                | NVIDIA releases Nemotron 3.5 models for specialized agents and edge deployment        |
| 742  | GeekNews              | news | -   | 10-13 | 정상 | 700곳·평균 30% ✓. 제목 "fail to"는 원제 "만들지는 못함"과 같다                                                                                                                                                                                        | AI coding agents boost code output 30% but fail to increase overall software delivery |
| 699  | Latent Space          | news | -   | 10-11 | 정상 |                                                                                                                                                                                                                                                       | AlphaFold's limits: why protein folding remains unsolved                              |
| 259  | The Decoder           | news | -   | 07-07 | 정상 | 40분·GitHub ✓. 제목 과거형(사소 이하)                                                                                                                                                                                                                 | Claude Code ported 2003 strategy game to iOS in hours                                 |
| 932  | The Verge AI          | news | -   | 10-20 | 사소 | "mostly operated on their own"의 단서가 "autonomous"로 빠졌고, 피해 기업은 Norforge가 아니라 Reuters 보도다(귀속 탈락) → 수정                                                                                                                         | Hacker compromised over 100 websites using autonomous AI agent army                   |
| 960  | The Decoder           | news | -   | 10-21 | 정상 | 50+ languages·EU-hosted ✓                                                                                                                                                                                                                             | Mistral AI launches Voxtral 3, a full voice agent stack for real-time conversations   |
| 1220 | TechCrunch AI         | news | -   | 10-30 | 정상 |                                                                                                                                                                                                                                                       | Deepgram acquires Pipecat-maker Daily to strengthen voice AI infrastructure           |
| 672  | OpenAI News           | news | -   | 10-10 | 정상 | 96%·52% ✓                                                                                                                                                                                                                                             | Sophos cuts threat investigation time by 96% with OpenAI Daybreak                     |
| 1070 | The Verge AI          | news | -   | 10-25 | 정상 |                                                                                                                                                                                                                                                       | OpenAI trains frontier AI models without internet access following hacking incidents  |
| 634  | The Verge AI          | news | -   | 10-09 | 정상 |                                                                                                                                                                                                                                                       | Anthropic launches free AI security scans for open-source projects                    |
| 1025 | TechCrunch AI         | news | -   | 10-23 | 사소 | 원문 "promising"(회사 주장)을 사실로 쓰고, 원문에 없는 비교 "than existing alternatives"를 더했다 → 수정                                                                                                                                              | Canva releases its first image generation model                                       |

### 백필 — 오픈소스 6건 · 논문 6건

| id   | 매체                     | 형식  | kr  | 호    | 판정 | 메모                                                                                                                           | title_en (DB 현재)                                                                        |
| ---- | ------------------------ | ----- | --- | ----- | ---- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 341  | GitHub (topic:llm)       | oss   | -   | 10-06 | 정상 | 저장소 자기소개 문구를 제목에 씀(형식은 지킴)                                                                                  | pitroom, a free pit crew for your expensive coding agent                                  |
| 205  | GitHub (topic:llm)       | oss   | -   | 07-07 | 정상 |                                                                                                                                | market-fish, a multi-agent market prediction engine                                       |
| 63   | GitHub (topic:llm)       | oss   | -   | 06-09 | 사소 | 저장소 제목 형식(`<project>, <what it does>`) 위반 "… enables AI agents …"(2-3 #199와 같은 유형, 고치지 않음)                  | Web3 Agent Kit enables AI agents to interact with blockchains                             |
| 1336 | GitHub Trending          | oss   | -   | 11-04 | 정상 |                                                                                                                                | Worktrunk, a CLI for Git worktree management designed for parallel AI agent workflows     |
| 746  | GitHub (topic:llm)       | oss   | -   | 10-13 | 정상 | $7 ESP32 ✓                                                                                                                     | esp32-iphone-agent lets AI model control a real iPhone with a $7 ESP32                    |
| 1279 | GitHub Trending          | oss   | -   | 11-02 | 사소 | "supporting models like DeepSeek, Qwen, and GLM"은 [토픽] 태그를 기능으로 씀(1-4 #16과 같은 유형, 한국어도 같음 — 고치지 않음) | FreeToken brings datacenter-scale model serving to your desktop                           |
| 53   | HuggingFace Daily Papers | paper | -   | 06-09 | 정상 | 50 constraint types·54K ✓                                                                                                      | OmniCap-IF benchmarks instruction-following in omni-modal video captioning                |
| 677  | HuggingFace Daily Papers | paper | -   | 10-10 | 정상 | 25 games·100.0·44% ✓                                                                                                           | Memento 3 enables frozen LLM agents to improve through reflective rulebooks               |
| 1329 | Takara TLDR              | paper | -   | 11-03 | 정상 | 0.465→0.423·0.691→0.727 ✓                                                                                                      | CIRCE estimates LLM task complexity from constraint structure                             |
| 1335 | HuggingFace Daily Papers | paper | -   | 11-04 | 정상 | 12 benchmarks·6 categories ✓                                                                                                   | CoworkOS framework scales long-horizon agent workflows with human-in-the-loop integration |
| 210  | arXiv cs.CL (NLP)        | paper | -   | 07-07 | 정상 | 6 models·3 tasks ✓                                                                                                             | ACUTE protocol improves LLM calibration, utility, and trust via activation analysis       |
| 1097 | Takara TLDR              | paper | -   | 10-25 | 정상 | 14 systems·20 points ✓                                                                                                         | TRIAD benchmarks how well multimodal AI resolves cross-modal ambiguity                    |

### 수집 경로 20건 (11-05·11-06 호)

| id   | 매체                         | 형식  | kr  | 호    | 판정 | 메모                                                                                                                                                                                                    | title_en (DB 현재)                                                                       |
| ---- | ---------------------------- | ----- | --- | ----- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1392 | 로봇신문                     | news  | kr  | 11-06 | 사소 | 원문은 "인수한다고 발표"(4일 발표, 보고서 인용) — "acquired"는 완료로 읽힘. KRW 3 billion ✓. 한국어도 "인수했다"                                                                                        | Osteonic acquires 51% stake in US spine surgery robot company FoxEyes                    |
| 1366 | AI타임스                     | news  | kr  | 11-05 | 사소 | 원문은 1000만 토큰에서 최대 35배라는 "예측 결과" — 요약 "achieves up to 35x"는 단서 탈락                                                                                                                | Zyphra's hierarchical attention technique speeds up long-context processing by up to 35x |
| 1365 | AI타임스                     | news  | kr  | 11-05 | 정상 | S-1/A·인간 감독 강화 ✓                                                                                                                                                                                  | Anthropic warns safety measures may lag behind recursive self-improvement acceleration   |
| 1374 | 로봇신문                     | news  | kr  | 11-05 | 사소 | 제목이 PICKY를 휴머노이드로 묶었다(본문은 PICKY + 별도 휴머노이드). 원제부터 모호하고 한국어 제목도 같다. 요약은 맞다                                                                                   | Beyond Robotics unveils strawberry-harvesting humanoid robot PICKY                       |
| 1380 | The Decoder                  | news  | -   | 11-06 | 정상 | 280B·33.5 trillion ✓                                                                                                                                                                                    | Baidu releases ERNIE 5.5 Flash Base, a 280B-parameter open-source foundation model       |
| 1376 | The Verge AI                 | news  | -   | 11-05 | 사소 | 제목 "$200 billion AI infrastructure spending" — 원문은 "about $200 billion" 계획(단서·예정 탈락). 요약은 맞다                                                                                          | Google's search ad growth slows amid $200 billion AI infrastructure spending             |
| 1370 | GitHub (topic:llm)           | oss   | -   | 11-05 | 정상 | 125B·1M·3080 10GB ✓                                                                                                                                                                                     | Speedy runs Qwen3.8-Flash-Next up to 1M context on one or two RTX cards                  |
| 1381 | The Decoder                  | news  | -   | 11-06 | 정상 | 35 points·Tencent 자체 평가 귀속 ✓                                                                                                                                                                      | Tencent unveils Hy4, a multimodal model with vision and computer use                     |
| 1390 | HuggingFace Daily Papers     | paper | -   | 11-06 | 정상 | 56·42·22·26·46/168 ✓                                                                                                                                                                                    | FrontierPhysics evaluates AI agents on 56 end-to-end physics research tasks              |
| 1378 | OpenAI News                  | news  | -   | 11-06 | 정상 |                                                                                                                                                                                                         | OpenAI unveils GPT-6 Cyber, a cybersecurity agent for finding and fixing vulnerabilities |
| 1379 | Google AI Blog               | news  | -   | 11-06 | 정상 |                                                                                                                                                                                                         | Google releases Gemini Omni 1.2 Flash with native 15-second video generation             |
| 1387 | TechCrunch AI                | news  | -   | 11-06 | 정상 |                                                                                                                                                                                                         | Axiom Math bets on formal verification to control AI proofs in mathematics               |
| 1391 | GitHub (topic:ai-agents·mcp) | oss   | -   | 11-06 | 정상 |                                                                                                                                                                                                         | poki, an MCP agent that operates a real iPhone                                           |
| 1388 | MarkTechPost                 | news  | -   | 11-06 | 정상 | 2.6x·24시간 ✓                                                                                                                                                                                           | Together AI releases Together Compiler with agent-driven optimization up to 2.6x faster  |
| 1371 | GitHub Trending              | oss   | -   | 11-05 | 정상 |                                                                                                                                                                                                         | spec-kit, a toolkit to get started with specification-driven development                 |
| 1367 | HuggingFace Daily Papers     | paper | -   | 11-05 | 정상 |                                                                                                                                                                                                         | Behind Video Generation: observations on multimodal understanding from Kling             |
| 1386 | The Verge AI                 | news  | -   | 11-06 | 정상 | read-only·Plaid ✓                                                                                                                                                                                       | Anthropic enables Claude to connect directly to your bank account                        |
| 1384 | GitHub Trending              | oss   | -   | 11-06 | 사소 | "expert teams … ensure character and brand consistency through the Scenario MCP" — 원문에서 일관성은 skills(Scenario MCP)가, 전문 팀은 Blender 등을 다룬다. 한국어도 같은 오독(같은 호출에서 함께 생성) | Scenario Skills, production-ready content generation for AI agents via MCP               |
| 1369 | GitHub (topic:ai-agents·mcp) | oss   | -   | 11-05 | 정상 |                                                                                                                                                                                                         | agenterm, AI agent remote control via MCP and terminal                                   |
| 1394 | OpenAI News                  | news  | -   | 11-06 | 정상 |                                                                                                                                                                                                         | OpenAI sets standards for responsible AI infrastructure development                      |

형식 점검(74건): 한글 유출 0 · 한국 매체 언급 0 · 원화는 `KRW` 표기(#166 `KRW 34 billion`, #1392 `KRW 3 billion`) · `N won` 0이다. 수집 경로의 사소 5건은 다른 에이전트의 11-05·11-06 호 검토 범위라 수정 목록에 넣지 않았다(아래 "남은 일").

## 오류율 비교

| 묶음                   |   건수 |   정상 |   사소 |  오류 | 오류율 (95% Wilson)  | 오류+사소 |
| ---------------------- | -----: | -----: | -----: | ----: | -------------------- | --------: |
| 백필 KOREA             |     27 |     18 |      5 |     4 | 14.8% (5.9~32.5%)    |     33.3% |
| 백필 해외              |     27 |     21 |      6 |     0 | 0% (0~12.5%)         |     22.2% |
| **백필 계(7-7)**       | **54** | **39** | **11** | **4** | **7.4% (2.9~17.6%)** | **27.8%** |
| 백필 + 2-3 표본        |     74 |     48 |     20 |     6 | 8.1% (3.8~16.6%)     |     35.1% |
| 수집 KOREA             |      4 |      1 |      3 |     0 | 0%                   |       75% |
| 수집 해외              |     16 |     14 |      2 |     0 | 0%                   |     12.5% |
| **수집 계(7-7)**       | **20** | **15** |  **5** | **0** | **0% (0~16.1%)**     |   **25%** |
| 수집 + 1-4 `--no-save` |     44 |     30 |     14 |     0 | 0% (0~8.0%)          |     31.8% |

- **오류율 차이는 통계적으로 확실하지 않다.**
  - Fisher 단측 p: 백필 54 대 수집 20은 0.28, 백필 54 대 수집 44는 0.09, 백필 74 대 수집 44는 0.06이다.
  - 오류+사소는 p 0.44~0.53으로 차이가 없다.
- **KOREA 대 KOREA는 비교할 수 없다.** 수집 경로 KOREA는 이번 4건과 1-4의 5건을 합쳐 9건이고, 그중 한국 고유명사가 나오는 기사는 #1392(오스테오닉·폭스아이즈, 원문에 FoxEyes 병기) 하나뿐이다. 백필 KOREA 오류 4건은 모두 "원문에 라틴 표기가 없는 한국 이름"에서 나왔다. 수집 경로는 그런 입력을 아직 거의 만나지 않았다.
- **오류 원인과 경로:**

| id   | 원인                                     | 한국어 참고 탓?                      | 수집 경로에도 같은 위험? | 재생성으로 고쳐지나?       |
| ---- | ---------------------------------------- | ------------------------------------ | ------------------------ | -------------------------- |
| 994  | 비교 모델 이름 바꿔치기(Seedance → Sora) | 아니다(한국어는 "시댄스 2.5"로 맞음) | 있다                     | 불확실(확률적)             |
| 951  | 라틴 표기 없는 회사명 음역 + 원문 오타   | 아니다(한국어에 이름 없음)           | 있다                     | 불확실                     |
| 1165 | 용어집 `제논 → Xenon` 오류               | 아니다                               | 있다(같은 용어집)        | 아니다(용어집을 고쳐야 함) |
| 696  | 기법 영문명 지어냄                       | 아니다(한국어에 영문 없음)           | 있다                     | 불확실                     |

- 2-3의 오류 2건(#633·#585)은 한국어 참고 탓이었고, 이미 재시도로 고쳤다. 그 뒤 백필 프롬프트에 "이름·버전·범위는 원문을 따른다" 줄도 더했다. 이번 54건에서 한국어 참고 탓은 사소 1건(#146 덧붙임)이고, 부분적으로 #1142의 상태 표현이 있다. **한국어 참고 입력이 오류율을 높인다는 근거는 이번 표본에서 약하다.**

## 권고

**(a) 백필은 그대로 두고 표적 수정 + 용어집 보강.** 전체 `--overwrite`는 하지 않는다.

- **근거 1. 차이가 확실하지 않다.** 오류율은 7.4% 대 0%지만 표본이 작아 p=0.09~0.28이다. 오류+사소 비율은 같다.
- **근거 2. 재생성이 오류를 고치지 못한다.** 오류 4건 중 한국어 참고 탓은 0건이다. 한국어를 빼고 다시 돌려도 용어집 오류(#1165)는 그대로 남는다. 나머지 3건은 Haiku의 확률적 실수라서 다시 나올 수도, 다른 기사에서 새로 나올 수도 있다(0-3: 같은 입력에서 1차는 맞히고 2차는 틀림).
- **근거 3. 비용 대비 이득이 작다.** 약 $0.8과 2-3 수준의 재검토가 다시 필요하다. 2-3 재시도로 바로잡은 #633·#585와 기각 재시도 22건도 다시 흔들린다.
- **할 일.**
  1. `configs/backfill/en-fixes-backfill.json`(17건 24항목)을 적용한다. 적용 경로는 `--ko-fixes`처럼 "정확히 한 번 나올 때만 치환" 방식이면 된다. 지금 `backfill-en.ts`의 `--ko-fixes`는 한국어 필드만 받으므로 영어 필드를 받는 작은 옵션이 필요하다. 다른 에이전트의 `en-fixes-p7-editions.json`과 같은 형식이라 같은 적용기를 쓸 수 있다.
  2. 용어집을 고친다(아래 규칙 제안 1). 특히 `제논 → GenON`.
  3. (선택) 백필 KOREA 357건 중 "원문에 라틴 표기가 없는 이름"만 골라 보는 점검을 한 번 한다. 영어의 대문자 고유명사 중 원제·발췌·용어집에 없는 것을 추려 사람이 확인한다. 오류 4건 모두 이 유형이었으므로 표본 50건보다 효율이 높다. 이번에 DeepMind 표기·Seedance·제논·오케스트로·대원씨티에스는 전수 스캔했고 추가 건이 없었다(DeepMind 표기 2건만 더 찾았다).
- **(b)를 택한다면(참고, 실행 안 함).**
  - `backfill-en.system.md`의 "## 입력" 절에서 [게재 한국어 제목]·[게재 한국어 요약] 설명 4줄을 지운다. `backfill-en.ts` 436~437행의 두 입력 줄과 few-shot의 한국어 줄을 뺀다.
  - 그러면 수집 가공과 같은 입력(원문 + 형식·출처·토픽)이 된다. `--overwrite --apply`, 상한 `BACKFILL_MAX_COST_USD` 1 → 비용 약 $0.7~0.8(입력이 기사당 약 100토큰 줄어 2-2 추정보다 약간 낮다)이다.
  - 그 전에 용어집을 먼저 고쳐야 하고, 끝난 뒤 이 수정 목록과 2-3 재시도 결과는 다시 확인해야 한다.

## 규칙 제안 (적용 안 함 — `english.md`·`glossary.en.md`는 다른 에이전트가 수정 중)

1. **`glossary.en.md` 수정·추가.**
   - `제논 → Xenon`을 **`제논 → GenON`**으로 고친다(genon.ai. 젠가드 GenGuard·제노스 GenOS는 맞다).
   - 추가: `오케스트로 → Okestro`(오케스트로 클라우드 → Okestro Cloud) · `대원씨티에스 → Daewon CTS` · `시댄스 → Seedance` · `바이트댄스 → ByteDance` · `구글 딥마인드 → Google DeepMind` · `프렌들리AI → FriendliAI`.
   - 용어집의 다른 회사 항목 중 공식 영문명을 확인하지 않고 음역한 것이 더 있는지 한 번 훑어볼 만하다. 이번 오류의 근원이 용어집이었다.
2. **`english.md` Names 절에 두 줄 추가.**
   - `- A product or model the input names stays that name: 시댄스 2.5 is Seedance 2.5. Never swap in a better-known name (Sora).`
   - `- If the input gives a Korean name with no Latin spelling and the glossary has none, do not invent an English expansion: keep the acronym the input gives (패치 재탄생 역변환(PRI) → "a technique called PRI"), and romanize a company name from its most common spelling in the body, not from a one-off typo.`
3. **공식 표기 우선.** Names 절의 공식 표기 예시에 `DeepMind`를 더한다(`Keep official casing even when the source writes it differently: DeepMind, not Deepmind`). The Decoder가 `Deepmind`로 써서 #990·#1263이 따라갔다.
4. **(백필 전용, 선택)** `backfill-en.system.md`에 이미 있는 "한국어 쪽에만 있는 사실·숫자·평가는 쓰지 않는다"에 `설명·평가어(성능 개선, 의미 있는 진전 등)도` 한 구절을 더한다(#146). 다만 백필은 다시 돌리지 않으므로 효과는 `--ids` 재시도에만 미친다.
5. 기존 규칙으로 덮이는 사소 유형(제목의 예정 → 완료 #1142·#1392, 단서 탈락 #932·#1366·#1376, 회사·좌담회 주장 귀속 #1025·#1094, [토픽]을 기능으로 씀 #1279, 저장소 제목 형식 #63)은 빈도가 2-3·1-4와 비슷하다. 새 규칙은 필요 없다.
6. **(코드, 선택)** KOREA 기사에서 영어의 라틴 고유명사(대문자 낱말·모델명)가 원제·발췌·용어집 어디에도 없으면 notes에 경고만 남긴다(`영어 이름 확인 N건`). 숫자 검사처럼 기각하면 정상 음역(Inha University 등)이 막히므로 경고까지만 둔다.

## 남은 일

- 수정 목록 적용 방법을 정한다(영어 필드 치환 옵션 — `en-fixes-p7-editions.json`과 같은 적용기).
- 용어집 `제논` 항목 수정(규칙 제안 1)은 수집 경로에도 영향이 있어 출시 전에 하는 편이 좋다.
- 수집 경로 사소 5건(#1392 acquired, #1366 예측 → achieves, #1374 제목, #1376 제목 단서, #1384 한·영 같은 오독)은 11-05·11-06 호 검토와 겹치므로 그쪽 수정 목록에 맡겼다.
