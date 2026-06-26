# CLAUDE.md

**Daily AI Brief** — 글로벌·한국의 AI/IT 뉴스를 매일 1회 자동 수집하고 LLM으로 한국어 요약·분류·중요도 평가하여 카드형 피드로 제공하는, 토큰 비용을 최소화한 큐레이션 웹서비스입니다.

운영비 ≈ 0을 목표로 **SQLite 파일 DB + GitHub Actions cron + GitHub Pages 정적 배포(전환 진행 중)** 위에서 동작하며, 신규 항목만 LLM 단일 호출로 가공해 토큰 비용을 구조적으로 절감합니다.

- 요구사항 원천: [docs/PRD.md](docs/PRD.md) (Daily AI Brief PRD v1.0)
- 개발 계획·진행 현황: [docs/WORK-PLAN.md](docs/WORK-PLAN.md)
- 배포 전환: [docs/PRD-github-pages.md](docs/PRD-github-pages.md) (GitHub Pages 배포 전환 PRD v1.0)
- 배포 전환 작업 계획·진행 현황: [docs/WORK-PLAN-github-pages.md](docs/WORK-PLAN-github-pages.md) (Phase 0~5 체크리스트)
- 디자인 토큰/원칙: [DESIGN.md](DESIGN.md)

> **현재 구현 단계:** Phase 0~6 전체 완료. 수집 파이프라인·LLM 가공·검색·Admin 콘솔·GitHub Actions 자동화까지 모두 구현됨. 단계별 상세·체크리스트는 [docs/WORK-PLAN.md](docs/WORK-PLAN.md)를 단일 출처로 참조합니다.

> **배포 전환 진행 중 — 클린 컷오버 (`deploy/github-pages`):** Vercel/`standalone`을 **폐기**하고 GitHub Pages 정적 호스팅으로 **완전 전환**합니다(공존·토글 없음). `output:'export'`를 빌드 기본값으로 삼아 `npm run build`가 곧 정적 export이며, `deploy.yml`이 GitHub Pages로 배포합니다. 목표 아키텍처는 본 문서에 반영했으나 일부는 아직 코드 미구현 상태입니다(`output:'export'`, `deploy.yml`, 클라이언트 검색 등) — 아래 "(전환 후)"/"(예정)" 마커와 [docs/PRD-github-pages.md](docs/PRD-github-pages.md)·[docs/WORK-PLAN-github-pages.md](docs/WORK-PLAN-github-pages.md)를 참조하세요. admin/api/middleware는 **로컬 `next dev` 운영 도구로 잔존**(프로덕션 빌드에서만 제외)하며, 공개 3페이지(피드/상세/검색)·디자인·데이터 모델·수집·LLM 가공은 변경하지 않습니다.

## 기술 스택

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (strict)
- **Styling**: TailwindCSS v4, shadcn/ui (New York, baseColor: zinc)
- **Database**: SQLite (`better-sqlite3`) — 파일 DB `data/app.db`, 빌드/렌더 시 readonly 조회
- **수집**: `rss-parser` (RSS/Atom), HN/GitHub/HuggingFace/Reddit 집계 API
- **AI/LLM**: Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) — `generateObject` + Zod, 기본 모델 `claude-haiku-4-5`
- **스키마/검증**: `zod` (LLM 출력 구조화)
- **스크립트 실행**: `tsx` (배치 `scripts/*.ts`)
- **Package manager**: npm
- **Linter/Formatter**: ESLint (next flat config), Prettier (+ prettier-plugin-tailwindcss)
- **Test**: Vitest + React Testing Library (jsdom)
- **Runtime**: Node.js 20+
- **인프라(전환 후 목표 — 클린 컷오버)**: GitHub Actions cron(일 1회, `0 21 * * *` UTC = 06:00 KST) → `data/app.db` git 커밋 → `deploy.yml`이 정적 export(`npm run build`, `output:'export'` 기본값) → GitHub Pages 배포
  - _현재 코드는 아직 `output:'standalone'` + Vercel ISR 재배포 전제이며, 전환 시 standalone/Vercel 전제는 제거됩니다(되돌릴 땐 git revert)._

