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
- [x] **Phase 4** — LLM 선별·가공 프롬프트 개편 (2026-10-30 완료)
- [x] **Phase 5** — 1면 10건 편집 로직 (리드·서브·브리핑·레이더·화제) (2026-10-30 완료)
- [x] **Phase 6** — 디자인 고도화 (시안 → 구현) (2026-10-30 완료)
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

**Acceptance:** 로컬에서 `npm run collect -- --dry-run`(수집 → 선별 풀까지, LLM·DB 쓰기 없음)을 실행하면 notes에서 `oss`, `model`, `paper` 후보가 각각 1건 이상 확인된다. 처음 문구는 `npm run collect`였다. 2026-10-30 사용자 결정으로 dry-run으로 바꿨고, 실제 실행은 4-3과 Phase 7에서 한다.

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

- [x] 페르소나를 "AI **뉴스** 브리핑"에서 "AI 브리핑(뉴스·오픈소스·모델·연구)"으로 바꾼다.
  - ✅ 2026-10-30 선별 프롬프트를 전면 개정했다. 유저 메시지는 "오늘 후보 구성·오늘 할당 → 이미 보도함 → 오늘 후보" 3블록이다. 리포 발췌는 설명·토픽뿐이라 짧다는 점과, 모델 발췌(`작업 · 라이브러리 · 크기 · 라이선스 · base`)를 읽는 법도 적었다.
- [x] 입력 줄에 형식 열을 추가한다: `번호 | 형식 | 매체 | 날짜 | 화제 | 제목 | 발췌`.
  - ✅ 2026-10-30 형식 열은 `FORMAT_LABELS`(뉴스·오픈소스·모델·논문)를 쓴다. dry-run 미리보기 줄의 `[format]` 접두는 중복이라 뺐다.
- [x] 제외 목록의 "사소한 저장소·버전 업데이트"를 고친다. **주목할 리포·모델·논문은 적극적으로 고르고**, 제외하는 것은 단순 패치나 마이너 버전으로 좁힌다.
  - ✅ 2026-10-30 제외 대상은 "단순 버그 수정·마이너 버전 업데이트(패치 릴리스)"로 좁혔다. 형식별 선정 기준(리포: 새 기능·스타 급등·실용성 / 모델: 주목할 기관의 기반·오픈 웨이트 공개, 크기·벤치마크 / 논문: 새 방법·주목할 기관·뚜렷한 결과)을 넣었다.
  - **(추가) 파생 모델 규칙:** GGUF·AWQ 양자화, abliterated, ComfyUI 재포장, 단순 파인튜닝 사본은 원본이 후보에 있으면 원본 선정의 `duplicates`로 묶는다. 원본이 없으면 의미 있는 파생(주목할 기관의 공식 파인튜닝 등)만 고른다. 모델 공개 보도와 그 모델의 HF 페이지, 논문 보도와 논문 원문도 같은 사건으로 묶는다.
- [x] 할당 지침을 추가한다(후보가 있을 때).
  - 비뉴스(오픈소스·모델·논문) 8건 이상, 그중 각 형식 1건 이상
  - Physical AI 3건 이상
  - 중요도는 **형식 안에서** 상대 평가한다. 비뉴스가 뉴스와 경쟁해 밀려나지 않게 하려는 것이다.
  - ✅ 2026-10-30 할당 숫자의 단일 출처는 `PICK_QUOTAS`(triage.ts)다. `pickTargets(pool, maxPicks)`가 항목마다 min(할당, 풀의 해당 후보 수, maxPicks)를 계산해 유저 메시지의 "오늘 할당"에 넣는다. 그래서 LLM이 "후보가 있을 때"를 따로 판단하지 않고, 프롬프트와 코드의 숫자가 어긋나지 않는다. 목표가 0인 항목은 적지 않는다.
  - Physical AI는 매체와 상관없이 로봇·물리 세계가 주제인 후보로 정의했다(categories.md 요약). 할당은 그 형식 안에서 가장 나은 후보로 채우고, 제외 대상뿐일 때만 미달을 허용한다. 중요도 5는 형식을 통틀어 최대 2건, 4는 형식마다 6건 안팎이다.
- [x] **이틀에 걸친 같은 사건 중복을 막는다.** 최근 3개 호의 게재 제목(`title_ko`, 약 90줄)을 "이미 보도함" 목록으로 넣는다. 같은 사건이면 고르지 않고, 새로운 전개(후속 보도)일 때만 고른다.
  - ✅ 2026-10-30 `loadReportedHeadlines(db, 3)`: 공개 기사가 있는 최신 KST 호 날짜(`date(created_at, '+9 hours')`, `getEditionRefs`와 같은 관례) 3개의 `title_ko`를 호 최신순 → 중요도순으로 읽어 `MM-DD 제목` 한 줄씩 넣는다. 읽기 전용이라 dry-run에서도 돌고, notes에 `이미 보도함: 최근 3개 호 제목 N건`을 남긴다. 06:00 회차에는 직전 3개 호가 들어가고, 같은 날 수동 재실행이면 오늘 호도 들어간다(중복 방지에 맞는 동작).
  - 후속 보도로 인정하는 경우: 발표했던 모델의 실제 출시·가중치 공개, 새 수치·결정 공개, 사고·논란의 새 국면. 같은 내용을 다시 정리했거나 늦게 보도한 기사는 후속 보도가 아니다.
- [x] `MAX_PICKS_PER_RUN`을 30에서 35로, `TRIAGE_POOL_SIZE`를 150에서 180으로 바꾼다. 코드 기본값과 `collect.yml`의 vars를 함께 바꾼다.
  - ✅ 2026-10-30 `collect.ts` 기본값, `collect.yml` 주석(vars가 비면 코드 기본값을 쓴다), `.env.example`, CLAUDE.md 환경변수 표를 고쳤다. 선별 `max_tokens`는 1000 + 35×60 = 3,100이라 출력 근사 875토큰에 여유가 있다. **운영:** Actions에 `MAX_PICKS_PER_RUN`·`TRIAGE_POOL_SIZE` vars가 설정돼 있으면 그 값이 이기므로, 병합 전에 저장소 vars를 확인한다.
- [x] `resolvePicks` 이후 코드에서 할당 미달을 검사하고 `notes`에 경고로 남긴다. 강제로 채우지는 않는다.
  - ✅ 2026-10-30 `quotaShortfallNote`가 `할당 미달: 비뉴스 5/8, 모델 0/1, Physical AI 2/3` 꼴로 남긴다. 목표는 프롬프트와 같은 `pickTargets`라, 후보가 없어 줄어든 항목은 경고하지 않는다. Physical AI는 **가공된 분야**(`category === "physical"`)로 센다. 소스 `topic`은 일반 매체의 로봇 기사를 놓치기 때문이다. 가공되지 않은 선정만 소스 topic으로 대신 센다. 그래서 검사 위치는 가공 이후(persist 직전)다. `kpi baseline`의 notes 파싱이 영향을 받지 않는다는 점을 테스트로 고정했다.
  - **(추가) dry-run:** 오늘 할당과 선별 요청 추정 토큰·비용을 함께 출력한다.
  - 검증(2026-10-30): vitest 43파일·393건 통과(Node 24), typecheck 통과, lint 오류 0건. `npm run collect -- --dry-run` 결과는 `선별 풀: 후보 301건 중 180건`, `이미 보도함: 최근 3개 호 제목 84건`, `오늘 할당: 비뉴스 8(오픈소스 1·모델 1·논문 1), Physical AI 3`이다. 형식별 후보→풀은 뉴스 235→137, 오픈소스 15→15, 모델 6→6, 논문 45→22이고 Physical AI는 69→48이다. `data/app.db`의 sha256은 실행 전후 같았다.
  - 선별 입력은 약 10k에서 약 16k 토큰으로 는다(풀 +30줄 ≈ +1.8k, 형식 열 ≈ +0.65k, 이미 보도함 84줄 ≈ +2.1k, 시스템 프롬프트 ≈ +1.2k). 배치 단가로 선별 1회는 약 $0.0075에서 약 $0.011이 된다.

### 4-2. 가공 (`configs/prompts/enrich.system.md`, `enrich.fewshot.json`)

