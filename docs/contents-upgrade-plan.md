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
- [x] **Phase 1** — 1면 "오늘 호 전용" 전환 (빠른 개선, 데이터 변경 없음) (2026-10-28 완료)
- [x] **Phase 2** — 카테고리 6분야 + 형식(format) 데이터 모델·마이그레이션 (2026-10-29 완료)
- [x] **Phase 3** — 수집 소스 확장 (HF 모델·GitHub·논문·Physical AI) (2026-10-29 완료)
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

- [x] **통합 검증 (2026-10-28)**
  - 게이트: vitest 39파일·258건 통과. typecheck 통과. lint는 오류 0건이고, 경고 1건(`_contentRaw`)은 Phase 1 이전부터 있던 것이다. 정적 빌드 성공.
  - 인수 조건: 빌드 HTML의 기사 id를 DB `date(created_at,'+9 hours')`와 대조했다. 홈(제131호, 10-25)의 1면과 섹션 22건, `/edition/2026-10-25`·`10-20`·`06-07`의 1면·섹션·"이 호의 기사"에서 **불일치 0건**이었다. 각 호의 목록 수는 그날 공개 수집분과 같다(28·30·20).
  - 화면: 360·1280px, 라이트·다크에서 가로 스크롤 0, 콘솔·하이드레이션 오류 0. 발행 지연 안내가 정적 HTML과 브라우저 양쪽에서 표시된다.
- [x] **리뷰 반영 (2026-10-28)** — 코드 리뷰와 통합 검증에서 나온 지적을 고쳤다.
  - **빈 호 숨김(호수 유지, 사용자 결정):** 06-10~10-05에는 LLM 가공이 06-09·07-07·10-06에 몰려 있어 호 129개 중 106개가 0건이었다. 이 빈 호가 빈 `/edition` 페이지로 생성되고, 이전·다음 이동도 빈 호를 거쳐 갔다. 이제 `getEditionRefs()`는 공개 기사가 있는 KST 날짜만 반환하고, 호수는 실패하지 않은 회차 전체의 순번을 유지한다(빈 번호가 생긴다). 지난 호 페이지는 129개에서 23개가 됐다.
  - **자정을 넘긴 회차의 귀속:** 호 날짜와 `publishedAt`을 `COALESCE(finished_at, started_at)`의 KST 날짜로 정한다. 23:50에 시작해 00:10에 저장한 회차의 기사가 어느 호에도 실리지 않던 문제를 막는다.
  - 홈의 호 선택을 `getLatestEditionRef()` 하나로 모으고 `getHomeIssue()`는 삭제했다. 편집 정렬과 화제 정렬에는 마지막 기준으로 `id`를 추가해, 공유 메타의 리드와 1면 리드가 항상 같게 했다. 섹션 링크 문구는 "이 분야 전체 기사 →"다.
  - **발행 지연 안내:** 빌드 시점의 지연 일수를 초기 상태로 넣어 정적 HTML에도 안내가 그려지게 했다. 마운트 후에 생기던 레이아웃 이동(약 40px)이 사라졌다. 모바일은 "10.25(일) 발행 · 새 호 지연 중"처럼 짧은 문구 한 줄로 표시한다.
  - 테스트를 추가했다: 빈 날짜 제외와 호수 유지, 자정 경계, 하루 여러 회차, 완전 동점, `FeedView.test.tsx`(빈 호, 정적 HTML, `hydrateRoot` 불일치 경고 없음).
- 참고 (후속 Phase):
  - **`kpi baseline`:** `buildEdition`이 호 배열만 받게 되면서, 누적 입력으로 옛 1면을 재현하던 지표 두 개가 기록값과 달라졌다. "1면 오늘 호 비율"은 52%에서 50%로, "지금 화제 오늘 호 비율"은 57%(13/23)에서 2%(3/140)로 바뀐다. 위 기준선 표는 **Phase 1 이전 동작으로 측정한 값**이므로 그대로 둔다. Phase 7에서 `baseline.ts`를 고쳐 옛 동작과 새 동작을 나눠 측정한다.
  - **Phase 5·6:** 오늘 호만 쓰면서 섹션 밴드가 얇아졌다. 예를 들어 MLOps는 1건이고, 에이전트는 "4건"인데 2건이 1면에 실려 밴드에는 2건만 보인다. 밴드 건수를 셀 때 1면 게재분을 어떻게 다룰지, 1~2건짜리 밴드를 압축할지를 정한다. 오늘 수집했지만 게시일이 오래된 기사(예: Takara TLDR의 "10.22")가 1면에서 낡아 보이는 문제도 표기 방식을 함께 검토한다.

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

- [x] `scripts/lib/schema.ts`: `CATEGORIES`를 위 6개 키로 바꾼다(`z.enum`도 함께 바뀐다).
  - ✅ 2026-10-29 `CATEGORIES`·`Category`·`LEGACY_CATEGORY_MAP`의 정의는 `src/lib/labels.ts`에 두고 `schema.ts`는 재수출만 한다. `src`는 `scripts/`를 import하지 않지만 `scripts/`는 `../src/lib/*`를 이미 쓰므로, 양쪽이 닿는 곳은 labels 한 곳뿐이다.