## 디렉토리 구조

```
.
├── src/                          # 웹 애플리케이션 소스
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx              # 피드(홈, /) — SSG(빌드타임) + 클라 필터 (전환 후)
│   │   ├── globals.css           # Tailwind v4 + DESIGN.md 디자인 토큰
│   │   ├── article/[id]/page.tsx # 상세(/article/[id]) — SSG generateStaticParams (전환 후)
│   │   ├── search/page.tsx       # 검색(/search) — 정적 셸 + 클라이언트 검색 (전환 후)
│   │   ├── admin/                # 운영 콘솔 — 로컬 전용(배포 제외, 전환 후)
│   │   │   ├── page.tsx          # 운영 콘솔(/admin) — SSR+인증
│   │   │   └── login/page.tsx    # 로그인
│   │   └── api/                  # Route Handler — 로컬 전용(배포 제외, 전환 후)
│   │       ├── health/route.ts   # 헬스체크
│   │       └── admin/
│   │           ├── login/route.ts
│   │           ├── logout/route.ts
│   │           ├── sources/route.ts   # 소스 CRUD
│   │           └── collect/route.ts   # workflow_dispatch 트리거
│   ├── components/
│   │   ├── ArticleCard.tsx       # 피드/검색 공용 카드
│   │   ├── ArticleMeta.tsx       # 카테고리 배지·태그 칩
│   │   ├── FilterBar.tsx         # 태그/소스/정렬 필터 pill
│   │   ├── SearchInput.tsx       # 클라이언트 라이브 검색 (디바운스)
│   │   ├── admin/                # Admin 전용 컴포넌트 (KpiPanel 등)
│   │   └── ui/                   # shadcn/ui 프리미티브
│   ├── lib/
│   │   ├── db.ts                 # SQLite readonly 조회 (getFeed/getArticle/searchArticles/getRecentRuns/getKpiSummary)
│   │   ├── types.ts              # RawItem, ArticleCard, SourceConfig, RunRow 등
│   │   ├── paths.ts              # 프로젝트 경로 상수 (DB_PATH 등)
│   │   ├── auth.ts               # HMAC 서명 쿠키 인증
│   │   ├── github.ts             # sources.json GitHub 커밋
│   │   ├── sources.ts            # sources.json 로컬 읽기/쓰기
│   │   ├── config.ts             # configs/ 로더
│   │   └── utils.ts              # shadcn cn() 유틸
│   └── middleware.ts             # /admin/* 인증 보호 — 로컬 전용(정적 export 시 미산출, 전환 후)
├── scripts/                      # 배치 파이프라인 (tsx 실행)
│   ├── collect.ts                # 수집→전처리→LLM→SQLite 오케스트레이터
│   ├── export-search-index.ts    # 검색 인덱스 JSON 생성 (예정)
│   ├── kpi.ts                    # KPI CLI (npm run kpi)
│   └── lib/
│       ├── schema.ts             # CATEGORIES enum, articleEnrichmentSchema(Zod)
│       ├── schema.sql            # SQLite DDL + FTS5 트리거
│       ├── initDb.ts             # 테이블 생성 (npm run db:init)
│       ├── reindexFts.ts         # FTS 재색인 (npm run db:reindex)
│       ├── dedup.ts              # URL 정규화 + dedup_key(sha256)
│       ├── trending.ts           # 코드 기반 트렌딩 점수
│       ├── enrich.ts             # generateObject + prompt caching
│       ├── cost.ts               # 토큰→비용 산출 (Haiku 단가)
│       ├── tags.ts               # tags/article_tags upsert
│       └── collect/
│           ├── rss.ts            # RSS/Atom 어댑터
│           ├── api.ts            # HN Algolia / GitHub Search / HF Daily Papers
│           └── reddit.ts         # Reddit OAuth2 client_credentials
├── configs/
│   ├── sources.json              # 소스 정의 (Admin이 GitHub API로 커밋)
│   └── prompts/
│       ├── enrich.system.md      # 시스템 프롬프트 (캐싱)
│       └── enrich.fewshot.json   # few-shot 예시 (캐싱)
├── .github/workflows/
│   ├── collect.yml               # cron 일 1회 + workflow_dispatch
│   └── deploy.yml                # 정적 빌드 → GitHub Pages 배포 (예정)
├── data/
│   └── app.db                    # SQLite DB (db:init/collect로 생성)
├── docs/                         # PRD.md, PRD-github-pages.md, WORK-PLAN.md
├── public/                       # 정적 자산 (search-index.json: 빌드 생성, 예정)
└── DESIGN.md                     # 모노크롬·타이포 중심 디자인 토큰/가이드
```

