# Daily AI Brief — 콘텐츠·1면 개편 작업 계획서 (Contents Upgrade Plan)

## Context

2026-10-25(제131호) 1면을 점검하면서 문제 4가지가 나왔다. 코드와 DB를 확인해 원인을 찾았다.

| # | 관찰된 문제 | 원인 (코드·데이터 근거) |
|---|---|---|
| 1 | 1면에 오늘 기사가 없다 | `buildEdition`이 가장 최근 `published_at`에서 48시간 안의 기사를 모두 후보로 삼는다(`src/lib/edition.ts:40-52`). 수집 회차는 보지 않는다. 그래서 오늘 1면 4건 중 2건(디시전스 API, Kimi K3.1)이 어제 호 기사였다. 화면 날짜도 원문 게재일이라, 06:00에 발행하면 모든 기사가 "어제" 날짜로 보인다. 같은 사건(Kimi K3.1 Pro)을 이틀 연속 다른 기사로 고른 일도 있었다. |
| 2 | 뉴스만 보이고 오픈소스·HF 모델·GitHub·논문이 거의 없다 | ① 선별 프롬프트가 "AI **뉴스** 브리핑 편집장"을 페르소나로 쓰고, **"사소한 저장소·버전 업데이트"를 제외 대상**으로 둔다. 소스의 형식(kind)도 LLM에 넘기지 않는다. ② HF 모델 소스가 없다. `github_trending`은 AI로 걸러지지 않은 전체 언어 피드이고, `github_llm`은 `topic:llm` 하나뿐이다. ③ 최근 14일 게재 388건 중 RSS가 368건이고, 마지막 회차에서는 GitHub·HF·arXiv에서 **0건**이 실렸다. |
| 3 | 1면이 4건뿐이다 | `EDITION_LIMITS.seconds = 3`이라 리드 1건과 서브 3건만 들어간다. "지금 화제"는 화제 지수가 0보다 큰 기사만 받는데, 그런 기사는 HN 계열뿐이라 하루 2~3건에 그친다. |
| 4 | Physical AI가 거의 없다 | 카테고리 enum에 로보틱스·Physical AI가 **없다**. 그래서 Eka Robotics VFA 투자는 `Agents`로, 로봇용 Nemotron은 `Language Models`로 분류됐다. 로보틱스 소스 8개 가운데 2개는 403으로 실패하고, 3개는 수집 0건이 이어진다. Google News `gnews_physical_ai`는 하루 90건이 들어오는데 상한 8건에서 잘린다. |

**목표:** 1면은 오늘 호 기사로만, 10건 안팎으로 꾸린다. 뉴스와 오픈소스·모델·논문을 함께 싣고, Physical AI를 독립 분야로 다룬다. 이렇게 운영해도 회차당 비용은 $0.1 상한 아래로 유지한다.

## 확정된 결정 (2026-10-25 사용자 확인)

- **"오늘 기사" = 오늘 호 수집분.** 1면에는 오늘(KST) 06:00 회차가 **선정한 기사만** 싣는다. 판정 기준은 `created_at`의 KST 날짜(= 호 날짜)이고 `published_at`은 쓰지 않는다. 화면의 시각은 "어제 20:12", "10시간 전"처럼 KST 상대 시각으로 표시한다.
- **카테고리 = 분야 6개 + 형식 배지.**
  - 분야(topic, LLM이 분류): `LLM` · `에이전트` · `Physical AI` · `오픈소스·도구` · `연구·논문` · `산업·정책`. "기타"는 두지 않는다. 기존 Dev Tools와 MLOps는 오픈소스·도구에 흡수한다.
  - 형식(format, 출처로 결정하며 LLM 비용 없음): `뉴스` · `오픈소스`(GitHub) · `모델`(HF 모델) · `논문`(arXiv·HF Papers·Takara). 1면 다양성 제어와 배지 표시에 쓴다. 뉴스에는 배지를 붙이지 않는다.
- **1면 레이아웃 = 리드 + 서브 + 브리핑 + 레이더.** 리드 1, 서브 3, 오늘의 브리핑 3을 뉴스 축으로 두고 그 아래에 오픈소스·논문 레이더 4건을 놓는다. 본문은 약 11건이고, 사이드바 "지금 화제" 5건은 오늘 호 기사만 다룬다.

## 아키텍처 결정 (전 Phase 공통)

- **카테고리 저장값을 안정 키로 바꾼다:** `llm | agent | physical | oss | research | industry`. 표시명은 `src/lib/labels.ts` 한 곳에서만 관리한다. URL은 `?category=physical`처럼 읽기 쉬워진다. 기존 행은 마이그레이션 스크립트로 일괄 변환한다.
- **형식(format)은 소스 속성으로 둔다.** `configs/sources.json`의 각 소스에 `format`(`news|oss|model|paper`, 생략하면 `news`)을 넣고, `sources` 테이블에 컬럼을 추가해 동기화한다(`ensureSchema`). `ArticleCard.format`은 JOIN으로 노출한다. 지난 호에도 소급해서 적용된다.
- **호(issue) 경계는 수집 시각으로 정한다.** `created_at`(UTC)을 KST 날짜로 바꾼 값을 호 날짜로 쓴다. 홈은 최신 호, `/edition/[date]`는 그날 호를 같은 함수로 조회한다. 작업 트리에 있는 미커밋 `getArticlesCollectedSince`/`collected_at`(export-latest 작업)이 같은 기준이므로 그 코드를 재사용하고 정렬을 맞춘다.
- **비용 상한은 유지한다.** 게재 상한을 30건에서 35건으로 늘리고(뉴스 약 27건, 비뉴스 약 8건), 선별 풀을 150건에서 180건으로 늘린다. 예상 회차 비용은 $0.027에서 약 $0.035로 오르며, $0.1 상한 안이다.
- **불변:** 정적 export와 GitHub Pages 배포 구조, Batches API 호출 계층(`scripts/lib/llm.ts`), DESIGN.md의 핵심 톤(뉴스프린트, 잉크, 코발트 단일 강조색, 괘선 구획, Hahmlet/Pretendard)은 바꾸지 않는다.

