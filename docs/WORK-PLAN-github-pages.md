# Daily AI Brief — GitHub Pages 배포 전환 상세 작업 계획서 (Work Plan)

## Context

[PRD-github-pages.md](PRD-github-pages.md)(GitHub Pages 배포 전환 PRD v1.0)를 실행 가능한 단계별 작업 계획으로 분해한다.
본 계획서는 **원본 서비스 PRD([PRD.md](PRD.md))를 분해한 [WORK-PLAN.md](WORK-PLAN.md)와 달리, "배포 타깃만 Vercel → GitHub Pages로 전환"하는 마이그레이션 PRD를 분해**한다.
서비스·데이터 모델·수집/LLM 파이프라인·디자인([DESIGN.md](../DESIGN.md))은 **변경하지 않고**, 정적 호스팅 제약(서버 런타임 없음)에 맞춰 렌더링·검색·배포 방식만 바꾼다.

**작성 방식(하이브리드):** PRD의 기능 단위(§3.1~§3.6)를 의존 순서대로 vertical-slice Phase로 묶고, 각 Phase에 파일 경로·Acceptance·Verify를 결합한다. 각 Phase는 "정적 빌드 후 해당 화면/동작이 서브경로에서 정상"임을 **단독으로 검증 가능**하다.

**현재 코드 상태(전환 전):** PRD의 "before"와 일치한다.