## 아키텍처 / 파이프라인

배치(`scripts/collect.ts`)가 GitHub Actions cron으로 일 1회 실행되어 다음 4단계를 수행합니다 (PRD §4):

1. **수집** — `rss-parser`로 RSS/Atom, HN Algolia·GitHub Search·HuggingFace Daily Papers API, Reddit OAuth2(`client_credentials`)에서 raw item 수집. 소스별 try/catch로 부분 실패 격리.
2. **코드 전처리** — `normalize(url)` + `dedup_key`(sha256) 중복 제거, `trendingScore()`로 1차 트렌딩 점수 산출. 기존 DB 항목은 스킵 → 신규만 다음 단계로. 신규 > `MAX_ITEMS_PER_RUN`(150) 시 상위만 가공(비용 가드).
3. **LLM 통합 가공** — 신규 1건당 `generateObject`(Haiku) **단일 호출**로 한국어 제목·요약·카테고리·태그·중요도를 Zod 스키마로 생성. Anthropic prompt caching 적용.
4. **저장** — `better-sqlite3`로 `articles`/`tags`/`article_tags` upsert + 실행 통계(`llm_calls`/토큰/비용/상태)를 `collection_runs`에 1행 기록.

결과 `data/app.db`를 git 커밋 → **(전환 후)** `deploy.yml`(GitHub Actions)이 정적 export(`output:'export'`)로 빌드해 `out/`을 생성하고 GitHub Pages에 배포. `[skip ci]`/트리거 정책은 배포 워크플로에 맞춰 조정합니다(PRD-github-pages.md §3.6). _(현재 코드는 `[skip ci]` 커밋 → Vercel ISR 재배포 전제입니다.)_

### 라우트 & 렌더링

렌더링/접근 열은 **전환 후 목표** 기준입니다(현재 코드는 Vercel 런타임 기준 — 위 전환 배너 참조).

| 경로                                       | 페이지                    | 렌더링 / 접근 (전환 후)        | 배포 포함     |
| ------------------------------------------ | ------------------------- | ------------------------------ | ------------- |
| `/`                                        | 피드(홈)                  | SSG(빌드타임) + 클라 필터 · 공개 | ✅            |
| `/article/[id]`                            | 상세                      | SSG(generateStaticParams) · 공개 | ✅            |
| `/search`                                  | 검색                      | 정적 셸 + 클라이언트 검색 · 공개 | ✅            |
| `/admin`                                   | 운영 콘솔                 | 로컬 전용(`next dev`) · 인증    | ❌ 배포 제외  |
| `/api/admin/sources`, `/api/admin/collect` | 소스 커밋 / 재수집 트리거 | 로컬 전용                       | ❌ 배포 제외  |
| `/api/health`                              | 헬스체크                  | 로컬 전용                       | ❌ 배포 제외  |

## 개발 워크플로우

### 환경 설정

```bash
npm install

cp .env.example .env.local
# Phase 2부터 .env.local 에 ANTHROPIC_API_KEY 입력
# (Phase 1 수집은 별도 API 키 불필요)
```