- [x] 분야 정의를 2-1 표와 경계 규칙으로 교체한다. Physical AI 우선 규칙을 명시한다.
  - ✅ 2026-10-30 분야 정의는 2-1에서 이미 `categories.md`(`{{CATEGORIES}}`)로 교체돼 있었고, 2-1 표의 포함 범위·경계 규칙과 일치하는지 대조했다. Physical AI 최우선 규칙은 `enrich.system.md`의 category 필드 설명에도 다시 적었다.
  - **경계 규칙 우선순위 정리(categories.md):** 제목을 "번호가 앞선 규칙이 우선"으로 바꾸고, 에이전트 규칙(2번)을 모델/저장소 규칙(3번)보다 앞에 뒀다. 이전 순서대로 적용하면 에이전트 프레임워크 저장소가 `oss`가 되는데, 2-3 재분류 결과(Dev Tools → agent 42건)와 맞지 않기 때문이다. 결과적인 우선순위는 **physical > agent > llm(모델 공개)·oss(그 밖의 저장소·도구) > research > industry**다. 로봇 제어 저장소·VLA 모델도 `physical`로 명시했다.
  - **(추가) 2-3의 애매한 사례를 규칙으로:** 클라우드·칩 공급 계약과 기업 간 제휴는 인프라를 다뤄도 `industry`, 보안 기능·사고는 대상의 분야(에이전트 보안 → `agent`, 보안 도구 → `oss`)를 따른다. 이 파일은 `db:reclassify`와 함께 쓰므로, 다음 재분류는 프롬프트 해시가 바뀌어 캐시 없이 다시 묻는다.
  - "형식과 분야" 절을 추가했다. 형식은 출처의 종류일 뿐 분야를 정하지 않는다(로봇 제어 저장소 → `physical`, 에이전트 프레임워크 저장소 → `agent`, 그 밖의 모델 → `llm`).
- [x] 형식별 요약 가이드를 추가한다.
  - 리포: 무엇을 하는가, 왜 주목받는가, 누가 쓰면 좋은가
  - 모델: 크기·라이선스·용도·벤치마크
  - 논문: 문제, 방법, 결과 한 줄
  - ✅ 2026-10-30 뉴스 가이드도 함께 넣었다. 리포 입력은 대개 설명·토픽뿐이라 "왜 주목받는가"는 근거가 입력에 있을 때만 쓰고, 입력에 없으면 '출시·공개'라고 단정하지 않는다. 모델은 메타 한 줄에 있는 항목만 쓰고 base 관계(quantized·finetune·adapter·merge)를 풀어 쓴다. 환각 금지 규칙에 "기능·성능·스타 수·출시 시점"을 명시했고, 입력이 적으면 요약을 1~2문장으로 줄여도 된다.
- [x] few-shot을 3건에서 6건으로 늘린다. Physical AI 뉴스, GitHub 리포, HF 모델을 추가한다.
  - ✅ 2026-10-30 추가한 3건은 모두 가상 사례다. Physical AI 뉴스(휴머노이드 기업 투자 → `physical`, Eka Robotics 오분류 사례의 본보기), GitHub 트렌딩 리포(설명 + topics만 있는 입력 → `oss`), HF 모델(메타 한 줄 입력 → `llm`)이다. 기존 LangChain 1.0 예시는 새 우선순위에 따라 `oss`에서 `agent`로 바꿨고, CoRAG 요약은 문제 → 방법 → 결과로 다시 썼다.
- [x] 가공 입력에 형식을 함께 전달한다(`enrich.ts`).
  - ✅ 2026-10-30 `EnrichInput.format`(필수)을 추가하고, `articleFields()` 한 곳에서 `[형식] 오픈소스` 줄을 만든다. few-shot도 같은 함수를 거쳐 실제 입력과 모양이 같다.
  - 시스템 프롬프트는 약 1.5k에서 약 2.7k 토큰으로 늘었다(대부분 few-shot 3건). 35건이면 묶음 4개라 회차당 약 +4.8k 입력 토큰, 배치 단가로 약 +$0.0024다.
  - 검증(2026-10-30): enrich 테스트 8 → 13건(형식 줄 위치, Physical AI 최우선·우선순위 문구, 형식 가이드, few-shot 6건이 4개 형식을 모두 다루고 스키마·`title_ko` 60자를 통과하는지). 전체 vitest 393건 통과.

### 4-3. 테스트·검증

- [x] `src/__tests__/triage*.test.ts`, `enrich.test.ts`: 입력 줄 포맷, 이미 보도한 목록 주입, 할당 경고 로직을 검증한다.
  - ✅ 2026-10-30 triage 15 → 48건(줄 형식, 메시지 블록 순서, 이미 보도함 주입·`already_reported` 제외, `pickTargets` 줄임, 할당 미달·초과, 논문 분야 쏠림, KST 호 경계), enrich 8 → 20건(형식 줄, `[토픽]` 분리, 형식 가이드, few-shot 6건 검증). 신규: `repeatCheck`(19건), `evalRun`·`triageCompare`(비교 도구), `cost`(문자 종류별 토큰 추정). 모든 신규 notes 문구가 `kpi baseline`의 notes 파싱에 영향이 없다는 점을 테스트로 고정했다. 전체 vitest 46파일·464건 통과(Node 24).
- [x] 같은 후보 풀로 개편 전후 선별을 비교한다(로컬에서 1회 실행, 일반 호출). 형식과 분야 분포를 기준선과 비교해 기록한다.
  - ✅ 2026-10-30 **검증 방식(사용자 결정):** DB에 쓰지 않는 비교 실행으로 한다. 이를 위해 도구를 만들었다.
    - `npm run collect -- --no-save`: 수집 → 선별 → 가공 → 재보도 검사를 실제로 돌리되 DB는 readonly로 연다. 결과는 `data/eval/run-<시각>.json` 스냅숏(git 제외)으로 남긴다.
    - `--db <path>`: dry-run·no-save 전용이다. 배포 브랜치 DB 사본을 열어 dedup과 이미 보도함이 실제와 같게 동작하게 한다. 알 수 없는 플래그는 오류로 처리해, 오타가 실제 회차로 흘러가지 않는다.
    - `npm run triage:compare -- <스냅숏> [--rev 096de4e] [--current] [--repeat-check <file>] [--known ids]`: 같은 풀로 개편 전(096de4e의 프롬프트·줄 형식·30건)과 현재 선별·가공을 다시 돌려 비교한다.
  - **풀:** 배포 브랜치 DB 사본 기준으로 후보 160건이 모두 풀에 들었다(뉴스 96, 오픈소스 13, 모델 6, 논문 45, Physical AI 소스 49). 이미 보도함은 79건이다. 그날 06:00 회차가 이미 반영된 DB라 풀은 앞 회차에서 상한에 잘린 잔여분과 새로 들어온 기사였다. 비교는 공정하지만, 06:00 실제 풀보다 품질이 낮고 Physical AI 비중(31%)이 높다.
  - **결과 (같은 풀 160건):**

    | 항목 | 개편 전 (096de4e) | 개편 후 v1 (4-1·4-2) | 보강 후 (최종) |
    |---|---|---|---|
    | 선정 | 26 | 35 | 25 |
    | 뉴스 / 오픈소스 / 모델 / 논문 | 19 / 2 / 0 / 5 | 18 / 7 / 0 / 10 | 12 / 4 / 1 / 8 |
    | 비뉴스 합계 (비율) | 7 (27%) | 17 (49%) | 13 (52%) |
    | Physical AI (가공 분야) | — (미가공, 소스 topic 6) | 15 (43%) | 8 (32%) |
    | 분야 LLM / 에이전트 / Physical / 오픈소스·도구 / 연구 / 산업 | — | 3 / 10 / 15 / 0 / 2 / 5 | 3 / 6 / 8 / 1 / 2 / 5 |
    | 할당 경고 | 비뉴스 7/8, 모델 0/1 | 모델 0/1, 초과 Physical AI 15/9 | 없음(논문 분야 쏠림 Physical AI 5/8) |
    | 이미 보도한 사건 재선정 (알려진 5건) | 4 | 5 | 선별 4 → 재보도 검사 후 0~1 |
    | 회차 비용 실지불 / 배치 환산 | — | $0.0879 / $0.0439 | $0.0864 / $0.0432 (재보도 검사 포함) |

    기준선(14개 호)에서 비뉴스 게재 비율은 5%(19/388), 모델은 0건이었다.
  - **v1에서 드러나 보강한 것** (`d0ef018` 외):
    - 이미 보도함: 선별의 프롬프트 지시만으로는 5건 중 1건만 걸렀다. 영문 후보 160여 줄과 한국어 제목 80줄을 한 번에 대조하는 일이 Haiku에게 무겁기 때문이다. ① 선별 출력에 `already_reported`(picks 앞)를 두고 `resolvePicks`가 코드로 뺀다(1차). ② **가공 후 재보도 검사(신규 LLM 단계, 사용자 결정):** 가공을 마친 선정의 한국어 제목·요약 첫 문장을 이미 보도함의 한국어 제목·요약 첫 문장과 대조한다. 출력은 `repeats`/`followups`에 `{id, reported, event}`로 짝을 지어 낸다. `event`(공통 사건을 "주체 + 대상·행위"로 짧게)를 쓰게 한 뒤 오탐이 3건에서 1건으로 줄었다. 빠진 기사와 그 묶음은 미선정 후보처럼 `seen_items`로 가고, 재심사 행은 지운다. 호출이 실패하면 전부 게재한다(fail-open). notes는 `재보도 제외 N건(후속 보도 유지 M건)`이다.
      - 재보도 검사 정확도: 알려진 재보도 9건(두 실행 합) 중 8건을 잡았다(제목만 넣었을 때 7건). 오탐은 1건(같은 회사의 다른 발표)으로, 제목만 넣었을 때의 2건보다 줄었다. 회차당 약 +4.5k 입력 토큰, 배치 기준 약 $0.007이다.
    - 모델 할당 0/1, Physical AI 쏠림: 할당 블록이 240줄 위에 있어 묻혔다. 후보 목록 뒤에 "출력 전 확인" 점검표를 두고, Physical AI 상한(`ceil(maxPicks/4)`, 35건 기준 9건)과 논문 분야 분산 규칙을 넣었다. 초과는 `할당 초과`, 논문 쏠림은 `논문 분야 쏠림` notes로 경고한다.
    - 오픈소스·도구 0건: 리포 7건이 모두 에이전트로 분류됐다. `categories.md` 2번 규칙을 "에이전트 **자체**일 때만"으로 좁혔다. 에이전트가 쓰거나 겨냥한 도구(보안 스캐너·방어 도구·미디어 엔진·인프라)는 `oss`로 간다. 재가공에서 CVEngine과 kinetograph가 agent에서 oss로 바뀌었다.
    - 토픽 환각: "Godot·Unity·Unreal을 지원한다"처럼 토픽 태그로 기능을 지어냈다. 가공 입력에서 `· topics:`를 떼어 `[토픽] … (분류·태그용 키워드 — 기능·지원 근거 아님)` 줄로 분리했다. 리포 6건을 재가공하니 3건에서 지어낸 문장이 사라졌고 1건은 일부 남았다.
    - 비용 가드 과소추정: `approxTokens`(글자 ÷ 2)가 한국어가 많은 입력을 12%가량 적게 셌다. 문자 종류별 가중(비ASCII 1.3, ASCII 영문·공백 0.175, 숫자·기호 1.55 토큰/자, count_tokens 실측 25개 구간으로 적합)과 구조화 출력 스키마 오버헤드를 반영해, 추정이 실제보다 3~7% 크게 나온다.
  - **지출:** 검증용 LLM 호출 합계는 일반 호출로 $0.256이다(v1 실행·개편 전 비교 $0.108, 보강 후 재실행 $0.072, 재보도 검사·리포 재가공 $0.047, 요약 대조 실험 $0.029). `data/app.db`는 모든 실행 전후 sha256이 같았다.

