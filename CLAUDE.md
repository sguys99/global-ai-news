# CLAUDE.md

**Daily AI Brief** — 글로벌·한국의 AI/IT 뉴스·오픈소스·모델·논문을 매일 1회 자동 수집하고 LLM으로 한국어 요약·분류·중요도 평가하여, 매일 발행되는 한 호(號)의 편집 지면으로 제공하는, 토큰 비용을 최소화한 큐레이션 웹서비스입니다.

운영비 ≈ 0을 목표로 **SQLite 파일 DB + GitHub Actions cron + GitHub Pages 정적 배포** 위에서 동작하며, LLM이 하루치 후보에서 35건 이하만 골라(같은 사건 묶기) 묶음 가공하고 Message Batches API(50% 할인)로 보내 1회 수집 비용을 $0.1 이하로 묶습니다.

- 요구사항 원천: [docs/PRD.md](docs/PRD.md) (Daily AI Brief PRD — v1.1에서 분야·형식·1면 반영)
- 개발 계획·진행 현황: [docs/WORK-PLAN.md](docs/WORK-PLAN.md)
- 배포 전환: [docs/PRD-github-pages.md](docs/PRD-github-pages.md) · [docs/WORK-PLAN-github-pages.md](docs/WORK-PLAN-github-pages.md) (Phase 0~5 완료)
- 콘텐츠·1면 개편: [docs/contents-upgrade-plan.md](docs/contents-upgrade-plan.md) (분야 6개·형식 축·호 단위 1면·소스 확장·선별 개편 결정 기록)
- 디자인 토큰/원칙: [DESIGN.md](DESIGN.md) (v2.1)

> **현재 구현 단계:** WORK-PLAN Phase 0~6, GitHub Pages 전환(클린 컷오버), 콘텐츠·1면 개편 Phase 1~6 완료. 개편 Phase 7(통합 검증·문서 갱신) 진행 중. 상세 체크리스트는 각 계획 문서가 단일 출처입니다.

> **배포 구조 (`deploy/github-pages`):** Vercel/`standalone`은 폐기됐습니다. `npm run build`(= `PHASE_PRODUCTION_BUILD`)가 곧 `output:'export'` 정적 export(`out/`, `basePath:'/global-ai-news'`)이고 `deploy.yml`이 GitHub Pages로 배포합니다. admin/api/middleware는 `*.local.ts(x)` 파일로 두고 `pageExtensions` 게이팅으로 **로컬 `next dev`에서만** 라우트가 됩니다(프로덕션 빌드에서 제외). 개편 작업 브랜치는 `feat/contents-upgrade`이며, 일일 수집 커밋(`data/app.db`)은 `deploy/github-pages`에 쌓입니다.

## 기술 스택

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (strict)
- **Styling**: TailwindCSS v4, shadcn/ui (New York, baseColor: zinc)
- **Database**: SQLite (`better-sqlite3`) — 파일 DB `data/app.db`, **빌드타임 readonly 조회**(정적 export → 공개 페이지 런타임 DB 접근 없음; 로컬 `next dev` admin만 런타임 조회)
- **검색**: 빌드 시 `public/search-index.json` 생성 → 브라우저에서 FlexSearch(`flexsearch`)로 검색
- **수집**: `rss-parser` (RSS/Atom), HN Algolia·GitHub(Search API·트렌딩 페이지)·HuggingFace(Daily Papers·트렌딩 모델)·arXiv API(+ Semantic Scholar·OpenAlex 게이트). Reddit 어댑터는 남아 있으나 등록된 소스는 없음
- **AI/LLM**: Anthropic SDK (`@anthropic-ai/sdk`, 수집 파이프라인 전용) — Message Batches API + 구조화 출력(`output_config.format`, `zod/v4` 스키마), 기본 모델 `claude-haiku-4-5`
- **스키마/검증**: `zod` (LLM 출력 구조화)
- **스크립트 실행**: `tsx` (배치 `scripts/*.ts`)
- **Package manager**: npm
- **Linter/Formatter**: ESLint (next flat config), Prettier (+ prettier-plugin-tailwindcss)
- **Test**: Vitest + React Testing Library (jsdom)
- **Runtime**: Node.js 20+ (빌드/스크립트 기준; 빌드·CI(`collect.yml`·`deploy.yml`)는 Node 22 고정)
- **인프라**: 외부 크론(cron-job.org)이 06:00 KST 에 `collect.yml` 을 `workflow_dispatch`(GitHub `schedule` 은 2~8h 지연돼 06:47 KST 백업 전용 — 이미 발행된 날은 `guard` 잡이 건너뜀, README "발행 트리거") → `data/app.db` 를 `deploy/github-pages` 에 커밋 → `deploy.yml` 을 dispatch → 정적 export → GitHub Pages 배포

