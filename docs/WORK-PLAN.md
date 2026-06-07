# Daily AI Brief 상세 작업 계획서 (Work Plan)

## Context

[PRD.md](PRD.md)(Daily AI Brief PRD v1.0)를 실행 가능한 단계별 개발 계획으로 분해한다.
PRD는 "글로벌·한국 AI/IT 뉴스를 일 1회 배치 수집 → LLM 단일 호출로 한국어 가공 → 카드형 피드/검색/상세 + 운영 콘솔로 제공, 운영비≈0" 서비스다.

**작성 방식(하이브리드):** vertical-slice(트레이서 불릿) 구조를 골격으로 하고, 파일 경로·테스트·검증 섹션·KPI 표를 각 Phase에 결합한다. 각 Phase는 수집→전처리→LLM→SQLite→렌더 전 레이어를 얇게 관통해 **단독으로 데모 가능**하다(수평 레이어링 지양 → 1인 2~4주 개발에 적합).

**현재 구현 상태:** Next.js 15 스타터킷 + 보일러플레이트(`/api/chat`, `/api/health` 예제) 상태. PRD의 핵심 로직(`scripts/collect.ts`, SQLite, 페이지, Admin)은 전부 미구현.

**진행 기록 방법:** 각 Phase와 작업 항목에 체크박스(`- [ ]`)를 두어 진행 상황을 직접 체크한다. 아래 **진행 현황 개요**로 전체를 한눈에 추적한다.

---

## 진행 현황 개요

- [ ] **Phase 0** — Walking Skeleton (기반 정리)
- [ ] **Phase 1** — 트레이서 불릿: RSS 1개 소스 end-to-end (LLM 없이)
- [ ] **Phase 2** — LLM 통합 가공 (한국어·분류·태그·비용 기록)
- [ ] **Phase 3** — 소스 확장 + 필터/정렬 + 비용 가드
- [ ] **Phase 4** — 검색 (`/search`)
- [ ] **Phase 5** — 관리자 운영 콘솔 (`/admin`)
- [ ] **Phase 6** — 자동화 · 배포 · KPI 검증

---

## Architectural decisions (전 Phase 공통, 변하지 않는 결정)

- **라우트**
  - 공개: `/`(피드·ISR), `/article/[id]`(상세·SSG+ISR), `/search`(검색·동적)
  - 운영: `/admin`(SSR+인증), Route Handler `/api/admin/sources`, `/api/admin/collect`
  - `/api/health`(기존 유지)
- **DB 스키마(SQLite, better-sqlite3)** — PRD §5: `sources`, `articles`(수집 원본+LLM 가공 통합), `tags`, `article_tags`, `articles_fts`(FTS5), `collection_runs`. 파일 `data/app.db`, 빌드 시 readonly 조회.
- **핵심 모델/타입**: `RawItem`(수집 원본), `articleEnrichmentSchema`(Zod, LLM 출력), `ArticleCard`(렌더 DTO), `CATEGORIES` enum 6종.
- **파이프라인**: `scripts/collect.ts` → ① 수집(`rss-parser` + HN/GitHub/HF/Reddit OAuth2) ② `trendingScore()` + dedup(코드) ③ `generateObject`(Haiku, 신규만 1호출/건) ④ better-sqlite3 upsert + `collection_runs` 기록.
- **소스 정의**: `configs/sources.json`(코드 하드코딩 금지, Admin이 GitHub API로 커밋). `kind`: rss/web/reddit/hn/github/hf. WEB은 등록만, 수집 Post-MVP.
- **프롬프트**: `configs/prompts/enrich.system.md`(캐싱) + `enrich.fewshot.json`(캐싱) + 가변 유저 메시지. Anthropic prompt caching `cache_control`.
- **비용 가드**: `MAX_INPUT_CHARS≈2500`, `maxOutputTokens=400`, `MAX_ITEMS_PER_RUN≈150`(초과 시 트렌딩 상위만), 일 1회 cron.
- **인증**: `ADMIN_PASSWORD` → 서명 세션 쿠키, `middleware.ts`가 `/admin/*`·admin API 보호. `GITHUB_PAT` 등 비밀은 서버에서만.
- **인프라**: GitHub Actions `schedule` 일 1회(`0 21 * * *` UTC) + `workflow_dispatch`, 실행 후 `data/app.db` 커밋 → Vercel 자동 배포(ISR).
- **디자인**: `DESIGN.md` 토큰 준수 — 단일 강조색 Action Blue `#0066cc`, `store-utility-card`, `rounded.lg/pill`, 라이트/패치먼트 교차, 그림자/2차 강조색 금지.
- **환경변수**: `ANTHROPIC_API_KEY`, `LLM_MODEL`(기본 `claude-haiku-4-5`), `REDDIT_CLIENT_ID/SECRET`, `GITHUB_PAT`, `GITHUB_REPO`, `ADMIN_PASSWORD`.