**Acceptance:** 한 회차 게재분에서 비뉴스 6건 이상, Physical AI 2건 이상(후보가 있을 때)이고, 비용은 $0.05 이하다.

- [x] **통합 검증 (2026-10-30)**
  - 인수 조건: 같은 풀에 최종 선별·가공을 적용한 결과는 **비뉴스 13건(≥ 6), Physical AI 8건(≥ 2, 가공 분야 기준)**이다. 비용은 배치 환산 **$0.0432(≤ $0.05)**이다(선별 $0.0136 + 가공 $0.0226 + 재보도 검사 약 $0.007). 재보도 검사로 빠지는 기사는 뉴스 위주라 비뉴스 수에는 영향이 없다.
  - 게이트: vitest 46파일·464건 통과(Node 24), typecheck 통과, lint 오류 0건(경고 1건 `_contentRaw`는 이전부터 있던 것), prettier 통과. `collect --dry-run --db <배포 DB 사본>`이 정상 동작한다.
  - 한계: 평가 풀이 06:00 실제 풀이 아니라 잔여분이고, 배치 실행이 아닌 일반 호출이다. 실제 배치 회차의 분포·비용·재보도 오탐률은 Phase 7에서 확인한다.
- 참고 (후속 Phase):
  - **운영(병합 전):** Actions 저장소 vars에 `MAX_PICKS_PER_RUN`·`TRIAGE_POOL_SIZE`가 설정돼 있으면 코드 기본값(35·180)보다 우선한다. 설정돼 있는지 확인한다. 회차당 LLM 호출이 4회에서 6회(선별 1, 가공 4, 재보도 검사 1)로 늘고, 배치 대기도 한 번 더 생긴다(`timeout-minutes: 75` 안).
  - **Phase 5:** 중요도는 형식 안에서 상대 평가하므로 리포·모델·논문도 5를 받을 수 있다(5는 형식을 통틀어 최대 2건). 1면 리드 슬롯은 뉴스 축에서 고르고 레이더는 비뉴스에서 고르는 식으로, 슬롯이 형식을 직접 보게 설계한다. 재보도 검사 뒤 게재는 20~30건으로 줄 수 있으므로, 1면 11건과 섹션 밴드가 채워지는지 Phase 7에서 함께 본다.
  - **Phase 6:** 리포 요약은 이제 설명 위주이고 토픽은 태그로만 쓰인다. 레이더 메타 줄은 `engagement_json`의 `stars`·`stars_today`·`language`, 모델 `params`·`pipeline_tag`, 논문 `ups`를 그대로 보여 준다.
  - **Phase 7:** 실제 배치 회차의 notes에서 `재보도 제외`, `할당 미달·초과`, `논문 분야 쏠림`이 나오는 빈도와 재보도 오탐(정상 기사가 빠졌는지)을 3~5회 확인한다. 오탐이 잦으면 재보도 검사만 Sonnet으로 돌리는 방안(배치 기준 회차당 약 $0.015)을 검토한다. 이틀 연속 중복 쌍은 기준선 9쌍(14개 호)과 비교한다.
  - **Phase 8 후보:** 재보도 검사의 `followups`(새 전개가 있는 후속 보도)가 이미 `{id, reported}` 짝을 낸다. "후속 보도 연결(`follow_up_of`)"은 이 결과를 저장만 하면 추가 호출 없이 만들 수 있다.

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

- [x] `EDITION_LIMITS`를 `{ seconds: 3, briefs: 3, radar: 4, trending: 5, sectionItems: 4 }`로 바꾼다.
  - ✅ 2026-10-30 `buildEdition`이 오늘 호 기사를 형식별로 나눠 리드 1·서브 3·오늘의 브리핑 3(뉴스)과 레이더 4(비뉴스)를 채운다. 리드+서브는 같은 분야 2건 이하로 고르고, 분야 3개를 덮지 못하면 겹친 서브 중 가장 낮은 순위를 다른 분야 뉴스로 바꾼다. 풀이 한 분야뿐이면 상한을 풀어 서브부터 채운다.
  - 리드·서브에 Physical AI가 없으면 중요도 3 이상 Physical AI 뉴스 1건을 브리핑에 먼저 넣는다. 레이더는 오픈소스·모델·논문 각 1위를 먼저 담고 남은 자리를 편집 순으로 채운다. 표시도 편집 순이다(형식별 고정 열은 형식이 빠진 날 의미가 무너진다). 뉴스가 0건인 호는 비뉴스 1위를 리드로 쓴다.
  - 1면 본문은 `frontArticles(edition)`(리드 → 서브 → 브리핑 → 레이더) 한 곳에서 센다. 공유 메타·OG는 그대로 리드+서브를 쓴다. `kpi baseline`의 1면 지표는 본문 전체를 세도록 바꿨다(누적 입력 근사 — Phase 7에서 재작업).
- [x] 슬롯이 부족하면 남는 슬롯을 다음 슬롯으로 넘기고, 다른 호의 기사로는 채우지 않는다. 뉴스가 7건 미만이면 브리핑을 줄이고, 비뉴스가 4건 미만이면 레이더를 줄인다(0건이면 레이더 띠를 숨긴다).
  - ✅ 2026-10-30 부족하면 슬롯만 줄고 뉴스·비뉴스가 서로의 자리를 채우지 않는다. 남는 기사는 섹션 밴드로 간다.
- [x] 섹션 밴드: 오늘 호 기사를 분야별로 최대 4건씩 보여 주며, 1면에 오른 기사는 제외한다. 오늘 기사가 없는 분야는 밴드를 숨기고 내비게이션에서도 뺀다. 섹션 헤더의 "전체 보기"로 누적 피드에 들어갈 수 있다.
  - ✅ 2026-10-30 1면 본문(지금 화제 제외)을 뺀다. 머리 건수는 "5건 · 1면 2건"처럼 호 전체 `count`와 `onFront`를 함께 보인다(사용자 결정). 남은 기사가 없는 분야는 밴드와 내비게이션에서 모두 뺀다.