## 디렉토리 구조

```
.
├── src/                          # 웹 애플리케이션 소스
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx              # 홈(/) — 최신 호 지면 SSG + 누적 색인 클라 필터
│   │   ├── globals.css           # Tailwind v4 + DESIGN.md 디자인 토큰
│   │   ├── icon.svg              # 파비콘 원본(이니셜 "D.") — favicon.ico·apple-icon.png 는 여기서 래스터화
│   │   ├── article/[id]/page.tsx # 상세(/article/[id]) — SSG generateStaticParams
│   │   ├── search/page.tsx       # 검색(/search) — 정적 셸 + SearchClient
│   │   ├── edition/[date]/page.tsx # 호 고정 링크(/edition/YYYY-MM-DD) — 그날 수집분(호) 지면 SSG
│   │   ├── og/                   # 공유 썸네일(og:image) — 빌드타임 PNG: edition/<날짜>·article/<id>(최근 기사만)·default
│   │   ├── admin/                # 운영 콘솔 — 로컬 전용(page.local.tsx, login/page.local.tsx)
│   │   └── api/                  # Route Handler — 로컬 전용(route.local.ts)
│   │       ├── health/
│   │       └── admin/{login,logout,sources,collect}/  # 인증·소스 커밋·workflow_dispatch 트리거
│   ├── components/
│   │   ├── Masthead.tsx          # 마스트헤드(폴리오·제호·'귀' 이번 호 통계·섹션 내비)
│   │   ├── IssueDelayNotice.tsx  # 발행 지연 줄 "발행 전/발행 지연"(브라우저 KST 시각으로 판정)
│   │   ├── ShareButton.tsx       # 호 공유(모바일 공유 시트·데스크톱 링크 복사) — 호 고정 링크를 공유
│   │   ├── Edition.tsx           # FrontPage(리드·서브·오늘의 브리핑)·RadarBand·TrendingList(지금 화제)·이 호의 지면·SectionBands
│   │   ├── Story.tsx             # 스토리 변형 6종(Lead/Secondary/SectionItem/Brief/Radar/Entry)
│   │   ├── StoryIndex.tsx        # 전체 기사 색인(30건씩 더 보기)
│   │   ├── ArticleMeta.tsx       # 신호: 키커·FormatBadge·중요도 미터·바이라인·화제 바·태그
│   │   ├── RelativeTime.tsx      # 상대 시각("3시간 전") — 정적 HTML은 호 발행 시각 기준, 마운트 후 실시각
│   │   ├── FeedView.tsx / FeedClient.tsx # 홈 지면+색인 렌더 / useSearchParams 필터 래퍼
│   │   ├── SearchClient.tsx      # 검색 인덱스 fetch + FlexSearch + 필터·정렬
│   │   ├── FilterBar.tsx         # 정렬 탭 + 분야/매체/태그 필터 칩
│   │   ├── EditionPager.tsx      # 지난 호 이전/다음
│   │   ├── HeaderWordmark.tsx    # 헤더 워드마크(홈에선 제호를 지나면 등장)
│   │   ├── SearchInput.tsx       # 라이브 검색 입력 (디바운스)
│   │   ├── mobile/               # 모바일 앱 셸(MobileTopBar·BottomTabBar·FilterSheet)
│   │   ├── admin/                # Admin 전용 컴포넌트 (KpiPanel·SourceManager 등)
│   │   └── ui/                   # shadcn/ui 프리미티브
│   ├── lib/
│   │   ├── db.ts                 # SQLite readonly 조회 (getFeed/getArticle/getIssueArticles/getEditionRefs/getLatestEditionRef/searchArticles/getKpiSummary 등)
│   │   ├── types.ts              # RawItem, ArticleCard(format 포함), SourceConfig, RunRow 등
│   │   ├── edition.ts            # 1면 편집(buildEdition: 리드·서브·브리핑·레이더·화제·섹션) + frontArticles·issueStats
│   │   ├── labels.ts             # 분야 CATEGORIES·표시명·코드, 형식 FORMATS·배지, 소스 축약명, KST 날짜·상대 시각·발행 지연 문구 (단일 출처)
│   │   ├── radarMeta.ts          # 레이더 카드 메타 레일(리포 ★·모델 파라미터·논문 arXiv ID 등)
│   │   ├── feedFilter.ts         # 클라 필터·정렬 + URL 옵션 파싱(구 분야값 URL 호환)
│   │   ├── searchIndex.ts        # FlexSearch 문서 빌드·질의
│   │   ├── site.ts               # 사이트 정체성·공유 메타(OG/카카오톡 미리보기) 단일 출처
│   │   ├── ogImage.tsx           # 공유 썸네일 렌더러(next/og + Google Fonts 정적 TTF)
│   │   ├── paths.ts              # 프로젝트 경로 상수 (DB_PATH·EVAL_DIR 등)
│   │   ├── auth.ts               # HMAC 서명 쿠키 인증
│   │   ├── github.ts             # sources.json GitHub 커밋
│   │   ├── sources.ts            # sources.json 로컬 읽기/쓰기 + admin 스키마 검증(format·topic·keywordFilter)
│   │   ├── config.ts             # configs/ 로더
│   │   └── utils.ts              # shadcn cn() — 글자 크기 토큰(FONT_SIZE_TOKENS)을 twMerge에 등록
│   └── middleware.local.ts       # /admin/* 인증 보호 — 로컬 전용
├── scripts/                      # 배치 파이프라인 (tsx 실행)
│   ├── collect.ts                # 수집→전처리→선별→가공→재보도 검사→SQLite 오케스트레이터 (--dry-run / --no-save / --db)
│   ├── reclassify.ts             # 구 분야값 → 6개 키 LLM 재분류 (npm run db:reclassify, 기본 dry-run)
│   ├── triage-compare.ts         # no-save 스냅숏으로 개편 전후 선별 비교 (npm run triage:compare)
│   ├── export-search-index.ts    # public/search-index.json 생성 (prebuild)
│   ├── export-latest.ts          # 최근 3일 수집분 public/latest.json — 외부 소비용(자랑터 큐레이터, prebuild)
│   ├── kpi.ts                    # KPI CLI (npm run kpi) + baseline 하위 명령(콘텐츠 개편 지표)
│   └── lib/
│       ├── schema.ts             # 선별·가공·재보도 출력 스키마(zod/v4), CATEGORIES 재수출(정의는 src/lib/labels.ts)
│       ├── schema.sql            # SQLite DDL + FTS5 트리거
│       ├── initDb.ts             # 테이블 생성 (npm run db:init) + ensureSchema(컬럼 마이그레이션), --existing(prebuild)
│       ├── syncSources.ts        # configs/sources.json → sources 테이블 동기화(format 포함, 비활성 포함 전체)
│       ├── reindexFts.ts         # FTS 재색인 (npm run db:reindex)
│       ├── dedup.ts              # URL 정규화 + dedup_key(sha256)
│       ├── trending.ts           # 코드 기반 트렌딩 점수(HN·GitHub stars_today·HF likes 등)
│       ├── llm.ts                # Claude 호출 계층 (Batches API + 일반 호출 대체, usage 비용 누적)
│       ├── triage.ts             # 선별 풀(형식·Physical AI 최소 할당) + LLM 선별(PICK_QUOTAS·이미 보도함·할당 경고)
│       ├── enrich.ts             # LLM 가공: 선정 기사 10건씩 묶음 → 한국어 제목·요약·분야·태그 (형식 줄 포함)
│       ├── repeatCheck.ts        # LLM 재보도 검사: 가공 제목·요약 첫 문장 ↔ 최근 호 게재분 대조, 새 전개 없는 재보도 제외(코드 확인으로 오탐 기각, 실패 시 전부 게재)
│       ├── textTokens.ts         # 재보도 코드 확인용 내용어 토큰(조사·어미 절단, 회사 표기 통일, 일반어 제외)
│       ├── cost.ts               # 토큰→비용 산출 (Haiku 단가, Batches 50% 할인, 문자 종류별 토큰 추정)
│       ├── tags.ts               # tags/article_tags upsert
│       ├── env.ts                # 환경변수 헬퍼(Actions 빈 vars → 코드 기본값)
│       ├── evalRun.ts            # dry-run·no-save 인자·스냅숏(data/eval/, git 제외)·분포 집계
│       ├── baseline.ts           # kpi baseline 집계(형식·분야·Physical AI·1면 지표)
│       └── collect/
│           ├── rss.ts            # RSS/Atom 어댑터 + SourceConfig 타입
│           ├── api.ts            # HN Algolia / GitHub Search·Trending / HF Daily Papers / HF 트렌딩 모델
│           ├── arxiv.ts          # arXiv 어댑터("유명 논문" 게이트) — scholar.ts(인용·소속)·paperFilter.ts 사용
│           ├── keywordFilter.ts  # 소스별 키워드 사전 필터(configs/keyword-filters.json)
│           └── reddit.ts         # Reddit OAuth2 client_credentials (현재 등록 소스 없음)
├── configs/
│   ├── sources.json              # 소스 정의 — format·topic·keywordFilter·maxItems (Admin이 GitHub API로 커밋)
│   ├── keyword-filters.json      # 키워드 사전 필터 목록(예: github_trending 의 "ai")
│   ├── paper-filter.json         # arXiv 인용·기관 게이트, HF Papers upvote 임계값
│   └── prompts/
│       ├── triage.system.md      # 선별 시스템 프롬프트 (형식별 선정 기준·묶기·중요도·할당·이미 보도함)
│       ├── enrich.system.md      # 가공 시스템 프롬프트 ({{CATEGORIES}} 자리에 categories.md 삽입)
│       ├── categories.md         # 분야 6개 정의·경계 규칙 단일 출처 (가공·재분류 공용)
│       ├── repeat.system.md      # 재보도 검사 시스템 프롬프트
│       └── enrich.fewshot.json   # 가공 few-shot 6건 (뉴스·Physical AI·리포·모델·논문)
├── .github/workflows/
│   ├── collect.yml               # 외부 크론 dispatch + schedule 백업 → 수집 → app.db 커밋 → deploy dispatch
│   └── deploy.yml                # 정적 빌드 → GitHub Pages 배포
├── data/
│   ├── app.db                    # SQLite DB (db:init/collect로 생성)
│   └── eval/                     # collect --no-save 스냅숏 (git 제외)
├── docs/                         # PRD.md, PRD-github-pages.md, WORK-PLAN*.md, contents-upgrade-plan.md, design/mockups/
├── public/                       # 정적 자산 + 빌드 생성물(search-index.json·latest.json)
└── DESIGN.md                     # v2.1 "Edition" 에디토리얼 디자인 토큰/가이드
```