## 진행 현황 개요

- [x] **Phase 0** — 기준선 측정·작업 준비 (2026-10-27 완료)
- [ ] **Phase 1** — 1면 "오늘 호 전용" 전환 (빠른 개선, 데이터 변경 없음)
- [ ] **Phase 2** — 카테고리 6분야 + 형식(format) 데이터 모델·마이그레이션
- [ ] **Phase 3** — 수집 소스 확장 (HF 모델·GitHub·논문·Physical AI)
- [ ] **Phase 4** — LLM 선별·가공 프롬프트 개편
- [ ] **Phase 5** — 1면 10건 편집 로직 (리드·서브·브리핑·레이더·화제)
- [ ] **Phase 6** — 디자인 고도화 (시안 → 구현)
- [ ] **Phase 7** — 통합 검증·문서 갱신
- [ ] **Phase 8** — (제안·선택) 추가 아이디어

---

## Phase 0: 기준선 측정·작업 준비

**목표:** 개편 효과를 숫자로 비교할 수 있게 현재 지표를 기록하고, 작업 충돌을 정리한다.

- [x] 미커밋 export-latest 작업(`scripts/export-latest.ts`, `db.ts`의 `getArticlesCollectedSince`·`collected_at`)을 먼저 커밋하거나 병합 방향을 정한다. Phase 1이 이 작업 위에서 진행되기 때문이다.
  - ✅ 2026-10-27 확인: `959e309`(feat(export))로 `deploy/github-pages`에 이미 커밋·푸시돼 있다. 개편 브랜치는 이 커밋 위에서 분기했다.
- [x] 기준선 쿼리를 `scripts/kpi.ts`에 하위 명령으로 추가하거나 일회성으로 실행해, 최근 14일 값을 이 문서 하단의 "기준선" 표에 기록한다.
  - ✅ 2026-10-27 `npm run kpi -- baseline [days]` 하위 명령(`scripts/lib/baseline.ts`, 테스트 `src/__tests__/baseline.test.ts`)으로 구현했다. 10-12~10-25(제118~131호) 값을 하단 "기준선 기록"과 Phase 7 "목표 지표"에 기록했다. 측정 범위에 넣은 추가 지표: 이틀 연속 중복 후보, 0건 소스, 형식별 후보→게재율.
  - 회차별 형식 비율(뉴스/오픈소스/모델/논문)
  - 회차별 분야 비율
  - Physical AI 키워드 기사 수
  - 1면 기사 중 오늘 호 비율
  - 회차 비용
- [x] 개편 브랜치를 만든다(예: `feat/contents-upgrade`, `deploy/github-pages`에서 분기).
  - ✅ 2026-10-27 `feat/contents-upgrade` 생성(`959e309`에서 분기), origin에 푸시. 배포 브랜치 push가 `deploy.yml`을 트리거하므로 Phase 0 커밋부터 이 브랜치에 쌓는다.
  - 주의: 일일 수집 커밋(`data/app.db`)은 계속 `deploy/github-pages`에 쌓인다. 병합 전에 `deploy/github-pages`를 이 브랜치로 merge해 최신 DB를 받고, `app.db` 충돌은 **배포 브랜치 쪽을 채택한 뒤 마이그레이션(Phase 2-3)을 다시 실행**하는 방식으로 푼다.

---

## Phase 1: 1면 "오늘 호 전용" 전환

**목표:** 요청 1번을 먼저 반영한다. 카테고리를 바꾸기 전에도 단독으로 배포할 수 있다.
**의존성:** Phase 0

### 1-1. 호 단위 조회

- [x] `src/lib/db.ts`: `getIssueArticles(dateKey)`를 추가한다. 조건은 `created_at`이 `[dateKey 00:00 KST, +1일)` 안에 있고 게재된 기사이며, 중요도 순으로 정렬한다. `getEditionRefs()`의 cutoff 계산과 미커밋 `getArticlesCollectedSince`를 재사용한다.
  - ✅ 2026-10-27 `getIssueArticles(dateKey)` 추가. KST 하루 경계는 `kstDayBounds(dateKey)` 한 곳에서 계산하고 `getEditionRefs()`의 `cutoff`도 이 함수를 쓴다. 정렬은 중요도 → 화제 → 최신 게시 순이다.
- [x] 최신 호 날짜는 `getEditionRefs()`의 마지막 값으로 정한다. 실패 회차는 제외된다.
  - ✅ 2026-10-27 `getLatestEditionRef()` = `getEditionRefs().at(-1)`.
- [x] **(추가) 재가공 기사의 호 귀속:** 가공에 실패한 기사는 이후 회차에서 다시 심사하는데, 이때 `UPDATE`만 하고 `created_at`은 처음 수집한 날로 남는다. 그러면 오늘 회차가 고른 기사가 지난 호로 소급돼 오늘 1면에 오르지 못한다.
  - ✅ 2026-10-27 `scripts/collect.ts`의 `updateArticle`이 `created_at = datetime('now')`도 갱신한다. 재심사 창(`published_at` 7일)과 `latest.json`(`created_at` 기준)은 영향이 없다. `persist()`가 export되지 않아 단위 테스트는 없다.

### 1-2. 편집 로직

- [x] `src/lib/edition.ts`: `currentIssue()`의 "48시간 `published_at` 창 + 4건 미만이면 전체로 폴백"을 없앤다. `buildEdition`이 **호 기사 배열**을 직접 받도록 바꾼다.
  - ✅ 2026-10-27 `currentIssue()`·`EDITION_WINDOW_MS`·폴백을 삭제했다. 시그니처는 `buildEdition(issueArticles, limits)`이고, 섹션 `count`도 호 안 개수다("섹션 전체 보기"는 누적 피드로 이어진다).