- [x] **(추가) 기본 렌더 (사용자 결정: Phase 5에서 기본 렌더까지, Phase 6에서 시안으로 다듬는다)**
  - ✅ 2026-10-30 `StoryBrief`(md+ 키커·한 줄 세리프 헤드라인·바이라인 3열, 모바일 2줄), `StoryRadar`(형식 라벨 REPO·MODEL·PAPER는 잉크 1px 아웃라인, 헤드라인 3줄·요약 2줄, 날짜 없음), `RadarBand`(굵은 괘선 머리, lg 4열·md 2열·모바일 가로 스냅 약 1.5장)를 붙였다. 레이더 카드에 날짜를 빼서, 게시일이 며칠 지난 논문이 낡아 보이던 문제(Phase 1 참고)를 피했다.
  - 검증: 레이더 형식을 섞은 DB 사본으로 360·1280px, 라이트·다크를 확인했다. 가로 스크롤 0, 콘솔 오류 0이다. `/edition/[date]`도 같은 지면을 그린다. vitest 46파일·473건, typecheck, lint(기존 경고 1건), prettier가 통과한다.

### 5-2. 화제 지수 보강

- [x] `scripts/lib/trending.ts`: HF 모델(likes)과 GitHub Δstars 신호를 추가해 "지금 화제"가 HN에만 기대지 않게 한다.
  - ✅ 2026-10-30 likes(HF 모델)·stars_today(GitHub 트렌딩)는 Phase 3에서 더했다. 개편 전 호는 화제 지수가 0보다 큰 기사가 호당 평균 1.4건이었고, 10-29 평가 회차에는 10~12건(OSS 5~7건·논문 5건, HN 0건)이었다. 실측 점수는 HN 46~70, GitHub 트렌딩 59~67, 검색 저장소 8~26, HF 논문 12~22, arXiv 0~8이다.
  - HF 모델은 `publishedAt`이 생성 시각이라 트렌딩 목록에 처음 오른 날에도 실측 6건 모두 200~700시간이 지나 있었고, 최신성 하한 0.5에 걸려 18~20점에 그쳤다. likes 2,041 모델이 생성 7일 이내 335★ 저장소(23점)보다 낮았다. likes는 수집 시점의 "지금" 신호이므로 likes가 있는 항목은 감쇠하지 않게 했다. HF 모델은 35~40점이 되고 다른 소스 154건의 점수는 그대로다(vitest 46파일·466건 통과).
  - HF 논문(ups)도 게재일 기준으로 대개 0.5를 받는다. 다만 Reddit과 같은 칸이라 `trending.ts`에서는 가를 수 없어 그대로 둔다(어댑터에서 신호를 분리하는 일은 후속 과제).

### 5-3. 테스트

- [x] `edition.test.ts`에 다음을 추가한다: 슬롯 수, 분야 다양성 제약, Physical AI 우선 배정, 레이더 형식 혼합, 부족 시 축소, 레이더 0건일 때 숨김.
  - ✅ 2026-10-30 `edition.test.ts`에 슬롯 수, 분야 다양성(교체 대상·상한 완화·서브 5 상한), Physical AI 우선 배정, 레이더 형식 혼합, 부족 시 축소, 섹션 `count`·`onFront`, 뉴스 0건 호, 결정성 케이스 37건을 더했다(15 → 52건). 무작위 호 300개로 불변식을 검사하는 속성 테스트 1건도 포함한다. `edition.ts`를 6가지로 일부러 망가뜨려 보니 매번 테스트가 실패했다. 리드+서브 4건에서는 "분야 3개"가 곧 "분야당 2건 이하"라서, 상한 위반은 서브 5건 케이스에서만 잡힌다.
  - 레이더 0건 숨김과 브리핑 3행은 `FrontPage.test.tsx`(RTL, 3건)에서 렌더 수준으로 확인했다. `edition.ts`는 고칠 곳이 없었다.
- [x] `site.test.ts`: 공유 메타(리드·서브 기반)를 회귀 검증한다.
  - ✅ 2026-10-30 공유 메타가 리드·서브만 쓰고 브리핑·레이더·화제 1위 제목이 설명에 새지 않는지, 입력 순서와 무관한지, 비뉴스만 있는 호와 빈 호가 정상인지 5건으로 검증한다. `editionImage`는 `lead`와 `seconds.slice(0, 3)`만 읽어 새 구조와 충돌하지 않는다. vitest 47파일·518건, typecheck, lint(기존 경고 1건), prettier가 통과한다.

**Acceptance:** 오늘 호가 28~35건이면 1면 본문이 약 11건이고, 그중 비뉴스가 4건 가까이 된다. 모두 오늘 호 기사다.

- [x] **인수 조건 검증 (2026-10-30)**
  - 합성 30건 호(뉴스 22·비뉴스 8)는 1면 본문 11건, 그중 비뉴스 4건이며 모두 입력 기사다(테스트로 고정).
  - 10-29 평가 회차(Phase 4-3)의 선정·가공 결과를 그대로 넣었다. 35건(재보도 제외 후 30건)과 현재 rev 25건(재보도 제외 후 21건) 모두 1면 11건·비뉴스 4건이고, 리드+서브는 분야 3개를 덮는다. 35건 회차는 모델 형식이 없어 레이더가 저장소 2·논문 2로 찬다. 그 회차의 지금 화제 5건은 HN 점수가 0이라 모두 오픈소스·논문이었다.
  - 한계: 35건 회차는 Physical AI 선정이 15건이라 1면 11건 중 4~5건이 Physical AI였다. 리드+서브는 분야당 2건으로 막히지만 브리핑에는 분야 상한이 없다. 현재 rev(Physical AI 상한 9건)에서는 이 쏠림이 줄었으며, Phase 7 실제 배치 회차에서 다시 본다. 반복되면 브리핑에도 분야당 1건 상한을 둔다.

- 참고 (후속 Phase):
  - **Phase 6 (`cn()` 글자 크기 버그):** `twMerge`가 커스텀 크기 토큰(`text-meta`·`text-label` 등)을 색상 클래스로 읽는다. 색상 클래스와 함께 넘기면 크기가 빠지므로, `CategoryKicker`·`Byline`이 사이트 전체에서 13px 대신 상속 크기로 그려진다. `StoryEntry`의 `className="text-label"`은 키커의 코발트를 지워, 전체 기사 색인 키커가 잉크색이다. `extendTailwindMerge`에 크기 토큰을 font-size 그룹으로 등록하면 고쳐지지만, 키커·바이라인 크기가 사이트 전체에서 바뀌므로 시안 단계에서 함께 정한다.
  - **Phase 6:** 모바일 브리핑 행이 100~124px로 높다. 키커와 바이라인을 한 줄로 합치는 안을 검토한다. 레이더 형식 라벨은 `FormatBadge`로 교체하면서 스크린리더용 한국어 이름(저장소·모델·논문)을 붙인다.
  - Physical AI 우선 배정은 리드·서브만 본다. 레이더에 로보틱스 논문이 있어도 브리핑에 Physical AI 뉴스를 1건 확보한다(뉴스 축에 분야를 보장하려는 의도).

---

## Phase 6: 디자인 고도화

**목표:** 늘어난 1면과 새 축(형식, Physical AI)을 에디토리얼 톤 그대로 세련되게 담는다.
**의존성:** Phase 5 (마크업), 시안은 Phase 2부터 병행 가능

### 6-1. 시안