## 아키텍처 / 파이프라인

배치(`scripts/collect.ts`)가 GitHub Actions로 일 1회 실행되어 다음 단계를 수행합니다 (PRD §4, 개편 결정은 contents-upgrade-plan):

1. **수집** — RSS/Atom, HN Algolia, GitHub(토픽 검색 3개 + 트렌딩 페이지), HuggingFace(Daily Papers·트렌딩 모델), arXiv(cs.CL·cs.RO, 인용·기관 게이트)에서 raw item 수집. 소스별 try/catch로 부분 실패 격리. `keywordFilter`가 지정된 소스는 수집 직후 키워드 없는 항목을 버린다(dedup 키도 남기지 않음).
2. **코드 전처리** — `normalize(url)` + `dedup_key`(sha256) 중복 제거(`articles`·`seen_items` 모두 스킵), `trendingScore()` 산출, 소스별 신규 상한(`maxItems`). 신규 후보 + 최근 7일 가공 실패분을 소스별 라운드로빈으로 선별 풀(`TRIAGE_POOL_SIZE`, 180건)에 담되, **비뉴스 2/9·Physical AI 소스(`topic: physical`) 1/9 최소 할당**을 보장한다.
3. **LLM 선별 → 가공 → 재보도 검사** — 선별 1회로 최대 `MAX_PICKS_PER_RUN`(35)건을 고르고 같은 사건을 묶고 중요도(1~5, 형식 안에서 상대 평가)를 매긴다. 선정 기사만 10건씩 묶어 한국어 제목·요약·분야·태그를 생성한 뒤, 재보도 검사 1회로 새 전개 없는 재보도를 뺀다. 모든 호출은 Message Batches API(50% 할인, 시간 초과 시 일반 호출로 대체), 실행당 비용 상한 `MAX_COST_USD_PER_RUN`($0.1). 회차당 LLM 호출은 보통 6회(선별 1·가공 4·재보도 1).
4. **저장** — 선정 기사는 `articles`(+`related_json`: 묶인 다른 매체 보도)·`tags`/`article_tags`, 미선정·재보도 후보는 `seen_items`에 키만 기록. 실행 통계(`llm_calls`/토큰/비용/상태)와 notes(소스별 결과, `형식별 후보→풀→게재`, `할당 미달/초과`, `재보도 제외 N건` 등)를 `collection_runs`에 1행 기록. 공개 페이지는 가공을 마친 기사(`summary_ko IS NOT NULL`)만 노출한다.