- [x] `src/components/FeedView.tsx` 및 `src/app/page.tsx`: 1면과 섹션에는 오늘 호 기사만 넘긴다. 하단 "전체 기사" 색인은 지금처럼 전체를 유지한다.
  - ✅ 2026-10-27 홈 호는 `getHomeIssue()`가 고른다. 최신 호부터 거슬러 올라가며 공개 기사가 1건 이상인 첫 호를 쓰므로, 0건으로 끝난 회차가 1면을 비우지 않는다. 다른 호 기사는 섞지 않는다. 카드를 두 번 싣지 않도록 `issueIds`만 넘기고 `FeedView`가 누적 목록에서 골라 쓴다. 공유 메타도 이 호의 리드를 쓰며, 호출처가 없어진 `getEditionInfo()`는 삭제했다.
- [x] `src/app/edition/[date]/page.tsx`와 `src/app/og/edition/[file]/route.tsx`: `getArticlesUntil(cutoff)`을 `getIssueArticles(date)`로 바꿔 지난 호도 그날 수집분만 보이게 한다.
  - ✅ 2026-10-27 두 곳 모두 `getIssueArticles(ref.date)`로 바꿨다. `getArticlesUntil`과 `EditionRef.cutoff`는 `kpi baseline`이 옛 1면 방식을 재현하는 데 쓰므로 남겼다.
- [x] **발행 지연 폴백:** 오늘(KST) 호가 아직 없으면(06:00 회차 실패나 지연) 최신 호를 그대로 보여 준다. 마스트헤드에는 "최신 호 · 10월 24일 발행" 안내 줄을 띄운다.
  - ✅ 2026-10-27 `IssueDelayNotice`(클라이언트 컴포넌트)를 추가했다. 정적 페이지는 빌드 뒤에도 오래 서빙되므로, 빌드 시점이 아니라 브라우저의 현재 KST 시각으로 판단한다. 서버 렌더에서는 아무것도 그리지 않는다. 표시 조건은 호 날짜가 오늘보다 이전이면서, 08:00 KST 이후이거나(정상 발행 시간대 전에는 띄우지 않는다) 이틀 이상 지난 경우다. 문구는 "**최신 호** 10월 26일(월) 발행 — 오늘 호는 아직 발행 전입니다"이고, 이틀 이상이면 "…발행 이후 새 호가 아직 나오지 않았습니다"다. 폴리오 줄 아래 가는 괘선 사이에 한 줄로 놓고, 강조색은 "최신 호" 라벨에만 쓴다.

### 1-3. 표기

- [x] 마스트헤드 통계를 "기사 997건 · 매체 30곳"(누적)에서 **"오늘 28건 · 매체 11곳"**(호 기준)으로 바꾼다. 누적은 "전체 기사" 색인 머리에만 둔다.
  - ✅ 2026-10-27 문구는 **"이번 호 28건 · 매체 11곳"**으로 정했다. 발행이 지연된 날에는 "오늘"이 틀린 말이 되기 때문이다. 홈과 `/edition/[date]`가 같은 prop(`issueCount`·`issueSourceCount`)을 쓴다. 누적 수치는 홈 "전체 기사" 머리에 "누적 997건 · 매체 30곳"으로 옮겼다(필터 모드는 기존 `N건` 그대로).
- [x] `src/lib/labels.ts`에 `formatRelativeKst(iso, now)`를 추가한다. 24시간 안이면 "N시간 전", 어제면 "어제 HH:mm", 그 밖에는 "M.D"로 표시한다. 1면과 섹션의 바이라인에 적용하고, 상세 페이지는 절대 일시를 유지한다.
  - 빌드 시점 기준이라 시간이 흐를수록 어긋날 수 있다. 1면은 "호 기준 시각"(발행 06:00 대비)으로 계산해 정적 빌드에서도 값이 고정되게 한다.
  - ✅ 2026-10-27 `formatRelativeKst(iso, now)`·`formatDateTime(iso)`(툴팁용 절대 일시)와 클라이언트 컴포넌트 `RelativeTime`을 추가했다. 1시간 미만은 "N분 전", 1분 미만과 미래 시각은 "방금"으로 표시한다. "어제"는 KST 달력 날짜로 판정하고, 해가 다르면 "YYYY.M.D"로 쓴다.
  - **(개선)** `RelativeTime`은 정적 HTML을 호 발행 시각 기준으로 그려 빌드 결과를 고정한다. 마운트 후에는 실제 현재 시각으로 다시 계산하고, 1분마다와 탭 복귀 때 갱신한다. 그래서 저녁에 읽어도 "10시간 전"으로 굳지 않는다. `<time title="YYYY.MM.DD HH:mm KST">`으로 절대 시각도 제공한다. 바이라인 연결은 1-3 후속 작업에서 한다.
  - ✅ 2026-10-27 `Byline`에 `timeBase`(호 발행 시각)를 주면 `RelativeTime`을 쓴다. 홈 1면 리드·서브와 섹션 밴드에만 적용했다. 상세·검색·색인("MM.DD" 열)은 절대 날짜를 유지한다. `/edition/[date]` 지난 호도 절대 날짜를 유지하는데, 상대 시각을 쓰면 열 때마다 "3시간 전"이 "10.24"로 바뀌며 깜빡이기 때문이다. 테스트는 `issueLabels.test.tsx`다.

### 1-4. 테스트

- [x] `src/__tests__/edition.test.ts`: 48시간 창과 폴백 케이스를 삭제하고, 호 배열을 입력으로 쓰는 케이스로 바꾼다.
  - ✅ 2026-10-27 섹션 count가 호 안 개수인지, 입력에만 의존하는지를 추가로 검증한다. 발행 지연 판정(`issueDelayDays`의 07:59/08:00 경계, 이틀 이상, 미래·잘못된 입력)은 `labels.test.ts`에서, `IssueDelayNotice.test.tsx`는 서버 렌더가 비어 있는지와 08:00 경과 시 표시되는지를 검증한다.