- [x] `docs/design/mockups/`에 데스크톱·모바일·다크 시안 HTML을 만든다. 1면 전체(리드, 서브, 브리핑, 레이더, 화제)와 형식 배지가 대상이다. 사용자 리뷰를 받은 뒤 구현한다.
  - ✅ 2026-10-30 `docs/design/mockups/front-v3.html`(목록 `index.html` 맨 위 카드). 툴바와 URL 파라미터로 테마, 데스크톱 1280/모바일 360(폰 3대), 발행 정상/지연, `cn()` 버그 전후를 바꿔 볼 수 있고, `?bare=1`이면 지면만 보인다. 1280·768·360px, 라이트·다크에서 가로 스크롤은 없다. 실제 10-29 평가 회차 기사로 채웠다.
  - **사용자 확정(검토 포인트 14개 모두 추천안 채택):** ① 이번 호 통계는 제호 옆 '귀'에 둔다("이번 호 30건 · 매체 14곳 / 뉴스 22 · 오픈소스 3 · 모델 2 · 논문 3", 모바일은 제호 아래 2줄). 태그라인은 푸터와 공유 메타로 옮긴다. ② 발행 지연 안내는 날짜 줄 아래 헤어라인 사이 한 줄로 넣고, 라벨은 "최신 호", "발행 전"(1일), "발행 지연"(2일 이상) 순으로 바뀐다. ③ 섹션 내비에는 건수를 넣지 않는다. ④·⑤ 데스크톱 브리핑은 [키커 | 한 줄 제목 | 바이라인] 약 48px로 한다. 모바일은 헤드라인 다음에 메타 한 줄(키커가 바이라인으로 들어간다)을 두어 132px에서 83px로 줄인다. ⑥ 지금 화제의 비뉴스 행은 매체명 대신 형식 배지를 단다. ⑦ 데스크톱 사이드바 화제 아래에 '이 호의 지면' 박스(분야별 건수와 1면 건수, 점선 리더, 섹션 앵커)를 두고 모바일에서는 숨긴다. ⑧ 레이더 카드 머리는 배지와 분야 키커로 하고, 메타는 카드 하단 헤어라인 위에 정렬한다. ⑨ 스타 증가는 "오늘 +1,190"으로 쓰고, ★♥↓▲는 인라인 SVG로 그린다(모바일에서 이모지로 바뀌는 것을 막는다). ⑩ 빠진 데이터는 그 조각만 뺀다. ⑪ `FormatBadge`는 10.5px 신규 `text-badge` 토큰으로 6곳에 쓰고, 스크린리더는 저장소·모델·논문으로 읽는다. ⑫ 모바일 레이더 카드 폭은 64%로 한다. ⑬ Physical AI도 다른 분야와 같이 다룬다. ⑭ `cn()` 버그를 고쳐 키커·바이라인을 13px로 맞춘다.

### 6-2. 구성요소

- [x] **레이더 띠** (`Edition.tsx`에 `RadarBand` 추가)
  - 굵은 괘선 아래 "오픈소스·논문 레이더" 머리와 4열 그리드를 둔다. 모바일에서는 가로 스크롤 스냅으로 한 장 반이 보이게 한다.
  - 카드마다 형식별 메타 줄을 둔다.
    - 리포: `owner/repo`, ★ 스타(+Δ), 언어
    - 모델: 파라미터·태스크(`pipeline_tag`), ♥ likes, ↓ downloads
    - 논문: 기관·arXiv ID, ▲ upvotes
  - 수치는 `tabular-nums`로 정렬한다.
  - ✅ 2026-10-30 카드 머리는 `FormatBadge`와 분야 키커(결정 ⑧)이고, 그 아래 세리프 제목 3줄과 요약 2줄을 둔다. 메타 레일은 카드 하단 헤어라인 위에 두어 4장이 표처럼 맞는다. 첫 줄은 식별자(`owner/repo`·모델 id·arXiv ID), 둘째 줄은 수치(★·"오늘 +1,190"·언어 / 파라미터·태스크·♥·↓ / ▲·"인용 N")다. 아이콘은 11px 인라인 SVG(`aria-hidden`)이고 스크린리더는 `label`을 읽는다. 수치는 `tabular-nums`로 쓰고, 1만 미만은 쉼표로 표기한다. 데이터가 빠지면 `radarMetaBlock()`이 대체 순서(수치 없음 → 식별자만, 모두 없음 → 매체명)를 적용한다. 모바일은 카드 폭 64% 가로 스냅이다. sr-only 텍스트가 스크롤러를 벗어나 페이지가 845px로 넓어지던 문제는 `relative`로 막았다.
- [x] **오늘의 브리핑** (`StoryBrief` 변형 추가): 한 줄 헤드라인, 키커, 매체, 상대 시각, 중요도 도트로 구성한 3행 리스트다. 서브 그리드 아래에 가는 괘선으로 구분한다.
  - ✅ 2026-10-30 데스크톱 행은 [키커 7.5rem | 16px 세리프 한 줄 | 매체·시각·도트]로 실측 50px이다. 모바일은 헤드라인(≤2줄) 다음에 메타 한 줄(키커가 바이라인 앞으로 들어간다)을 두어 1줄 62px, 2줄 83px이고 `min-h-11`이다. 메타 줄이 넘치면 끝을 자른다.
- [x] **형식 배지** (`ArticleMeta.tsx`에 `FormatBadge` 추가): `REPO`·`MODEL`·`PAPER`를 스몰캡(small caps), 잉크 1px 아웃라인, 코발트 없이 표시한다. 강조색이 하나라는 원칙을 지키려는 것이다. 뉴스에는 배지를 붙이지 않는다. 1면, 섹션, 색인, 상세, 검색 결과에 공통으로 적용한다.
  - ✅ 2026-10-30 새 `text-badge`(10.5px) 토큰을 쓰고, 17px 높이·잉크 1px·각진 모서리이며 코발트는 쓰지 않는다. 대문자는 `aria-hidden`으로 숨기고 sr-only로 "저장소·모델·논문"을 읽힌다. 레이더, 지금 화제, 섹션 바이라인(`Byline showFormat`), 색인·검색·상세 "다른 기사"(`StoryEntry`), 상세 헤더 6곳에 적용했다. **`cn()` 버그 수정:** `extendTailwindMerge`에 `FONT_SIZE_TOKENS`를 font-size 그룹으로 등록했고, globals.css의 `--text-*`와 같은지 테스트로 고정했다. 키커와 바이라인은 13px, 색인 키커는 12px 코발트로 돌아왔다. 영향: FilterBar 칩 13px, 정렬 탭과 HeaderNav 14px.
- [x] **Physical AI 키커**: 다른 분야와 같은 코발트 키커를 쓰고, 마스트헤드 섹션 내비게이션 순서는 `1면 · LLM · 에이전트 · Physical AI · 오픈소스·도구 · 연구·논문 · 산업·정책 · 전체 기사`로 한다.
  - ✅ 2026-10-30 분야 순서는 `CATEGORIES`(llm·agent·physical·oss·research·industry) 하나로 정한다. 섹션 내비, 섹션 밴드, '이 호의 지면'이 모두 이 순서를 따른다. 내비에는 건수를 넣지 않고(결정 ③), 밴드가 없는 분야는 빼며, 모바일 내비는 자체 가로 스크롤(탭 높이 45.7px)이다. Physical AI는 다른 분야와 같은 코발트 키커를 쓴다.
- [x] **마스트헤드**: 호 기준 통계(Phase 1)를 쓰고, 발행 지연 안내 줄 스타일을 정한다.
  - ✅ 2026-10-30 폴리오(날짜·`제N호`·발행 시각·공유) 아래 제호 옆 '귀'에 이번 호 통계를 둔다. "이번 호 30건 · 매체 14곳"(세리프 34px 숫자)과 형식 구성 "뉴스 22 · 논문 3"이다. 계산은 `issueStats()`(`edition.ts`)가 하며, 0건인 형식은 뺀다. 모바일은 제호 아래 2줄이다. 태그라인은 푸터로 옮겼다. 발행 지연 안내는 `issueDelayCopy()`가 만들고, 헤어라인 사이 한 줄로 "발행 전"(1일) 또는 "발행 지연"(2일 이상) 라벨과 문구를 보인다. 모바일은 짧은 문구다. 하이드레이션 안전 구조(서버 `initialGap` → 마운트 후 재계산)는 그대로다. Playwright 고정 시계로 정상·1일·3일 상태를 360~1536px, 라이트·다크에서 확인했다.
- [x] **지금 화제**: 5건으로 줄이고 출처 아이콘 대신 형식 배지를 쓴다. 화제 바는 유지한다.
  - ✅ 2026-10-30 화제 5건이며, 비뉴스 행은 매체명 대신 형식 배지를 단다. 화제 바(0–100 고정 축)와 상위 3위 코발트는 유지한다. **(추가, 결정 ⑦)** 데스크톱(lg 이상) 사이드바 화제 아래에 '이 호의 지면' 박스를 둔다(`issueContents()`: 분야별 호 건수와 1면 건수, 점선 리더, 섹션 앵커. 밴드가 없는 분야는 `#front`로 보낸다).
- [x] **OG 이미지** (`src/lib/ogImage.tsx`): 기본 썸네일의 분야 목록을 새 6분야로 바꾸고, 호 썸네일에 "오늘 N건"을 넣는다.
  - ✅ 2026-10-30 기본 썸네일의 분야 목록은 `CATEGORIES` 순서로 만든다. 분야명에 "·"가 들어 있어 경계가 헷갈리므로 사이에 헤어라인 세로 구분선을 넣었다. 호 썸네일은 키커 줄 오른쪽에 **"오늘 N건"**(잉크 볼드)과 형식 구성("뉴스 27 · 오픈소스 3 · 모델 2 · 논문 3", 0건인 형식은 생략하고 모두 뉴스이면 생략)을 둔다. N은 마스트헤드와 같은 `edition.issue` 기준이며, 새 헬퍼는 `formatMix()`다. 기사 썸네일에는 비뉴스 기사에만 REPO·MODEL·PAPER 배지를 붙인다(잉크 아웃라인. 축소 표시를 고려해 2px). 폰트는 서브셋이 아닌 전체 TTF라 글리프가 빠지지 않는다. `ogImage.test.ts`에 `formatMix` 3건을 더했다.

