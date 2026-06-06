# PRD 작성 메타 프롬프트: 글로벌 AI/IT 뉴스·트렌드 큐레이션 웹서비스

## 프롬프트 사용법

아래 프롬프트를 Claude Code에 입력하여 PRD 문서를 생성하세요.

---

## 메타 프롬프트

```
당신은 솔로 개발자를 위한 PRD 전문가입니다.
아래 프로젝트 정보를 바탕으로 실용적이고 개발 가능한 PRD 문서를 작성해주세요.

## 프로젝트 개요

**프로젝트명**: Daily AI Brief — 글로벌 AI/IT 뉴스·트렌드 큐레이션 웹서비스

**핵심 목표**:
Daily AI Brief는 Reddit, Hacker News, 주요 테크 미디어(TechCrunch, The Verge 등)의
글로벌 AI/IT 뉴스를 매일 자동 수집하고, LLM으로 한국어 요약·분류·중요도 평가하여
카드형 피드로 제공하는 큐레이션 웹서비스다.
국내 사용자가 흩어진 영문 AI 소식을 한 곳에서 한국어로 빠르게 파악하는 것이 목표이며,
**LLM API 토큰 비용을 최소화하는 배치 파이프라인**으로 운영비를 낮게 유지하는 것이
핵심 제약 조건이다.

**사용자 시나리오**:
1. (자동/배치) 일 1회 GitHub Actions cron이 수집 스크립트를 실행한다.
   - 글로벌 RSS 피드(TechCrunch AI, The Verge AI, MIT Tech Review, The Decoder 등) 파싱
   - 한국 RSS 피드(AI타임스, 전자신문 AI섹션, 바이라인네트워크 등) 파싱
   - Hacker News(Algolia) API로 AI 관련 상위 글 수집
   - GitHub REST Search API로 AI 트렌딩 신규 저장소 수집
   - Reddit OAuth2 API로 주요 AI 서브레딧 상위 글 수집(r/LocalLLaMA, r/MachineLearning 등)
   - (선택) HuggingFace Daily Papers 등 연구 보조 소스
2. (코드 처리) 수집 항목을 URL/제목 해시로 중복 제거하고, SQLite에 이미 존재하는 항목은
   스킵한다. engagement 신호(추천수·점수·댓글수)를 코드로 정규화하여 1차 트렌딩 점수를 산출한다.
3. (LLM 처리) **신규 항목만** LLM에 전달하여 단일 호출로 다음을 한 번에 생성한다:
   한국어 요약(2~3줄), 한국어 제목, 카테고리/태그, 보조 중요도 점수.
4. (저장) 가공 결과를 SQLite에 저장한다.
5. (렌더링) Next.js가 SQLite를 읽어 피드(홈)·상세·검색 페이지를 정적/ISR로 렌더링한다.
6. (열람) 사용자는 피드에서 태그/소스로 필터링하고 최신순·중요도순으로 정렬하며,
   카드를 클릭해 한국어 요약 + 원문(영문) 병기 상세를 보고 원문 링크로 이동한다.

## 비용 절감 설계 원칙 (반드시 PRD에 반영)

1. **LLM 호출 전 코드 필터링**: 중복 제거 + 기존 항목 스킵 → 신규 항목만 LLM 전달
2. **단일 호출 통합 가공**: 요약·번역·태그분류·점수를 하나의 구조화 JSON 출력으로 통합
   (1 기사 = 1 LLM 호출, Vercel AI SDK `generateObject` + Zod)
3. **프롬프트 캐싱**: 시스템 프롬프트·분류 체계·few-shot 예시를 Anthropic prompt caching 적용
4. **저비용 모델 기본값**: `claude-haiku-4-5` 기본, `LLM_MODEL` 환경변수로 전환
5. **입력 토큰 절감**: 본문 상위 N자/주요 단락만 전달, 입력 토큰 상한 설정
6. **출력 토큰 제한**: max_tokens 제한, 요약 2~3줄로 제약
7. **코드 우선 처리**: 트렌딩 1차 신호는 engagement로 코드 계산, LLM 점수는 보조
   배치는 일 1회로 호출량 최소화

## 기술 스택 (고정)

| 구분 | 기술 | 비고 |
|---|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript | SSG/ISR 렌더링 |
| Styling | TailwindCSS v4 + shadcn/ui (New York, zinc) | 카드형 레이아웃 |
| LLM | Claude Haiku 4.5 (기본) | `LLM_MODEL` 환경변수로 전환 |
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) | `generateObject`로 구조화 출력 |
| 수집(RSS) | `rss-parser` | 글로벌(TechCrunch/The Verge 등) + 한국(AI타임스/전자신문 등) 공식 RSS |
| 수집(API) | Hacker News(Algolia), GitHub REST Search, HuggingFace API, Reddit(OAuth2) | HN/GitHub/HF는 무인증·무료, Reddit은 OAuth2 client_credentials 인증 |
| 저장 | SQLite (`better-sqlite3` 또는 Drizzle ORM) | 로컬 파일 DB, 운영비 0 |
| 배치 | Node 스크립트(`scripts/collect.ts`) + GitHub Actions cron | 일 1회 실행 |
| 배포 | Vercel | 정적/ISR, 배치 결과 커밋 시 자동 배포 |

## PRD 작성 요구사항

### 1. 문서 구조
다음 섹션을 포함하여 작성:

1. **프로젝트 개요** — 이름/한줄 설명, 해결하려는 문제, 핵심 가치 제안
2. **사용자 정의** — 주요 사용자(열람자/운영자), 각 니즈와 목표
3. **핵심 기능 (MVP 범위)**
   - 3.1 데이터 수집 파이프라인 (RSS + Reddit/HN API)
   - 3.2 코드 기반 전처리 (중복 제거 + engagement 트렌딩 점수)
   - 3.3 LLM 통합 가공 (요약·번역·분류·점수, 단일 호출)
   - 3.4 비용 절감 메커니즘 (캐싱·모델 전환·토큰 상한)
   - 3.5 피드/필터/정렬 (카드형 목록)
   - 3.6 상세 보기 (한국어 요약 + 원문 병기 + 출처 링크)
   - 3.7 검색
   - 각 기능별 우선순위·의존성·상세 요구사항
4. **시스템 아키텍처** — 데이터 흐름도(수집→전처리→LLM→저장→렌더), 배치 스케줄, 페이지 라우팅
5. **데이터 모델** — SQLite 스키마(articles, sources, tags 등), 수집 원본↔가공 결과 매핑,
   LLM 출력 JSON 스키마(Zod 타입)
6. **UI/UX 요구사항** — 페이지별 와이어프레임 설명, 반응형, 카드 구성요소(출처/제목/요약/태그/점수),
   **최대 3개 페이지**(피드 / 상세 / 검색)
7. **프롬프트 관리/구성** — LLM 통합 가공 프롬프트 템플릿, few-shot 예시, 캐싱 전략,
   카테고리/태그 분류 체계
8. **MVP 제외 사항** — 커뮤니티/로그인/댓글, AI 용어사전, 다국어, 실시간 수집 등과 그 이유
9. **성공 지표** — MVP 완료 기준, 일일 LLM 토큰/비용 상한, 수집 기사 수, 갱신 안정성

### 2. 작성 원칙
- **구체적으로**: 모호한 표현 대신 명확한 요구사항
- **개발자 친화적**: 바로 구현 가능한 상세도(타입·API·스키마 예시 포함)
- **MVP 집중**: 최소 기능, 과도한 기능 배제
- **비용 의식**: 모든 기능 설계에서 LLM 호출/토큰을 명시적으로 최소화
- **실용적**: 1인 개발자가 2~4주 내 구현 가능한 범위

### 3. 출력 형식
- 파일명: `docs/PRD.md`
- 형식: 마크다운 / 언어: 한국어
- 코드 예시 포함 (SQLite 스키마, LLM 출력 Zod 타입, generateObject 호출, API 응답 구조 등)

## 추가 컨텍스트

- 참고 디자인: https://aitrends.kr/ (카드형 피드, 한국어 요약, 출처 태그)
- 원하는 카테고리/태그 분류 체계: Language Models / Agents / Dev Tools / MLOps / 연구·논문 / 산업·정책 등 (운영자가 조정 가능)

### 검증된 시드 소스 목록 (2026-06-07 기준, 실제 HTTP 응답 확인됨)

> 아래 목록은 코드 하드코딩이 아니라 `configs/sources.json`(또는 유사 설정 파일)로 관리하며,
> 운영자가 추가·삭제할 수 있도록 설계한다. URL은 실제 동작 확인된 것만 수록했다.

**글로벌 RSS (무인증)**
| 매체 | RSS URL |
|---|---|
| TechCrunch (AI) | `https://techcrunch.com/category/artificial-intelligence/feed/` |
| The Verge (AI) | `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` |
| MIT Technology Review | `https://www.technologyreview.com/feed/` |
| Ars Technica (AI) | `https://arstechnica.com/ai/feed/` |
| Wired (AI) | `https://www.wired.com/feed/tag/ai/latest/rss` |
| The Decoder | `https://the-decoder.com/feed/` |
| MarkTechPost | `https://www.marktechpost.com/feed/` |
| VentureBeat | `https://venturebeat.com/feed/` (전체 피드; AI 카테고리 피드는 stale) |