결과 `data/app.db`를 `deploy/github-pages`에 커밋하고 `deploy.yml`을 dispatch → `npm run build`(prebuild: `initDb --existing`(스키마·sources 동기화) → `export-search-index` → `export-latest`) → `out/`을 GitHub Pages에 배포합니다.

### 호(issue)와 1면

- **호 = 그날 수집분.** 기사의 호 날짜는 `created_at`의 KST 날짜(`published_at` 아님). 홈은 최신 호(`getLatestEditionRef`, 공개 기사가 있는 날만), `/edition/[date]`는 그날 호를 `getIssueArticles(date)`로 조회한다. 호수는 실패하지 않은 회차 순번.
- **1면(`buildEdition`, `EDITION_LIMITS`)** — 오늘 호 기사만 쓴다: 리드 1·서브 3·오늘의 브리핑 3(뉴스 축) + 오픈소스·논문 레이더 4(비뉴스 축) ≈ 11건, 사이드바 지금 화제 5(화제 지수 > 0, 중복 허용)·'이 호의 지면'. 리드+서브는 분야 3개 이상(같은 분야 ≤ 2), 브리핑은 분야당 1건(남은 분야가 모자라면 상한을 풀어 채움)이고 리드·서브에 Physical AI가 없으면 1건 우선 배정, 레이더는 오픈소스·모델·논문 각 1위 우선. 부족하면 슬롯이 줄 뿐 다른 호 기사로 채우지 않는다. 그 아래 분야 섹션 밴드(1면 게재분 제외, 분야당 ≤ 4)와 누적 전체 기사 색인.
- 마스트헤드 '귀'는 이번 호 통계(`issueStats`: "이번 호 N건 · 매체 M곳" + 형식 구성), 발행이 늦으면 `IssueDelayNotice`가 "발행 전/발행 지연" 줄을 띄운다.