### 6-3. 품질

- [x ] 반응형은 360, 768, 1280, 1536px에서 확인한다.
  - ✅ 2026-10-30 `/`, `/edition/<날짜>`, 상세(REPO·뉴스), 검색, `?category=physical`을 360·768·1280·1536px, 라이트·다크 48조합으로 확인했다. 가로 스크롤·콘솔 오류·텍스트 잘림이 모두 0이다(시드 DB 사본 사용, 실제 `app.db`는 수정하지 않았다). 고친 것: ① 레이더 메타 레일이 1024px·모바일에서 수치 줄바꿈 때문에 20~22px 어긋나던 것을 카드별 2행 subgrid로 고쳐, 모든 폭에서 헤어라인 높이가 같다. ② 모바일 브리핑 메타 줄이 키커나 마지막 도트까지 자르던 것을 매체명만 말줄임하게 했다(`Byline truncateSource`, 320px에서도 키커 유지). ③ FilterBar 정렬 탭 15px, 모바일 리드문 17px로 시안과 맞췄다. 정적 빌드(`npm run build`)는 성공한다. `out/`에 edition OG 23장, 기사 OG 190장, 기본 OG가 생기고, basePath 아래 주요 경로가 모두 200이다.
- [x ] 다크 모드와 44px 터치 타깃을 확인한다.
  - ✅ 2026-10-30 다크에서 배지, 괘선, 메타, SVG 아이콘이 모두 보인다. 44px에 못 미치던 모바일 링크(워드마크 28px, 마스트헤드 날짜 18px, "이 분야 전체 기사 →" 18px, 푸터 22px, 상세 "전체 보기", 지난 호 "오늘의 지면 보기", "필터 모두 해제")는 음수 마진과 `min-h`로 히트 영역만 44px로 넓혀 화면 배치는 그대로다. "1면" 탭(폭 28px)과 푸터 "검색"(폭 24px)은 WCAG 2.5.8의 24px 기준을 넘어 그대로 둔다.
- [x ] 접근성 대비(배지·메타 텍스트)가 WCAG AA를 충족하는지 확인한다.
  - ✅ 2026-10-30 토큰으로 대비를 계산했다(라이트/다크). 배지 텍스트·테두리 16.56/15.67, `foreground-soft` 9.99/9.80, `muted-foreground` 5.05/5.86(`muted` 배경 4.61/5.10), 코발트 키커 6.43/8.01로 모두 통과다. 중요도 빈칸 테두리는 라이트에서 2.82로 비텍스트 3:1에 못 미쳐, 불투명도를 70%에서 80%로 올렸다(3.39).
- [x ] `DESIGN.md`에 다음을 반영한다: 분야 코드표(PHY·OSS 추가, DEV·OPS 삭제), 형식 배지, 레이더·브리핑 컴포넌트 명세.
  - ✅ 2026-10-30 DESIGN.md를 v2.1로 올렸다. 변경 이력에 시안 `front-v3.html` 링크를 달았다. §3 정보 구조에는 1면 슬롯표, 귀, 발행 지연 줄, 내비 순서를 새로 썼다. §4에는 분야 키·표시명·코드(LLM·AGT·PHY·OSS·RES·BIZ, DEV·OPS는 폐기)와 형식 맵을 넣었다. §5에는 FormatBadge·StoryBrief·RadarBand/StoryRadar 명세와 메타 레일 표를 더했다. §6 레이아웃, §8 접근성(배지 SR, sr-only 라벨, `relative` 컨테이닝 박스), §9 신호표도 고쳤다. §10에는 `cn()`/`FONT_SIZE_TOKENS` 동기화 규칙을 적었다(`utils.test.ts`가 강제한다). CLAUDE.md의 낡은 기술(Masthead·Edition·Story 변형 수, `CATEGORIES` 위치, 디렉터리 트리)은 Phase 7 문서 갱신에서 고친다.

**Acceptance:** Playwright로 데스크톱·모바일·다크 스크린샷을 찍어 시안과 비교했을 때 레이아웃이 깨지거나 가로 스크롤이 생기지 않는다.

- [x] **인수 조건 검증 (2026-10-30)**
  - 1280px·360px에서 앱과 시안 `front-v3.html`을 나란히 찍어 비교했다. 마스트헤드 귀, 지연 줄, 내비, 1면 리드·서브·브리핑, 지금 화제, '이 호의 지면', 레이더, 섹션 밴드, 색인이 시안과 같다. 5개 경로 × 4개 폭 × 2개 테마 48조합에서 가로 스크롤이 0이다. vitest 50파일·589건, typecheck, lint(기존 경고 1건), prettier가 통과한다.
  - 남은 과제(Phase 6 범위 밖, 기존부터 있던 문제): 서로 다른 소스 id가 `shortSourceName`에서 같은 축약명이 되어 매체 필터 칩이 중복된다(Hacker News·HuggingFace·Google News). 여러 줄로 감긴 FilterBar 행의 라벨은 세로 가운데 정렬로 남아 있다.
  - ✅ 2026-10-31 두 과제 해결. ① 매체 칩을 축약명 단위로 묶는다(`groupSources`, `src/lib/feedFilter.ts`). 칩은 매체당 하나이고 `?source=`에는 기사가 가장 많은 피드의 id를 싣는다. 묶음의 다른 id로 들어온 옛 링크도 같은 칩이 활성으로 보이고 그 매체의 모든 피드가 걸린다. 필터 결과 머리, 전체 기사 머리의 "매체 N곳", 마스트헤드 귀(`issueStats`)도 같은 단위로 센다. HF 논문·모델은 한 매체("HuggingFace")로 묶는다. 바이라인이 이미 둘 다 "HuggingFace"로 적고, 형식 구분은 형식 배지가 맡기 때문이다. 현재 DB 기준 매체 칩은 30개에서 28개로 줄었다. ② FilterBar 행을 md 이상에서 `items-baseline`으로 바꿔, 라벨이 첫 줄 칩 글자와 같은 기준선에 놓인다. 1280px에서 라벨과 첫 칩의 글자 기준선 차이는 56px(매체 행)에서 0px로 줄었다. 모바일 시트는 라벨이 칩 위에 쌓이는 구조라 바뀐 것이 없다.

---

## Phase 7: 통합 검증·문서 갱신

**의존성:** Phase 1~6

- [x] `scripts/lib/baseline.ts`: 1면·화제 지표를 Phase 1 이후 동작(`getIssueArticles` → `buildEdition`)으로 측정하는 모드를 추가한다(Phase 1 참고 항목).
  - ✅ 2026-10-31 사용법: `npm run kpi -- baseline [days=14] [--front issue|legacy] [--since YYYY-MM-DD]`. 기본은 `issue`(그 호 기사만으로 1면을 구성하는 실제 동작)이고, `legacy`는 마감 전 누적 기사로 옛 1면을 근사한다. `--since`는 배포 뒤 회차만 재는 데 쓴다.
  - 출력 맨 앞에 아래 "목표 지표" 표와 행이 1:1로 맞는 **"목표 지표 (Phase 7)"** 표를 둔다. 새 지표는 1면 본문 수(리드·서브·브리핑·레이더 슬롯별), 레이더 건수, 회차당 비뉴스 게재, Physical AI 세 기준(**가공 분야**·키워드(기준선 방식)·소스 topic(notes))과 "1면 Physical AI ≥ 1" 호 수, 회차 notes 경고(재보도 제외 건수·재보도 검사 실패·할당 미달·할당 초과·논문 분야 쏠림)다. Phase 3-5에서 미룬 Physical AI 기준 구분을 여기서 했다.
  - 현재 DB(10-12~10-25, 개편 전 회차)의 issue 모드: 1면 오늘 호 비율 **100%**(117/117), 1면 본문 평균 8.4건(7~11, 레이더 평균 1.4), 지금 화제 오늘 호 100%(20/20). 비뉴스·비용·중복 등 나머지 지표는 기준선과 같다. 1면이 11건에 못 미치는 것은 개편 전 회차에 비뉴스가 적어 레이더가 줄기 때문이다.
  - **legacy 모드는 기준선 숫자를 재현하지 못한다:** 지금의 5슬롯 `buildEdition`에 누적 입력을 넣는 근사라 1면 오늘 호 비율이 23%(36/154)로 나온다(기록값 52%는 4슬롯 시절). 측정 방식만 같으므로 "기준선 기록" 표는 Phase 1 이전 측정값으로 그대로 둔다.
  - 게이트: vitest 50파일·597건(baseline 22건) 통과(Node 24), typecheck 통과, lint 오류 0건, prettier 통과. `data/app.db`는 실행 전후 sha256이 같다.