**한국 RSS (무인증)**
| 매체 | RSS URL | 비고 |
|---|---|---|
| AI타임스 | `https://www.aitimes.com/rss/allArticle.xml` | 한국 대표 AI 전문지, 최우선 |
| 전자신문 (AI 섹션) | `https://rss.etnews.com/04046.xml` | SW=`04.xml`, IT=`03.xml`, 보안=`04045.xml` |
| 디지털투데이 | `https://www.digitaltoday.co.kr/rss/allArticle.xml` | AI·테크 혼재 |
| 바이라인네트워크 | `https://byline.network/feed/` | 테크 심층 |
| 테크42 | `https://www.tech42.co.kr/feed/` | AI 기반 테크 저널리즘 |
| (RSS 미지원) | ZDNet Korea, 디지털데일리, 아웃스탠딩 | 필요 시 Google News RSS로 우회 |

**Hacker News (무인증 Algolia API)**
- 검색: `https://hn.algolia.com/api/v1/search?query=AI&tags=story&numericFilters=points>50,created_at_i>{24h전}&hitsPerPage=30`
- 최신순: `https://hn.algolia.com/api/v1/search_by_date?query=LLM&tags=story`

**GitHub (AI 트렌딩 저장소)**
- REST Search(권장): `https://api.github.com/search/repositories?q=topic:llm+created:>{최근}&sort=stars&order=desc`
  — 무인증 10 req/분, 토큰 인증 시 30 req/분 (토큰 사용 권장)