---

## Phase 0: Walking Skeleton (기반 정리)

**목표:** 스타터 정리 + 환경/DB/타입/디자인 토큰 골격 확보. (트레이서 불릿을 쏘기 위한 최소 기반)

### 작업
- [ ] 스타터 보일러플레이트 정리: `/api/chat` 등 데모 제거(`starter-cleaner` 에이전트 활용 가능).
- [ ] 의존성 추가: `better-sqlite3`, `rss-parser`, `zod`(+ `ai`/`@ai-sdk/anthropic` 기존), `@types/better-sqlite3`.
- [ ] `.env.example` 갱신(위 환경변수 전체), `.env.local` 안내.
- [ ] DB 계층: `src/lib/db.ts`(readonly 조회), `scripts/lib/schema.sql`(PRD §5 DDL), `scripts/lib/initDb.ts`(테이블 생성). `src/lib/paths.ts`에 `DB_PATH` 추가.
- [ ] 타입: `src/lib/types.ts`(`ArticleCard`, `RawItem`), `scripts/lib/schema.ts`(`CATEGORIES`, `articleEnrichmentSchema`).
- [ ] DESIGN.md 토큰 → `globals.css` CSS 변수/Tailwind 매핑(Action Blue, parchment, hairline, rounded).

### 핵심 파일
`package.json`, `.env.example`, `src/lib/paths.ts`, `src/lib/db.ts`, `src/lib/types.ts`, `scripts/lib/schema.sql`, `scripts/lib/schema.ts`, `scripts/lib/initDb.ts`, `src/app/globals.css`

### Acceptance / Tests / Verify
- [ ] `npx tsx scripts/lib/initDb.ts`로 빈 `data/app.db`에 6개 테이블 생성.
- [ ] `npm run typecheck`·`npm run lint` 통과.
- [ ] (test) `src/__tests__/db.test.ts` — 스키마 생성/조회 스모크.

---

## Phase 1: 트레이서 불릿 — RSS 1개 소스 end-to-end (LLM 없이)

**User stories:** 열람자 "한 곳에서 본다"(부분), 운영자 파이프라인 안정성(부분)
**목표:** RSS 1개(TechCrunch AI) → 수집 → dedup → SQLite 저장 → `/` 카드 1장 → `/article/[id]` 상세까지 **전 레이어 관통**. LLM/태그/필터/정렬 전 단계는 placeholder.

### 작업 (수직 슬라이스)
- [ ] `configs/sources.json`에 RSS 1건 시드.
- [ ] `scripts/collect.ts`: 수집(`rss-parser`) → `normalize(url)`+`dedup_key`(sha256) → SQLite 미존재 항목만 insert(`title_ko`/`summary_ko` 비움, 원본만 저장).
- [ ] `scripts/lib/trending.ts`: `trendingScore()`(PRD §3.2 코드) 적용.
- [ ] `/` 피드: `getFeed()`로 카드 렌더(출처·제목·게시시각·점수). DESIGN `store-utility-card`.
- [ ] `/article/[id]`: 원문 병기 + 원문 링크(새 탭).

### 핵심 파일
`configs/sources.json`, `scripts/collect.ts`, `scripts/lib/collect/rss.ts`, `scripts/lib/dedup.ts`, `scripts/lib/trending.ts`, `src/lib/db.ts`(`getFeed`/`getArticle`), `src/app/page.tsx`, `src/app/article/[id]/page.tsx`, `src/components/ArticleCard.tsx`

### Acceptance / Tests / Verify
- [ ] 배치 1회 실행 시 신규 기사만 저장, 재실행 시 중복 0건(`dedup_key` UNIQUE).
- [ ] `/`에서 카드 목록, 클릭 시 `/article/[id]` 이동, 원문 링크 새 탭.
- [ ] (test) `dedup.test.ts`(URL 정규화), `trending.test.ts`(점수 0~100·최신성 감쇠).
- [ ] (verify) `npx tsx scripts/collect.ts` → `npm run dev` → 브라우저로 카드/상세 확인.

---

## Phase 2: LLM 통합 가공 추가 (한국어 + 분류 + 태그 + 비용 기록)

**User stories:** 열람자 "한국어 요약으로 본다", "태그로 필터"(데이터 준비), 운영자 "비용 모니터링"(기록)
**목표:** 신규 항목에 LLM 1호출 가공을 끼워넣어 카드/상세에 한국어·카테고리·태그 노출.