- [x] `src/lib/labels.ts`: `CATEGORY_LABELS`(표시명·순서), `CATEGORY_SLUGS`(키를 그대로 쓰면 삭제할 수 있다), 코드(LLM/AGT/PHY/OSS/RES/BIZ)를 넣는다.
  - ✅ 2026-10-29 `CATEGORY_SLUGS`는 삭제했다(키 = 슬러그, 미정의는 `etc`). `CATEGORY_CODES`·`categoryCode()`를 추가했다. 헬퍼 `normalizeCategory`·`categoryAliases`·`isCategory`도 추가했다. `categoryLabel`·`categoryCode`는 구 값도 받아 새 분야명으로 보여 준다.
- [x] **(추가) 분류 정의 단일 출처:** 분야 정의·경계 규칙을 `configs/prompts/categories.md`로 분리했다. `enrich.system.md`의 `{{CATEGORIES}}` 자리에 `enrich.ts`(`readCategoryGuide()`)가 채운다. 2-3 재분류 스크립트도 같은 파일을 쓴다. enum이 지금 바뀌므로 Phase 4 전에도 수집이 새 키로 분류되도록, few-shot 3건의 값과 `triage.system.md`의 분야 나열도 함께 고쳤다. 프롬프트 전면 개편은 Phase 4에서 한다.

### 2-2. 형식(format)

- [x] `configs/sources.json`: 각 소스에 `format`을 넣는다.
  - `github_llm`, `github_trending`과 신규 GitHub 소스는 `oss`
  - 신규 HF 모델 소스는 `model`
  - `hf_daily_papers`, `arxiv_*`, `takara_tldr`은 `paper`
  - 나머지는 생략해 `news`로 둔다.
  - ✅ 2026-10-29 7개 소스에 넣었다(oss 2, paper 5). HF 모델 소스는 Phase 3-1에서 추가한다. `FORMATS`·`Format`·`FORMAT_LABELS`(뉴스·오픈소스·모델·논문)·`FORMAT_BADGES`(REPO·MODEL·PAPER, 뉴스는 없음)·`toFormat`은 분야와 같은 단일 출처인 `src/lib/labels.ts`에 둔다.
- [x] `scripts/lib/schema.sql` 및 `scripts/lib/initDb.ts`의 `ensureSchema`: `sources.format TEXT NOT NULL DEFAULT 'news'` 컬럼을 추가하고, collect 시작 시 sources.json에서 동기화한다.
  - ✅ 2026-10-29 동기화는 `scripts/lib/syncSources.ts`로 분리했다. 이전에는 collect가 활성 소스만 upsert해서 비활성 소스의 행이 갱신되지 않았다. 이제 sources.json의 **전체** 소스를 동기화하고, 바뀐 행만 한 트랜잭션으로 쓴다. collect 시작(`ensureSchema` 직후)과 `npm run db:init`이 호출한다.
  - **제거된 소스(기준선 참고 항목):** sources.json에서 빠진 행은 참조하는 기사가 없으면 삭제하고, 있으면 `enabled=0`으로 남긴다(JOIN 보존). `reddit_*` 8개는 기사가 0건이라 삭제된다.
  - **(추가) 빌드 안전장치:** `prebuild`가 `initDb.ts --existing`(DB가 없으면 실패)을 먼저 실행해, 컬럼이 없는 DB(예: 배포 브랜치에서 병합해 온 DB)로 빌드해도 깨지지 않는다. `configs/**` 변경으로 배포될 때도 형식 변경이 다음 수집을 기다리지 않고 반영된다. 읽기 전용 쿼리도 컬럼이 없으면 `news`로 읽는다(`hasSourceFormat`), 그래서 `kpi`·`dev`도 옛 DB에서 동작한다.
- [x] `src/lib/types.ts`: `ArticleCard.format`과 `SourceConfig.format`을 추가한다. `src/lib/db.ts`의 `ARTICLE_SELECT`에 `s.format`을 추가한다.
  - ✅ 2026-10-29 `toArticleCard`가 `toFormat`으로 매핑한다(미정의·NULL → `news`). 검색 인덱스와 `latest.json`에도 `format`이 실린다(필드 추가, `version: 1` 유지).
- [x] `src/lib/sources.ts`: `SOURCE_KINDS`에서 빠져 있던 `arxiv`와 신규 `hf_models`를 추가하고, 로컬 admin에서 `format`을 검증한다.
  - ✅ 2026-10-29 `format: z.enum(FORMATS).optional()`로 검증한다. admin `SourceManager`에 형식 선택(뉴스를 고르면 키를 생략)과 목록의 형식 열을 추가했다. `hf_models`는 어댑터가 없어 Phase 3 전까지 수집에서 건너뛴다.
  - **(추가) `kpi baseline`:** `provisionalFormat` 대신 `sources.format`을 쓰고, 컬럼이 없는 DB에서만 임시 판정으로 되돌아간다.

### 2-3. 기존 데이터 마이그레이션