- [x] `src/__tests__/editionRefs.test.ts`: `getIssueArticles`의 KST 경계(UTC 14:59와 15:00)를 검증한다.
  - ✅ 2026-10-27 KST 경계(14:59:59 / 15:00:00 UTC, 3일 연속), 미게재·다른 날 제외, 중요도 정렬, 게시일이 오래됐어도 그날 수집분이면 포함, `getLatestEditionRef`(호 없음·실패 회차 무시)를 검증한다.
- [x] `src/__tests__/labels.test.ts`: `formatRelativeKst`를 검증한다.
  - ✅ 2026-10-27 분기 전체, KST·UTC "어제" 경계, 연도 경계, 잘못된 입력을 검증한다. `RelativeTime.test.tsx`는 정적 첫 렌더가 호 기준인지, 마운트 후 실시각으로 바뀌는지, 60초 갱신, 탭 복귀, 언마운트 정리를 검증한다.

**Acceptance:** 오늘 빌드한 홈 1면의 모든 기사는 `created_at`의 KST 날짜가 오늘이다. 지난 호 페이지도 그날 수집분만 보여 준다.

---

## Phase 2: 카테고리 6분야 + 형식(format) 데이터 모델

**목표:** 요청 4번(분야 개편)과 형식 축 도입을 위한 데이터 기반을 만든다.
**의존성:** Phase 0 (Phase 1과 병행 가능)

### 2-1. 분야 정의 (단일 출처)

| 키 | 표시명 | 코드 | 포함 범위 | 경계 규칙 |
|---|---|---|---|---|
| `llm` | LLM | LLM | 파운데이션·멀티모달 모델 출시·성능·아키텍처, 오픈 웨이트 모델, 이미지·영상·음성 생성 모델 | 모델 **자체**가 주제일 때 |
| `agent` | 에이전트 | AGT | 에이전트·툴 유즈·MCP·코딩 에이전트·AI 비서·오케스트레이션 | 로봇 에이전트는 `physical` |
| `physical` | Physical AI | PHY | 로보틱스·휴머노이드·VLA·자율주행·드론·임바디드 AI·로봇 시뮬레이션·월드 모델(로봇용)·엣지 AI 디바이스 | **최우선 규칙**: 로봇·물리 세계가 주제면 회사가 투자·출시 소식이어도 `physical` |
| `oss` | 오픈소스·도구 | OSS | 오픈소스 프로젝트, 개발 도구·프레임워크·SDK·라이브러리, 학습·서빙 인프라(구 MLOps) | 모델 공개는 `llm`, 리포·도구 공개는 `oss` |
| `research` | 연구·논문 | RES | 논문·연구 성과·벤치마크·기술 리포트 | 로봇 논문은 `physical` |
| `industry` | 산업·정책 | BIZ | 투자·인수·규제·정책·시장·기업 전략·칩·데이터센터 | 위 5개에 해당하지 않는 비즈니스 소식 |

- [ ] `scripts/lib/schema.ts`: `CATEGORIES`를 위 6개 키로 바꾼다(`z.enum`도 함께 바뀐다).
- [ ] `src/lib/labels.ts`: `CATEGORY_LABELS`(표시명·순서), `CATEGORY_SLUGS`(키를 그대로 쓰면 삭제할 수 있다), 코드(LLM/AGT/PHY/OSS/RES/BIZ)를 넣는다.

### 2-2. 형식(format)

- [ ] `configs/sources.json`: 각 소스에 `format`을 넣는다.
  - `github_llm`, `github_trending`과 신규 GitHub 소스는 `oss`
  - 신규 HF 모델 소스는 `model`
  - `hf_daily_papers`, `arxiv_*`, `takara_tldr`은 `paper`
  - 나머지는 생략해 `news`로 둔다.
- [ ] `scripts/lib/schema.sql` 및 `scripts/lib/initDb.ts`의 `ensureSchema`: `sources.format TEXT NOT NULL DEFAULT 'news'` 컬럼을 추가하고, collect 시작 시 sources.json에서 동기화한다.
- [ ] `src/lib/types.ts`: `ArticleCard.format`과 `SourceConfig.format`을 추가한다. `src/lib/db.ts`의 `ARTICLE_SELECT`에 `s.format`을 추가한다.
- [ ] `src/lib/sources.ts`: `SOURCE_KINDS`에서 빠져 있던 `arxiv`와 신규 `hf_models`를 추가하고, 로컬 admin에서 `format`을 검증한다.

### 2-3. 기존 데이터 마이그레이션

- [ ] `scripts/reclassify.ts`(신규)와 `npm run db:reclassify`를 만든다.
  1. `data/app.db`를 백업(`data/app.db.bak-YYYYMMDD`)한 뒤 진행한다. 백업 파일은 git에서 제외한다.
  2. 기존 값을 규칙으로 먼저 바꿔 둔다. 이 값은 폴백으로 쓴다.
     - `Language Models` → `llm`
     - `Agents` → `agent`
     - `Dev Tools`, `MLOps` → `oss`
     - `연구·논문` → `research`
     - `산업·정책` → `industry`
  3. **LLM으로 전체를 재분류한다**(약 1,000건, 제목·요약만 넣고 10건씩 Batches로 처리). 예상 비용은 1회 약 $0.2이고, `--dry-run`으로 바뀌는 분포만 출력해 볼 수 있다.
  4. 분류가 바뀐 건수와 Physical AI로 옮겨진 건수를 보고한 뒤 FTS를 재색인한다(`db:reindex`).
- [ ] 마이그레이션 결과 DB를 커밋한다. 이 커밋은 일일 수집 커밋과 겹치지 않도록 06:00 회차 이후에 한다.

### 2-4. 소비처 일괄 갱신

- [ ] 카테고리 리터럴을 쓰는 곳을 갱신한다.
  - 컴포넌트·라이브러리: `FilterBar.tsx`, `Masthead.tsx`, `Edition.tsx`, `ArticleMeta.tsx`, `FeedView.tsx`, `ogImage.tsx`, `article/[id]/page.tsx`, `mobile/FilterSheet.tsx`, `SearchClient.tsx`
  - 테스트 8개: `edition`, `labels`, `feedFilter`, `getFeed`, `search`, `exportSearchIndex`, `enrich`, `site`