### 작업
- [ ] `scripts/lib/enrich.ts`: `generateObject` + `articleEnrichmentSchema` + 시스템/few-shot 프롬프트 + prompt caching. 검증 실패 1회 재시도 후 스킵·로깅.
- [ ] `configs/prompts/enrich.system.md`, `enrich.fewshot.json`(PRD §7).
- [ ] `collect.ts`에 ③단계 결합 → `title_ko/summary_ko/category/importance/tags`(→ `tags`/`article_tags`) 저장.
- [ ] `collection_runs` 1행 기록: `llm_calls`/`input_tokens`/`output_tokens`/`est_cost_usd`/`status`.
- [ ] 카드/상세에 한국어 제목·요약·카테고리 배지·태그 칩 표시.

### 핵심 파일
`scripts/lib/enrich.ts`, `scripts/lib/schema.ts`, `scripts/lib/cost.ts`(토큰→비용), `configs/prompts/*`, `scripts/collect.ts`, `src/components/ArticleCard.tsx`, `src/app/article/[id]/page.tsx`

### Acceptance / Tests / Verify
- [ ] 1 기사 = 정확히 1 LLM 호출, 기존 기사 재가공 0(비용 0).
- [ ] 출력은 항상 Zod 통과, `category`는 enum만, `LLM_MODEL`로 전환 가능.
- [ ] 실행 후 `collection_runs`에 토큰·추정비용 기록.
- [ ] (test) `enrich.test.ts`(스키마 검증/재시도, AI SDK mock), `cost.test.ts`.
- [ ] (verify) 소량 실행 → 카드에 한국어 요약·태그·배지 표시 확인.

---

## Phase 3: 소스 확장 + 필터/정렬 완성 + 비용 가드

**User stories:** 열람자 "중요도순 정렬·태그 필터", 운영자 "소스 다양성·부분 실패 격리·비용 상한"
**목표:** 전체 시드 소스 수집 + 피드 필터/정렬 완성.

### 작업
- [ ] 수집 어댑터: `collect/api.ts`(HN Algolia/GitHub Search/HF Daily Papers), `collect/reddit.ts`(OAuth2 `client_credentials` 토큰 발급·갱신, 서브레딧 8종).
- [ ] 소스별 try/catch로 **부분 실패 격리**, 건수/실패 `collection_runs.notes` 로깅.
- [ ] 비용 가드: 신규 > `MAX_ITEMS_PER_RUN` 시 `trending_score` 상위만 가공.
- [ ] 피드: `?tag=`/`?source=`/`?sort=latest|importance` 쿼리 처리, 카테고리/태그 칩, ISR `revalidate`.

### 핵심 파일
`scripts/lib/collect/api.ts`, `scripts/lib/collect/reddit.ts`, `scripts/collect.ts`(가드·집계), `src/lib/db.ts`(`getFeed` 필터/정렬), `src/app/page.tsx`, `src/components/FilterBar.tsx`

### Acceptance / Tests / Verify
- [ ] 한 소스 실패해도 나머지 수집 지속, 소스별 건수 기록.
- [ ] Reddit OAuth2 토큰 자동 발급, engagement(`ups`/`num_comments`)가 트렌딩에 반영.
- [ ] 태그·소스 필터 + 최신/중요도 정렬 동작, 상한 초과 시 상위만 가공.
- [ ] (test) `reddit.test.ts`(토큰/파싱 mock), `api.test.ts`(응답 정규화), `getFeed.test.ts`(필터/정렬 SQL).
- [ ] (verify) 전체 수집 1회 → 다양한 소스 카드 + 필터/정렬 확인.

---

## Phase 4: 검색 (`/search`)

**User stories:** 열람자 "키워드로 과거 기사 탐색"
**목표:** FTS5(우선) 또는 LIKE 폴백으로 한국어 제목·요약·태그 검색.

### 작업
- [ ] `src/lib/db.ts` `searchArticles(q)` — `articles_fts` MATCH, 결과 없음/에러 시 LIKE 폴백.
- [ ] `/search?q=`: 동일 `ArticleCard` 재사용, 결과 없음 상태 명시.
- [ ] `collect.ts`에서 insert 시 `articles_fts` 동기화.

### 핵심 파일
`src/app/search/page.tsx`, `src/lib/db.ts`(`searchArticles`), `src/components/SearchInput.tsx`

### Acceptance / Tests / Verify
- [ ] 한국어 제목·요약·태그 대상 검색, 피드와 동일 카드, 결과 없음 명확.
- [ ] (test) `search.test.ts`(FTS 매칭 + 빈 결과).
- [ ] (verify) `/search?q=agent` 결과 확인.

---

## Phase 5: 관리자 운영 콘솔 (`/admin`)

**User stories:** 운영자 "코드 수정 없이 소스 관리", "즉시 재수집", "비용/통계 모니터링", "운영자 인증"
**목표:** 인증 섹션 + 소스 CRUD(GitHub 커밋) + 재수집 트리거 + 통계/비용 대시보드.