- 보조: GitHub Trending RSS 프록시 `https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml` (third-party)

**연구·모델 보조 소스 (무인증, 선택)**
- HuggingFace Daily Papers: `https://huggingface.co/api/daily_papers?limit=20`
- HuggingFace Trending Models: `https://huggingface.co/api/models?sort=trendingScore&limit=20`
- arXiv (cs.AI): `http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=20`

**Reddit (OAuth2 필요 → MVP 포함)**
- 무인증 `.json` 호출은 현재 차단됨. OAuth2 앱 등록(script 타입) 후 `https://oauth.reddit.com/r/<sub>/top?t=day&limit=25` 호출.
- 인증 방식: `client_credentials` 그랜트로 앱 전용 토큰 발급(사용자 로그인 불필요) → `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` 환경변수로 관리.
- 추천 서브레딧: r/LocalLLaMA, r/MachineLearning, r/OpenAI, r/ClaudeAI
- engagement 신호(`ups`, `num_comments`)를 코드 트렌딩 점수에 직접 활용 가능해 가치가 높으므로 **MVP에 포함**한다.

### MVP 권장 시드 구성 (저비용·안정성 우선)
- 글로벌 RSS 5: TechCrunch AI, The Verge AI, MIT Tech Review, The Decoder, MarkTechPost
- 한국 RSS 3: AI타임스, 전자신문 AI섹션, 바이라인네트워크
- 집계/연구 3: Hacker News(Algolia), GitHub REST Search(`topic:llm`), HuggingFace Daily Papers
- 커뮤니티 1: Reddit(OAuth2, r/LocalLLaMA·r/MachineLearning·r/OpenAI·r/ClaudeAI 상위 글)
- → 인증은 GitHub 토큰(선택)과 Reddit OAuth2 자격증명 2종. HN/RSS/HF는 무인증 즉시 수집 가능. Reddit은 `client_credentials`로 사용자 로그인 없이 앱 토큰만 발급하면 된다.

---

위 요구사항을 바탕으로 PRD 문서를 작성해주세요.
```

---

## 예상 PRD 구조

생성될 PRD는 다음과 같은 구조를 가집니다:

```
docs/PRD.md
├── 1. 프로젝트 개요
├── 2. 사용자 정의
├── 3. 핵심 기능 (MVP)
│   ├── 3.1 데이터 수집 파이프라인
│   ├── 3.2 코드 기반 전처리 (중복 제거 + 트렌딩 점수)
│   ├── 3.3 LLM 통합 가공 (단일 호출)
│   ├── 3.4 비용 절감 메커니즘
│   ├── 3.5 피드/필터/정렬
│   ├── 3.6 상세 보기 (한국어+원문)
│   └── 3.7 검색
├── 4. 시스템 아키텍처
├── 5. 데이터 모델 (SQLite + LLM 출력 스키마)
├── 6. UI/UX 요구사항 (3페이지)
├── 7. 프롬프트 관리/구성
├── 8. MVP 제외 사항
└── 9. 성공 지표 (토큰/비용 상한 포함)
```