### 라우트 & 렌더링

| 경로                                                                | 페이지                    | 렌더링 / 접근                    | 배포 포함    |
| ------------------------------------------------------------------- | ------------------------- | -------------------------------- | ------------ |
| `/`                                                                 | 홈(최신 호 지면 + 색인)   | SSG(빌드타임) + 클라 필터 · 공개 | ✅           |
| `/article/[id]`                                                     | 상세                      | SSG(generateStaticParams) · 공개 | ✅           |
| `/search`                                                           | 검색                      | 정적 셸 + 클라이언트 검색 · 공개 | ✅           |
| `/edition/[date]`                                                   | 호 고정 링크(지난 호)     | SSG(generateStaticParams) · 공개 | ✅           |
| `/og/edition/[date].png`, `/og/article/[id].png`, `/og/default.png` | 공유 썸네일(og:image)     | 빌드타임 정적 PNG · 공개         | ✅           |
| `/admin`                                                            | 운영 콘솔                 | 로컬 전용(`next dev`) · 인증     | ❌ 배포 제외 |
| `/api/admin/sources`, `/api/admin/collect`                          | 소스 커밋 / 재수집 트리거 | 로컬 전용                        | ❌ 배포 제외 |
| `/api/health`                                                       | 헬스체크                  | 로컬 전용                        | ❌ 배포 제외 |

URL 필터: `?category=<분야 키>`(예: `physical`, 구 값 `Language%20Models`도 받아 줌)·`?source=`·`?tag=`·`?sort=`. 필터가 있으면 지면을 생략하고 결과 목록만 보인다.

## 개발 워크플로우

### 환경 설정

```bash
npm install

cp .env.example .env.local
# .env.local 에 ANTHROPIC_API_KEY 입력 (collect --dry-run 은 키 불필요)
```

### 데이터 파이프라인

```bash
npm run db:init                     # data/app.db 에 7개 테이블 생성 + sources.json 동기화
npm run collect                     # 수집 → 전처리 → 선별 → 가공 → 재보도 검사 → SQLite 배치 1회 (LLM 비용 발생, app.db 변경)
npm run collect -- --dry-run        # 수집 → 선별 풀까지만: notes·풀 구성·오늘 할당·추정 비용 출력 (LLM·API 키·DB 쓰기 없음)
npm run collect -- --no-save        # LLM 단계까지 실제로 돌리되 DB 에 쓰지 않음 → data/eval/run-<시각>.json 스냅숏
npm run collect -- --dry-run --db <path>  # --db 는 dry-run·no-save 전용(예: 배포 브랜치 DB 사본)
npm run triage:compare -- <스냅숏>  # 같은 풀로 개편 전후 선별 비교
npm run db:reclassify               # 구 분야값 재분류(기본 dry-run, --apply 로 백업 후 적용, --only-legacy)
npm run db:reindex                  # FTS5 재색인
npm run kpi                         # 최근 N일 KPI (기본 30) / npm run kpi -- baseline: 콘텐츠 개편 지표
```

> 커밋된 `data/app.db`를 바꾸면 배포 브랜치의 일일 수집 커밋과 충돌한다 — 소스·풀·프롬프트 검증은 `--dry-run`/`--no-save`로 한다.

### 개발 서버

```bash
npm run dev       # http://localhost:3000 (export·basePath 미적용, admin/api 동작)
```

### 빌드

```bash
npm run build     # prebuild(initDb --existing·검색 인덱스·latest.json) → 정적 export out/
```