### 데이터 파이프라인

```bash
npm run db:init   # data/app.db 에 6개 테이블 생성
npm run collect   # 수집 → 전처리(dedup/trending) → (LLM) → SQLite 배치 1회
```

### 개발 서버

```bash
npm run dev       # http://localhost:3000
```

### 빌드 / 실행

```bash
npm run build
npm run start
```

### 테스트

```bash
npm test           # 1회 실행
npm run test:watch # watch 모드
```

### 린트 / 포맷 / 타입체크

```bash
npm run lint
npm run format
npm run typecheck
```

### Docker

```bash
docker compose up --build
```

## 환경변수

`.env.local`에 설정하며 git에 커밋하지 않습니다 (`.env.example` 참조). 도입 Phase 기준:

| 변수                                        | 용도                                              | 필수 여부              |
| ------------------------------------------- | ------------------------------------------------- | ---------------------- |
| `ANTHROPIC_API_KEY`                         | LLM 가공 호출 (수집 `collect.yml` 전용 — 변화 없음) | 필수                   |
| `LLM_MODEL`                                 | 모델 전환 (기본 `claude-haiku-4-5`)               | 선택                   |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Reddit OAuth2 `client_credentials` (수집 전용 — 변화 없음) | 선택 (Reddit 수집 시)  |
| `GITHUB_PAT`                                | `configs/sources.json` 커밋 + `workflow_dispatch` — **로컬 admin 전용(배포 불필요)** | 선택 (GitHub 연동 시)  |
| `GITHUB_REPO`                               | `owner/repo` — **로컬 admin 전용(배포 불필요)**    | 선택 (GitHub 연동 시)  |
| `ADMIN_PASSWORD`                            | 운영자 인증 — **로컬 admin 전용(배포 불필요)**     | 필수 (로컬 Admin 사용) |
| `STATIC_EXPORT`                             | 프로덕션 빌드에서 admin/api/middleware 제외용(빌드 전용, 빌드 phase 감지로 대체 가능). `output:'export'`는 기본값이라 토글 불필요 (예정) | 선택 (배포 빌드 시)    |

## 데이터 모델

SQLite 6개 테이블 (DDL: `scripts/lib/schema.sql`, 상세: PRD §5):

- `sources` — 소스 메타 (`configs/sources.json`과 동기화)
- `articles` — 수집 원본 + LLM 가공 결과 통합
- `tags`, `article_tags` — 태그 다대다 매핑
- `articles_fts` — FTS5 검색 가상 테이블 (Phase 4)
- `collection_runs` — 배치 실행 이력 (토큰·비용·상태)

핵심 타입: `RawItem`(수집 원본)·`ArticleCard`(렌더 DTO) → `src/lib/types.ts`, `articleEnrichmentSchema`(LLM 출력 Zod)·`CATEGORIES`(6종 enum) → `scripts/lib/schema.ts`.

## LLM 가공

LLM 호출은 채팅 엔드포인트가 아니라 **배치 파이프라인** 안에서만 일어납니다. 신규 기사 1건당 `generateObject` + `articleEnrichmentSchema`(Zod)로 한국어 제목·요약·카테고리·태그·중요도를 단일 호출 JSON으로 생성합니다.

- 구현 위치: `scripts/lib/enrich.ts`
- 프롬프트: `configs/prompts/enrich.system.md`(시스템·캐싱), `enrich.fewshot.json`(few-shot·캐싱) + 가변 유저 메시지 (PRD §7)
- 비용 절감: 코드 선필터(신규만) → 단일 호출 통합 → Anthropic prompt caching → 입력/출력 토큰 상한 (PRD §3.4)
- 비용 기록: `scripts/lib/cost.ts`(Haiku 단가 $1/$5 per M) → `collection_runs` 실행마다 1행 기록

## 주요 경로 별칭

