# Phase 2-3 백필 영어 무작위 20건 검토 · 유출 점검

작성 2026-11-04 · 대상 DB `data/app.db`(41f27a7 `chore(data): backfill english 2026-11-04`, 게재 1,255건 중 영어 1,223건) · 배포 [run 41791731216](https://github.com/sguys99/global-ai-news/actions/runs/41791731216)(headSha 41f27a7, success) · 표본 추출·검사 스크립트와 내려받은 페이지는 세션 스크래치패드(커밋 안 함)

## 요약

- **판정: 정상 9 · 사소 9 · 사실·숫자 오류 2**(20건). KOREA 10건은 정상 3 · 사소 6 · 오류 1, 해외 10건은 정상 6 · 사소 3 · 오류 1.
- **숫자·금액 오류는 0건이다.** 오류 2건은 범위 과장(#633 "4,000개를 풀었다")과 모델명 변형(#585 `Qwen3.6-35B-A3B` → `Qwen 3.6-35B`)이다. 둘 다 **한국어 가공본의 잘못된 해석을 영어가 그대로 옮긴** 경우다. 백필 입력에 한국어를 참고용으로 넣은 데서 오는 위험이다.
- 사소 9건은 네 갈래다. ① 예정·발표를 완료로 씀(#871 상장 예정 → listed, #609). ② 단서·범위가 제목에서 빠짐(#1127 약 4000배, #814 줄이기 → eliminate). ③ 귀속 없는 전망·논평(#538, #965). ④ 입력에 없는 설명어·형식 위반(#692, #199, #1281).
- **한국어 수정 25건 38항목은 모두 DB에 들어갔다.** `to` 문자열 38/38 있음, `from` 잔존 0. 영어는 24/25건이 고친 숫자와 맞고, 1건(#155)은 숫자 검사가 맞게 기각했다.
- **유출 0건.** 영어가 있는 1,223건 전부의 영어 고유 조각(원문에 없는 30자)으로 배포 사이트 페이지 25개와 공개 JSON 3개·RSS를 grep했다. 영어 필드는 한 번도 나오지 않았다. 기사 페이지 크기는 HTML 평균 60.6 KB, HTML+RSC 91.7 KB로 0-4 기준(60.7 / 92.0 KB)과 같다.

## 표본

- `random.Random(20261104)`로 영어가 있는 게재 기사 1,223건을 섞는다. 앞에서부터 KOREA(`region: kr` — aitimes·etnews_ai·byline_network·irobotnews) 10건을 고르고, 해외는 뉴스 5 · 오픈소스 3 · 논문 2건을 고른다. 묶음마다 호 날짜(KST)가 겹치지 않게 했다.
- KOREA 10건은 모두 뉴스다(한국 매체 소스가 전부 뉴스 형식). AI타임스 7 · 전자신문 2 · 바이라인 1이고, 로봇신문은 뽑히지 않았다. 날짜는 10-06~10-27이다.
- 해외 10건은 06-09~11-02다. 모델 형식은 DB에 게재 기사가 없어 넣지 못했다.
- 각 기사는 원제 + `content_raw` 앞 2,000자(모델이 본 발췌, `MAX_INPUT_CHARS`)와 `title_ko`·`summary_ko`를 놓고 `english.md` 규칙으로 판정했다.

## 기사별 판정

판정: 정상 = 고칠 것 없음 · 사소 = 사실은 맞지만 귀속·뉘앙스·형식 문제 · 오류 = 사실·숫자·고유명사가 틀림(0-3 기준과 같음).

| id   | 매체          | 형식  | kr  | 판정 | 메모                                                                                                                                                                       | title_en                                                                               |
| ---- | ------------- | ----- | --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 871  | AI타임스      | news  | kr  | 사소 | 원제 "30일 코스닥 상장"은 예정이다(16일 간담회 기사). 요약은 "listed on Kosdaq"(완료). 제목 "safe AI"·요약 "safety AI"가 엇갈린다. IntelliVIX는 용어집대로 맞다            | IntelliVIX lists on Kosdaq, expands safe AI into defense and autonomous vehicles       |
| 538  | 전자신문 AI   | news  | kr  | 사소 | "may expand to other countries including South Korea"는 매체의 전망("주목된다")이다. 귀속 없이 썼다. Textgrain은 원문에 라틴 표기가 없어 추정 표기다                       | OpenAI deploys watermarking technology for AI-generated text in EU first               |
| 965  | 바이라인      | news  | kr  | 사소 | "the work demonstrates the potential for AI to…"는 금지 문형이다. 원문은 "~가능성을 보여줬다는 설명이다"(귀속)                                                             | Anthropic demonstrates self-replicating AI worm in controlled experiment               |
| 814  | 전자신문 AI   | news  | kr  | 사소 | 제목 "eliminate"는 원문 "줄이기 위한"(reduce)보다 세다. 요약은 reduce로 맞다                                                                                               | NetApp unveils Novus, an AI storage platform to eliminate GPU data bottlenecks         |
| 1114 | AI타임스      | news  | kr  | 정상 | MIT 연구, 농구·볼링·물체 던지기 모두 원문대로                                                                                                                              | MIT finds AI agents spontaneously invent play and discover unknown techniques          |
| 1127 | AI타임스      | news  | kr  | 사소 | 원문 "약 4000배"의 '약'이 제목·요약 모두 빠졌다. 1.76시간 → 1.6초 ✓                                                                                                        | Backpropagation-free AI training accelerates 4000x in 10 days to 1.6 seconds           |
| 1074 | AI타임스      | news  | kr  | 정상 | Agent Compute Engine·microVM 표기 ✓                                                                                                                                        | Google Cloud launches Agent Compute Engine with microVM security isolation             |
| 692  | AI타임스      | news  | kr  | 사소 | $7.5 billion·$870 million ✓, 원화 병기는 버렸다 ✓. "decision-scoring model"은 입력("의사결정 특화 모델")에 없는 설명어다(경계). "from a16z-led round"는 관사가 빠졌다      | TypeSafe AI reaches $7.5 billion valuation, raises $870 million                        |
| 1048 | AI타임스      | news  | kr  | 정상 | 130여개 → "130+"·"more than 130" ✓                                                                                                                                         | SpaceX launches SI partner network with 130+ companies to expand Grok enterprise reach |
| 633  | AI타임스      | news  | kr  | 오류 | 원문은 약 4000개 문제를 "제시"하고 성과를 722편으로 정리했다. 제목은 "solve 4,000 problems"로 과장했고 '약'도 뺐다(요약은 approximately로 맞다). 한국어 제목도 같은 오류다 | OpenAI used frontier model to solve 4,000 math research problems                       |
| 828  | MarkTechPost  | news  | -   | 정상 |                                                                                                                                                                            | CopilotKit releases CLiF, a continual learning platform for AI agents                  |
| 741  | TechCrunch AI | news  | -   | 정상 | almost $50 million → nearly ✓                                                                                                                                              | WindBorne wins nearly $50 million US Air Force contract for weather balloon data       |
| 609  | The Verge AI  | news  | -   | 사소 | 원문은 행사에서 "will give" 업그레이드를 시연한 것이다. 요약은 "upgraded Copilot"(완료)                                                                                    | Microsoft gives Copilot local file access and OS-level control                         |
| 1244 | OpenAI News   | news  | -   | 정상 | 954% ✓. OpenAI 고객 사례라 귀속 없음은 경계                                                                                                                                | Credit Saison achieves 954% ROI with ChatGPT Enterprise pilot                          |
| 1044 | The Decoder   | news  | -   | 정상 | up to 25 percent·61-page ✓. 한국어 요약은 '최대'를 뺐다(한국어 쪽 사소)                                                                                                    | Three-week audit finds significant gaps in OpenAI's AI safety monitoring               |
| 199  | GitHub llm    | oss   | -   | 사소 | 저장소 제목 형식(`<project>, <what it does>`)을 어겼다("neo is an … that"). "scales"는 원문(make small models do big work)과 다르다                                        | neo is an open-source agent harness that scales small models for complex work          |
| 332  | GitHub llm    | oss   | -   | 정상 | 짧은 설명 → 1문장                                                                                                                                                          | Paperfold, zoom any paper for better understanding                                     |
| 42   | GitHub llm    | oss   | -   | 정상 | 25+·no telemetry ✓                                                                                                                                                         | TokenBar monitors AI token usage for 25+ coding agents on macOS                        |
| 1281 | arXiv cs.CL   | paper | -   | 사소 | "near-non-thinking regime" → "low-overhead inference scenarios"로 뜻이 바뀌었다. 제목 "faster inference"는 초록의 latency 근거가 있어 허용                                 | HyperThink amortizes reasoning computation into parameter updates for faster inference |
| 585  | Takara TLDR   | paper | -   | 오류 | 기반 모델 `Qwen3.6-35B-A3B` → "Qwen 3.6-35B"(A3B가 빠지고 띄어 썼다 — 한국어 요약 표기와 같다). 제목 "over any corpus"는 원문 "a fixed corpus"와 반대다. 수치는 맞다       | T-Search, an agentic retriever for multi-step search over any corpus                   |

형식 기준 점검(20건): 한글 유출 0 · sentence case 위반 0 · 한국 매체 언급 0 · 제목 50~86자 · 요약 15~56단어 · 본문 짧은 저장소 1문장 ✓.

## 합계

| 묶음   |  정상 |  사소 | 사실·숫자 오류 |
| ------ | ----: | ----: | -------------: |
| KOREA  |     3 |     6 |              1 |
| 해외   |     6 |     3 |              1 |
| **계** | **9** | **9** |          **2** |

- 1-4 `--no-save`(정상 15 · 사소 9 · 오류 0, 24건)보다 나쁘다. 백필은 한국어 가공본을 참고로 받는다. 오류 2건과 사소 1건(#1127은 한국어도 '약'을 뺐다)이 한국어의 해석을 따라갔다. 수집 가공은 같은 호출에서 원문을 직접 읽으므로 이 경로가 없다.
- 표본 KOREA 10건에 원화 금액이 하나도 없었다(#692는 원화 병기를 버림). 원화는 아래 한국어 수정 기사 4건(#760·#1237·#493·#1258)에서 확인했다.

## 전체 1,223건 패턴 스캔

표본 밖 빈도를 보려고 영어가 있는 전체 기사에 정규식을 돌렸다(오탐을 손으로 걸렀다).

| 패턴                                                        | 건수 | 예                                                           | 기존 규칙           |
| ----------------------------------------------------------- | ---: | ------------------------------------------------------------ | ------------------- |
| 원화를 `N won`으로 씀(`KRW` 아님)                           |    2 | #1250 `5 trillion won`, #1258 `15.027 billion won`           | 있음(Numbers)       |
| 금지 논평 문형(demonstrates the potential·marks a shift 등) |    3 | #965, #774, #219 `strengthens its position`                  | 있음(Source)        |
| 원문에 없는 과장어                                          |    2 | #534 `unprecedented warnings`(사설), #1073 `massive`(초대형) | 있음                |
| 제목이 의문문·1인칭 칼럼 문장                               |    4 | #704 `— will they deliver?`, #1096, #24(Ask HN), #246        | 있음(teaser 금지)   |
| 제목 100자 초과(검사 상한 110 안)                           |    9 | 101~107자                                                    | 있음(≤100)          |
| 저장소 제목 `X is a …`                                      |    3 | #199, #349, #365 (오픈소스 110건 중)                         | 있음(Repo 형식)     |
| MoE 모델명 변형(`…-A3B` 탈락)                               |    1 | #585                                                         | 있음(모델명 그대로) |

- 원문에 있는 과장어(#15 `massive`, #660·#1145 `unprecedented` 인용)와 기능 서술의 `strengthens`(#814·#800·#807·#1053)는 위반이 아니라서 뺐다.
- 모두 기존 규칙이 있는 유형이고 비율이 낮다(많아야 0.7%). 규칙을 새로 만들기보다 예시를 붙이는 쪽이 맞다.

## 문제 유형과 제안 규칙

`configs/prompts/english.md`에 더할 문구 제안이다(**적용 안 함**). 1~3은 이번 오류·사소의 근거가 있고, 4~5는 빈도가 낮아 선택이다.

| #   | 유형                                               | 사례                           | 제안 위치             |
| --- | -------------------------------------------------- | ------------------------------ | --------------------- |
| 1   | 예정·발표를 완료로(0-3 C 유형 재발)                | #871, #609                     | Source 절 "status" 줄 |
| 2   | 제목이 본문보다 넓게 말함 — 범위 과장·단서 탈락    | #633, #585, #1127, #814, #1250 | title_en 절           |
| 3   | 한국어 가공본의 표기·해석을 따라감(백필 입력 특유) | #585, #633                     | Source 절 첫 줄       |
| 4   | 원화 `won` 표기                                    | #1250, #1258                   | Numbers 절 KRW 줄     |
| 5   | 질문형·1인칭 원제를 그대로 씀                      | #704, #1096, #246              | title_en 절           |

제안 문구:

1. `- A date after the story's date, or "will", means the event has not happened yet: 30일 코스닥 상장 in a story about a press event on the 16th → "will list on Kosdaq on the 30th", not "listed". A feature shown at an event that "will give" access → "will give", not "upgraded".`
2. `- title_en claims no more than the body: problems given to a model are not problems solved, "a fixed corpus" is not "any corpus", "reduce" is not "eliminate". Keep the body's hedges in the headline too (약 4000배 → about 4,000x, 5조원 이상 → over KRW 5 trillion).`
3. `- The Korean title and summary show only how the story was framed. Take names, model versions and the scope of each claim from the original, not from the Korean (Qwen3.6-35B-A3B stays Qwen3.6-35B-A3B even if the Korean writes Qwen 3.6-35B).` — 백필 프롬프트(`backfill-en.system.md`)에만 넣어도 된다. 수집 가공에는 한국어 입력이 없다.
4. Numbers 절 KRW 줄 끝에 `Always "KRW 5 trillion", never "5 trillion won".`
5. `- If the original headline is a question or a first-person opinion line, state what the piece does: "Essay argues…", "Paper examines why…", "Ask HN thread collects…".`

- **용어집(`glossary.en.md`)은 바꿀 것이 없다.** 표본과 수정 기사에 나온 한국 이름(IntelliVIX·TypeSafe AI/Jev·POSCO DX/Enhans·Nanopozi.ai·Seongnam 등)은 모두 맞다. #538 Textgrain은 원문에 라틴 표기가 없는 제품명이라 용어집으로 미리 막을 수 없다.
- 2·3은 코드 검사로 잡기 어렵다(숫자가 아니다). 4는 `englishCheck`에서 `\d… won\b`을 경고로 띄울 수 있지만 2건뿐이라 우선순위가 낮다.

## 한국어 수정(`configs/backfill/ko-number-fixes.json`) 반영 확인

- **25건 38항목 모두 반영.** 각 항목의 `to` 문자열이 해당 필드에 있고, `from`(바뀐 쪽이 `to`에 포함되지 않는 경우)은 남아 있지 않다.
- **영어 일관성: 24/25건 일치, 1건 기각(정상).**

| id   | 고친 한국어                   | 영어                                              | 일치                      |
| ---- | ----------------------------- | ------------------------------------------------- | ------------------------- |
| 1301 | 9,000억 달러                  | `$900 billion`                                    | ✓                         |
| 968  | 14.5억 달러                   | `$1.45 billion`                                   | ✓                         |
| 1055 | 300억 달러 · 1조 2,500억 달러 | `$30 billion` · `$1.25 trillion`                  | ✓                         |
| 151  | 9,650억 달러                  | `$965 billion`                                    | ✓                         |
| 154  | 68억 · 11억 개                | `6.8 billion` · `1.1 billion`                     | ✓                         |
| 238  | 8,520억 달러                  | `$852 billion`                                    | ✓                         |
| 417  | 780억 개 매개변수             | `78 billion parameters`                           | ✓                         |
| 475  | 40.2~77.2%                    | `40.2–77.2%`                                      | ✓                         |
| 493  | 4.7조원(약 34.9억 달러)       | `KRW 4.7 trillion ($3.49 billion)`                | ✓ (원문이 둘 다 씀)       |
| 601  | 1,800억 개                    | `180 billion`                                     | ✓ (제목 구문 어색 — 아래) |
| 636  | 120억 매개변수                | `12-billion-parameter`                            | ✓                         |
| 671  | 500억 달러                    | `$50 billion`                                     | ✓                         |
| 710  | 5,000억 토큰                  | `500 billion tokens`                              | ✓ (아래)                  |
| 760  | 20억 원                       | `KRW 2 billion`                                   | ✓                         |
| 763  | Claude Fable 5.1              | `Claude Fable 5.1`                                | ✓                         |
| 770  | 27억 달러 · 거래 이후         | 금액 언급 없음 · "filed for bankruptcy"           | ✓                         |
| 833  | 168억 달러                    | `$16.8B` · `$16.8 billion`                        | ✓                         |
| 944  | GPT-6 아스트라                | `GPT-6 Astra`                                     | ✓                         |
| 1054 | 155조 토큰                    | `155 trillion tokens`                             | ✓                         |
| 1075 | 100만 토큰                    | `1-million-token`                                 | ✓                         |
| 1237 | 참여 기관 수 삭제             | `KRW 14.6 billion` · 기관 이름 나열(수 없음)      | ✓                         |
| 1258 | 2026~2028년 3년간             | `through 2028` · `15.027 billion won`             | ✓ (won 표기 — 제안 4)     |
| 1306 | 7,530억 파라미터              | `753 billion parameters`                          | ✓                         |
| 1321 | 270억 파라미터                | `27B` · Gemma 4 26B-A4B                           | ✓                         |
| 155  | 100억 달러(데카콘)            | **영어 없음** — 숫자 검사 기각(`10 billion, USD`) | 정상 기각                 |

- #155는 원문이 "decacorns"뿐이고 금액이 없다. 모델이 `$10 billion`을 써서 숫자 검사가 기각했다(백필 보고서 아티팩트). 수정 목록 작성 때 예상한 "근거 발췌 없음" 경고와 같은 원인이다. `--ids` 재시도로도 금액을 빼야만 통과하므로 그대로 둬도 된다.
- 숫자는 맞지만 문장이 어색한 2건(사소): #601 제목 "as 180 billion watermarked images go public"은 공개되는 것이 감지기다. #710 "trained on 500 billion tokens"는 원제 "500B Tokens Later"(토큰을 쓴 뒤)와 뜻이 다르고, 한국어("5,000억 토큰으로 … 학습")도 같다.

## 유출·용량 점검 (배포 사이트)

배포 run 41791731216(headSha 41f27a7 = 백필 커밋, 07:23:59Z 완료) 뒤 `https://sguys99.github.io/global-ai-news/`에서 받았다.

- **받은 것:** 홈 · `/edition/2026-11-02/` · 기사 21쪽(표본 20건 + #1301, 각각 HTML과 `index.txt`) · `search-index.json` · `feed-index.json` · `latest.json` · `feed.xml`.
- **방법:** 영어가 있는 1,223건 모두에서 `title_en`·`summary_en`의 30자 조각 중 그 기사 원제·발췌에 없는 것을 최대 4개씩 뽑았다(예: #1301 `Anthropic commits to $900 bill`, #1281 `HyperThink amortizes reasoning`, #1244 `xpand the results to companywi`). HTML 엔티티와 JSON 이스케이프를 푼 뒤 각 파일에서 찾았다.
- **결과: 유출 0건.**
  - `search-index.json`에서 6개 조각(4건)이 맞았지만 모두 오탐이다. 다른 기사의 `titleOriginal`이나 `related` 제목(원문 영어)이 같은 낱말로 시작한다(#684·#1039·#1068 원제, #900의 HN 관련 보도 제목). 영어 가공 필드 자체가 아니다.
  - 모든 파일에서 `titleEn`·`summaryEn`·`title_en`·`nameEn` 키 0회.
  - 공개 JSON 키: `feed-index.json`과 `latest.json`, `search-index.json` 어디에도 영어 키가 없다(`SearchIndexEntry`가 `titleEn`·`summaryEn`을 `Omit`, 목록 카드는 `src/lib/db.ts`에서 `delete card.titleEn/summaryEn`).
- **기사 페이지 크기:** 표본 20건 HTML 평균 60.6 KB(57.6~65.0), RSC 31.2 KB, 합계 **91.7 KB**. 0-4 기준 HTML 60.7 · 합계 92.0 KB와 같다 → 백필로 늘지 않았다. 홈 316 KB · 호 309 KB(0-4 호 평균 365 KB 범위 안).

## 남은 일

- 2-3 첫 항목(`npm run kpi`로 커버리지 = 100% − 기각 32건 확인)과 기각 목록 정리는 이 문서 범위 밖이다.
- 제안 규칙 1~3을 적용할지 정한다. 적용하면 수집 가공(`english.md`)과 백필(`backfill-en.system.md`)에 같이 들어간다. 3은 백필에만 넣어도 된다.
- 오류 2건(#633·#585)과 사소 중 고칠 만한 것(#871 listed)은 `--ids … --overwrite` 재시도 후보다. 다만 한국어 쪽(#633 제목)도 같은 오류라 한국어 수정 없이 재시도하면 같은 해석을 따라갈 수 있다.