`output:'export'`라 `npm run start`(`next start`)는 쓰지 않는다. 산출물은 `out/`을 `/global-ai-news` 서브경로로 서빙해 확인한다([WORK-PLAN-github-pages.md](docs/WORK-PLAN-github-pages.md) "전체 검증 방법").

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

`Dockerfile`·`docker-compose.yaml`은 standalone 시절 산출물(`.next/standalone`)을 전제해 현재 정적 export 빌드와 맞지 않는다.

## 환경변수

`.env.local`에 설정하며 git에 커밋하지 않습니다 (`.env.example` 참조).

| 변수                                           | 용도                                                                                                                                     | 필수 여부              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `ANTHROPIC_API_KEY`                            | LLM 선별·가공·재보도 검사 (수집 `collect.yml`·`db:reclassify`·`triage:compare`)                                                          | 필수                   |
| `LLM_MODEL`                                    | 모델 전환 (기본 `claude-haiku-4-5`)                                                                                                      | 선택                   |
| `MAX_PICKS_PER_RUN` / `TRIAGE_POOL_SIZE`       | 1회 게재(가공) 상한 35 / 선별 후보 상한 180 (Actions `vars`로 조정, 비면 코드 기본값)                                                    | 선택                   |
| `MAX_COST_USD_PER_RUN`                         | 1회 LLM 비용 상한 (기본 0.1)                                                                                                             | 선택                   |
| `LLM_USE_BATCH` / `BATCH_TIMEOUT_MIN`          | Batches API 사용(기본 1) / 배치 대기 상한(기본 25분)                                                                                     | 선택                   |
| `SEMANTIC_SCHOLAR_API_KEY` / `OPENALEX_MAILTO` | arXiv "유명 논문" 게이트의 인용·소속 조회 보강                                                                                           | 선택                   |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`    | Reddit OAuth2 `client_credentials` (현재 Reddit 소스 없음)                                                                               | 선택                   |
| `GITHUB_PAT`                                   | 수집: GitHub API 인증(레이트리밋 완화, CI는 `GH_SEARCH_PAT` 또는 `GITHUB_TOKEN`) / 로컬 admin: `sources.json` 커밋 + `workflow_dispatch` | 선택                   |
| `GITHUB_REPO` / `GITHUB_BRANCH`                | admin GitHub 연동 대상 `owner/repo` / 브랜치 — **로컬 admin 전용**                                                                       | 선택 (GitHub 연동 시)  |
| `ADMIN_PASSWORD`                               | 운영자 인증 — **로컬 admin 전용**                                                                                                        | 필수 (로컬 Admin 사용) |
| `RECLASSIFY_MAX_COST_USD`                      | `db:reclassify` 예상 비용 상한 (기본 0.5)                                                                                                | 선택                   |

## 데이터 모델

SQLite 7개 테이블 (DDL: `scripts/lib/schema.sql`, 상세: PRD §5):

- `sources` — 소스 메타 (`configs/sources.json`과 `syncSources`로 동기화). **`format`**(`news|oss|model|paper`, 기본 `news`) 컬럼이 기사 형식의 단일 저장처 — 기사는 JOIN으로 읽어 지난 기사에도 소급된다. sources.json에서 빠진 소스는 기사가 없으면 삭제, 있으면 `enabled=0`.
- `articles` — 선별된 기사: 수집 원본 + LLM 가공 결과 + `related_json`(같은 사건의 다른 매체 보도) + `engagement_json`(수집 시점 메트릭: stars·stars_today·language·likes·downloads·params·ups 등). `category`는 분야 키 6개 중 하나.
- `seen_items` — 선별에서 떨어지거나 재보도로 빠진 후보의 dedup 키(본문 미저장, 30일 보존)
- `tags`, `article_tags` — 태그 다대다 매핑
- `articles_fts` — FTS5 가상 테이블 (트리거로 동기화·`db:reindex`. 공개 검색은 빌드 시 만든 FlexSearch 인덱스를 쓴다)
- `collection_runs` — 배치 실행 이력 (토큰·비용·상태·notes)

**분야(category, LLM 분류)** — 저장값은 안정 키, 표시명·코드·순서는 `src/lib/labels.ts`(`CATEGORIES`·`CATEGORY_LABELS`·`CATEGORY_CODES`), 정의·경계 규칙은 `configs/prompts/categories.md`가 단일 출처:

| 키         | 표시명        | 코드 | 범위 (경계 규칙: 번호가 앞선 쪽 우선 — physical > agent > llm·oss > research > industry) |
| ---------- | ------------- | ---- | ---------------------------------------------------------------------------------------- |
| `llm`      | LLM           | LLM  | 파운데이션·멀티모달·생성 모델 자체                                                       |
| `agent`    | 에이전트      | AGT  | 에이전트 자체·프레임워크·MCP·코딩 에이전트(에이전트가 쓰는 도구는 `oss`)                 |
| `physical` | Physical AI   | PHY  | 로보틱스·휴머노이드·VLA·자율주행 — 로봇이 주제면 투자·논문·저장소여도 최우선             |
| `oss`      | 오픈소스·도구 | OSS  | 오픈소스·개발 도구·SDK·학습/서빙 인프라(구 Dev Tools·MLOps)                              |
| `research` | 연구·논문     | RES  | 논문·벤치마크·기술 리포트                                                                |
| `industry` | 산업·정책     | BIZ  | 투자·인수·규제·시장·칩·데이터센터 등 나머지 비즈니스                                     |

구 값(`Language Models`·`Agents`·`Dev Tools`·`MLOps`·`연구·논문`·`산업·정책`)은 `LEGACY_CATEGORY_MAP`으로 읽을 때 변환한다.

**형식(format, 소스 속성 — LLM 비용 없음)** — `FORMATS`·`FORMAT_LABELS`·`FORMAT_BADGES`: `news`(뉴스, 배지 없음) · `oss`(오픈소스, `REPO` — GitHub) · `model`(모델, `MODEL` — HF 모델) · `paper`(논문, `PAPER` — arXiv·HF Papers·Takara TLDR). 소스 설정의 `topic: "physical"`은 선별 풀 할당용 힌트일 뿐 DB에 저장하지 않는다.

핵심 타입: `RawItem`(수집 원본)·`ArticleCard`(렌더 DTO, `format` 포함) → `src/lib/types.ts`, `triageSchema`·`enrichBatchSchema`·`repeatCheckSchema`(LLM 출력 zod/v4) → `scripts/lib/schema.ts`.

## LLM 가공

LLM 호출은 채팅 엔드포인트가 아니라 **배치 파이프라인** 안에서만 일어나며, 3단계로 나뉩니다.

1. **선별**(`scripts/lib/triage.ts`) — 후보 풀(최대 180건)을 `번호 | 형식 | 매체 | 날짜 | 화제 | 제목 | 발췌` 한 줄씩 1회 호출로 보내, 최대 35건 선정·같은 사건 묶기(`duplicates`, 모델 파생본·논문 보도 포함)·중요도(같은 형식 후보끼리 상대 평가)·`already_reported`를 받는다. 유저 메시지는 "오늘 후보 구성·오늘 할당 → 이미 보도함 → 오늘 후보" 순이다. 할당 숫자의 단일 출처는 `PICK_QUOTAS`(비뉴스 8·형식별 1·Physical AI 3, 상한 `ceil(35/4)`=9)이며 `pickTargets`가 풀 구성에 맞춰 줄여 넣는다. "이미 보도함"은 최근 3개 호 게재 제목(`loadReportedHeadlines`). 할당 미달·초과·논문 분야 쏠림은 최종 게재분 기준으로 notes에 경고만 남긴다.
2. **가공**(`scripts/lib/enrich.ts`) — 선정 기사만 10건씩 묶어 한국어 제목·요약·분야·태그를 받는다. 입력에 `[형식]` 줄과 분리된 `[토픽]` 줄(분류용, 기능 근거 아님)을 넣고, 형식별 요약 가이드(뉴스·리포·모델·논문)를 따른다.
3. **재보도 검사**(`scripts/lib/repeatCheck.ts`) — 가공된 `title_ko`+요약 첫 문장을 최근 3개 호 게재분과 1회 호출로 대조해, 새 전개 없는 재보도(`repeats`)를 게재에서 뺀다(묶음 포함 → `seen_items`, 재심사 행은 삭제). 후속 보도(`followups`)는 유지. 모델의 재보도 판정은 코드로 다시 확인한다(`confirmRepeats`) — 두 기사가 내용어(`textTokens.ts`, 일반어·분야어 제외, 회사는 몇 개가 겹쳐도 1개 — 제휴·인수·투자처럼 상대가 있는 사건만 2개)를 2개 이상 함께 쓰지 않으면 판정을 기각하고 싣는다(notes `재보도 판정 기각 N건`). 호출·검증 실패 시 전부 게재(fail-open).

- 호출 계층: `scripts/lib/llm.ts` — Message Batches API로 제출, `BATCH_TIMEOUT_MIN` 초과·개별 실패 시 일반 호출로 1회 재시도. 출력은 구조화 출력(`output_config.format`)으로 받고 zod 로 검증한다.
- 프롬프트: `configs/prompts/triage.system.md`(선별), `enrich.system.md` + `categories.md`(`{{CATEGORIES}}`) + `enrich.fewshot.json`(가공), `repeat.system.md`(재보도) + 가변 유저 메시지 (PRD §7)
- 비용 절감: 코드 선필터(신규·소스별 상한·키워드 필터) → LLM 선별(35건 이하) → 묶음 가공(지시문 반복 제거) → Batches 50% 할인 → 실행당 비용 상한. 프롬프트 캐싱은 쓰지 않는다(Haiku 4.5 는 4,096토큰 미만 프리픽스를 캐시하지 않음).
- 비용 기록: `scripts/lib/cost.ts`(Haiku 단가 $1/$5 per M, 배치 50%) → `collection_runs` 실행마다 1행 기록

## 주요 경로 별칭

`tsconfig.json`에 `@/*` → `./src/*` 별칭이 설정되어 있습니다.

- `@/lib/db` → `src/lib/db.ts`
- `@/lib/types` → `src/lib/types.ts`
- `@/lib/paths` → `src/lib/paths.ts`
- `@/components/Story` → `src/components/Story.tsx`

> `scripts/`는 별도 tsx 실행 영역으로 `@/*` 별칭 대상이 아니며 상대 경로를 사용합니다(`../src/lib/*` import 는 허용 — 예: labels·paths). `src/`는 `scripts/`를 import 하지 않습니다.

## shadcn/ui 컴포넌트 추가

```bash
npx shadcn@latest add card dialog input
```

설정(`components.json`):

- style: `new-york`
- baseColor: `zinc`
- Tailwind v4 사용 → `tailwind.config`는 빈 문자열

## 디자인 가이드 (DESIGN.md)

프로젝트 루트의 `DESIGN.md`(v2.1 "Edition", 2026-10-30 콘텐츠 개편 반영)는 매일 발행되는 한 호(號)처럼 읽히는 에디토리얼 뉴스 리더 UI 스타일 가이드입니다. 시안 원본은 `docs/design/mockups/`(1면 최신 시안 `front-v3.html`).

- **UI 마크업/스타일링 작업 전 반드시 `DESIGN.md`를 참조**합니다.
- 디자인 토큰은 `src/app/globals.css`에 CSS 변수로 매핑되어 있습니다(Tailwind v4 `@theme inline` — 단일 출처). 글자 크기 토큰(`--text-*`)을 바꾸면 `src/lib/utils.ts`의 `FONT_SIZE_TOKENS`도 함께 고친다(`utils.test.ts`가 검사).
- 핵심 원칙: **편집 위계**(마스트헤드·귀 → 1면 리드·서브·오늘의 브리핑 + 사이드바 지금 화제·이 호의 지면 → 오픈소스·논문 레이더 → 분야 섹션 밴드 → 전체 기사)와 **데이터 신호**(중요도 도트·화제 바·분야 키커·형식 배지)가 시각 언어. 뉴스프린트 종이 `#f4f4f1` + 잉크 `#141519`, **강조색은 코발트 `brand` 하나**(키커·순위·활성 밑줄·hover 제목 — 채움 버튼은 잉크). **형식 배지(`FormatBadge`, REPO·MODEL·PAPER)는 잉크 1px 아웃라인·코발트 금지**, 뉴스에는 붙이지 않는다. 굵은 잉크 괘선(`rule`)으로 구획하고 카드 박스·그림자·그라데이션은 쓰지 않음. 서체는 **Hahmlet**(세리프 헤드라인, `next/font/google` 자체 호스팅) + **Pretendard**(본문). 한글은 `word-break: keep-all`. 다크는 심야 잉크블루 `#0f1118` + 밝은 코발트 `#93a3ff`. 날짜는 `src/lib/labels.ts`로 KST 고정 표기(홈 1면·섹션은 상대 시각, 레이더는 날짜 생략). 모바일 앱 셸(상단 바 + 하단 탭 바 + 필터 바텀시트)·44px 터치 타깃·safe-area는 유지.

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
- 소스 정의는 `configs/sources.json`으로 관리 (코드 하드코딩 금지 — GitHub 검색 쿼리도 `url`에)
- 분야·형식 키/표시명은 `src/lib/labels.ts`, 분야 정의는 `configs/prompts/categories.md`에서만 관리
- 런타임 경로 상수는 `src/lib/paths.ts`, 설정 파일은 `configs/`에서 관리
- DB 조회는 `src/lib/db.ts`를 통해 readonly로 접근
- 환경 변수는 `.env.local` 사용 (git에 커밋하지 않음)
- 커밋 전 `npm run lint && npm run typecheck && npm test` 실행 권장 (DB 테스트는 `better-sqlite3` 빌드와 같은 Node 버전에서)