`tsconfig.json`에 `@/*` → `./src/*` 별칭이 설정되어 있습니다.

- `@/lib/db` → `src/lib/db.ts`
- `@/lib/types` → `src/lib/types.ts`
- `@/lib/paths` → `src/lib/paths.ts`
- `@/components/ArticleCard` → `src/components/ArticleCard.tsx`

> `scripts/`는 별도 tsx 실행 영역으로 `@/*` 별칭 대상이 아니며 상대 경로를 사용합니다.

## shadcn/ui 컴포넌트 추가

```bash
npx shadcn@latest add card dialog input
```

설정(`components.json`):

- style: `new-york`
- baseColor: `zinc`
- Tailwind v4 사용 → `tailwind.config`는 빈 문자열

## 디자인 가이드 (DESIGN.md)

프로젝트 루트의 `DESIGN.md`는 모노크롬·타이포그래피 중심의 모바일 우선 뉴스 리더 UI 스타일 가이드입니다.

- **UI 마크업/스타일링 작업 전 반드시 `DESIGN.md`를 참조**합니다.
- 디자인 토큰은 `src/app/globals.css`에 CSS 변수로 매핑되어 있습니다(Tailwind v4 `@theme inline` — 단일 출처).
- 핵심 원칙: **브랜드 강조색 없음 — 강조는 색이 아닌 대비**(잉크 `#1d1d1f` ↔ 파치먼트 `#f5f5f7`, 다크모드 반전). 단일 자체 호스팅 폰트 **Pretendard Variable**(한글·라틴 통합). 라이트/다크 동등 지원(`next-themes` `.dark` 클래스). 헤어라인 보더 카드(반경 18px)·풀 pill 칩/배지. 모바일 우선 앱 셸(데스크톱 프로스티드 헤더 ↔ 모바일 상단바+하단 탭바). **그림자·그라데이션·2차 강조색 금지.** 유일한 유채색은 `destructive`(빨강)로 Admin 파괴적 동작에만 사용.

## Claude 에이전트 목록

`.claude/agents/` 에 프리셋 에이전트가 준비되어 있습니다.

### Dev 에이전트

| 에이전트               | 용도                                 |
| ---------------------- | ------------------------------------ |
| `development-planner`  | ROADMAP.md 작성 및 개발 계획 수립    |
| `nextjs-app-developer` | Next.js App Router 구조 설계 및 구현 |
| `starter-cleaner`      | 스타터킷 보일러플레이트 정리         |
| `ui-markup-specialist` | UI 컴포넌트 마크업 및 스타일링       |
| `code-reviewer`        | 코드 리뷰                            |

### Docs 에이전트

| 에이전트        | 용도                   |
| --------------- | ---------------------- |
| `prd-generator` | PRD 문서 생성          |
| `prd-validator` | PRD 기술적 타당성 검증 |

> 참고: `backend-developer` 에이전트는 FastAPI/LangGraph 전용이므로 본 프로젝트에서는 사용하지 않습니다.

## 코딩 컨벤션

- TypeScript strict 모드 준수
- Next.js App Router: 서버 컴포넌트 기본, 인터랙션이 필요한 경우에만 `"use client"`
- 스타일: TailwindCSS 유틸리티 + shadcn/ui 프리미티브, `cn()`으로 클래스 병합
- UI 작업 시 `DESIGN.md`의 디자인 토큰과 원칙을 우선 적용
- 경로 별칭 `@/*` 사용 (상대 경로 지양). 단 `scripts/`는 상대 경로
- 소스 정의는 `configs/sources.json`으로 관리 (코드 하드코딩 금지)
- 런타임 경로 상수는 `src/lib/paths.ts`, 설정 파일은 `configs/`에서 관리
- DB 조회는 `src/lib/db.ts`를 통해 readonly로 접근
- 환경 변수는 `.env.local` 사용 (git에 커밋하지 않음)
- 커밋 전 `npm run lint && npm run typecheck && npm test` 실행 권장