- [ ] 예전 URL `?category=Language%20Models`는 `parseFeedOptions`에서 새 키로 매핑해 받아 준다. 공유된 링크가 깨지지 않게 하려는 것이다.

**Acceptance:** `npm run typecheck && npm test`가 통과한다. DB의 `category` 값이 6개 키뿐이다. 과거 로보틱스 기사(예: Eka Robotics)가 `physical`로 분류돼 있다.

---

## Phase 3: 수집 소스 확장

**목표:** 오픈소스·모델·논문·Physical AI 후보가 선별 풀에 충분히 들어오게 한다.
**의존성:** Phase 2 (`format` 필드)

### 3-1. HuggingFace 모델 (신규)

- [ ] `scripts/lib/collect/api.ts`에 `hf_models` 어댑터를 추가한다.
  - 엔드포인트: `https://huggingface.co/api/models?sort=trendingScore&limit=30`
  - 수집 항목: `likes`, `downloads`, `trendingScore`, `pipeline_tag`
  - 필터: 생성 30일 이내 또는 최근 7일 안에 처음 본 모델. 이미 본 모델은 dedup으로 걸러진다.
- [ ] `trendingScore()`에 HF 모델 신호(likes)를 반영한다.

### 3-2. GitHub

- [ ] `github_llm`을 소스 여러 개로 나눈다. 쿼리 예: `topic:llm`, `topic:ai-agents OR topic:mcp`, `topic:robotics OR topic:embodied-ai`. `sources.json`의 `url`에 쿼리를 넣어 하드코딩을 피한다.
- [ ] `github_trending`(전체 언어)에 AI 키워드 사전 필터를 걸어(설명·토픽 기준) 관련 없는 리포가 선별 풀에 들어오지 않게 한다.
- [ ] 스타 증가량(Δstars)을 계산할 수 있으면 `engagement_json`에 담는다. 화제 지수 정확도가 올라간다.

### 3-3. 논문

- [ ] `arxiv_cs_ro`(로보틱스)를 신규로 활성화하고, 꺼져 있는 `arxiv_cs_ai` 재활성화를 검토한다. `configs/paper-filter.json`의 "유명 논문 게이트"는 유지한다.
- [ ] HF Daily Papers의 `minUpvotes`를 10에서 5로 낮추는 안을 실험한다. 최근 하루 7~9건만 남기 때문이다.

### 3-4. Physical AI

- [ ] 실패하는 소스를 정비한다. `industrial_ai`, `it_can_think`(403)는 대체 URL을 찾거나 비활성화하고, `cmu_ri`(0건 지속)도 점검한다.
- [ ] 신규 후보를 검증한 뒤 추가한다. IEEE Spectrum Robotics, 자율주행 전문 매체, 국내 로봇 매체(로봇신문 등)가 대상이고, RSS가 살아 있는지 확인한 소스만 넣는다.
- [ ] `gnews_physical_ai`의 `maxItems`를 8에서 12로 늘리고, 쿼리를 다듬어 "physical AI" 마케팅성 기사를 줄인다.

### 3-5. 선별 풀

- [ ] `scripts/lib/triage.ts`의 `buildTriagePool`: 소스 라운드로빈은 유지하되 **형식별 최소 할당**(풀 180건 중 비뉴스 40건 이상, Physical AI 소스 20건 이상, 후보가 있을 때)을 보장한다.
- [ ] 회차 `notes`에 형식별 후보 수와 게재 수를 함께 기록한다.

**Acceptance:** 로컬에서 `npm run collect`를 실행하면 notes에서 `oss`, `model`, `paper` 후보가 각각 1건 이상 확인된다.

---

## Phase 4: LLM 선별·가공 개편

**목표:** 수집한 비뉴스와 Physical AI 후보를 LLM이 실제로 고르게 만든다.
**의존성:** Phase 2, 3

### 4-1. 선별 (`configs/prompts/triage.system.md`, `scripts/lib/triage.ts`)

- [ ] 페르소나를 "AI **뉴스** 브리핑"에서 "AI 브리핑(뉴스·오픈소스·모델·연구)"으로 바꾼다.
- [ ] 입력 줄에 형식 열을 추가한다: `번호 | 형식 | 매체 | 날짜 | 화제 | 제목 | 발췌`.
- [ ] 제외 목록의 "사소한 저장소·버전 업데이트"를 고친다. **주목할 리포·모델·논문은 적극적으로 고르고**, 제외하는 것은 단순 패치나 마이너 버전으로 좁힌다.
- [ ] 할당 지침을 추가한다(후보가 있을 때).
  - 비뉴스(오픈소스·모델·논문) 8건 이상, 그중 각 형식 1건 이상
  - Physical AI 3건 이상
  - 중요도는 **형식 안에서** 상대 평가한다. 비뉴스가 뉴스와 경쟁해 밀려나지 않게 하려는 것이다.
- [ ] **이틀에 걸친 같은 사건 중복을 막는다.** 최근 3개 호의 게재 제목(`title_ko`, 약 90줄)을 "이미 보도함" 목록으로 넣는다. 같은 사건이면 고르지 않고, 새로운 전개(후속 보도)일 때만 고른다.
- [ ] `MAX_PICKS_PER_RUN`을 30에서 35로, `TRIAGE_POOL_SIZE`를 150에서 180으로 바꾼다. 코드 기본값과 `collect.yml`의 vars를 함께 바꾼다.
- [ ] `resolvePicks` 이후 코드에서 할당 미달을 검사하고 `notes`에 경고로 남긴다. 강제로 채우지는 않는다.

### 4-2. 가공 (`configs/prompts/enrich.system.md`, `enrich.fewshot.json`)