### 작업
- [ ] 인증: `middleware.ts`로 `/admin/*`·admin API 보호, `ADMIN_PASSWORD` 검증 → 서명 쿠키. 로그인 페이지.
- [ ] 소스 관리: `/api/admin/sources` → `configs/sources.json` 갱신 + `PUT .../contents` GitHub API 커밋. `url`/중복 `id` 유효성 검증. WEB "수집 예정" 배지.
- [ ] 재수집: `/api/admin/collect` → `workflow_dispatch`(collect.yml). 진행 중 버튼 비활성(중복 방지).
- [ ] 대시보드: `collection_runs` 최근 N회 표(수집/신규/토큰/비용/상태), 임계($0.30) 초과 강조.

### 핵심 파일
`middleware.ts`, `src/lib/auth.ts`, `src/app/admin/page.tsx`, `src/app/admin/login/page.tsx`, `src/app/api/admin/sources/route.ts`, `src/app/api/admin/collect/route.ts`, `src/lib/github.ts`, `src/components/admin/*`

### Acceptance / Tests / Verify
- [ ] 미인증 `/admin/*` → 로그인 리다이렉트. `GITHUB_PAT` 클라이언트 미노출.
- [ ] 소스 추가/수정/삭제/토글 → `sources.json` GitHub 커밋, 성공/실패 UI 표시.
- [ ] "지금 수집" → `workflow_dispatch` 성공 표시, 중복 클릭 차단.
- [ ] 대시보드에 실행별 통계·비용, 임계 초과 강조.
- [ ] (test) `auth.test.ts`, `sources-route.test.ts`(GitHub API mock, 유효성).
- [ ] (verify) 로컬 로그인 → 소스 토글 커밋(테스트 repo) → 대시보드 확인.

---

## Phase 6: 자동화 · 배포 · KPI 검증

**목표:** cron 자동화 + Vercel 배포 + PRD KPI 측정.

### 작업
- [ ] `.github/workflows/collect.yml`: `schedule`(일1회) + `workflow_dispatch`, `scripts/collect.ts` 실행 → `data/app.db` 커밋. Secrets 주입.
- [ ] Vercel 배포 설정(ISR `revalidate`), README 운영 가이드.
- [ ] KPI 측정: 비용/성공률/카드수/LCP/품질 샘플(PRD §9).

### 핵심 파일
`.github/workflows/collect.yml`, `vercel.json`(필요 시), `README.md`

### Acceptance / Tests / Verify
- [ ] cron + 수동 트리거 동작, 실행 후 `app.db` 커밋 → Vercel 배포.
- [ ] (verify) 30일/주간 KPI 표 충족 여부 점검(아래).

---

## Phase 의존성

```
Phase 0 (기반)
   └─ Phase 1 (RSS 트레이서 불릿)
         └─ Phase 2 (LLM 가공)
               ├─ Phase 3 (소스 확장 + 필터/정렬)
               │     └─ Phase 4 (검색)
               └─ Phase 5 (Admin)  ← Phase 1(파이프라인)+collection_runs 필요
                     └─ Phase 6 (자동화/배포/KPI)
```

## 검증 지표 (PRD §9 KPI)

| 항목 | 목표 | 달성 |
|---|---|:--:|
| 일일 LLM 비용 | ≤ $0.30 (Haiku, 신규 50~100건/일) | [ ] |
| 파이프라인 성공률 | ≥ 95% (최근 30일 cron) | [ ] |
| 일일 신규 카드 | ≥ 30건 | [ ] |
| 피드 LCP | ≤ 2.0s (데스크톱) | [ ] |
| 중복 제거 | 동일 기사 중복 0건 | [ ] |
| 한국어 요약 품질 | 주간 20건 샘플 통과율 ≥ 90% | [ ] |
| 소스 변경 반영 | 콘솔 저장 → 재배포 ≤ 10분 | [ ] |

## 전체 검증 방법

1. `npm install && npx tsx scripts/lib/initDb.ts` → DB 초기화.
2. `npx tsx scripts/collect.ts` → 수집·가공 1회, `collection_runs` 비용 로그 확인.
3. `npm run dev` → `/` 필터·정렬, `/article/[id]` 병기, `/search` 검색, `/admin`(로그인 후) 소스/대시보드 확인.
4. `npm run lint && npm run typecheck && npm test` 통과.
5. (배포) 테스트 repo에서 `workflow_dispatch` 수동 트리거 → `app.db` 커밋 → Vercel 미리보기 ISR 확인.

## 주요 참조

- [PRD.md](PRD.md) — 요구사항 원천
- [../DESIGN.md](../DESIGN.md) — 디자인 토큰
- [../CLAUDE.md](../CLAUDE.md) — 스택/컨벤션
