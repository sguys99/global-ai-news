# Phase 7 — 최근 2개 호 영어판 통독 (2026-11-05 · 11-06)

작성 2026-11-06 · 대상 DB `data/app.db`(f2f9b49 `chore(data): daily collect 2026-11-05` 이후 배포 브랜치 상태, 회차 142·143) · 배포 사이트 https://sguys99.github.io/global-ai-news/en/ · 스크린샷·추출 스크립트는 세션 스크래치패드(커밋 안 함)

## 요약

- **대상.** 호 날짜(KST, `created_at`) 2026-11-05(제142호)와 11-06(제143호)이다. 두 호 모두 게재는 22건이고 영어는 21건씩 있어 모두 42건이다. 두 호 다 수집 가공(같은 호출)에서 만든 영어다. 백필 영어는 없다.
- **판정(42건): 정상 13 · 사소 23 · 오류 6.**
  - 11-05(21건): 정상 6 · 사소 11 · 오류 4. KOREA 3건은 사소 1 · 오류 2, 해외 18건은 정상 6 · 사소 10 · 오류 2.
  - 11-06(21건): 정상 7 · 사소 12 · 오류 2. KOREA 1건은 정상 1, 해외 20건은 정상 6 · 사소 12 · 오류 2.
  - KOREA 전체 4건은 정상 1 · 사소 1 · 오류 2, 해외 38건은 정상 12 · 사소 22 · 오류 4.
- **숫자·금액 오류는 0건이다**(KRW 3 billion·$5.4 billion·$350 million·$200 billion 모두 맞다). 오류 6건은 숫자가 아니라 **뜻**이 틀린 경우다.
  - 단서·범위 누락: #1366은 '예측'을 달성으로 썼고, #1398은 "US open models"에서 US를 뺐다.
  - 주체 혼동: #1374는 PICKY와 휴머노이드를 한 로봇으로 합쳤고, #1384는 일관성을 유지하는 주체를 바꿨다. 둘 다 한국어 가공본도 같은 해석이다.
  - 구문 오류: #1361은 "oracle이 learned router를 앞선다"로 읽히고, 0.3점의 근거 벤치마크 수(16개)를 25개로 바꿨다.
  - 주어·형식 누락: #1372는 원제 주어(Hugging Face)를 뺐고, 팟캐스트를 "the report"라고 썼다.