- [ ] 분야 정의를 2-1 표와 경계 규칙으로 교체한다. Physical AI 우선 규칙을 명시한다.
- [ ] 형식별 요약 가이드를 추가한다.
  - 리포: 무엇을 하는가, 왜 주목받는가, 누가 쓰면 좋은가
  - 모델: 크기·라이선스·용도·벤치마크
  - 논문: 문제, 방법, 결과 한 줄
- [ ] few-shot을 3건에서 6건으로 늘린다. Physical AI 뉴스, GitHub 리포, HF 모델을 추가한다.
- [ ] 가공 입력에 형식을 함께 전달한다(`enrich.ts`).

### 4-3. 테스트·검증

- [ ] `src/__tests__/triage*.test.ts`, `enrich.test.ts`: 입력 줄 포맷, 이미 보도한 목록 주입, 할당 경고 로직을 검증한다.
- [ ] 같은 후보 풀로 개편 전후 선별을 비교한다(로컬에서 1회 실행, 일반 호출). 형식과 분야 분포를 기준선과 비교해 기록한다.

**Acceptance:** 한 회차 게재분에서 비뉴스 6건 이상, Physical AI 2건 이상(후보가 있을 때)이고, 비용은 $0.05 이하다.

---

## Phase 5: 1면 10건 편집 로직

**목표:** 요청 2·3번을 반영한다. 오늘 호 기사로 약 11건의 1면을 구성한다.
**의존성:** Phase 1, 2 (Phase 4가 끝나야 레이더가 꽉 찬다)

### 5-1. 슬롯 정의 (`src/lib/edition.ts`)

| 슬롯 | 수 | 대상 | 선정 규칙 |
|---|---|---|---|
| 리드 | 1 | 형식 = 뉴스 | 편집 순서(중요도, 화제, 시각) 1위 |
| 서브 | 3 | 뉴스 | 다음 순위. 리드와 서브 4건이 **분야 3개 이상**을 덮도록 같은 분야는 최대 2건 |
| 오늘의 브리핑 | 3 | 뉴스 | 남은 뉴스 중 상위. Physical AI가 리드·서브에 없으면 1슬롯을 우선 배정(중요도 3 이상) |
| 레이더 | 4 | 형식 ≠ 뉴스 | 형식 안에서 중요도·화제 순. 오픈소스·모델·논문을 각 1건 이상 섞는다 |
| 지금 화제 | 5 | 전체(오늘 호) | 화제 지수 0 초과, 위 슬롯과 중복 허용(순위 정보 제공용) |

- [ ] `EDITION_LIMITS`를 `{ seconds: 3, briefs: 3, radar: 4, trending: 5, sectionItems: 4 }`로 바꾼다.
- [ ] 슬롯이 부족하면 남는 슬롯을 다음 슬롯으로 넘기고, 다른 호의 기사로는 채우지 않는다. 뉴스가 7건 미만이면 브리핑을 줄이고, 비뉴스가 4건 미만이면 레이더를 줄인다(0건이면 레이더 띠를 숨긴다).
- [ ] 섹션 밴드: 오늘 호 기사를 분야별로 최대 4건씩 보여 주며, 1면에 오른 기사는 제외한다. 오늘 기사가 없는 분야는 밴드를 숨기고 내비게이션에서도 뺀다. 섹션 헤더의 "전체 보기"로 누적 피드에 들어갈 수 있다.

### 5-2. 화제 지수 보강

- [ ] `scripts/lib/trending.ts`: HF 모델(likes)과 GitHub Δstars 신호를 추가해 "지금 화제"가 HN에만 기대지 않게 한다.

### 5-3. 테스트

- [ ] `edition.test.ts`에 다음을 추가한다: 슬롯 수, 분야 다양성 제약, Physical AI 우선 배정, 레이더 형식 혼합, 부족 시 축소, 레이더 0건일 때 숨김.
- [ ] `site.test.ts`: 공유 메타(리드·서브 기반)를 회귀 검증한다.

**Acceptance:** 오늘 호가 28~35건이면 1면 본문이 약 11건이고, 그중 비뉴스가 4건 가까이 된다. 모두 오늘 호 기사다.

---

## Phase 6: 디자인 고도화

**목표:** 늘어난 1면과 새 축(형식, Physical AI)을 에디토리얼 톤 그대로 세련되게 담는다.
**의존성:** Phase 5 (마크업), 시안은 Phase 2부터 병행 가능

### 6-1. 시안

- [ ] `docs/design/mockups/`에 데스크톱·모바일·다크 시안 HTML을 만든다. 1면 전체(리드, 서브, 브리핑, 레이더, 화제)와 형식 배지가 대상이다. 사용자 리뷰를 받은 뒤 구현한다.

### 6-2. 구성요소

- [ ] **레이더 띠** (`Edition.tsx`에 `RadarBand` 추가)
  - 굵은 괘선 아래 "오픈소스·논문 레이더" 머리와 4열 그리드를 둔다. 모바일에서는 가로 스크롤 스냅으로 한 장 반이 보이게 한다.
  - 카드마다 형식별 메타 줄을 둔다.
    - 리포: `owner/repo`, ★ 스타(+Δ), 언어
    - 모델: 파라미터·태스크(`pipeline_tag`), ♥ likes, ↓ downloads
    - 논문: 기관·arXiv ID, ▲ upvotes
  - 수치는 `tabular-nums`로 정렬한다.