- [x] `scripts/reclassify.ts`(신규)와 `npm run db:reclassify`를 만든다.
  1. `data/app.db`를 백업(`data/app.db.bak-YYYYMMDD`)한 뒤 진행한다. 백업 파일은 git에서 제외한다.
  2. 기존 값을 규칙으로 먼저 바꿔 둔다. 이 값은 폴백으로 쓴다.
     - `Language Models` → `llm`
     - `Agents` → `agent`
     - `Dev Tools`, `MLOps` → `oss`
     - `연구·논문` → `research`
     - `산업·정책` → `industry`
  3. **LLM으로 전체를 재분류한다**(약 1,000건, 제목·요약만 넣고 10건씩 Batches로 처리). 예상 비용은 1회 약 $0.2이고, `--dry-run`으로 바뀌는 분포만 출력해 볼 수 있다.
  4. 분류가 바뀐 건수와 Physical AI로 옮겨진 건수를 보고한 뒤 FTS를 재색인한다(`db:reindex`).
  - ✅ 2026-10-29 사용법: `npm run db:reclassify -- [--dry-run | --apply] [--only-legacy] [--limit N] [--rules-only] [--chunk N] [--max-cost USD]`. **기본은 dry-run**이고 `--apply`를 줘야 쓴다. 공개 기사만 대상으로 한다.
    - 분류 입력은 `id | 매체 | 제목 | 요약 | 태그`이고, 현재 분류값은 답을 끌어당기지 않도록 넣지 않는다. 시스템 프롬프트는 가공과 같은 `configs/prompts/categories.md`를 쓴다. 20건씩 묶은 요청 전체를 Batch 1개로 보낸다.
    - **(추가) 이중 과금 방지 캐시:** LLM 판정은 `data/reclassify-cache.json`(git 제외)에 기사 id와 입력·프롬프트 해시로 저장한다. dry-run에서 한 번 비용을 내면 `--apply`는 캐시만 쓴다. 요약이나 `categories.md`가 바뀌면 해당 기사만 다시 묻는다.
    - 호출 전에 비용을 추정해 상한(기본 $0.5)을 넘으면 보내지 않는다. 누락·중복·잘못된 판정은 규칙 매핑으로 되돌린다. 적용은 백업(`data/app.db.bak-YYYYMMDD`, 같은 날 재실행 시 `-2`, git 제외) 뒤 한 트랜잭션으로 UPDATE와 FTS 재색인을 함께 한다.
    - **배포 브랜치 병합 시:** 일일 수집이 쌓은 구 값 행만 `--only-legacy --apply`로 다시 분류한다(Phase 0 병합 방침). 그 사이 수집분은 이미 새 키로 나오므로 대상은 병합 전 수집분뿐이다.
  - ✅ 2026-10-29 **실행 결과 (997건):** LLM 977건과 샘플 캐시 20건, 버린 판정 0건, 호출 49회, 토큰 226,146/9,614, **비용 $0.137**(샘플 포함 $0.140). 규칙 매핑과 다른 분류가 **305건**이고 **Physical AI로 87건**이 옮겨졌다.

    | 분야 | 이전 (구 값) | 이후 |
    |---|---|---|
    | llm | Language Models 145 | 116 |
    | agent | Agents 136 | 199 |
    | physical | — | **87** |
    | oss | Dev Tools 187 + MLOps 38 | 149 |
    | research | 연구·논문 99 | 131 |
    | industry | 산업·정책 392 | 315 |

    - 전이: 산업·정책 → physical 49건이 가장 크다(휴머노이드 협력, 피지컬 AI 정책·예산, 로봇 투자). 다음은 Dev Tools → agent 42건(코딩 에이전트·MCP 도구)이고, Agents → physical 14건, 연구·논문 → physical 8건이다.
    - Acceptance 확인: Eka Robotics 2건(#968, #1087)이 `physical`이다. `category` 값은 6개 키뿐이고 `integrity_check`는 ok다.
- [x] 마이그레이션 결과 DB를 커밋한다. 이 커밋은 일일 수집 커밋과 겹치지 않도록 06:00 회차 이후에 한다.
  - ✅ 2026-10-29 07:28 KST에 적용했다. 같은 커밋에 `npm run db:init`의 결과도 들어 있다: `sources.format` 컬럼 추가, 5개 소스의 형식 갱신, `arxiv_cs_ai`·`arxiv_cs_lg` 등록, `reddit_*` 8개 삭제. 형식별 누적 기사 수는 뉴스 843, 오픈소스 99, 논문 55다. 일일 수집 커밋은 `deploy/github-pages`에 쌓이므로 이 브랜치와 겹치지 않는다.

### 2-4. 소비처 일괄 갱신

- [x] 카테고리 리터럴을 쓰는 곳을 갱신한다.
  - 컴포넌트·라이브러리: `FilterBar.tsx`, `Masthead.tsx`, `Edition.tsx`, `ArticleMeta.tsx`, `FeedView.tsx`, `ogImage.tsx`, `article/[id]/page.tsx`, `mobile/FilterSheet.tsx`, `SearchClient.tsx`
  - 테스트 8개: `edition`, `labels`, `feedFilter`, `getFeed`, `search`, `exportSearchIndex`, `enrich`, `site`
  - ✅ 2026-10-29 2-1과 함께 커밋했다(2-1만 커밋하면 typecheck가 깨진다). `FilterBar`·`edition.ts`는 `CATEGORIES`로 칩·섹션을 만든다. `ArticleMeta`·`FeedView`·`SearchClient`·`FilterSheet`·상세·OG는 이미 `categoryLabel`을 거쳐 수정이 필요 없었다. 테스트는 위 8개에 `baseline`·`exportLatest`·`FeedView`·`editionRefs`·`FilterSheet`까지 13개를 갱신했다(39파일·285건 통과).
  - **(추가) 읽기 시 변환:** `toArticleCard`가 구 값을 새 키로 바꾸고, 분야 필터는 `IN (키, 구 값…)`으로 조회한다. 마이그레이션 전 DB나 배포 브랜치에서 병합해 들어온 구 값 행도 그대로 렌더된다. 마이그레이션 뒤에는 비용이 없으므로 남긴다. `kpi baseline`도 구 값을 새 키로 세어 기준선과 비교할 수 있다.
  - **(디자인)** "Physical AI"·"오픈소스·도구"는 이전보다 길다. 필터 칩과 마스트헤드 내비게이션은 `whitespace-nowrap`으로 칩 안에서 줄바꿈되지 않게 했다. 섹션 머리는 `flex-wrap`으로 바꿔, 좁은 화면에서는 "이 분야 전체 기사 →"가 다음 줄로 내려간다. OG 기본 썸네일은 새 6분야가 한 줄(약 710px)에 들어간다.
  - **(추가) `public/latest.json`(외부 소비, 사용자 결정):** `category`는 새 키를 담고 `categoryLabel`(표시명)을 추가했다. 필드 추가뿐이라 `version: 1`을 유지한다. 소비자(자랑터 「한입뉴스」)에는 `category` 값의 의미가 바뀐 것을 알려야 한다.
- [x] 예전 URL `?category=Language%20Models`는 `parseFeedOptions`에서 새 키로 매핑해 받아 준다. 공유된 링크가 깨지지 않게 하려는 것이다.
  - ✅ 2026-10-29 구 값 6종 모두 매핑한다(Dev Tools·MLOps → `oss`). 미정의 값은 그대로 통과한다.

**Acceptance:** `npm run typecheck && npm test`가 통과한다. DB의 `category` 값이 6개 키뿐이다. 과거 로보틱스 기사(예: Eka Robotics)가 `physical`로 분류돼 있다.

- [x] **통합 검증 (2026-10-29)**
  - 게이트: vitest 41파일·314건 통과(Node 24, `reclassify` 21건·`syncSources` 4건 포함). typecheck 통과. lint는 오류 0건이고, 경고 1건(`_contentRaw`)은 이전부터 있던 것이다. 정적 빌드(`npm run build`, prebuild의 `initDb --existing` 포함)가 성공했다.
  - 인수 조건: DB `category`는 6개 키뿐이다(llm 116, agent 199, physical 87, oss 149, research 131, industry 315). Eka Robotics 2건은 `physical`이다. 빌드한 홈에 6개 섹션 앵커(`#section-physical` 포함)가 모두 있고, 화면 텍스트에 구 분야명이 남지 않았다(원문 제목 안의 단어만 남는다).
- 참고 (후속 Phase):
  - **외부 소비자 공지:** `public/latest.json`의 `category`가 구 값("Language Models")에서 새 키("llm")로 바뀌었다. `categoryLabel`과 `format`은 새로 추가했다. 배포 전에 자랑터 「한입뉴스」 쪽에 알린다.
  - **Phase 3:** `hf_models` kind와 `model` 형식은 준비만 했다. 어댑터와 소스 등록은 3-1에서 한다. 형식별 누적 기사에 `model`은 아직 0건이다.
  - **Phase 4:** 가공 프롬프트는 분류 체계만 `categories.md`로 교체했다. 형식별 요약 가이드와 few-shot 확장은 4-2에서 한다. 재분류 결과에서 경계가 애매했던 사례(보안 기능 → industry, 클라우드 계약 → oss 등)는 4-2 few-shot을 만들 때 참고한다.
  - **Phase 6:** `FORMAT_BADGES`(REPO·MODEL·PAPER)와 `categoryCode()`(LLM·AGT·PHY·OSS·RES·BIZ)는 labels.ts에 준비돼 있다. 배지 UI는 6-2에서 만든다.

---

## Phase 3: 수집 소스 확장

**목표:** 오픈소스·모델·논문·Physical AI 후보가 선별 풀에 충분히 들어오게 한다.
**의존성:** Phase 2 (`format` 필드)

### 3-1. HuggingFace 모델 (신규)

- [x] `scripts/lib/collect/api.ts`에 `hf_models` 어댑터를 추가한다.
  - 엔드포인트: `https://huggingface.co/api/models?sort=trendingScore&limit=30`
  - 수집 항목: `likes`, `downloads`, `trendingScore`, `pipeline_tag`
  - 필터: 생성 30일 이내 또는 최근 7일 안에 처음 본 모델. 이미 본 모델은 dedup으로 걸러진다.
  - ✅ 2026-10-29 `fetchHfModels`를 추가했다. `source.url`(목록 API)에 `expand[]`로 필드를 붙여 회차당 1회만 호출하고, 생성 30일 이내 모델만 남긴다. `publishedAt`은 `createdAt`만 쓴다(`lastModified`는 커밋마다 바뀌어 오래된 모델이 새것처럼 보인다). 실측에서 트렌딩 30건 중 25건이 통과했다.
  - 목록 API에 설명 필드가 없다(`cardData`·`full=true`도 마찬가지). 그래서 `contentRaw`는 "태스크 · 라이브러리 · 파라미터 · 라이선스 · base: 원본(관계)" 한 줄로 만든다. base 표기는 Phase 4 선별이 같은 모델의 재배포(GGUF·파인튜닝)를 묶는 단서가 된다. 파생 모델 필터는 두지 않았다. HF의 관계 데이터가 일관되지 않고, NVIDIA 공식 배포에도 `quantized`가 붙기 때문이다.
  - `Engagement`에 순위 신호 `likes`·`downloads`·`hf_trending`(HF 자체 점수, 우리 `trending_score`와 구분)과 표시용 메타 `pipeline_tag`·`params`를 추가했다. 표시용 메타는 Phase 6 레이더 메타 줄에 쓰며, 수집 시점에만 얻을 수 있어 지금부터 저장한다. 파라미터 표기 헬퍼 `formatParams()`(`763B`, `1.7B`)도 함께 넣었다.
  - 소스 `hf_models`(이름 "HuggingFace 트렌딩 모델", 형식 `model`, `maxItems` 6)를 등록했다. 첫 회차 뒤로는 하루 3~6건이 새로 트렌딩에 들어오므로 상한에 거의 걸리지 않고, 양자화·파인튜닝 사본이 공유 풀을 차지하는 것도 막는다.
- [x] `trendingScore()`에 HF 모델 신호(likes)를 반영한다.
  - ✅ 2026-10-29 likes를 가중 0.4, 상한 2000으로 더한다. 상한은 실측값(생성 30일 이내 모델의 likes 145~3,659)에서 정했다. `downloads`는 양자화 재배포가 부풀리고 `hf_trending`은 HF 자체 순위라 중복 신호여서 점수에 쓰지 않는다. 기존 소스 점수가 변경 전과 같은지 테스트로 고정했다(vitest 41파일·325건 통과).

### 3-2. GitHub

- [x] `github_llm`을 소스 여러 개로 나눈다. 쿼리 예: `topic:llm`, `topic:ai-agents OR topic:mcp`, `topic:robotics OR topic:embodied-ai`. `sources.json`의 `url`에 쿼리를 넣어 하드코딩을 피한다.
  - ✅ 2026-10-29 검색 소스 3개(`github_robotics`·`github_agents`·`github_llm`)로 나눴다. `github_llm`은 기존 기사가 참조하므로 id를 유지했다. 쿼리는 `url`의 `q=`에 두고, 코드는 `created:>{7일 전}` 창과 정렬 기본값만 붙인다. `q`가 없으면 예외를 던지고 대체 쿼리는 두지 않는다.
  - 검색 API는 한정자 OR를 받지 않는다(`topic:a OR topic:b`는 422). 그래서 토픽 OR는 `topic:ai-agents,mcp`처럼 쉼표로 쓴다. 쿼리마다 스타 하한(`stars:>=10`, 로보틱스는 `>=5`)을 둬 0★ 저장소를 거른다. 7일 실측 하한 통과 수는 llm 39, agents·mcp 106, robotics 16이다.
  - 상한은 trending 5, agents 4, llm 3, robotics 3(`topic: physical`)으로 회차당 최대 15건이다. 이전에는 llm 10과 trending 10이었고, 기준선에서 `github_llm`은 후보 112건 중 2건만 실렸다. 배치 dedup이 상한에 잘린 항목의 키도 잡으므로, 토픽이 여럿인 저장소는 파일 순서상 앞선 구체 소스가 가져가도록 llm을 맨 뒤에 뒀다.
  - **(추가) CI 인증:** `collect.yml`이 참조하던 `GH_SEARCH_PAT` 시크릿이 설정돼 있지 않아 CI 검색이 미인증으로 돌고 있었다. `${{ secrets.GH_SEARCH_PAT || secrets.GITHUB_TOKEN }}`으로 바꿨다. 공개 저장소 조회에는 권한이 필요 없고, 빌트인 토큰으로 한도가 검색 30/분, 일반 1,000/시간으로 오른다.
- [x] `github_trending`(전체 언어)에 AI 키워드 사전 필터를 걸어(설명·토픽 기준) 관련 없는 리포가 선별 풀에 들어오지 않게 한다.
  - ✅ 2026-10-29 `github_trending`은 RSS 미러 대신 github.com/trending 페이지를 직접 읽는다(kind `github`, `url`로 분기). RSS에는 스타·언어·오늘 증가분이 없기 때문이다. 저장소 토픽은 REST `/repos/{name}`로 보탠다(하루 14~25회, 실패하면 토픽 없이 진행). 저장소 블록을 하나도 파싱하지 못하면 0건 대신 "마크업 변경 의심" 예외를 던진다.
  - 소스 필드 `keywordFilter: "ai"`가 `configs/keyword-filters.json`의 목록 이름을 가리킨다. `collect.ts`가 수집 직후 kind와 무관하게 제목·설명·토픽을 검사하고, 키워드가 없는 항목은 dedup 키도 남기지 않고 버린다. 일치는 대소문자 무시·단어 단위라 `ai`가 email·maintain에 걸리지 않는다. 끝의 `*`는 접두어 일치(`agent*`)이고 한중일 키워드는 부분 일치다. 범용어(model·inference·prompt·gpu)는 오탐이 많아 뺐다. 없는 목록 이름은 예외로 처리해 필터가 조용히 꺼지지 않게 했다.
  - 실측에서 오늘 트렌딩 14건 중 11건이 통과했다. 탈옥 프롬프트 목록, 네트워크 드라이브 다운로더, 독학 에세이가 빠졌다. 토픽 덕분에 설명만으로는 떨어졌을 HKUDS/DeepTutor와 ruvnet/RuView가 살았다. 전체 언어 피드는 유지한다. Python 피드만 쓰면 오늘 AI 저장소 11건 중 7건(TS·Rust·Shell)을 놓친다.
  - notes에 `, 키워드 제외 N`이 붙는다. `kpi baseline`의 notes 파싱 정규식도 함께 고쳤다.
- [x] 스타 증가량(Δstars)을 계산할 수 있으면 `engagement_json`에 담는다. 화제 지수 정확도가 올라간다.
  - ✅ 2026-10-29 트렌딩 페이지의 "N stars today"를 `stars_today`로 저장하고, `trendingScore()`에 가중 0.4·상한 2000으로 더한다(오늘 실측 90~2,371). 트렌딩 기사의 화제 지수가 0에서 50~70으로 올라 "지금 화제" 후보가 된다. 검색 소스는 생성 7일 이내라 누적 스타가 곧 증가분이므로 따로 계산하지 않는다. 레이더 메타 줄에 쓸 `language`도 표시용 메타로 저장한다. 기존 소스 점수는 그대로다(vitest 42파일·350건 통과).

### 3-3. 논문

- [x] `arxiv_cs_ro`(로보틱스)를 신규로 활성화하고, 꺼져 있는 `arxiv_cs_ai` 재활성화를 검토한다. `configs/paper-filter.json`의 "유명 논문 게이트"는 유지한다.
  - ✅ 2026-10-29 `arxiv_cs_ro`를 추가했다(`topic: physical`, `maxItems` 10). 실측에서 원본 120건(약 하루치) 중 27건이 게이트를 통과했고, 대부분 기관 allowlist 경로였다. 통과 제목은 VLA 정책, 휴머노이드, 매니퓰레이션, 월드 액션 모델로 주제에 맞았다. 상한 10은 `arxiv_cs_cl`과 같고, 3-5의 Physical AI 할당(20건)의 절반가량을 채운다.
  - `arxiv_cs_ai`는 비활성으로 둔다. 통과 25건 중 cs.CL과 겹치는 것은 3건뿐이었다. 그러나 하루 제출량이 많아 120건 창이 하루의 약 6시간분만 보고, 인용 3회 이상은 0건(기관 경로로만 통과)이었으며, 주제도 추천 시스템·강수 예측 등으로 흩어져 있었다. 기준선에서 논문 후보 329건 중 14건만 실렸으므로 병목은 후보 수가 아니라 선별(Phase 4)이다. Phase 4 이후 다시 검토한다.
- [x] HF Daily Papers의 `minUpvotes`를 10에서 5로 낮추는 안을 실험한다. 최근 하루 7~9건만 남기 때문이다.
  - ✅ 2026-10-29 실측해 보니 병목은 임계값이 아니라 `limit=20`이었다. 응답이 upvote 순이 아니라 데일리 목록 날짜순이어서, 아직 투표가 쌓이는 당일 목록 일부만 보고 다음 날에는 창 밖으로 밀려났다. 평일 하루 목록 45~64건 중 10표 이상이 25~50건이었다.
  - 그래서 `minUpvotes`는 10을 유지하고, `limit`을 100(평일 약 2일치)으로, `maxItems`를 15(upvote 상위)로 정했다. 한 논문이 두 회차에 걸쳐 보이므로, 첫날 임계에 못 미친 논문도 다음 회차에 통과할 수 있다. 5표로 낮추면 하루 5~12건이 늘지만, 3~4표 표본에는 주제 밖 논문(분자 계면, 세포 추적)이 섞여 있었다. 회차당 논문 후보는 약 14~20건에서 약 35건(HF 15, cs.CL 10, cs.RO 10)으로 늘어난다.

### 3-4. Physical AI

- [x] 실패하는 소스를 정비한다. `industrial_ai`, `it_can_think`(403)는 대체 URL을 찾거나 비활성화하고, `cmu_ri`(0건 지속)도 점검한다.
  - ✅ 2026-10-29 `industrial_ai`와 `it_can_think`는 `enabled: 0`으로 끄고 항목은 남겼다(기사 JOIN 유지). 로컬에서는 UA와 상관없이 200이 나오므로, 403은 Substack이 Actions 러너 IP를 막아서 생기는 것으로 본다. `industrial_ai`는 7월 이후 새 글이 없고 `it_can_think`는 월 2회 정도라, 우회할 이득이 작다.
  - `cmu_ri`는 피드가 살아 있다(최근 글 10-15). 주 1회 꼴로 올라와 7일 창에 0건인 날이 많을 뿐이라 그대로 둔다. `science_robotics`·`nvidia_dev_robotics`·`gnews_humanoid`·`gnews_vla`도 수집은 정상이다. 게재가 적은 원인은 선별(Phase 4)에 있다.
- [x] 신규 후보를 검증한 뒤 추가한다. IEEE Spectrum Robotics, 자율주행 전문 매체, 국내 로봇 매체(로봇신문 등)가 대상이고, RSS가 살아 있는지 확인한 소스만 넣는다.
  - ✅ 2026-10-29 `fetchRss`로 파싱과 최근 7일 항목을 확인한 소스 4개를 추가했다. 회차당 최대 18건이다.

    | id | 매체 | 상한 | 최근 7일 |
    |---|---|---|---|
    | `ieee_spectrum_robotics` | IEEE Spectrum Robotics | 4 | 1 |
    | `robotics_automation_news` | Robotics & Automation News(투자·휴머노이드·도입 사례) | 4 | 15 |
    | `av_international` | Autonomous Vehicle International(자율주행·ADAS) | 4 | 7 |
    | `irobotnews` | 로봇신문 "로봇" 섹션(`S1N1.xml`) | 6 | 20 |

  - 로봇신문은 전체 기사 피드 대신 섹션 피드를 쓴다. 전체 피드에는 로봇주 시세 기사와 오피니언이 섞여 있다. Humanoids Daily와 Robotics 24/7은 파싱에 실패해 뺐다. Electrek 자율주행은 2020년 이후 갱신이 없고, The Robot Report AV 카테고리는 403이었다.
  - 첫 회차 notes에서 확인할 것: AV International과 R&A News는 WordPress 사이트라 Substack처럼 러너 IP를 막을 수 있다.
- [x] `gnews_physical_ai`의 `maxItems`를 8에서 12로 늘리고, 쿼리를 다듬어 "physical AI" 마케팅성 기사를 줄인다.
  - ✅ 2026-10-29 상한을 12로 올리고, 쿼리에 `when:2d`와 키워드 제외(`-webinar -stock -stocks -shares -ETF -"index fund" -"market size" -CAGR -award -summit`)를 넣었다. 기존 쿼리 상위에는 TradingView·BigGo Finance·Business Wire 같은 증권·보도자료 배급 기사가 많았는데, 새 쿼리(최근 37건)는 투자 유치, 도입 사례, 기업 협력 기사가 대부분이다. `when:2d`는 회차가 실패했을 때 하루 여유를 준다. `-site:` 제외는 결과를 LinkedIn·X·채용 공고로 바꿔 놓아 쓰지 않는다.
- [x] **(추가) 소스 필드 `topic`:** 소스의 주력 분야를 나타내는 힌트로, `CATEGORIES` 키를 쓰고 지금은 `physical`만 쓴다. 로보틱스·Physical AI 소스 15개와 `arxiv_cs_ro`, `github_robotics`에 붙였다. 3-5에서 선별 풀 할당에 쓴다. 설정 전용이라 DB 컬럼은 없고, 기사 분야는 여전히 LLM 가공이 정한다.
  - 로컬 admin 스키마(`sourceSchema`)에 `topic`과 3-2의 `keywordFilter`를 선언했다. zod가 선언되지 않은 키를 지우므로, 선언하지 않으면 저장할 때 두 필드가 사라진다.
  - **(기존 버그 수정)** arXiv 소스는 `url`에 카테고리명(`cs.CL`)을 쓰는데 http(s) 규칙에 걸려, admin에서 편집하거나 토글하면 400이 났다. 이제 arxiv는 수집 어댑터와 같은 카테고리 규칙으로 검증한다.
  - `sourcesConfig.test.ts`가 `configs/sources.json`의 모든 항목이 스키마를 통과하고, 검증 뒤에도 필드가 지워지지 않는지 확인한다(vitest 43파일·360건 통과).

### 3-5. 선별 풀

- [x] `scripts/lib/triage.ts`의 `buildTriagePool`: 소스 라운드로빈은 유지하되 **형식별 최소 할당**(풀 180건 중 비뉴스 40건 이상, Physical AI 소스 20건 이상, 후보가 있을 때)을 보장한다.
  - ✅ 2026-10-29 최소 할당을 풀 대비 비율로 정했다: 비뉴스 2/9, Physical AI 1/9. 풀 180건이면 40·20건이고 지금 150건이면 33·17건이라, 4-1에서 `TRIAGE_POOL_SIZE`만 바꾸면 된다. 두 할당의 합이 풀의 절반을 넘으면 비율대로 줄여 뉴스 몫을 지킨다.
  - 채우는 순서는 다음과 같다. ① 비뉴스는 형식(oss → model → paper) 라운드로빈 안에서 다시 소스 라운드로빈으로 채워, 논문만으로 할당이 차지 않게 한다. ② Physical AI는 ①에서 이미 든 physical 후보를 빼고 모자란 만큼만 채운다. `arxiv_cs_ro`와 `github_robotics`는 두 할당에 모두 센다. ③ 나머지는 전체 라운드로빈으로 채운다.
  - 출력은 전체 라운드로빈 순서라 할당분이 선별 줄 앞쪽에 몰리지 않는다. 할당이 자연히 채워지는 날은 결과가 이전과 같다(테스트로 고정). `Candidate`에 `format`(필수)과 `topic`을 추가했다. 재심사 행의 두 값은 비활성 소스를 포함한 `sources.json` 전체에서 찾고, 설정에서 빠진 소스는 뉴스로 본다.
- [x] 회차 `notes`에 형식별 후보 수와 게재 수를 함께 기록한다.
  - ✅ 2026-10-29 `형식별 후보→풀→게재: 뉴스 a→b→c, 오픈소스 …, 모델 …, 논문 …`과 `Physical AI 후보→풀→게재: a→b→c`를 남긴다. 게재는 이번 회차에 가공까지 마친 선정 기사다. `finally`에서 기록하므로 선별이 실패한 회차도 후보·풀 수가 남는다. 여기서 Physical AI는 소스 `topic` 기준이라, 기준선의 키워드 기준 Physical AI 게재 수와는 다른 지표다(Phase 7에서 구분). `kpi baseline`의 notes 파싱은 영향이 없음을 테스트로 고정했다.
- [x] **(추가) `npm run collect -- --dry-run`:** 수집 → dedup → 선별 풀까지만 실행하고, 소스별 notes·풀 구성·풀 앞 40줄(선별 줄 형식)을 출력한다. LLM 호출과 API 키가 필요 없고, DB는 readonly로 열어 `ensureSchema`·`syncSources`·저장·`collection_runs` 기록을 모두 건너뛴다. 실제 수집은 비용이 들고, 커밋된 `data/app.db`를 바꿔 배포 브랜치의 일일 수집 커밋과 충돌한다. 그래서 소스·풀 변경은 이 모드로 검증한다.

**Acceptance:** 로컬에서 `npm run collect`를 실행하면 notes에서 `oss`, `model`, `paper` 후보가 각각 1건 이상 확인된다.

- [x] **통합 검증 (2026-10-29)**
  - 게이트: vitest 43파일·371건 통과(Node 24). typecheck 통과. lint는 오류 0건이고, 경고 1건(`_contentRaw`)은 이전부터 있던 것이다.
  - 인수 조건: `npm run collect -- --dry-run`을 실제 피드로 실행했다(API 키 없이). 실패한 소스는 없었다. 신규 소스(`hf_models`·`arxiv_cs_ro`·`github_*`·로봇 매체 4개)가 모두 수집됐고, `github_trending`은 키워드 필터에서 5건이 빠졌다. `data/app.db`는 실행 전후 sha256이 같았다.

    | 형식 | 후보 | 풀 |
    |---|---|---|
    | 뉴스 | 220 | 112 |
    | 오픈소스 | 15 | 15 |
    | 모델 | 6 | 6 |
    | 논문 | 45 | 17 |
    | (Physical AI 소스) | 64 | 41 |

    후보 286건 중 150건이 풀에 들었다. 비뉴스는 풀에 38건(할당 33)이고 Physical AI는 41건(할당 17)이다. 기준선에서 회차당 비뉴스 후보는 약 36건, 모델은 0건이었는데, `oss`·`model`·`paper`가 모두 1건 이상이다. 로컬 DB가 배포 브랜치보다 뒤처져 있어 "신규" 수는 실제 회차보다 크게 잡힌다.
  - **검증 방식 (2026-10-30 사용자 결정):** Phase 3 인수 조건은 `--dry-run`으로 확정한다. 수집·dedup·풀 단계는 실제 `npm run collect`와 같은 코드를 지나고, 이 Phase는 선별·가공 단계를 바꾸지 않았기 때문이다. LLM 비용을 들이는 실제 1회 실행과 비용·게재 분포 확인은 Phase 4 검증(4-3)과 Phase 7 통합 검증에서 한다.
- 참고 (후속 Phase):
  - **Phase 4-1:** 오늘 풀 150건에서는 라운드로빈만으로도 할당을 넘겨, 할당은 아직 하한 역할만 한다. 병목은 여전히 선별 프롬프트다. `Candidate.format`이 준비돼 있으므로 `triageLine`에 형식 열을 넣으면 된다(기존 줄 형식 테스트도 바뀐다). 할당 미달 경고는 `picks.map(p => pool[p.index])`에 `poolMixNotes`와 같은 방식의 집계를 쓰면 된다.
  - **Phase 4-1 (HF 모델):** 트렌딩 목록에 GGUF·abliterated·Comfy 재포장 같은 파생 모델이 많다. `contentRaw`에 `base: 원본(관계)`가 있으므로, 이미 고른 모델의 재배포는 묶거나 건너뛰도록 지시한다.
  - **Phase 4-2:** `github_trending`의 `contentRaw`가 RSS의 README 발췌 대신 설명과 토픽뿐이다. 리포 요약 가이드는 짧은 입력을 전제로 쓴다.
  - **Phase 6:** 레이더 메타 줄에 쓸 값이 `engagement_json`에 쌓이기 시작했다: 리포 `stars`·`stars_today`·`language`, 모델 `likes`·`downloads`·`pipeline_tag`·`params`, 논문 `ups`. 검색 소스의 `publishedAt`은 `pushed_at`이고 `created_at`은 저장하지 않는다. "생성 후 스타" 표기가 필요하면 그때 추가한다.
  - **운영:** 첫 Actions 회차의 notes에서 `av_international`과 `robotics_automation_news`의 403 여부, `github_*`의 인증(`GITHUB_TOKEN`) 동작을 확인한다.

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

- [ ] `scripts/lib/baseline.ts`: 1면·화제 지표를 Phase 1 이후 동작(`getIssueArticles` → `buildEdition`)으로 측정하는 모드를 추가한다(Phase 1 참고 항목).
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