- **사소 23건은 다섯 갈래다.**
  - ① 단서·상태 누락: 예정을 완료로(#1356 to acquire → acquires, #1377 11월 17일 행사를 현재형으로), 'about'·'expected to'·한계 문장·비판 문장 누락(#1358 · #1362 · #1376 · #1397 · #1399).
  - ② 번역투: `enables X to`(#1386 · #1393), 명사 나열(#1365 · #1369), 2인칭 your(#1386).
  - ③ 회사 주장을 사실로: 자사 블로그 구호를 제목으로(#1389 · #1394), 매체 해석을 귀속 없이 "signaling…"(#1382).
  - ④ 헤드라인 형식: 논문 제목·행사명·콜론 티저를 그대로 씀(#1367 · #1372 · #1377), 비문(#1370 · #1388), 뜻이 흐림(#1387).
  - ⑤ 논문 초록 전문용어 나열(#1375), 요약에 주어 없음(#1383 "the deal"), 관사 누락(#1391), 저장소 자기 수식어(#1395 frontier).
- **고친 것.**
  - DB 개별 수정은 `configs/backfill/en-fixes-p7-editions.json`에 **29건 39항목**이다. 사소·오류 29건 전부를 담았다.
  - 모든 `to`를 적용한 결과에 `checkEnglish`(한글·길이·숫자)를 돌려 29/29건이 통과했다. `from`은 모두 현재 값 안에서 유일하다.
  - 일반화는 `english.md` 규칙 9곳(약 +1.3KB ≈ +300토큰/가공 호출)과 `glossary.en.md` 9항목이다.
  - 화면 문구(`src/lib/messages/*.ts` en)는 고치지 않았다(아래 "UI 문구").
- **세 줄 요약(영어).** 11-05는 #1356 · #1357 · #1359, 11-06은 #1379(리드) · #1378 · #1380이다. #1356 제목(acquires)만 사소이고 수정 JSON이 고친다. 나머지는 정상이다.
- **Korea Desk.** 11-05는 데스크 1건(#1374 — 제목 오류, 수정 포함)과 "Elsewhere" 2건(#1365 · #1366, 둘 다 1면 브리핑)이다. 11-06은 한국 매체 기사가 1건(#1392)뿐이고 1면 브리핑에 실려 **데스크가 없다**. 홈 메타 설명은 "with a Korea Desk…"라고 약속하는데 오늘 홈에는 데스크가 없다. 한국 매체 공급이 얇다(22건 중 3건 · 1건).
- **영어 기각 2건.** #1368(kimi-k3-in-c)과 #1396(PyRUA-DataFarm)이고, notes상 둘 다 숫자 기각이다. #1396은 발췌의 금액이 `\21`·`\117`처럼 `$`가 깨져 들어와 있어서, 맞게 쓴 금액도 근거 대조에 걸렸을 가능성이 높다. 영어판에는 실리지 않았다(정상 동작).

## 기사별 판정

판정: 정상 = 고칠 것 없음 · 사소 = 사실은 맞지만 어색함·귀속·단서·형식 문제 · 오류 = 뜻·사실·고유명사가 틀림(2-3 기준과 같다). "수정"은 `en-fixes-p7-editions.json`에 담은 필드다.

### 2026-11-05 (제142호)

| id   | 매체          | 형식  | kr  | 판정 | 메모                                                                                                                                                                        | 수정      | title_en(현재)                                                                           |
| ---- | ------------- | ----- | --- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| 1356 | OpenAI News   | news  | -   | 사소 | 원제 "to acquire"(예정)인데 제목은 "acquires"(완료)로 썼다. 요약은 "is acquiring"으로 맞다. 리드이자 세 줄 요약 첫 줄이다                                                   | title     | OpenAI acquires Pierre Computer Company                                                  |
| 1357 | Robot Report  | news  | -   | 정상 | 2.2 million hours ✓                                                                                                                                                         |           | LiberAI unveils Liber-0, a world action model for robot manipulation                     |
| 1358 | The Decoder   | news  | -   | 사소 | 원문 "The system still has significant limitations"를 뺐다(한국어는 유지했다)                                                                                               | summary   | Anthropic releases FlashProve to verify which model generated an AI response             |
| 1359 | AV Intl.      | news  | -   | 사소 | "…markets following." 문장 끝이 매달렸다. 원문은 "planned for the following years"다. 제목은 원제와 같다                                                                    | summary   | Waymo and Toyota to test autonomous bZ4X fleet in Japan from 2027                        |
| 1360 | GitHub Trend. | oss   | -   | 정상 | 원문 2문장을 거의 그대로 옮겼다                                                                                                                                             |           | Auto Ontology, a framework for semantic graph-based reasoning layers                     |
| 1361 | HF Papers     | paper | -   | 오류 | "oracle … by 5.4 points, and learned routers by 0.3 points"는 oracle이 learned router를 0.3점 앞선다고 읽힌다. 0.3점은 16개 벤치마크 결과인데 25개로 묶었다(한국어도 같다)  | summary   | Route Anything, a framework for model and policy routing in general-purpose AI           |
| 1362 | HF Papers     | paper | -   | 사소 | SOTA의 범위 "among latent action models"를 뺐고, "enabling … SOTA"라는 인과를 덧붙였다                                                                                      | summary   | DreamX, a universal latent action learner from video diffusion models                    |
| 1363 | arXiv cs.RO   | paper | -   | 정상 | 18%→73%, less planner compute, DROID ✓                                                                                                                                      |           | H-JEPA learns hierarchical world models for visual robot planning                        |
| 1364 | The Decoder   | news  | -   | 정상 |                                                                                                                                                                             |           | CloudOpsBench reveals reasoning as the biggest bottleneck for AI agents in DevOps        |
| 1365 | AI타임스      | news  | kr  | 사소 | 제목은 명사 나열("recursive self-improvement acceleration")이다. 요약 "past instances of being late to detect development speed changes"는 번역투다. 신고서(S-1/A)가 흐리다 | title·sum | Anthropic warns safety measures may lag behind recursive self-improvement acceleration   |
| 1366 | AI타임스      | news  | kr  | 오류 | 원문은 "최대 35배 빠른 처리 속도를 낼 수 있다는 **예측 결과**"다. 제목과 요약은 달성한 것처럼 "speeds up"·"achieves"라고 썼다                                               | title·sum | Zyphra's hierarchical attention technique speeds up long-context processing by up to 35x |
| 1367 | HF Papers     | paper | -   | 사소 | 논문 제목 "Behind Video Generation:"을 대소문자를 섞어 헤드라인으로 썼다. 요약은 "generations of Kling video generation"으로 중복이다                                       | title·sum | Behind Video Generation: observations on multimodal understanding from Kling             |
| 1369 | GitHub topic  | oss   | -   | 사소 | 제목·요약 모두 명사 나열이다. 저장소 홍보 문구 "anytime, anywhere"를 그대로 옮겼다                                                                                          | title·sum | agenterm, AI agent remote control via MCP and terminal                                   |
| 1370 | GitHub topic  | oss   | -   | 사소 | "runs X up to 1M context"는 비문이다                                                                                                                                        | title     | Speedy runs Qwen3.8-Flash-Next up to 1M context on one or two RTX cards                  |
| 1371 | GitHub Trend. | oss   | -   | 정상 | SDD → specification-driven(토픽 spec-driven에서 풀었다). 경계                                                                                                               |           | spec-kit, a toolkit to get started with specification-driven development                 |
| 1372 | TechCrunch    | news  | -   | 오류 | 원제 주어 Hugging Face가 제목·요약 모두에서 빠졌다. 팟캐스트 회차를 "the report"라고 썼다. "startups promising lower costs" 수식도 틀렸다. 제목은 콜론 티저다               | title·sum | Open source AI is booming: how companies capture value                                   |
| 1373 | The Decoder   | news  | -   | 정상 | 제목은 원제와 같다                                                                                                                                                          |           | Anthropic's text watermark is easy to bypass on several older Claude models              |
| 1374 | 로봇신문      | news  | kr  | 오류 | 원문은 딸기 수확 로봇 PICKY를 휴머노이드와 **함께** 공개했다. 제목은 둘을 "humanoid robot PICKY"로 합쳤다(한국어 제목도 같다). KIEMSTA 설명이 없다. Korea Desk 유일 기사다  | title·sum | Beyond Robotics unveils strawberry-harvesting humanoid robot PICKY                       |
| 1375 | HF Papers     | paper | -   | 사소 | 초록 전문용어(compositional query comprehension·target imagination objective·factor-level contrastive loss)를 나열했다. CIR이 뭔지 설명이 없다                              | summary   | FactEmbed improves composed image retrieval with factorized MLLM embeddings              |
| 1376 | The Verge AI  | news  | -   | 사소 | 제목이 "about"과 '계획'을 빼서 $200B를 진행 중인 지출처럼 썼다. 요약 "Paid clicks growth"는 어색하고 "as"는 인과처럼 읽힌다                                                 | title·sum | Google's search ad growth slows amid $200 billion AI infrastructure spending             |
| 1377 | MIT Tech Rev. | news  | -   | 사소 | 11월 17일 예정 행사인데 현재형(discuss)으로 썼다. 제목은 행사명 "Roundtables:" 티저다                                                                                       | title·sum | Roundtables: Inside the quest for cognitive immortality                                  |

### 2026-11-06 (제143호)

| id   | 매체          | 형식  | kr  | 판정 | 메모                                                                                                                                                                                                          | 수정      | title_en(현재)                                                                           |
| ---- | ------------- | ----- | --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| 1378 | OpenAI News   | news  | -   | 정상 | 세 줄 요약                                                                                                                                                                                                    |           | OpenAI unveils GPT-6 Cyber, a cybersecurity agent for finding and fixing vulnerabilities |
| 1379 | Google AI     | news  | -   | 정상 | 리드. 15-second·30% ✓                                                                                                                                                                                         |           | Google releases Gemini Omni 1.2 Flash with native 15-second video generation             |
| 1380 | The Decoder   | news  | -   | 정상 | 280B·33.5 trillion ✓                                                                                                                                                                                          |           | Baidu releases ERNIE 5.5 Flash Base, a 280B-parameter open-source foundation model       |
| 1381 | The Decoder   | news  | -   | 정상 | "according to Tencent"가 AA 지수 35점까지 덮는 것처럼 읽힌다(경계). "by a wide margin"이 빠졌다                                                                                                               |           | Tencent unveils Hy4, a multimodal model with vision and computer use                     |
| 1382 | The Decoder   | news  | -   | 사소 | "signaling a shift in where value accrues…"는 매체 해석을 귀속 없이 쓴 것이다(금지 문형)                                                                                                                      | summary   | Meta acquires AI coding startup Conductor                                                |
| 1383 | Robot Report  | news  | -   | 사소 | 한 문장 요약에 주어·거래가 없다("blocked the deal")                                                                                                                                                           | summary   | Chinese regulators block SoftBank's $5.4 billion ABB Robotics acquisition                |
| 1384 | GitHub Trend. | oss   | -   | 오류 | 원문은 *skills*가 Scenario MCP로 일관성을 유지하고, expert teams는 Blender 등을 구동한다. 요약은 expert teams가 일관성을 지킨다고 바꿨고 MCP를 "Scenario Model Context Protocol"로 잘못 풀었다(한국어도 같다) | summary   | Scenario Skills, production-ready content generation for AI agents via MCP               |
| 1385 | HF Papers     | paper | -   | 정상 |                                                                                                                                                                                                               |           | NEO-VLA, an encoder-free vision-language-action framework for robotic manipulation       |
| 1386 | The Verge AI  | news  | -   | 사소 | 제목·요약에 2인칭 "your"를 썼고, 제목은 "enables Claude to"로 번역투다                                                                                                                                        | title·sum | Anthropic enables Claude to connect directly to your bank account                        |
| 1387 | TechCrunch    | news  | -   | 사소 | "to control AI proofs"는 뜻이 흐리다. 원문은 "keep AI slop out of mathematics"다                                                                                                                              | title     | Axiom Math bets on formal verification to control AI proofs in mathematics               |
| 1388 | MarkTechPost  | news  | -   | 사소 | "with agent-driven optimization up to 2.6x faster"는 비문이다                                                                                                                                                 | title     | Together AI releases Together Compiler with agent-driven optimization up to 2.6x faster  |
| 1389 | NVIDIA Blog   | news  | -   | 사소 | 자사 블로그 구호("Best of Both Worlds: Highest Throughput…")를 사실처럼 제목에 썼다                                                                                                                           | title     | NVIDIA Vera delivers highest throughput and fastest agent execution                      |
| 1390 | HF Papers     | paper | -   | 정상 | 56·42·22·26·46/168 ✓                                                                                                                                                                                          |           | FrontierPhysics evaluates AI agents on 56 end-to-end physics research tasks              |
| 1391 | GitHub topic  | oss   | -   | 사소 | "without jailbreak" 관사가 빠졌다                                                                                                                                                                             | summary   | poki, an MCP agent that operates a real iPhone                                           |
| 1392 | 로봇신문      | news  | kr  | 정상 | 30억원 → KRW 3 billion ✓, FoxEyes(원문 표기) ✓. "인수한다고 발표" → acquired는 경계                                                                                                                           |           | Osteonic acquires 51% stake in US spine surgery robot company FoxEyes                    |
| 1393 | TechCrunch    | news  | -   | 사소 | "enables US users to"는 번역투다                                                                                                                                                                              | title     | Meta enables US users to video chat with customizable Muse AI avatars                    |
| 1394 | OpenAI News   | news  | -   | 사소 | 회사 주장("Setting a new standard")을 "sets standards"로 단정했다. 실제 내용(Compact·Blueprint)은 제목에 없다                                                                                                 | title     | OpenAI sets standards for responsible AI infrastructure development                      |
| 1395 | GitHub Trend. | oss   | -   | 사소 | 저장소 자기 수식어 "frontier"를 그대로 썼다. 소유자 Microsoft가 더 유용하다                                                                                                                                   | title     | VibeVoice, an open-source frontier voice AI project                                      |
| 1397 | The Decoder   | news  | -   | 사소 | "achieved above 12 percent performance"는 어색하다. 원문의 비판(도메인별 과제 수·고르지 않은 조건)이 빠졌다                                                                                                   | summary   | No AI agent scores above 12 percent on SemiAnalysis' GDPx benchmark                      |
| 1398 | MarkTechPost  | news  | -   | 오류 | 원문 "ahead of **US** open models up to 15x its size"에서 US를 빼 비교 범위를 넓혔다. 원제 주어 Ricursive AI를 뺐고 "benchmark"가 중복이다                                                                    | title·sum | Ripple-65B scores 80.5 on Terminal-Bench 2.1 benchmark                                   |
| 1399 | TechCrunch    | news  | -   | 사소 | 원문 단서 "is expected to support"를 단정형으로 바꿨다                                                                                                                                                        | summary   | Dropbox acquires Tigris Data for $350 million to bolster AI infrastructure               |

형식 점검(42건): 한글 유출 0 · 한국 매체 언급 0 · 제목 39~88자 · 요약 8~63단어 · 숫자·금액 오류 0. sentence case 위반은 1건(#1367 논문 제목을 옮김)이다.

### 한국어 쪽에서 본 것(이번 범위 밖 — 고치지 않았다)

영어를 원문과 대조하다 보인 한국어 가공 오류다. notes의 `한국어 숫자 불일치`가 이미 경고한 것과 같다. 한국어 수정은 `ko-number-fixes.json` 방식으로 따로 다루는 것을 권한다.

- #1368 `title_ko`·`summary_ko` "278조 파라미터" → 원문 2.78-trillion = **2.78조**(100배 오류).
- #1383 `title_ko` "52억 달러" → 원문 $5.4B = **54억 달러**.
- #1398 `summary_ko` "65억 파라미터" → 원문 65B = **650억**.
- #1374 `title_ko` "딸기 수확 휴머노이드 로봇 'PICKY'"는 PICKY와 휴머노이드를 합쳤다(영어와 같은 오류).
- #1384 `summary_ko` "전문팀이 캐릭터와 브랜드 일관성을 유지한다"는 주체가 틀렸다.
- #1361 `summary_ko`는 0.3점을 25개 벤치마크로 묶었다.

## 규칙·용어집 변경 (일반화)

여러 기사에 되풀이된 문제만 반영했다. 기존 규칙을 날카롭게 고치는 쪽을 우선했다. `english.md`는 6,831 → 8,183바이트(약 +300토큰/가공 호출, 회차당 약 +$0.0006)다.

| 위치(`configs/prompts/english.md`) | 변경                                                                                                                                                                             | 근거(이번 호)                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Source · 논평 금지                 | 금지 문형에 "signaling…" 추가                                                                                                                                                    | #1382                                                                  |
| Source · 귀속                      | 회사가 자기 소식을 쓴 글의 구호는 제목이 아니다 — "Nvidia says its Vera CPU…", "Setting a new standard" → 무엇을 냈는지                                                          | #1389 · #1394                                                          |
| Source · 사건 상태                 | 제목에도 적용: "X to acquire Y"를 "X acquires Y"로 바꾸지 않는다                                                                                                                 | #1356                                                                  |
| Source · 단서                      | "expected to" 추가. 예측(예측·전망·could)은 예측으로 둔다. 범위 제한("among latent action models", "US open models")과 입력이 밝힌 한계·비판을 유지한다                          | #1366 · #1399 · #1362 · #1398 · #1358 · #1397                          |
| title_en                           | 논문 제목·행사명·콜론 티저를 헤드라인으로 쓰지 않는다 — 누가 무엇을 했는지                                                                                                       | #1367 · #1372 · #1377                                                  |
| summary_en · 첫 문장               | 원문이 "the deal"뿐이어도 이름을 쓴다. 논문은 과제를 평이하게 먼저 쓰고 초록 전문용어를 나열하지 않는다                                                                          | #1383 · #1375 · #1361                                                  |
| summary_en · 문체(새 줄)           | 번역가가 아니라 원어민 편집자처럼: "lets users", 2인칭 금지("users"), 명사 3개 이상 나열 금지                                                                                    | #1386 · #1393 · #1365 · #1369 (DB 전체 `enables` 제목 15건·`your` 8건) |
| Language · 한국 고유 명칭          | "bodies and terms" → "bodies, events and terms", 예시 KIEMSTA                                                                                                                    | #1374                                                                  |
| Numbers(새 줄)                     | 백분율은 숫자 + %(12%), "12 percent" 금지 — DB 영어 요약에 `percent` 68건 대 `%` 74건이 섞여 있다. `findUnsupportedNumbers`로 원문 "12 percent" ↔ 출력 "12%"가 통과함을 확인했다 | 표기 통일                                                              |

`configs/prompts/glossary.en.md`(파서 `scripts/lib/glossary.ts` 형식 그대로, 206항목 · skipped 0, `glossary.test.ts` 통과):

- 정부·지역: `대구 → Daegu`
- 대기업: `SK증권 → SK Securities`(#1392 원문 출처)
- 행사·장소: `엑스코 → EXCO (Daegu convention center)` · `국제농기계자재박람회 → KIEMSTA (agricultural machinery expo)`
- 해외 매체: `테크크런치 → TechCrunch` · `더 버지 → The Verge`
- 해외 기관·용어(새 줄): `증권거래위원회 → U.S. Securities and Exchange Commission (SEC)` · `증권신고서 → registration statement (IPO filing)` · `기업공개 → initial public offering (IPO)`. #1365처럼 IPO·S-1 관련 국내 보도가 이어지고 있다.

한국 쪽 이름(Daegu·EXCO·KIEMSTA·SK Securities)은 한국 절에 넣었으므로 Korea Desk의 한국 주제 판정(`koreaSubjectNames`)에도 잡힌다. 해외 절 항목은 판정에 쓰지 않는다.

넣지 않은 것:

- **Nvidia/NVIDIA 표기 통일.** DB 제목은 Nvidia 34건, NVIDIA 16건이다. "공식 표기 유지" 규칙과 충돌해서 규칙을 추가하지 않았다. 이번 수정(#1389)만 용어집 표기 Nvidia를 따랐다.
- **원제 그대로 쓰기 금지.** 원제와 같은 제목은 DB 전체 1,283건 중 51건이고, 이번 호에도 #1359 · #1373이 있다. 다시 쓰면 오히려 뜻이 흔들릴 수 있다. 검색엔진 중복 콘텐츠 우려는 Phase 8 지표를 보고 정하도록 남긴다.

## DB 개별 수정 (`configs/backfill/en-fixes-p7-editions.json`)

- `{"version":1,"fixes":[{id, field: title_en|summary_en, from, to, reason}]}` — 29건 39항목(title 18 · summary 21)이다. 11-05는 15건, 11-06은 14건이다.
- 검증 내용:
  - `from`이 현재 DB 값 안에서 정확히 1번 나온다.
  - 적용 후 `checkEnglish`가 29/29건 통과했다(한글 0, 제목 41~90자, 요약 8~64단어, 숫자 근거 OK).
  - 새 숫자는 모두 원제·발췌에 있는 값이다(#1361의 16 · #1377의 17 · #1365의 S-1/A).
  - KRW·달러 단위도 원문 그대로다.
- 적용 스크립트는 아직 없다. `backfill-en.ts`의 `--ko-fixes`와 같은 방식의 영어판 적용 경로가 필요하다(백필 리뷰의 `en-fixes-backfill.json`과 함께).

## UI 문구

`src/lib/messages/*.ts`의 en 문자열 20개 파일을 모두 읽고 화면에서 확인했다. **고칠 영어 오류는 없다.** 문구는 자연스럽고 일관된다("Three things to know", "You're reading a past issue.", "3 stories in this issue come from Korean outlets; those outside the desk carry a KOREA mark. Originals are in Korean."). 그래서 수정하지 않았다. 남은 것은 아래 디자인 항목(아포스트로피·태그 대소문자·분야명 대소문자)인데, 테스트(`siteShellEn`·`frontPageEn`)가 정확한 문자열을 검사하고 `labels.ts` 범위라 디자인 작업으로 넘긴다.

## 디자인 다듬기 (코드 수정 안 함 — 심각도 순)

확인 방법: Chromium(1280×900 · 360×780, `locale en-US`)으로 /en/ · /en/edition/2026-11-05/ · /en/edition/2026-11-06/ · /en/article/1392/(KOREA) · /en/article/1386/(해외) · /en/article/1385/(논문)을 전체 캡처하고 화면 높이 단위로 잘라 읽었다. 가로 넘침은 6페이지 × 2폭 모두 0px이다.

| #   | 심각도 | 위치                                                                                                  | 본 것                                                                                                                                                                                                                                                                           | 제안                                                                                                                                   |
| --- | ------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 중     | 오늘의 브리핑 360px — `globals.css` `.st-brief-h`(327, en 853–855 `line-clamp: 2`), `Story.tsx` Brief | 모바일에서 브리핑 헤드라인이 2줄에서 말줄임된다("Anthropic warns safety measures may lag behind recursive self-improvement…", "…by up …"). 영어 제목은 한국어보다 약 1.5배 길어 1면 헤드라인이 잘린다. 메타 줄도 꺾여 "· "가 줄 끝에 남고 중요도 도트가 혼자 다음 줄로 떨어진다 | 영어 `.st-brief-h`는 clamp를 풀거나 3줄로 한다. 메타 줄은 도트를 날짜와 묶어(`white-space: nowrap` 묶음) 줄바꿈 단위를 바꾼다          |
| D2  | 중     | Korea Desk 1건 — `ed-dk-*`·`st-desk`(`globals.css` 684·717–720), `KoreaDeskBand`                      | 11-05 데스크는 기사 1건이 2×2 칸의 왼쪽 위 한 칸만 차지한다. 오른쪽 아래가 비어 머리 칸(제목·Elsewhere·주석)보다 훨씬 짧다. 지면이 덜 찬 인상을 준다                                                                                                                            | 1~2건일 때는 카드가 칸 전폭을 쓰거나(리드형 크기) 머리 칸과 한 줄로 놓는 변형을 둔다                                                   |
| D3  | 중     | 시각 표기 — `labels.ts` 상대 시각, 1면 서브 카드                                                      | 같은 줄 카드 셋이 "yesterday, 18:00 KST" / "17 hours ago" / "18 hours ago"로 섞인다. 영어 독자에게 24시간제 + KST가 낯설다                                                                                                                                                      | 48시간 안은 상대 시각으로 통일("22 hours ago")한다. 절대 시각은 "Nov 5, 6:00 p.m. KST" 꼴로 쓴다                                       |
| D4  | 하     | 좁은 칸 자동 하이픈 — `globals.css` 798–801 `hyphens: auto; hyphenate-limit-chars: 7 4 3`             | 레이더·섹션 요약에 하이픈 줄바꿈이 잦다(execu-tion, knowl-edge, frame-work, under-standing, gener-ation). 말줄임 3줄 안에 2개씩 나와 지면이 어수선하다                                                                                                                          | `hyphenate-limit-chars: 10 5 5`로 올리거나, `hyphens: manual` + `text-wrap: pretty`만 쓴다                                             |
| D5  | 하     | 아포스트로피 — `messages/common.ts` · `edition.ts` · `frontPage.ts` · `site.ts`                       | UI는 곧은 '(Today's issue, You're reading, See today's issue, footer "The world's")인데 Korea Desk dek만 굽은 ’(Korea’s)다. 헤드라인 데이터도 곧은 '다                                                                                                                          | en 렌더에서 OG의 `typographicApostrophes()`처럼 ’로 바꾼다(문구 사전·테스트 함께 수정)                                                 |
| D6  | 하     | 태그 칩(en) — 홈 필터 "Tag" 줄, 기사 `#claude`                                                        | `openai`·`nvidia`·`llm`·`ai`처럼 브랜드·약어가 소문자다. 영어 지면에서는 다듬어지지 않은 인상을 준다                                                                                                                                                                            | 영어판 태그 표시용 대소문자 표(OpenAI·Nvidia·LLM·AI)를 두거나 영어판 Tag 줄을 숨긴다                                                   |
| D7  | 하     | 분야명 대소문자 — `labels.ts` 영어 표시명                                                             | "Open Source & Tools"·"Industry & Policy"(Title Case)가 sentence case 머리("Open source & papers radar", "Trending now", "Stories in this issue")와 섞인다                                                                                                                      | 영어 분야명을 sentence case로("Open source & tools", "Industry & policy") 하거나 반대로 통일한다                                       |
| D8  | 하     | 기사 신호 패널 — `.ar-sigs`, 한국 매체                                                                | 화제 지수가 없는 기사(#1392 · #1386)는 "Trending —"으로 대시 하나만 남아 빈 데이터처럼 보인다                                                                                                                                                                                   | 값이 없으면 칸을 빼서 3칸으로 하거나 "Not tracked"로 쓴다                                                                              |
| D9  | 하     | 원문 발췌 — `ArticleView` 발췌                                                                        | "…with Plaid facilit … Read the full story at The Verge."처럼 피드 상투 문구가 발췌 끝에 보인다. "…appeared first on The Decoder"도 같다. 게재 기사 329건이 이 문구를 담고 있다(두 언어 공통)                                                                                   | 표시할 때 "Read the full story at…", "The post/article … appeared first on …" 꼬리를 떼고, 잘린 단어는 말줄임으로 끝낸다               |
| D10 | 하     | 호 기사 목록 날짜 칸 — "Stories in this issue"                                                        | 11-05 호 목록에 "Oct 6"·"Nov 3"(원문 발행일)이 섞여 호와 날짜가 어긋나 보인다. 홈 색인 날짜에는 연도가 없다("Jun 8")                                                                                                                                                            | 호 안 목록은 날짜 칸을 숨기거나 "Published Oct 6"으로 성격을 밝힌다. 올해가 아닌 날짜에는 연도를 붙인다                                |
| D11 | 하     | 기사 헤드라인 폭 — `.ar-h1`(en 1136)                                                                  | 1280에서 논문 제목(#1385)이 본문 칸(672px)보다 좁은 약 490px 안에서 4줄로 꺾인다(균형 줄바꿈 + 하이픈 복합어)                                                                                                                                                                   | 영어 h1의 측정 폭을 본문 칸 전폭으로 넓힌다                                                                                            |
| D12 | 하     | 원제 줄 라벨 — 기사 머리                                                                              | 한국 매체는 "Original article in Korean" 라벨이 붙는데, 해외 기사(#1385 · #1386)의 원제 줄은 라벨 없이 회색 문장으로만 보인다                                                                                                                                                   | "Original headline" 라벨을 같은 꼴로 붙이거나, 영어 제목과 거의 같으면 숨긴다                                                          |
| D13 | 하     | 홈 메타 설명 — `site.ts:79`                                                                           | "…with a Korea Desk on Korean AI you won't find elsewhere"인데 한국 매체 기사가 1면에만 있는 날(11-06)은 홈에 데스크가 없다                                                                                                                                                     | 문구를 "with Korean AI news you won't find elsewhere"로 바꾸거나 데스크 노출 규칙을 다시 본다(콘텐츠 쪽: 한국 매체 공급 22건 중 1~3건) |

잘 된 것: 마스트헤드·귀("21 stories · 12 outlets / 3 repos · 2 papers"), "Three things to know" 띠, KOREA 표시와 "Original article in Korean" 원제 병기, "Read the original · in Korean", Korea Desk 머리 칸 문구, 360 머리 띠 한 줄 배치, 하단 탭 바, 가로 넘침 0. 지면의 위계와 괘선은 한국어판과 같은 품질로 읽힌다.