- [x] `npm run lint && npm run typecheck && npm test`가 통과한다. DB 테스트는 Node 24 PATH에서 실행한다.
  - ✅ 2026-10-31 최종 코드(203b401: 재보도 검사 수정·브리핑 상한·매체 칩 포함) 기준으로 vitest 52파일·641건 통과(Node 24.13), typecheck 통과, lint 오류 0건(경고 1건 `_contentRaw`는 이전부터 있던 것)이다. `format:check`는 코드(`src`·`scripts`·`configs`)에서 실패 0건이다. 문서·시안 HTML 10개(이 문서, `PRD-github-pages.md`, `docs/design/mockups/*` 등)는 처음 커밋할 때부터 prettier 형식이 아니었고, 이번 작업과는 무관하다. CI(`deploy.yml`)는 Node 22와 새 `npm ci`로 빌드한다.
- [x] 로컬에서 `npm run collect`를 1회 실행해 비용, 형식·분야 분포, 할당 경고를 확인한다.
  - ✅ 2026-10-31 **방식(사용자 결정):** 배포 브랜치를 병합해 최신 DB를 받고(`app.db`는 배포 쪽 채택), 마이그레이션을 다시 적용한 뒤 `collect --no-save`를 **Batches API**로 1회 돌렸다. DB 쓰기 없이 실제 배치 비용과 분포를 본다.
  - **병합 + 마이그레이션 재적용:** 배포 DB의 1,146건이 모두 구 분야값이었다. 이 브랜치에서 이미 재분류한 997건은 id·dedup_key·url이 일치해 분야만 복사했다. 새 회차분(10-26~10-31 호) 149건만 `db:reclassify --only-legacy`로 다시 분류했다. 비용은 **$0.022**(배치)이고, 규칙 매핑과 다른 분류는 47건, Physical AI로 옮겨진 것은 13건이다(Digit/GXO, Bedrock Robotics, PDRVLA 등). `db:init`이 `sources.format`을 추가했고 소스를 동기화했다(추가 10, 갱신 8, `reddit_*` 8개 삭제). 확인 결과 `integrity_check`는 ok이고, 공개 기사의 분야는 6개 키뿐이다(industry 359, agent 227, oss 169, research 146, llm 145, physical 100). FTS는 1,146행이다.
  - **배치 회차(no-save):** LLM 호출 5회(선별 1, 가공 3, 재보도 검사 1), 토큰 59,694/5,586이고 비용은 **$0.0438**이다(선별 $0.0138, 가공 $0.0231, 재보도 검사 $0.0070). 일반 호출로 대체된 요청은 없다. 수집 731건이 dedup 뒤 173건이 되었고, 풀 상한 180에 걸리지 않아 모두 풀에 들었다. 이미 보도함은 78건이다.
    - 형식별 후보 → 게재: 뉴스 109 → 14, 오픈소스 13 → 3, 모델 6 → 1, 논문 45 → 10이다. Physical AI(소스 topic)는 49 → 7이다. 선별은 28건을 골라 같은 사건 2쌍을 묶었고, 이미 보도한 8건을 뺐다.
    - 재보도 검사 뒤 **최종 게재는 22건**이다. 형식별로 뉴스 8, 오픈소스 3, 모델 1, 논문 10(**비뉴스 14건**)이고, 분야별로 physical 10, agent 5, llm 1, oss 2, research 2, industry 2다. notes 경고는 `할당 초과: Physical AI 10/9` 하나이고, 할당 미달과 논문 분야 쏠림은 없다.
    - 소스: 실패 0건. `av_international`(8건)과 `robotics_automation_news`(15건)는 403 없이 수집됐고, `github_*`도 인증 오류가 없었다. 0건인 소스는 `nvidia_dev_robotics`, `gnews_vla`, `ahead_of_ai`, `anthropic_news`다.
    - 1면 시뮬레이션(`buildEdition`, 게재 22건): 리드 1, 서브 3, 브리핑 3, 레이더 4, 화제 5로 **본문 11건, 그중 비뉴스 4건**이다.
  - **발견한 결함 (배포 전 수정, 아래 추가 항목):**
    - ① **재보도 검사 오탐:** 6건을 뺐는데 5건이 오탐이었다. 같은 회사이거나 "투자"·"수학" 같은 단어 하나만 겹쳐도 같은 사건으로 판정했다. 예: OpenAI 110억 달러 유치 ↔ OpenAI 지원 스라이브홀딩스 ADT 인수, 구글 AI 모드 검색 수익 감소 ↔ 방미통위 인앱결제 과징금, MS 자발적 퇴직 ↔ 코히어 투자 유치. 이 때문에 중요도 5인 뉴스 2건을 포함해 이 호에서 가장 강한 뉴스들이 빠졌고, 리드가 중요도 4 기사로 내려갔다. 진짜 재보도는 "구글 우주 위성 TPU 추론" 1건이다. Phase 4-3의 오탐률(1/9)보다 훨씬 나쁘다.
    - ② **브리핑 한 분야 쏠림:** 실제 결과에서는 브리핑 3건이 모두 Physical AI였다. 오탐 5건을 살린 반사실 시뮬레이션에서는 3건이 모두 산업·정책이었고, 그중 1건은 리드와 같은 사건의 두 번째 보도였다. Phase 5 "한계"가 예고한 문제다.
    - 그 밖에 선별이 같은 사건(OpenAI 투자 유치의 HN 보도와 일반 기사)을 묶지 못했다.
  - 참고 `kpi -- baseline 7`(옛 파이프라인 10-25~10-31 호, 배포 직전 기준선): 1면 오늘 호 100%, 1면 본문 평균 7.9건, 레이더 0.9건, 비뉴스 0.9건, Physical AI(가공 분야) 2.0건, 이틀 연속 중복 1쌍, 회차 비용 평균 $0.0261. 스냅숏은 `data/eval/run-2026-10-31T11-58-28-809Z.json`(git 제외)이다.
- [x] `npm run build`(정적 export) 후 `basePath` 아래 홈, `/edition/<오늘>`, 지난 호, `?category=physical`, 검색이 정상인지 확인한다.
  - ✅ 2026-10-31 병합·마이그레이션한 DB(최신 호 10-31, 제137호)로 빌드에 성공했다. `out/`에는 HTML 1,179개(기사 1,146, 호 29), OG 이미지(기사 176, 호 29, 기본 1)가 생겼고 `admin/`·`api/`는 없다. prebuild의 `initDb --existing`은 "변경 없음"이었고 `data/app.db`의 sha256은 빌드 전후 같다.
    - 경로(`/global-ai-news/` 아래 로컬 서빙): 홈, `/edition/2026-10-31/`, 지난 호(`10-27`, `06-07`), `?category=physical`(필터 결과 100건 = DB 100건), `/search/?q=휴머노이드`(20건 = DB LIKE 20건), REPO·PAPER 기사 상세, OG 3종, `search-index.json`·`latest.json`·파비콘이 모두 200이다. `/admin/`과 `/api/health/`는 404다(의도대로).
    - 브라우저(7개 페이지 × 360·1280px × 라이트·다크): 콘솔 오류·하이드레이션 경고·실패 요청이 0건이고 가로 스크롤도 0이다. 매체 칩 중복은 없다(28개). 매체 필터와 모바일 필터 시트도 동작한다. 10-31 호는 옛 파이프라인이 만든 호라 비뉴스가 1건뿐이어서, 레이더 1장·지금 화제 2건으로 그려진다.
    - 디자인 점검에서 나온 지적은 아래 "(추가) 배포 전 지면 다듬기"에서 처리한다.