- [next.config.ts](../next.config.ts): `output:"standalone"` + `serverExternalPackages:["better-sqlite3"]` (basePath/assetPrefix/images/trailingSlash·`STATIC_EXPORT` 처리 없음).
- [src/app/page.tsx:7](../src/app/page.tsx#L7): `export const revalidate = 3600`(ISR), 서버측 `searchParams` 파싱 + `Link` 기반 `FilterBar`(서버 컴포넌트).
- [src/app/article/[id]/page.tsx](../src/app/article/[id]/page.tsx): `generateStaticParams` **없음**, `notFound()` 사용.
- [src/app/search/page.tsx:9](../src/app/search/page.tsx#L9): `export const dynamic = "force-dynamic"` + 서버 `searchArticles()`(FTS5). `SearchInput`은 이미 `"use client"` 라이브 검색.
- [src/lib/db.ts](../src/lib/db.ts): `getFeed`/`getArticle`/`searchArticles`/`getSourcesWithCounts`/`getActiveTags`/`getRecentRuns`/`getKpiSummary` 존재, `getAllArticleIds` **없음**. `new Database(DB_PATH,{readonly:true,fileMustExist:true})`.
- `.github/workflows/`: `collect.yml`만 존재(`[skip ci]` 커밋), `deploy.yml` **없음**.
- `scripts/export-search-index.ts`·`public/search-index.json` **없음**, FlexSearch/Fuse.js **미설치**, `next/image` 사용처 **0건**.

**확정된 결정(전 Phase 공통):**

- **전환 전략 = 클린 컷오버.** Vercel/`standalone`을 **폐기**하고 `output:'export'`(정적 export)를 **빌드 기본값**으로 삼는다. `npm run build` = 정적 export. "전환 진행 중"식 공존/하위호환 코드는 두지 않는다(되돌릴 땐 git revert).
- 클라이언트 검색 라이브러리 = **FlexSearch** (한글 토크나이즈·경량 인덱스).
- admin/api/middleware = **프로덕션 빌드에서만 제외**(빌드 phase 감지 또는 빌드 전용 플래그). `next dev`는 영향받지 않으므로 로컬 admin은 그대로 동작.
- 배포 트리거 브랜치 = **`deploy/github-pages`** (`collect.yml`·`deploy.yml` 모두 이 브랜치 기준으로 정렬).

**진행 기록 방법:** 각 Phase와 작업 항목에 체크박스(`- [ ]`)를 두어 진행 상황을 직접 체크한다. 아래 **진행 현황 개요**로 전체를 한눈에 추적한다.

---

## 진행 현황 개요

- [x] **Phase 0** — 정적 export 기반 설정 (PRD §3.1)
- [x] **Phase 1** — 피드·상세 정적화 (PRD §3.2, §3.3)
- [x] **Phase 2** — 검색 클라이언트 전환 (PRD §3.4)
- [x] **Phase 3** — admin/api/middleware 배포 분리 (PRD §3.5)
- [x] **Phase 4** — 자동 빌드·배포 파이프라인 (PRD §3.6)
- [ ] **Phase 5** — 동작 동일성·`basePath`·KPI 검증 (PRD §9)

---

## Architectural decisions (전 Phase 공통, 변하지 않는 결정)

- **배포 타깃**: Vercel **폐기** → **GitHub Pages**(저장소 Settings → Pages → Source = **GitHub Actions**)가 유일한 배포. 프로젝트 페이지 서브경로 `basePath:/global-ai-news`.
- **빌드 모드**: `output:'export'`가 **빌드 기본값**(분기·토글 없음). `standalone`/`serverExternalPackages` 등 Vercel 전제는 제거.
- **렌더링 전략**:
  - `/` 피드 — **SSG**(빌드타임 `getFeed`) + **클라이언트 필터/정렬**.
  - `/article/[id]` 상세 — **SSG**(`generateStaticParams` 전수 생성).
  - `/search` 검색 — **정적 셸 + 클라이언트 검색**(FlexSearch).
- **DB 접근**: 빌드타임 readonly 조회만(런타임 번들 미포함). [src/lib/db.ts](../src/lib/db.ts) 조회 코드는 변경 없이 그대로 쓰며 `getAllArticleIds()` 헬퍼 1개만 추가.
- **검색 인덱스**: 빌드 시 `public/search-index.json`(`id/titleKo/summaryKo/tags/source/category/publishedAt` — 본문 전문 제외) 생성 → 클라이언트가 fetch 후 FlexSearch로 검색.
- **admin/api/middleware**: **프로덕션 빌드(`npm run build`)에서만 export 산출에서 제외**(빌드 phase 감지 또는 빌드 전용 플래그). 로컬 `next dev`는 영향받지 않아 admin/api가 그대로 동작 → 운영자 도구로 잔존.
- **자동화**: `collect.yml`(수집 → `data/app.db` 커밋) → `deploy.yml`(정적 빌드 → Pages 배포). 둘 다 **`deploy/github-pages`** 기준, `concurrency: pages`로 직렬화.
- **`basePath` 정합성**: `next/link`·`next/image`는 자동 반영, **수동 경로 문자열(fetch URL 등)은 `basePath` 명시**. 검색 인덱스 fetch = `${basePath}/search-index.json`.
- **불변(원본 PRD 유지)**: SQLite 6개 테이블·수집 어댑터·`generateObject` LLM 가공·`DESIGN.md` 토큰·공개 3페이지의 시각/인터랙션.

---

## Phase 0: 정적 export 기반 설정 (PRD §3.1)

**목표:** `npm run build`가 곧바로 `output:'export'`로 `out/` 정적 산출물을 생성하도록 기반을 깐다(클린 컷오버 — standalone/Vercel 전제 제거). (이후 모든 Phase의 전제)

### 작업

- [x] [next.config.ts](../next.config.ts): `output:'export'`를 **빌드 기본값**으로 설정 + `basePath:'/global-ai-news'`, `assetPrefix:'/global-ai-news/'`, `images:{unoptimized:true}`, `trailingSlash:true`. 기존 `output:'standalone'`·`serverExternalPackages` **제거**. _단, `output:'export'`는 `next dev`까지 정적 제약을 강제해 로컬 admin/api/middleware를 깨뜨림이 확인됨 → 계획서가 허용한 **빌드 phase 감지**(`PHASE_PRODUCTION_BUILD`)로 프로덕션 빌드에만 적용(수동 토글 없음·dev 무회귀). `next.config.ts`를 phase 함수 형태로 전환._
- [x] `better-sqlite3`가 빌드타임 전용(런타임 번들 미포함)임을 확인 — 정적 export 클라이언트 chunk에 미포함 확인(`grep .next/static/chunks` → 0건), `serverExternalPackages` 없이도 정상.
- [x] admin/api/middleware의 프로덕션 빌드 제외 메커니즘 결정 = **빌드 phase 감지**(`PHASE_PRODUCTION_BUILD`). 동시에 빌드 전용 플래그 `STATIC_EXPORT`를 [.env.example](../.env.example)에 용도 주석으로 문서화(deploy.yml 전용). 라우트 제외 상세 구현은 Phase 3.

### 핵심 파일

`next.config.ts`, `.env.example`

### Acceptance / Tests / Verify

- [x] `npm run build`가 `output:'export'` 모드로 진입함을 확인(에러 메시지 `... with "output: export"`). _현재는 §3.5 미적용으로 `/api/*` 라우트(`force-dynamic`/`force-static` 미지정)에서 실패 → Phase 3에서 해소. Phase 0 단독 검증 범위(`output:'export'` 기본 적용·basePath 반영)는 충족._
- [x] `basePath`/`assetPrefix`가 빌드 산출에 반영된다(`.next/static` chunk·`_buildManifest.js`에 `/global-ai-news` baked-in 확인).
- [x] `better-sqlite3`가 클라이언트 번들에 포함되지 않는다(빌드타임 전용 — chunk grep 0건).
- [x] `npm run dev`는 기존과 동일하게 동작한다(`/` 200·`/api/health` 200·`/admin/login` 200). _phase 게이팅으로 dev엔 export 미적용._

---

## Phase 1: 피드·상세 정적화 (PRD §3.2, §3.3)

**User story:** _열람자 "정적 사이트에서도 동일한 피드·필터·정렬·상세를 쓰고 싶다."_
**목표:** ISR 제거 → 빌드타임 SSG. 피드 필터/정렬을 클라이언트로 전환하고, 전 기사 상세를 사전 생성한다.

### 설계 결정 (Phase 1 한정)

전환의 핵심은 "**서버가 쿼리별로 다른 HTML을 생성하던 것**"을 "**단일 정적 HTML + 브라우저 필터링**"으로 바꾸는 것이다. 아래 결정은 변경 표면을 최소화하면서 시각·UX·공유 URL을 보존하는 1택이다.

- **필터/정렬 = URL 쿼리 기반 클라이언트 필터링(서버 분기 제거).** [FilterBar](../src/components/FilterBar.tsx)·[FilterSheet](../src/components/mobile/FilterSheet.tsx)의 `Link`/`href` 네비게이션(`?tag=&source=&sort=`)은 **그대로 유지**한다(공유 가능한 URL·칩 시각·active 표현 불변). 정적 export에서 `/?tag=x`는 동일한 `out/index.html`을 서빙하고, 클라이언트가 쿼리를 읽어 메모리상 전체 카드 목록을 필터/정렬한다. → 두 컴포넌트는 **무변경**이고, 피드의 옵션 파싱·데이터 렌더만 클라이언트로 옮긴다.
- **필터/정렬 의미 단일 출처 = `src/lib/feedFilter.ts`(신규 순수 함수).** [db.ts](../src/lib/db.ts)의 `buildFilters`(소스·태그)와 `orderByFor`(3종 정렬: 기본 `trending desc → published desc`, `latest` = `published desc`, `importance` = `importance desc → trending desc`) **의미를 `ArticleCard[]` 대상 순수 함수로 1:1 이전**한다. 빌드(서버 SQL)와 런타임(클라 JS)의 동작 일치를 단위 테스트로 고정하고, Phase 2 검색 결과 정렬에도 재활용한다.
- **피드 렌더 = 서버(빌드 데이터) + 클라이언트 셸.** [page.tsx](../src/app/page.tsx)는 빌드타임에 전체 카드(`getFeed()`)·소스·태그를 조회하는 서버 컴포넌트로 남는다. **`useSearchParams`는 정적 export에서 `<Suspense>` 경계가 필수**(누락 시 빌드 에러 `should be wrapped in a suspense boundary`)이고, 해당 하위 트리는 **클라이언트 전용으로 bailout**된다 → `fallback`이 그대로 정적 HTML이 되므로 `fallback={null}`이면 **피드가 빈 채로 정적 생성**(LCP·SEO·"피드 정적 생성" 위배). 따라서 렌더를 두 조각으로 나눈다:
  - `src/components/FeedView.tsx`(신규, 훅 없는 프레젠테이션) — `options`를 받아 `feedFilter` 적용 후 FilterBar/FilterSheet/카드 그리드/빈 상태를 렌더. **서버·클라 공용**.
  - `src/components/FeedClient.tsx`(신규, `"use client"`) — `useSearchParams()`로 옵션 파싱 → `<FeedView>`.
  - `page.tsx`: `<Suspense fallback={<FeedView options={{}} …/>}><FeedClient …/></Suspense>`. fallback(서버 렌더 기본 피드)이 정적 HTML에 카드를 담고, 하이드레이션 후 FeedClient가 URL 쿼리로 재필터링한다. 기본 URL에선 fallback==클라 결과라 무깜빡임.
- **상세 = `generateStaticParams` 전수 + `dynamicParams = false`.** 전 기사 `id`를 사전 생성하고, 목록 밖 id는 산출물에 없어 정적 404가 된다. 페이지 내부 로직(요약/원문 병기·태그·원문 새 탭)은 무변경.

### 작업

**1.1 DB 헬퍼 — [src/lib/db.ts](../src/lib/db.ts)**

- [x] `getAllArticleIds(conn: DatabaseType = getDb()): number[]` 추가 — `SELECT id FROM articles`(readonly). 정렬 불필요(빌드 파라미터 열거 전용). 기존 함수는 **추가만, 수정 없음**.

**1.2 상세 정적화 — [src/app/article/[id]/page.tsx](../src/app/article/[id]/page.tsx)**

- [x] `export function generateStaticParams()` 추가 → `getAllArticleIds().map((id) => ({ id: String(id) }))`.
- [x] `export const dynamicParams = false` 추가 — 목록 밖 id는 빌드 산출에 없어 정적 404(기존 `notFound()` 가드 유지).
- [x] 본문(요약+원문 병기·`TagChips`·원문 `target="_blank"`)·`getArticle(Number(id))` 호출은 **변경 없음**.

**1.3 필터/정렬 순수 함수 — `src/lib/feedFilter.ts`(신규)**

- [x] `filterAndSortFeed(articles: ArticleCard[], opts: FeedOptions): ArticleCard[]` — `opts.source`(=`source.id` 일치)·`opts.tag`(`tags` 배열 포함) 필터 후 `opts.sort`별 정렬. 정렬 비교자는 `db.ts orderByFor`와 1:1(동점 시 보조 키까지 동일). `FeedOptions`는 `@/lib/db`에서 재사용(중복 타입 금지). 입력 배열 불변(`filter`→`sort` 새 배열).

**1.4 피드 프레젠테이션 + 클라이언트 셸 — `FeedView.tsx`·`FeedClient.tsx`(신규)**

- [x] `src/components/FeedView.tsx`(훅 없음, 서버·클라 공용) — `options`를 받아 `filterAndSortFeed` 적용 후 FilterBar(`hidden md:block`)·FilterSheet·카드 그리드·빈 상태를 **기존 `page.tsx`와 동일 마크업**으로 렌더.
- [x] `src/components/FeedClient.tsx`(`"use client"`) — `useSearchParams()`로 `{ source, tag, sort }` 파싱(기존 `parseOptions` 로직 이전) → `<FeedView>`. Link 네비게이션으로 쿼리가 바뀌면 재필터링.

**1.5 피드 페이지 SSG화 — [src/app/page.tsx](../src/app/page.tsx)**

- [x] `export const revalidate = 3600` **제거**(빌드타임 1회 SSG).
- [x] `searchParams` prop·`parseOptions` 제거. 빌드타임 `getFeed()`(전량)·`getSourcesWithCounts()`·`getActiveTags(8)` 조회 → `<h1>` 제목(서버) + `<Suspense fallback={<FeedView options={{}} …/>}><FeedClient …/></Suspense>`. fallback이 정적 HTML에 카드를 담는다(빈 fallback 금지).

### 핵심 파일

신규: `src/lib/feedFilter.ts`, `src/components/FeedView.tsx`, `src/components/FeedClient.tsx`.
수정: `src/lib/db.ts`(`getAllArticleIds` 추가), `src/app/article/[id]/page.tsx`(`generateStaticParams`·`dynamicParams`), `src/app/page.tsx`(revalidate 제거·셸화).
**무변경(불변):** [FilterBar](../src/components/FilterBar.tsx)·[FilterSheet](../src/components/mobile/FilterSheet.tsx)·[ArticleCard](../src/components/ArticleCard.tsx)·[ArticleMeta](../src/components/ArticleMeta.tsx)의 `Link` 네비게이션·칩 시각·카드/상세 마크업·DESIGN 토큰·태그 이동·원문 새 탭, `db.ts` 기존 함수 시그니처.

### Acceptance / Tests / Verify

- [x] 빌드 시 모든 기사 상세가 `out/article/<id>/index.html`로 정적 생성된다(개수 = `getAllArticleIds().length` = 170, SSG). _Phase 1 단독 검증은 admin/api/search를 임시 제외하고 `npm run build`(170 SSG·`out/` 정상). 전체 빌드는 Phase 2(search)·Phase 3(api 제외) 완료 후 통과._
- [x] 피드가 ISR 없이 정적 생성되고 최신 `data/app.db` 내용이 반영된다(`out/index.html`에 카드 170개·`bg-card`·`<h2>` 확인 — fallback 서버 렌더).
- [x] 카드 링크에 `basePath`가 baked-in 된다(`href="/global-ai-news/article/<id>"` 170건), `better-sqlite3` 클라이언트 chunk 미포함(grep 0건). _필터/정렬·서브경로 인터랙션 점검은 Phase 5에서 `npx serve out`로 종합._
- [x] (test) `getAllArticleIds` 스모크(전 id 반환·빈 DB·readonly) — [getAllArticleIds.test.ts](../src/__tests__/getAllArticleIds.test.ts).
- [x] (test) `feedFilter` 단위 — `getFeed.test.ts`의 3종 정렬·소스/태그/복합 필터를 `ArticleCard[]` 입력으로 미러링 + 입력 불변 검증 — [feedFilter.test.ts](../src/__tests__/feedFilter.test.ts).
- [x] `npm run lint && npm run typecheck && npm test` 통과(119 tests).

### 의존성·주의

- **선행:** Phase 0(`output:'export'` 빌드 기본). **후행:** Phase 2(검색)가 `ArticleCard`·필터 UX·`feedFilter` 정렬을 재사용하므로 공용성 유지.
- `next dev`는 Phase 0 phase 게이팅으로 export 미적용 → 로컬에선 `useSearchParams`/`generateStaticParams`가 일반 동작. **검증은 반드시 `npm run build` + `npx serve out` 서브경로**로 수행(정적 제약·`basePath` 반영 확인).

---

## Phase 2: 검색 클라이언트 전환 (PRD §3.4)

**User story:** _열람자 "서버 없이도 동일한 검색 화면·UX로 과거 기사를 탐색하고 싶다."_
**목표:** 서버 FTS5 검색을 빌드 시 JSON 인덱스 + 클라이언트 FlexSearch 검색으로 대체하되 화면·필터 UX는 그대로 유지한다.

### 설계 결정 (Phase 2 한정)

검색은 피드와 달리 빌드타임에 결과를 만들 수 없다(쿼리는 런타임 입력). 따라서 "**서버가 요청마다 FTS5로 다른 결과를 만들던 것**"을 "**빌드 시 1회 인덱스 JSON 생성 → 브라우저가 fetch 후 FlexSearch로 검색**"으로 바꾼다. Phase 1에서 만든 카드·필터·정렬 자산을 최대한 재사용해 변경 표면을 최소화한다.

- **검색 인덱스 = 카드 DTO − 본문(`contentRaw`).** `SearchIndexEntry = Omit<ArticleCard, "contentRaw">`로 정의한다. 카드 렌더(`titleOriginal` 폴백·`trendingScore` 배지)와 정렬(`importance`)에 필요한 필드를 모두 포함하되, **비용/용량의 주범인 원문 본문(`content_raw`)만 제외**한다. 인덱스 항목이 곧 `ArticleCard`로 호환되므로 [ArticleCard](../src/components/ArticleCard.tsx)·`filterAndSortFeed`를 캐스팅 없이 그대로 재사용한다(서버 FTS의 원문 본문 매칭만 손실 — §10 위험으로 수용).
- **인덱스 생성 = `getFeed()` 재사용으로 매핑 일치 보장.** `scripts/export-search-index.ts`는 readonly DB에서 `getFeed({}, conn)`(=피드와 동일한 `toArticleCard` 매핑) 결과에서 `contentRaw`만 떼어 `SearchIndexEntry[]`를 만든다. 별도 SQL/매핑을 두지 않아 피드와 카드 데이터가 구조적으로 일치한다.
- **검색 질의 = 순수 헬퍼 `src/lib/searchIndex.ts`로 분리.** FlexSearch `Document`(`tokenize:"full"` — 한글 부분일치 = FTS5+LIKE 폴백 동작 근사) 인덱스 빌드(`buildSearchDocument`)와 질의→id 목록(`queryMatchingIds`)을 순수 함수로 분리한다. UI(SearchClient)와 단위 테스트가 동일 로직을 공유한다. 태그는 `tagsText`(공백 조인) 파생 필드로 색인한다.
- **검색 화면 = 정적 셸 + 클라이언트 검색(`SearchClient.tsx`).** Phase 1의 FeedClient 패턴을 따른다. `page.tsx`는 빌드타임에 소스·태그만 조회하는 서버 컴포넌트로 남고, `<Suspense>`로 감싼 `SearchClient`(`"use client"`)가 ① 마운트 시 `${basePath}/search-index.json` fetch → 인덱스 빌드 ② `useSearchParams()`로 `{q,source,tag,sort}` 파싱 ③ `queryMatchingIds` → id를 항목으로 매핑 → `filterAndSortFeed`로 소스/태그 필터·정렬 ④ [SearchInput](../src/components/SearchInput.tsx)·FilterBar·FilterSheet·결과 카드·결과 없음 상태를 **기존 마크업 그대로** 렌더. `useSearchParams`는 정적 export에서 `<Suspense>` 경계 필수(Phase 1과 동일).
- **`basePath` 정합 fetch.** 수동 fetch URL은 `next/link`처럼 자동 반영되지 않으므로 basePath를 명시한다. [next.config.ts](../next.config.ts) 프로덕션 분기에 `env:{ NEXT_PUBLIC_BASE_PATH: BASE_PATH }`를 추가해 클라이언트가 `process.env.NEXT_PUBLIC_BASE_PATH`로 읽고(`dev`는 미설정 → `""`), `fetch(\`${BASE_PATH}/search-index.json\`)`로 서브경로에서 200을 보장한다. next.config가 basePath 단일 출처로 유지된다(deploy env 불필요).
- **SearchInput·필터 무변경.** `router.push("/search?...")`·FilterBar/FilterSheet `Link`는 전역 basePath가 자동 반영되므로 코드 변경 없이 그대로 둔다(공유 URL·디바운스·칩 시각 불변).

### 작업

**2.1 인덱스 항목 타입 — [src/lib/types.ts](../src/lib/types.ts)**

- [x] `export type SearchIndexEntry = Omit<ArticleCard, "contentRaw">` 추가 — 본문만 제외, 카드/정렬 필드 전부 포함. 주석으로 "본문 전문 제외, ArticleCard 호환" 명시.

**2.2 경로 상수 — [src/lib/paths.ts](../src/lib/paths.ts)**

- [x] `PUBLIC_DIR`·`SEARCH_INDEX_PATH`(=`public/search-index.json`) 추가(런타임 경로 상수 단일 출처 규약).

**2.3 인덱스 생성 스크립트 — `scripts/export-search-index.ts`(신규)**

- [x] `buildSearchIndex(conn): SearchIndexEntry[]` — `getFeed({}, conn)`에서 `contentRaw` 제거(피드와 동일 매핑 재사용).
- [x] `writeSearchIndex(outPath, conn)` — JSON 직렬화 후 파일 기록. `reindexFts.ts` 패턴(export 함수 + `import.meta.url` main 가드)으로 `npm run export-search-index` 시 `SEARCH_INDEX_PATH`에 기록.

**2.4 검색 질의 헬퍼 — `src/lib/searchIndex.ts`(신규)**

- [x] `buildSearchDocument(entries): Document` — FlexSearch `Document`(`tokenize:"full"`, 색인 `titleKo/summaryKo/titleOriginal/tagsText`).
- [x] `queryMatchingIds(index, q): number[]` — `index.search(q)` 결과의 모든 필드 id 합집합(중복 제거). 빈 q → `[]`.

**2.5 패키지 스크립트 — [package.json](../package.json)**

- [x] `"export-search-index": "tsx scripts/export-search-index.ts"` 추가.
- [x] `"prebuild": "tsx scripts/export-search-index.ts"` 추가 — `npm run build` 직전 자동 실행(npm 생명주기 prebuild; `dev` 미영향). 매 빌드마다 최신 `data/app.db` 반영.

**2.6 FlexSearch 의존성 + 검색 셸 — `SearchClient.tsx`(신규)·[search/page.tsx](../src/app/search/page.tsx)·[next.config.ts](../next.config.ts)**

- [x] `flexsearch`(+`@types/flexsearch`) 설치.
- [x] `src/components/SearchClient.tsx`(`"use client"`) — 인덱스 fetch·빌드 → `useSearchParams` 파싱 → `queryMatchingIds`+`filterAndSortFeed` → SearchInput/FilterBar/FilterSheet/카드/빈 상태 렌더(기존 마크업). 빈 질의 안내 문구는 본문 미색인에 맞춰 "제목·요약·태그"로 갱신(원문 제외).
- [x] `src/app/search/page.tsx` — `export const dynamic="force-dynamic"`·`searchParams`·서버 `searchArticles` **제거**. 빌드타임 `getSourcesWithCounts()`·`getActiveTags(8)` 조회 → `<h1>` + `<Suspense><SearchClient …/></Suspense>`.
- [x] `next.config.ts` 프로덕션 분기에 `env:{ NEXT_PUBLIC_BASE_PATH: BASE_PATH }` 추가.

### 핵심 파일

신규: `scripts/export-search-index.ts`, `src/lib/searchIndex.ts`, `src/components/SearchClient.tsx`.
수정: `src/lib/types.ts`(`SearchIndexEntry`), `src/lib/paths.ts`(경로 상수), `src/app/search/page.tsx`(셸화), `next.config.ts`(`env`), `package.json`(스크립트).
**무변경(불변):** [SearchInput](../src/components/SearchInput.tsx)·[FilterBar](../src/components/FilterBar.tsx)·[FilterSheet](../src/components/mobile/FilterSheet.tsx)·[ArticleCard](../src/components/ArticleCard.tsx) 마크업/네비게이션, `db.ts` 기존 함수, `feedFilter.ts`.

### Acceptance / Tests / Verify

- [x] 빌드 시 `public/search-index.json`이 생성되고, 기사 추가/변경이 재빌드로 반영된다(`prebuild`). _`npm run export-search-index` → 170 entries·`contentRaw` 부재 확인._
- [x] `/search`가 정적 export되며 한국어 제목·요약·태그를 대상으로 클라이언트에서 검색된다. _`force-dynamic`·`searchParams` 제거 + `<Suspense>` 셸로 정적화. 서브경로 실서빙 점검은 Phase 5(`npx serve out`)에서 종합._
- [x] 결과가 피드와 동일 카드로 표시되고 결과 없음 상태가 명확히 노출된다. _`ArticleCard`·`filterAndSortFeed` 재사용, 빈/로딩/무결과 상태 분기._
- [x] 검색 인덱스 fetch 경로가 `basePath`를 포함해 서브경로에서 200 응답한다(`NEXT_PUBLIC_BASE_PATH`). _`next.config` 프로덕션 분기 `env` 주입 + `SearchClient`가 `${NEXT_PUBLIC_BASE_PATH}/search-index.json` fetch. 실제 200 서빙 검증은 Phase 5._
- [x] (test) `buildSearchIndex` 출력 스키마 스모크(본문 제외·카드 필드 보존) — [exportSearchIndex.test.ts](../src/__tests__/exportSearchIndex.test.ts), FlexSearch 한글/영문/태그 매칭 샘플(`queryMatchingIds`) — [searchIndex.test.ts](../src/__tests__/searchIndex.test.ts).
- [x] `npm run lint && npm run typecheck && npm test` 통과(128 tests).

### 의존성·주의

- **선행:** Phase 1(`ArticleCard`·`filterAndSortFeed`·FilterBar/FilterSheet 재사용). **후행:** Phase 3(api 제외) 완료 전까지 전체 `npm run build`는 `/api/*`에서 실패하므로, Phase 2 단독 검증은 인덱스 생성·search 정적화·테스트로 한정한다(Phase 1과 동일 방식).
- 서버 FTS의 **원문 본문(`content_raw`) 매칭만 손실**된다(인덱스에서 본문 제외) — §10 위험으로 수용. 제목·요약·원문 제목·태그 검색은 보존.

---

## Phase 3: admin/api/middleware 배포 분리 (PRD §3.5)

**User story:** _운영자 "소스 관리·재수집·KPI를 로컬에서 그대로 쓰되, 공개 배포에는 admin이 노출/포함되지 않길 원한다."_
**목표:** admin을 로컬 운영 도구로 유지하고 정적 배포 산출물에서 제외한다.

### 작업

- [x] 프로덕션 빌드(`npm run build`)에서 `/admin/*`·`/api/*`·`src/middleware.ts`가 export 대상에서 제외되도록 처리. **메커니즘 = `pageExtensions` 게이팅(빌드 phase 감지, 파일 이동·삭제 없이 reversible).** 라우트/미들웨어 파일을 `page.local.tsx`/`route.local.ts`/`middleware.local.ts`로 두고, [next.config.ts](../next.config.ts)가 `next dev`(=`PHASE_PRODUCTION_BUILD` 분기 밖)엔 `local.*` 확장자를 `pageExtensions`에 포함해 그대로 노출, 프로덕션 빌드엔 제외해 라우트로 인식되지 않게 한다. `next dev`엔 미적용(무회귀).
- [x] 공개 사이트 네비게이션/링크에 admin 진입점이 노출되지 않음을 확인. [Footer](../src/components/Footer.tsx)의 `/admin`("운영 콘솔") 링크 **제거**. (`BottomTabBar`의 `ADMIN_TABS`는 `pathname.startsWith("/admin")` 일 때만 렌더 → 정적 사이트엔 `/admin/*` 페이지가 없어 공개 노출 안 됨. 빌드된 `out/index.html`에 admin 링크 0건 확인.)
- [x] `npm run dev`에서 admin 소스 CRUD·재수집·KPI가 기존과 동일하게 동작함을 회귀 확인. (`/api/health` 200·`/admin/login` 200·`/admin`→`/admin/login` 307(middleware)·`/api/admin/sources` 401(middleware) 확인.)

### 핵심 파일

`next.config.ts`(`pageExtensions` phase 게이팅), `src/middleware.local.ts`, `src/app/admin/**/page.local.tsx`, `src/app/api/**/route.local.ts`, [Footer.tsx](../src/components/Footer.tsx)(admin 링크 제거), 테스트 import 경로 갱신(`health.test.ts`·`sources-route.test.ts`).

### Acceptance / Tests / Verify

- [x] 정적 산출물 `out/`에 `/admin/*`·`/api/*`가 포함되지 않는다. (`find out -path '*admin*' -o -path '*api*'` → 0건, `out/` 최상위 = `404 article fonts search index.html search-index.json`.)
- [x] 정적 export 빌드가 admin/api/middleware 때문에 실패하지 않는다. (`npm run build` 성공 — 라우트 `/`·`/article/[id]`·`/search`만 산출, `middleware-manifest.json` = `{ middleware:{}, sortedMiddleware:[] }`.)
- [x] `npm run dev`에서 admin 기능(소스 CRUD·재수집 트리거·KPI 대시보드)이 기존과 동일하게 동작한다. (위 dev 회귀 확인.)
- [x] 공개 사이트에 admin 진입점이 노출되지 않는다. (Footer 링크 제거, `out/index.html`에 admin href 0건. 잔존 `/admin` 문자열은 `ADMIN_TABS` 정의뿐 — 공개 경로에선 미렌더.)

---

## Phase 4: 자동 빌드·배포 파이프라인 (PRD §3.6)

**User story:** _운영자 "수집만 돌면 빌드·배포까지 자동으로 끝나길 원한다."_
**목표:** Vercel 대신 GitHub Actions가 정적 빌드 후 GitHub Pages로 배포한다. DB 커밋이 배포를 트리거한다.

### 작업

- [x] [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)(신규): 트리거 = `push`(`deploy/github-pages`의 `data/app.db`·`configs/**`·`src/**`·`next.config.ts`·`package.json`·`deploy.yml`) + `workflow_dispatch`. 단계 = `actions/checkout` → `setup-node`(22, cache npm) → `npm ci` → `npm run build`(정적 export 기본; `prebuild`가 검색 인덱스 생성을 자동 선행) → `configure-pages` → `upload-pages-artifact(out)` → `deploy-pages`(별도 `deploy` 잡, `environment: github-pages`). `permissions: pages:write, id-token:write`, `concurrency: {group:pages, cancel-in-progress:true}`.
- [x] [collect.yml](../.github/workflows/collect.yml) 조정: 커밋 메시지의 `[skip ci]` **제거**(이 push가 `deploy.yml`을 트리거). `checkout`/커밋/푸시 브랜치를 `deploy/github-pages`로 **고정 정렬**(`DEPLOY_BRANCH` env, `GITHUB_REF_NAME` 의존 제거 — schedule 실행이 기본 브랜치 컨텍스트로 돌아도 동일 브랜치에 커밋).
- [ ] (운영자 수동) 저장소 Settings → Pages → Source = **GitHub Actions** 설정. _코드/워크플로 측 준비는 완료, 저장소 설정은 운영자만 변경 가능._

### 핵심 파일

`.github/workflows/deploy.yml`(신규), `.github/workflows/collect.yml`(조정)

### Acceptance / Tests / Verify

- [x] 수집이 `data/app.db`를 커밋하면 추가 수작업 없이 `deploy.yml`이 트리거되어 빌드·배포까지 완료된다. _`collect.yml`이 `[skip ci]` 없이 `deploy/github-pages`에 push → `deploy.yml`의 `push`(paths: `data/app.db`) 트리거 정합. 실 cron push 발화는 운영자 점검._
- [x] Pages 소스가 GitHub Actions로 설정되고 `out/` 산출물이 배포된다. _워크플로가 `upload-pages-artifact(path: out)` → `deploy-pages`. `npm run build`가 `out/` 산출 확인(170 SSG·`search-index.json`·admin/api 부재). Pages Source 설정은 운영자 수동(위)._
- [x] `workflow_dispatch`로 즉시 재배포할 수 있다. _`deploy.yml`에 `workflow_dispatch: {}` 추가._
- [x] 동시 배포가 `concurrency`로 직렬화된다. _`concurrency: {group: pages, cancel-in-progress: true}`._
- [x] (verify) `deploy.yml` YAML 구조 검증(`yaml.safe_load` 통과), `npm run build` → `out/` 산출 확인. 테스트 push 트리거 동작은 운영자가 실 푸시로 점검.

---

## Phase 5: 동작 동일성 · basePath · KPI 검증 (PRD §9, §6, §10)

**목표:** 빌드 산출물을 서브경로로 서빙해 공개 3페이지 동일성과 경로 정합성을 점검하고, KPI 측정 항목을 정리한다.

### 작업

- [ ] PRD §9.2 동작 동일성 체크리스트 점검 — `npx serve out` + `/global-ai-news` 경로로 서빙(또는 Pages 미리보기).
  - [ ] 피드: 카드 렌더·태그/소스 필터·최신/중요도 정렬·카드→상세 이동.
  - [ ] 상세: 한국어 요약+원문 병기·태그 이동·원문 새 탭.
  - [ ] 검색: 인덱스 로드·한글 검색·결과 카드·결과 없음 상태.
  - [ ] 셸/디자인: 다크모드·모바일 상단바/하단 탭바/필터 시트·Pretendard 폰트 로드.
- [ ] `basePath` 경로 회귀 0건: 폰트(`public/fonts/*`)·자산·내부 링크·`search-index.json` fetch가 `/global-ai-news` 하에서 200 응답.
- [ ] PRD §9.3 빌드 환경: CI(Ubuntu, Node 22)에서 `better-sqlite3` 네이티브 빌드 성공·빌드타임 DB 조회 정상, `out/`에 `/admin`·`/api` 부재 확인.
- [ ] KPI(정적 빌드 성공률 ≥95%·수집→배포 ≤10분·피드 LCP ≤2.0s·추가 운영비 $0·`basePath` 회귀 0건)는 운영자 cron 누적/Lighthouse로 점검하는 항목으로 안내.

### 핵심 파일

(검증 전용 — 신규 코드 없음. 점검 절차·결과 기록)

### Acceptance / Tests / Verify

- [ ] 공개 3페이지 동작 동일성 100%(§9.2 전부 통과).
- [ ] `basePath` 경로 회귀 0건.
- [ ] `out/`에 `/admin`·`/api` 경로 부재.

---

## Phase 의존성

```
Phase 0 (정적 export 기반)
   ├─ Phase 1 (피드·상세 정적화)
   │     └─ Phase 2 (검색 클라이언트 전환)   ← 피드 카드/컴포넌트 재사용
   └─ Phase 3 (admin/api 배포 분리)
         └─ Phase 4 (빌드·배포 파이프라인)   ← Phase 1~3 정적화 완료 필요
               └─ Phase 5 (동일성·basePath·KPI 검증)
```

---

## 비호환 항목 처리 매핑 (PRD §7 요약)

| 원본 기능              | 정적 비호환 이유          | 정적 대체 방식                          | Phase |
| ---------------------- | ------------------------- | --------------------------------------- | :---: |
| ISR 피드(`revalidate`) | 서버 재검증 필요          | 빌드타임 SSG + 매 배포 갱신             | 1     |
| 동적 상세              | dynamic param 런타임 조회 | `generateStaticParams` 전수 사전 생성  | 1     |
| `force-dynamic` 검색   | 요청시 FTS5 쿼리          | JSON 인덱스 + 클라이언트 FlexSearch     | 2     |
| Route Handler `/api/*` | serverless 미지원         | 로컬 전용 분리, 프로덕션 빌드에서 제외   | 3     |
| Admin SSR · 미들웨어   | SSR+인증·런타임 필요      | 로컬 `next dev` 전용, 프로덕션 빌드 제외 | 3     |
| `next/image` 최적화    | 최적화 서버 필요          | `images.unoptimized`(현재 사용처 0건)   | 0     |
| Vercel ISR 트리거 배포 | Vercel 의존              | Actions `deploy.yml` 빌드·배포          | 4     |

---

## 검증 지표 (PRD §9.1 KPI)

측정 수단은 Phase 4~5에서 구축. 달성 여부는 실 cron/배포 누적으로 운영자가 점검한다.

| 항목                  | 목표값                                  | 측정 수단                        | 달성 |
| --------------------- | --------------------------------------- | -------------------------------- | :--: |
| 정적 빌드 성공률      | ≥ 95% (`next build` export, 최근 30일)  | Actions 로그 (자동)              | [ ]  |
| 수집→배포 자동화 시간 | ≤ 10분 (DB 커밋 → Pages 반영, 수동 0회) | Actions 타임스탬프 (수동)        | [ ]  |
| 공개 3페이지 동일성   | 100% (§9.2 체크리스트 전부 통과)        | 빌드 후 서브경로 서빙 점검 (수동)| [ ]  |
| 피드 LCP              | ≤ 2.0s (데스크톱)                       | Lighthouse (수동)                | [ ]  |
| 추가 운영비           | $0 (Pages·Actions 무료 범위)            | 청구 확인 (수동)                 | [ ]  |
| `basePath` 경로 회귀  | 0건 (자산·링크·검색 fetch 깨짐 없음)    | §9.2 경로 항목 (수동)            | [ ]  |

---

## 위험 요소 & 완화 (PRD §10 요약)

- **`basePath` 누락** → 수동 fetch에 `basePath` 명시, §9.2 회귀 체크.
- **대량 기사 빌드 시간 증가** → MVP는 전체 빌드 허용, 필요 시 최신 N개만 정적+나머지 인덱스화(Post-MVP).
- **FTS5 → FlexSearch 품질차** → 한글 토크나이즈 설정·§9.2 검색 항목 검수.
- **admin/api 배제 방식 오류** → 프로덕션 빌드에서만 제외(빌드 phase 감지/플래그), `out/` 부재 확인(§9.3).
- **`better-sqlite3` CI 빌드** → Node 22 고정, `npm ci`, 빌드 로그 점검.

---

## 전체 검증 방법

1. `npm run build` → 검색 인덱스 생성 + `out/` 정적 산출(정적 export 기본).
2. `npx serve out` → `http://localhost:3000/global-ai-news`에서 피드 필터·정렬, `/article/[id]` 병기, `/search` 검색(인덱스 로드) 점검.
3. `out/`에 `/admin`·`/api` 부재 확인, 폰트·자산·검색 fetch 200 확인(`basePath`).
4. `npm run lint && npm run typecheck && npm test` 통과.
5. `npm run dev`에서 admin/api/middleware 기존 동작 회귀 없음 확인(로컬 운영 도구 잔존).
6. (배포) `deploy/github-pages`에 `data/app.db` 변경 push → `deploy.yml` 자동 트리거 → Pages 반영 확인. `workflow_dispatch`로 즉시 재배포 확인.

---

## MVP 제외 / 향후 계획 (PRD §8, §11)

- 증분 빌드(변경분만 재생성), 검색 인덱스 분할/압축·형태소 토크나이즈·하이라이트.
- admin 별도 호스팅(serverless), 커스텀 도메인(`basePath` 제거·CNAME), Actions 빌드 캐싱.
- 배포된 공개 사이트에서의 admin 동작·요청시 서버 검색(FTS5)·ISR/온디맨드 재검증은 **비목표**(정적 호스팅 제약).

---

## 주요 참조

- [PRD-github-pages.md](PRD-github-pages.md) — 마이그레이션 요구사항 원천
- [PRD.md](PRD.md) — 원본 서비스 요구사항(불변)
- [WORK-PLAN.md](WORK-PLAN.md) — 원본 서비스 작업 계획(Phase 0~6, 양식 출처)
- [../DESIGN.md](../DESIGN.md) — 디자인 토큰(불변)
- [../CLAUDE.md](../CLAUDE.md) — 스택/컨벤션