- [ ] **오늘의 브리핑** (`StoryBrief` 변형 추가): 한 줄 헤드라인, 키커, 매체, 상대 시각, 중요도 도트로 구성한 3행 리스트다. 서브 그리드 아래에 가는 괘선으로 구분한다.
- [ ] **형식 배지** (`ArticleMeta.tsx`에 `FormatBadge` 추가): `REPO`·`MODEL`·`PAPER`를 스몰캡(small caps), 잉크 1px 아웃라인, 코발트 없이 표시한다. 강조색이 하나라는 원칙을 지키려는 것이다. 뉴스에는 배지를 붙이지 않는다. 1면, 섹션, 색인, 상세, 검색 결과에 공통으로 적용한다.
- [ ] **Physical AI 키커**: 다른 분야와 같은 코발트 키커를 쓰고, 마스트헤드 섹션 내비게이션 순서는 `1면 · LLM · 에이전트 · Physical AI · 오픈소스·도구 · 연구·논문 · 산업·정책 · 전체 기사`로 한다.
- [ ] **마스트헤드**: 호 기준 통계(Phase 1)를 쓰고, 발행 지연 안내 줄 스타일을 정한다.
- [ ] **지금 화제**: 5건으로 줄이고 출처 아이콘 대신 형식 배지를 쓴다. 화제 바는 유지한다.
- [ ] **OG 이미지** (`src/lib/ogImage.tsx`): 기본 썸네일의 분야 목록을 새 6분야로 바꾸고, 호 썸네일에 "오늘 N건"을 넣는다.

### 6-3. 품질

- [ ] 반응형은 360, 768, 1280, 1536px에서 확인한다.
- [ ] 다크 모드와 44px 터치 타깃을 확인한다.
- [ ] 접근성 대비(배지·메타 텍스트)가 WCAG AA를 충족하는지 확인한다.
- [ ] `DESIGN.md`에 다음을 반영한다: 분야 코드표(PHY·OSS 추가, DEV·OPS 삭제), 형식 배지, 레이더·브리핑 컴포넌트 명세.

**Acceptance:** Playwright로 데스크톱·모바일·다크 스크린샷을 찍어 시안과 비교했을 때 레이아웃이 깨지거나 가로 스크롤이 생기지 않는다.

---

## Phase 7: 통합 검증·문서 갱신

**의존성:** Phase 1~6

- [ ] `npm run lint && npm run typecheck && npm test`가 통과한다. DB 테스트는 Node 24 PATH에서 실행한다.
- [ ] 로컬에서 `npm run collect`를 1회 실행해 비용, 형식·분야 분포, 할당 경고를 확인한다.
- [ ] `npm run build`(정적 export) 후 `basePath` 아래 홈, `/edition/<오늘>`, 지난 호, `?category=physical`, 검색이 정상인지 확인한다.
- [ ] 배포 후 3일간 KPI를 관찰해 하단 "목표 지표" 표에 기록한다.
- [ ] 문서를 갱신한다: `CLAUDE.md`(카테고리, 형식, 1면 구성), `docs/PRD.md` 카테고리 절, `DESIGN.md`, 이 문서의 체크박스.

### 목표 지표

| 지표 | 기준선 (Phase 0) | 목표 |
|---|---|---|
| 1면 기사 중 오늘 호 비율 | 52% (29/56) | **100%** |
| 1면 본문 기사 수 | 4 | **10~11** |
| 회차당 비뉴스 게재 | 0~4 (평균 1.4) | **≥ 6** (1면 레이더 4) |
| 회차당 Physical AI 게재 | 1~7 (평균 2.9, 키워드 기준 · 분야로는 0) | **≥ 2** (1면 ≥ 1, 후보 존재 시) |
| 이틀 연속 같은 사건 중복 | 14일간 9쌍 (사건 8건, 휴리스틱) | 0 |
| 회차 비용 | $0.0266 (평균, $0.0236~$0.0281) | ≤ $0.05 (상한 $0.1) |

기준선은 `npm run kpi -- baseline 14`로 다시 측정한다(DB 읽기 전용, 최신 호부터 14일). Phase 7에서도 같은 명령으로 측정해 비교한다. 단, Phase 2 이후에는 형식·분야 값이 바뀌므로 `scripts/lib/baseline.ts`의 임시 형식 판정(`provisionalFormat`)을 `sources.format`으로 교체하고 분야 키 매핑을 맞춘다.

---

## Phase 8: (제안·선택) 추가 아이디어

우선순위 순서다. 본 개편이 안정된 뒤 하나씩 결정한다.

- [ ] **오늘 호 3줄 요약(편집자 노트):** 선별 호출의 출력에 `brief`(오늘 핵심 3줄)를 추가해 1면 리드 위나 마스트헤드 아래에 둔다. 별도 호출 없이 1회 출력 토큰만 약간 늘어난다. 공유 메타 설명으로도 쓸 수 있다.
- [ ] **후속 보도 연결:** 4-1의 "이미 보도함" 판정을 확장한다. 새로운 전개로 고른 기사에 `follow_up_of`를 저장하고 상세 페이지에 "이전 보도" 링크를 단다.
- [ ] **소스 헬스 패널:** 연속으로 실패하거나 3회 연속 0건인 소스를 로컬 admin KPI 패널에 경고로 띄운다(지금은 403 소스가 방치돼 있다).
- [ ] **주간 레이더:** 일요일 호에 한 주 동안의 오픈소스·모델·논문 상위 10을 묶은 특집 밴드를 싣는다(LLM 호출 없이 집계만 한다).

---

## 기준선 기록 (Phase 0에서 채움)

2026-10-27 측정. 재현: `npm run kpi -- baseline 14` (`scripts/kpi.ts` → `scripts/lib/baseline.ts`). 호 날짜는 `created_at`의 KST 날짜이고, 공개 기사(`summary_ko IS NOT NULL`)만 센다. 형식은 `format` 컬럼이 생기기 전이라 소스로 임시 판정했다(GitHub → 오픈소스, `hf_daily_papers`·`arxiv_*`·`takara_*` → 논문, 나머지 → 뉴스).