- [ ] 배포 후 3일간 KPI를 관찰해 하단 "목표 지표" 표에 기록한다.
- [ ] 문서를 갱신한다: `CLAUDE.md`(카테고리, 형식, 1면 구성), `docs/PRD.md` 카테고리 절, `DESIGN.md`, 이 문서의 체크박스.
  - ✅ 2026-10-31 1차(코드 대조): **CLAUDE.md**는 낡은 "(전환 후)/(예정)" 배너를 실제 배포 구조(`PHASE_PRODUCTION_BUILD`·`*.local.ts(x)` 게이팅)로 바꾸고, 디렉터리 트리를 실제 파일로 다시 그렸다. 호·1면 구성(리드·서브·브리핑·레이더·화제·'이 호의 지면'), 분야 6개 표·경계 우선순위·형식 축, 선별 할당·이미 보도함·재보도 검사, 새 명령(`collect --dry-run/--no-save/--db`, `triage:compare`, `db:reclassify`, `kpi -- baseline`)을 반영했다. 쓰지 않는 `STATIC_EXPORT`와 `npm run start`(정적 export에서는 동작하지 않음)는 뺐다. **docs/PRD.md**는 v1.1로 올려 §3.3 분야·형식, §3.5 호 단위 1면, §5 `sources.format`, §7.3 분류 체계를 고쳤다. **DESIGN.md**는 v2.1이 코드와 일치해 변경하지 않았다.
  - **(추가, 계획에 없던 낡은 문서):** README.md가 Vercel·ISR·Reddit 21개 소스 시절 그대로여서 GitHub Pages 배포, 지면 구성, 실제 소스 목록(47개 등록·43개 활성, 형식별), 환경 변수, 명령을 다시 썼다. `.env.example`에서 쓰지 않는 `STATIC_EXPORT`를 지우고 `GITHUB_BRANCH` 기본값을 코드와 같은 `deploy/github-pages`로 고쳤다. `docs/WORK-PLAN.md`(Vercel 전제)와 `docs/PRD-github-pages.md`(채택되지 않은 `STATIC_EXPORT` 안)에는 머리에 대체 안내를 달았다.
  - 남은 것: Dockerfile·docker-compose는 더 이상 생기지 않는 `.next/standalone`을 복사해 동작하지 않는다(CLAUDE.md에 명시, 정리 여부는 별도 결정). 이 문서의 체크박스와 CLAUDE.md "Phase 7 진행 중" 문구는 마지막 항목을 마친 뒤 갱신한다.

- [x] **(추가) 재보도 검사 오탐 수정 (배포 차단 결함):** 항목 3 결함 ①을 고쳤다.
  - ✅ 2026-10-31 **코드 확인 단계** `confirmRepeats`(`scripts/lib/repeatCheck.ts`)를 추가했다. LLM의 재보도 판정마다 오늘 제목+요약 첫 문장과 이미 보도함 쪽 같은 텍스트를 내용어로 바꿔 겹침 점수를 매긴다. **2점 미만이면 판정을 기각하고 게재한다**(fail-open 방향 유지). 내용어는 새 `scripts/lib/textTokens.ts`가 만든다. 조사와 하다/되다 어미를 떼고, 수+단위(110억, 1위)와 모델 버전(k3.1)은 한 단어로 둔다. 회사·주력 제품명은 한 키로 모은다(제미나이·구글 → `google`). 범용어·연도는 뺀다(AI, 투자, 유치, 발표, 달러, 로봇 등). 공유 회사는 몇 개든 합쳐 1점이다. 예외로 두 회사가 겹치고 양쪽 모두 거래(제휴·계약·인수·투자) 기사이면 2점으로 센다(Oracle·OpenAI 제휴 재보도 보존). 기각한 판정은 notes에 `재보도 판정 기각 N건(내용어 겹침 부족)`으로 남고, `kpi baseline` 경고 집계에 `repeatRejected`로 들어간다.
  - **프롬프트**(`repeat.system.md`): 같은 사건 = 같은 주체 **그리고** 같은 행위·대상으로 정의했다. 주체만 같거나, 행위만 같거나, 주제어 하나만 겹치거나, 회사가 지나가며 언급된 경우는 재보도가 아니다. `event`는 두 제목을 모두 설명하는 구절이어야 하고, 재보도는 드물다(호당 0~2건)는 점을 적었다. 오탐 유형을 본뜬 가상 부정 예시 4건을 넣었다.
  - **검증 (Batches 재실행 $0.0225):** 7-3 회차는 진짜 재보도 #71(구글 우주 TPU)만 빠지고 오탐 5건은 모두 게재된다. 새 프롬프트만으로도 LLM 오탐은 5건에서 3건으로 줄었지만, 남은 3건은 짝이 엉뚱해 결국 코드 확인이 거른다. Phase 4-3 두 세트에서도 알려진 재보도(48·60·62·130)는 모두 빠지고, 이전 오탐(#152, #1)은 사라졌다. 모든 오늘×보도함 쌍 가운데 확인을 통과하는 쌍은 7-3에서 1/2,184, 4-3에서 6/1,975·12/2,765다. 남은 위험은 "회사 + 구체어 1개"가 통과한다는 점이다(설계상 #60 mistral+가중치, #130 google+1위에 필요). 표기 차이(Carbon/카본)는 놓침 쪽으로만 작용한다.
  - 테스트: `repeatCheckGuard.test.ts`(신규 22건, 표지 쌍 14개 픽스처, 7-3 모델 출력 전체 → 제외 1·기각 5). vitest 52파일·641건(Node 24), typecheck, lint(기존 경고 1건), prettier 통과.
- [x] **(추가, 사용자 결정) 브리핑 분야당 1건 상한:** 위 항목 3 결함 ②를 고쳤다(Phase 5 "한계"에서 예고한 문제).
  - ✅ 2026-10-31 `selectBriefs`(`src/lib/edition.ts`)는 세 단계로 고른다. ① 리드·서브에 Physical AI가 없으면 중요도 3 이상 Physical AI 뉴스를 먼저 넣는다. 이 기사가 Physical AI의 1건이 된다. ② 편집 순으로 브리핑에 아직 없는 분야의 1위 기사를 하나씩 담는다. ③ 그래도 빈 슬롯은 건너뛴 뉴스로 편집 순으로 채운다(완화). 그래서 브리핑은 지금처럼 뉴스가 모자랄 때만 준다. 상한은 브리핑 안에서만 적용하고, 리드·서브의 분야는 피하지 않는다. 피하게 하면 강한 기사가 다른 분야의 약한 기사보다 밀려 규칙을 예측하기 어려워진다. 건너뛴 기사는 섹션 밴드로 가고 `onFront`도 따라 바뀐다.
  - 시뮬레이션(no-save 스냅숏): 실제 22건은 physical×3에서 physical×2·industry×1로 바뀌었다. 리드·서브 뒤에 남은 분야가 2개뿐이라 완화가 작동한 경우다. 오탐 5건을 살린 반사실 27건은 industry×3에서 industry×2·physical×1로 바뀌었다.
  - edition 테스트를 52건에서 59건으로 늘렸다(상한, Physical AI 예약과의 상호작용, 2·1분야 완화, 결정성). 무작위 호 300개 속성 테스트에는 불변식 두 개를 더했다: "브리핑의 서로 다른 분야 수 = min(브리핑 수, 남은 분야 수)", "브리핑에 든 분야는 그 분야의 1위 기사". 상한을 일부러 세 가지로 망가뜨려 보니 매번 테스트 3~6건이 실패했다. DESIGN.md §3 슬롯표, PRD §3.5, CLAUDE.md의 1면 설명도 고쳤다.
  - 남은 한계: 반사실에서 리드와 같은 사건(OpenAI 투자 유치)을 다룬 다른 매체 보도(HN 경유 WSJ)가 브리핑에 남았다. 선별이 두 기사를 묶지 못했고 URL도 달라서, 1면 단계에서는 가를 근거가 없다. 상류(선별의 같은 사건 묶기)에서 풀 과제로 Phase 8 후보에 둔다.
- [x] **(추가, 사용자 결정) `latest.json` 외부 소비자 공지문:** Phase 2의 "외부 소비자 공지" 참고 항목을 처리했다.
  - ✅ 2026-10-31 [docs/notices/latest-json-2026-10.md](notices/latest-json-2026-10.md)를 썼다. 대상은 자랑터 「한입뉴스」 담당 개발자다. 구 분야값 → 새 키·표시명 대응표를 담았다(Dev Tools·MLOps → `oss`는 되돌릴 수 없고 `physical`은 신설). 새 필드 `categoryLabel`·`format`·`engagement`(지표가 있을 때만 들어감)를 설명했고, `version: 1`은 필드만 늘어 그대로라는 점도 적었다. 구·새 값을 모두 받는 TypeScript 스니펫과 실제 기사(#1245) 전후 JSON도 넣었다. 물량 변화도 적었다: 하루 상한 35건(비뉴스 약 8건)이고, 재보도 검사 뒤 실제 게재는 20~30건이다. 중요도는 형식 안에서 상대 평가하므로 "중요도 상위 N" 컷에 리포·논문이 섞인다는 점도 밝혔다. 배포 브랜치의 현재 출력과 대조해 확인했다. 배포 뒤 이 문서를 소비자에게 전달한다.

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