| 항목 | 값 |
|---|---|
| 측정 기간 | 2026-10-12 ~ 2026-10-25 (KST, 제118~131호 14개 호, 회차 14회, 공개 기사 388건) |
| 형식 비율 (뉴스/오픈소스/모델/논문) | 뉴스 369 (95%) / 오픈소스 5 (1%) / 모델 0 (0%) / 논문 14 (4%) |
| 형식별 신규 후보 → 게재 | 뉴스 1,691 → 369 (22%) / 오픈소스 173 → 5 (3%) / 모델 0 → 0 / 논문 329 → 14 (4%). 후보는 회차 notes의 소스별 신규 수(상한 적용 후) 합계 |
| 분야 비율 | 산업·정책 120 (31%) / Language Models 76 (20%) / Agents 72 (19%) / Dev Tools 56 (14%) / 연구·논문 36 (9%) / MLOps 28 (7%) |
| Physical AI 키워드 기사 수 | 40건 (전체의 10%, 호당 2.9건, 호별 1~7건). 제목·태그만으로 세면 38건이다. 분야는 산업·정책 17 / Agents 11 / Language Models 4 / MLOps 4 / 연구·논문 3 / Dev Tools 1로 흩어져 있다 |
| 회차 평균 비용 | $0.0266 (최소 $0.0236, 최대 $0.0281, 14회 합계 $0.3726). 회차당 LLM 호출 4.0회, 입력 27,754 / 출력 5,094 토큰 |
| 1면 오늘 호 비율 (리드+서브) | 52% (29/56). 13개 호에서 1면 4건 중 2건이 전날 호 기사였다(10/16만 3/4) |
| 1면 본문 기사 수 | 4건 (14개 호 모두) |
| 지금 화제 오늘 호 비율 | 57% (13/23). 화제 지수가 0보다 큰 기사가 적어 호당 평균 1.6건(상한 10)이고, 5개 호는 0건이었다 |
| 이틀 연속 같은 사건 중복 후보 | 9쌍(사건 8건). 판정은 휴리스틱으로, 제목 토큰 Jaccard ≥ 0.5, 희귀 토큰 3개 이상 공유, URL 공유 중 하나다. 대상: LFM2.5-24B-A2B(10/14→15→16), Nemotron 3.5(10/16→17), 중국 AI 기술 수출 통제(10/17→18), Voxtral 3(10/21→22), Canva 이미지 모델(10/23→24), Formic 투자(10/23→24), Kimi K3.1 Pro(10/24→25), AI 요청 CO₂ 8.5배(10/24→25) |
| 0건 소스 (활성인데 기간 내 게재 0) | 9개. `industrial_ai`·`it_can_think`는 14회 모두 403이다. `gnews_humanoid`는 후보 112건 중 0건, `simon_willison`은 33건 중 0건, `science_robotics`는 6건 중 0건, `gnews_vla`는 4건 중 0건이 실렸다. `interconnects`(후보 2), `nvidia_dev_robotics`(1), `ahead_of_ai`(1)는 후보 자체가 거의 없다 |
| 회차 상태 | 14회 모두 `partial`이다. 403 소스 2개가 매회 실패하기 때문이며, 그 밖에 `etnews_ai` 3회, `hnrss_frontpage` 2회, `cmu_ri` 1회 fetch 실패가 있었다 |

### 호별

| 호 날짜 | 호 | 게재 | 뉴스/OSS/모델/논문 | Physical AI | 1면 오늘 호 | 화제 오늘 호 | 비용 |
|---|---|---|---|---|---|---|---|
| 10-12 | 118 | 23 | 22/1/0/0 | 4 | 2/4 | 4/5 | $0.0236 |
| 10-13 | 119 | 29 | 28/1/0/0 | 1 | 2/4 | 2/5 | $0.0275 |
| 10-14 | 120 | 30 | 29/1/0/0 | 3 | 2/4 | 1/3 | $0.0267 |
| 10-15 | 121 | 29 | 28/0/0/1 | 4 | 2/4 | 1/2 | $0.0277 |
| 10-16 | 122 | 29 | 27/0/0/2 | 1 | 3/4 | 0/1 | $0.0281 |
| 10-17 | 123 | 30 | 28/0/0/2 | 7 | 2/4 | 0/0 | $0.0281 |
| 10-18 | 124 | 21 | 20/0/0/1 | 1 | 2/4 | 0/0 | $0.0246 |
| 10-19 | 125 | 27 | 24/1/0/2 | 2 | 2/4 | 0/0 | $0.0280 |
| 10-20 | 126 | 30 | 26/0/0/4 | 3 | 2/4 | 0/0 | $0.0274 |
| 10-21 | 127 | 26 | 26/0/0/0 | 2 | 2/4 | 1/1 | $0.0247 |
| 10-22 | 128 | 30 | 29/1/0/0 | 2 | 2/4 | 0/1 | $0.0268 |
| 10-23 | 129 | 27 | 27/0/0/0 | 4 | 2/4 | 0/0 | $0.0261 |
| 10-24 | 130 | 29 | 28/0/0/1 | 4 | 2/4 | 2/2 | $0.0261 |
| 10-25 | 131 | 28 | 27/0/0/1 | 2 | 2/4 | 2/3 | $0.0272 |

### 후속 Phase 참고

- **Phase 3-4 (소스 정비):** 0건 소스 9개 가운데 403 소스 2개는 수집 자체가 안 된다. `gnews_humanoid`, `simon_willison`, `science_robotics`는 후보가 들어오는데도 선별에서 전부 떨어졌다.
- **Phase 4 (선별):** 비뉴스 후보는 선별 풀의 23%(502/2,193)를 차지하지만 게재율이 3~4%에 그친다. 뉴스 게재율은 22%다. `github_llm`은 후보 112건 중 2건, `arxiv_cs_cl`은 137건 중 1건이 실렸다.
- **Phase 2 (분야):** Physical AI 기사의 43%가 산업·정책으로, 28%가 Agents로 분류됐다. MLOps에도 투자·칩 소식(피지컬 AI 칩, 데이터셋 투자)이 섞여 있다.
- **Phase 2 (sources 동기화):** `sources` 테이블에 `reddit_*` 8개가 `enabled=1`로 남아 있다. `sources.json`에서는 빠진 소스들이다. `format` 컬럼을 동기화할 때 제거된 소스의 처리 방식도 함께 정한다.
