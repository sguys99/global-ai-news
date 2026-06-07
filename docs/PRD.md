# Daily AI Brief PRD v1.0

**글로벌 AI/IT 뉴스를 매일 자동 수집·한국어 요약하여 카드형 피드로 제공하는 저비용 큐레이션 웹서비스**

---

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 |
| 작성일 | 2026년 6월 7일 |
| 대상 독자 | 개발자(구현), 운영자(솔로 메인테이너), 이해관계자 |
| 구현 목표 기간 | 2~4주 (1인 개발) |
| 핵심 제약 | LLM API 토큰 비용 최소화, 운영비 ≈ 0 |

---

## 0. Executive Summary

- **Problem Statement**: 국내 사용자가 Reddit·Hacker News·TechCrunch 등 흩어진 영문 AI/IT 소식을 따라가려면 여러 채널을 매일 직접 순회하고 영어로 읽어야 하며, 무엇이 중요한지 판별하기 어렵다.
- **Proposed Solution**: 글로벌·한국 RSS/WEB와 HN/GitHub/HuggingFace/Reddit API에서 일 1회 배치로 뉴스를 수집하고, **신규 항목만** LLM 단일 호출로 한국어 요약·번역·분류·중요도 평가하여, 최신순·중요도순으로 정렬 가능한 카드형 피드로 제공한다. 운영자는 **관리자 운영 콘솔**(§3.8)에서 소스 관리·수집 재실행·비용 모니터링을 수행한다.
- **Success Criteria (측정 가능 KPI)**:
  1. **일일 LLM 비용 ≤ $0.30** (Claude Haiku 4.5 기준, 신규 50~100건/일 가공 시).
  2. **수집 → 렌더 파이프라인 성공률 ≥ 95%** (최근 30일 cron 실행 기준).
  3. **일일 신규 큐레이션 카드 ≥ 30건** 안정 게시.
  4. **피드 첫 화면 로드(LCP) ≤ 2.0s** (정적/ISR, 데스크톱 기준).
  5. **한국어 요약 품질 검수 통과율 ≥ 90%** (주간 20건 샘플, §9 평가 기준).
  6. **소스 변경 → 반영(재배포 완료) ≤ 10분** (콘솔 커밋 → Actions → Vercel 배포).

---

## 1. 프로젝트 개요

### 1.1 프로젝트 이름 및 한줄 설명

**Daily AI Brief** — 글로벌·한국의 AI/IT 뉴스를 매일 자동 수집하고 LLM으로 한국어 요약·분류·중요도 평가하여 카드형 피드로 제공하는, 토큰 비용을 최소화한 큐레이션 웹서비스.

### 1.2 해결하려는 문제

| 문제 | 현재 상황 | 결과/영향 |
|---|---|---|
| 소스가 흩어져 있음 | TechCrunch, HN, Reddit, GitHub 등을 매일 개별 순회 | 시간 소모·누락 발생 |
| 언어 장벽 | 핵심 AI 소식 대부분이 영문 | 빠른 파악 어려움, 피로도 증가 |
| 중요도 판별 어려움 | 하루에도 수백 건의 글, 신호/소음 구분 불가 | 정작 중요한 뉴스를 놓침 |
| 기존 서비스의 운영비 | 실시간 크롤링·대형 모델 사용 시 비용 급증 | 솔로 운영 지속 불가능 |

### 1.3 핵심 가치 제안

- **한국어 통합 큐레이션:** 영문·국문 소스를 한 곳에 모아 한국어 요약(2~3줄) + 원문 병기로 제공.
- **LLM 비용 최소화 배치:** 코드 선필터 → 신규 항목만 → 단일 호출 통합 가공 → 프롬프트 캐싱으로 토큰을 구조적으로 절감(§3.4).
- **운영비 ≈ 0 인프라:** SQLite 파일 DB + GitHub Actions cron + Vercel 정적/ISR. 상시 서버·관리형 DB 불필요.
- **코드 우선 트렌딩:** engagement(추천·점수·댓글) 신호를 코드로 정규화해 1차 트렌딩 점수를 산출, LLM 점수는 보조로만 사용.

---

## 2. 사용자 정의

### 2.1 주요 사용자

| 역할 | 설명 | 주요 니즈 |
|---|---|---|
| **열람자 (Reader)** | 국내 AI/개발 종사자·기획자·연구자. 영문 소식을 빠르게 한국어로 파악하고 싶은 사람 | 신뢰할 만한 한국어 요약, 출처·중요도 기반 빠른 스캔, 원문 즉시 이동 |
| **운영자 (Operator)** | 서비스를 운영하는 솔로 개발자(본 PRD 독자) | 낮은 운영비, 소스 추가/삭제 용이성, 파이프라인 안정성·관측성 |

### 2.2 사용자별 접근 방식 & User Story

**열람자**
- 흐름: 피드(홈) → 태그/소스 필터 + 정렬(최신/중요도) → 카드 클릭 → 상세(한국어 요약 + 원문 병기) → 원문 링크 이동. 검색 페이지에서 키워드로 과거 기사 탐색.
- *As a 국내 AI 종사자, I want 영문 AI 뉴스를 한국어 요약으로 한 곳에서 보고 싶다, so that 여러 채널을 돌지 않고도 하루치 흐름을 5분 안에 파악할 수 있다.*
- *As a 열람자, I want 중요도순으로 정렬하고 태그로 필터링하고 싶다, so that 내 관심 주제(예: Agents)의 핵심만 골라 본다.*

**운영자**
- 흐름: **관리자 콘솔(`/admin`)** 로그인 → 소스 관리(추가/수정/삭제/토글) → 콘솔이 GitHub API로 `configs/sources.json` 커밋 → 필요 시 "지금 수집" 버튼으로 `workflow_dispatch` 트리거 → Actions가 `scripts/collect.ts` 실행·`data/app.db` 커밋 → Vercel 자동 배포. 콘솔 대시보드에서 수집 통계·비용을 모니터링.
- *As a 운영자, I want 관리자 페이지에서 코드/파일 수정 없이 소스를 추가/삭제/토글하고 싶다, so that 운영 중 소스 구성을 유연하게 조정한다.*
- *As a 운영자, I want 콘솔에서 즉시 재수집을 트리거하고 싶다, so that 소스 변경을 다음 cron까지 기다리지 않고 바로 반영한다.*
- *As a 운영자, I want LLM 호출 건수·토큰·추정 비용을 실행별로 콘솔에서 보고 싶다, so that 비용 상한을 넘기 전에 감지한다.*

---

## 3. 핵심 기능 (MVP 범위)

### Must Have 기능 목록 및 우선순위

| 우선순위 | 기능 | 의존성 |
|:---:|---|---|
| 1 | 3.1 데이터 수집 파이프라인 | - |
| 2 | 3.2 코드 기반 전처리 (중복 제거 + 트렌딩 점수) | 3.1 |
| 3 | 3.3 LLM 통합 가공 (단일 호출) | 3.2 |
| 4 | 3.4 비용 절감 메커니즘 | 3.3 |
| 5 | 3.5 피드/필터/정렬 | 3.3, 3.4 |
| 6 | 3.6 상세 보기 | 3.5 |
| 7 | 3.7 검색 | 3.5 |
| 8 | 3.8 관리자 운영 콘솔 (소스 관리·재수집·통계/비용) | 3.1, 5 |

---

### 3.1 데이터 수집 파이프라인

일 1회 GitHub Actions cron이 `scripts/collect.ts`를 실행하여 RSS 피드와 API 소스에서 항목을 수집한다. 소스는 코드 하드코딩이 아닌 `configs/sources.json`으로 관리하여 운영자가 추가/삭제할 수 있다.

**입력**
- `configs/sources.json` (소스 정의 — 운영자 콘솔에서 GitHub API로 커밋 관리, §3.8), 환경변수(`GITHUB_PAT`/`GITHUB_REPO`, `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`)
- 수집 윈도우: 최근 24~48시간

**소스 분류 체계 (RSS / WEB / REDDIT / API)**

참고 서비스 [aitrends.kr](https://aitrends.kr/subscribe)의 **RSS / WEB / REDDIT** 소스 분류와 정합되도록 소스를 4종(RSS·WEB·REDDIT·집계 API)으로 구분한다.

- **RSS**: 공식 RSS/Atom 피드 제공 매체(`rss-parser`로 파싱).
- **WEB**: 공식 RSS가 없어 **HTML 스크래핑**이 필요한 소스. 데이터 모델·`sources.json`에는 등록 가능하나, 비용·유지보수 부담으로 **실제 수집은 Post-MVP**(§10)로 둔다(MVP에서는 `enabled=0` 또는 pending 상태로 등록만).
- **REDDIT**: OAuth2(`client_credentials`)로 서브레딧 상위 글 수집.
- **API**: HN/GitHub/HuggingFace 무인증·저비용 집계 API.

**MVP 시드 구성 (검증된 소스, 2026-06-07 기준)**

| 분류 | 소스 | 엔드포인트 | 인증 |
|---|---|---|---|
| RSS (글로벌) | TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` | 무인증 |
| RSS (글로벌) | The Verge AI | `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` | 무인증 |
| RSS (글로벌) | MIT Tech Review | `https://www.technologyreview.com/feed/` | 무인증 |
| RSS (글로벌) | The Decoder | `https://the-decoder.com/feed/` | 무인증 |
| RSS (글로벌) | MarkTechPost | `https://www.marktechpost.com/feed/` | 무인증 |
| RSS (글로벌) | Latent Space (swyx) | `https://www.latent.space/feed` | 무인증 (Substack) |
| RSS (한국) | AI타임스 | `https://www.aitimes.com/rss/allArticle.xml` | 무인증 |
| RSS (한국) | 전자신문 AI | `https://rss.etnews.com/04046.xml` | 무인증 |
| RSS (한국) | 바이라인네트워크 | `https://byline.network/feed/` | 무인증 |
| WEB (스크래핑) | AI Engineer | `https://www.ai.engineer/` | 무인증 · **Post-MVP** (공식 RSS 미확인) |
| API (집계) | Hacker News (Algolia) | `https://hn.algolia.com/api/v1/search?query=AI&tags=story&numericFilters=points>50,created_at_i>{24h전}&hitsPerPage=30` | 무인증 |
| API (집계) | GitHub Search | `https://api.github.com/search/repositories?q=topic:llm+created:>{최근}&sort=stars&order=desc` | 토큰 권장(30 req/분) |
| API (연구) | HuggingFace Daily Papers | `https://huggingface.co/api/daily_papers?limit=20` | 무인증 |
| REDDIT (OAuth2) | Reddit 서브레딧 | `https://oauth.reddit.com/r/{sub}/top?t=day&limit=25` | OAuth2 `client_credentials` |

> **Reddit 서브레딧(8개):** r/LocalLLaMA, r/MachineLearning, r/OpenAI, r/ClaudeAI, r/deeplearning, r/MLOps, r/LLMDevs, r/artificial (뒤 4개는 aitrends.kr 기준 보완).
>
> **Reddit 인증:** 무인증 `.json` 호출은 현재 차단됨. script 타입 앱 등록 후 `client_credentials` 그랜트로 앱 전용 토큰을 발급(사용자 로그인 불필요)한다. engagement 신호(`ups`, `num_comments`)가 트렌딩 점수에 직접 기여하므로 MVP에 포함한다.

**출력 (수집 원본, 정규화 전 raw item)**

| 필드명 | 설명 |
|---|---|
| `source_id` | 소스 식별자 (sources.json key) |
| `external_id` | 소스 내 고유 ID (HN objectID, Reddit name 등, 없으면 URL) |
| `url` | 원문 URL |
| `title_original` | 원문 제목 |
| `content_raw` | 본문/요약 원문 (RSS description 또는 API 본문) |
| `published_at` | 원문 게시 시각 (UTC) |
| `engagement` | `{ points?, ups?, num_comments?, stars? }` |

**Acceptance Criteria**
- [ ] 소스는 `configs/sources.json`으로 관리되며, 운영자 콘솔(§3.8)에서 코드 수정 없이 추가/삭제/토글할 수 있다.
- [ ] RSS/WEB/REDDIT/API 분류가 `kind`로 구분되며, WEB 타입은 등록 가능하되 수집은 Post-MVP다.
- [ ] 한 소스가 실패(타임아웃/4xx/5xx)해도 나머지 소스 수집은 계속된다(부분 실패 격리).
- [ ] 각 소스별 수집 건수·실패 여부가 실행 로그 및 `collection_runs`(§5)에 기록된다.
- [ ] Reddit OAuth2 토큰을 `client_credentials`로 자동 발급/갱신한다.

---

### 3.2 코드 기반 전처리 (중복 제거 + 트렌딩 점수)

수집 원본을 LLM에 보내기 **전에** 코드로 정제한다. URL/제목 해시로 중복을 제거하고, SQLite에 이미 존재하는 항목은 스킵한다. engagement 신호를 정규화하여 1차 트렌딩 점수를 코드로 산출한다.

**입력**: 3.1의 raw item 배열

**처리**
1. **정규화 키 생성**: `dedup_key = sha256(normalize(url))`, 보조로 `title_key = sha256(normalize(title))`.
   - `normalize(url)`: 소문자화, 트래킹 쿼리(`utm_*`, `ref` 등) 제거, 트레일링 슬래시 제거.
2. **중복 제거**: 배치 내 중복 + SQLite `articles.dedup_key` 존재 항목 스킵 → **신규 항목만** 다음 단계로.
3. **트렌딩 점수(코드, 0~100)**: 소스 종류별 engagement를 정규화 후 가중 합산. 최신성 보정 포함.

```typescript
// scripts/lib/trending.ts
// 소스 이질적 신호를 0~1로 정규화 후 가중합 → 0~100 스케일
export function trendingScore(item: RawItem): number {
  const e = item.engagement ?? {};
  // 로그 스케일 정규화: log1p(x) / log1p(cap)
  const norm = (x = 0, cap: number) => Math.min(1, Math.log1p(x) / Math.log1p(cap));

  const signal =
    0.45 * norm(e.points ?? e.ups ?? 0, 500) +   // HN points / Reddit ups
    0.25 * norm(e.num_comments ?? 0, 300) +       // 댓글 수
    0.30 * norm(e.stars ?? 0, 2000);              // GitHub stars

  // 최신성 보정: 24h 이내 1.0 → 48h 0.7 (선형 감쇠)
  const ageH = (Date.now() - new Date(item.published_at).getTime()) / 3.6e6;
  const recency = ageH <= 24 ? 1.0 : Math.max(0.5, 1 - (ageH - 24) / 80);

  return Math.round(100 * signal * recency);
}
```

**출력**

| 필드명 | 설명 |
|---|---|
| `dedup_key` | URL 정규화 해시 (UNIQUE) |
| `trending_score` | 코드 기반 1차 트렌딩 점수 (0~100) |
| `is_new` | SQLite 미존재 여부 (true인 항목만 LLM 전달) |

**Acceptance Criteria**
- [ ] 동일 기사가 여러 소스에서 들어와도 1건으로 합쳐진다.
- [ ] 이미 DB에 있는 기사는 LLM 호출 없이 스킵된다(재실행 시 추가 비용 0).
- [ ] 트렌딩 점수는 LLM 없이 코드만으로 계산된다.

---

### 3.3 LLM 통합 가공 (요약·번역·분류·점수, 단일 호출)

신규 항목 1건당 **단 한 번의 LLM 호출**로 한국어 제목·요약·카테고리·태그·보조 중요도 점수를 구조화 JSON으로 한꺼번에 생성한다. Vercel AI SDK `generateObject` + Zod 스키마를 사용한다.

**입력**: 신규 item의 `title_original`, `content_raw`(상위 N자로 절단), `source`, `url`

**LLM 출력 스키마 (Zod)**

```typescript
// scripts/lib/schema.ts
import { z } from "zod";

export const CATEGORIES = [
  "Language Models", "Agents", "Dev Tools",
  "MLOps", "연구·논문", "산업·정책",
] as const;

export const articleEnrichmentSchema = z.object({
  title_ko: z.string().max(60).describe("한국어 제목 (간결, 낚시성 금지)"),
  summary_ko: z.string().describe("한국어 요약 2~3줄, 핵심 사실 중심"),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string()).min(1).max(5).describe("소문자 영문 또는 한글 키워드"),
  importance: z.number().int().min(1).max(5).describe("보조 중요도 1~5"),
});

export type ArticleEnrichment = z.infer<typeof articleEnrichmentSchema>;
```

**generateObject 호출 예시**

```typescript
// scripts/lib/enrich.ts
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { articleEnrichmentSchema } from "./schema";

const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5";
const MAX_INPUT_CHARS = 2500; // 입력 토큰 상한 (본문 절단)

export async function enrich(item: RawItem): Promise<ArticleEnrichment> {
  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: articleEnrichmentSchema,
    maxOutputTokens: 400,           // 출력 토큰 제한 (요약 2~3줄)
    system: SYSTEM_PROMPT,          // 캐싱 대상 (§7)
    messages: [
      {
        role: "user",
        content:
          `[출처] ${item.source}\n[제목] ${item.title_original}\n` +
          `[본문]\n${item.content_raw.slice(0, MAX_INPUT_CHARS)}`,
      },
    ],
  });
  return object;
}
```

**출력 → SQLite 저장 매핑**: `title_ko`, `summary_ko`, `category`, `tags`, `importance`를 `articles`/`tags`/`article_tags`에 기록(§5).

**Acceptance Criteria**
- [ ] 1 기사 = 정확히 1 LLM 호출(요약·번역·분류·점수 통합).
- [ ] 출력은 항상 Zod 스키마를 통과한다(검증 실패 시 1회 재시도 후 스킵·로깅).
- [ ] `category`는 사전 정의된 enum 값만 가진다.
- [ ] `LLM_MODEL` 환경변수로 모델을 전환할 수 있다.

---

### 3.4 비용 절감 메커니즘

모든 가공 단계에서 LLM 호출/토큰을 구조적으로 최소화한다.

| 메커니즘 | 적용 방법 | 효과 |
|---|---|---|
| 코드 선필터 | 중복 제거 + 기존 항목 스킵 → 신규만 전달(§3.2) | 호출 건수 최소화, 재실행 비용 0 |
| 단일 호출 통합 | 요약·번역·분류·점수를 1 호출 JSON으로 통합(§3.3) | 기사당 호출 1회로 고정 |
| 프롬프트 캐싱 | 시스템 프롬프트·분류체계·few-shot에 Anthropic prompt caching 적용(§7) | 반복 입력 토큰 비용 절감 |
| 저비용 모델 기본값 | `claude-haiku-4-5` 기본, `LLM_MODEL`로 전환 | 단가 최소화 |
| 입력 토큰 절감 | 본문 상위 `MAX_INPUT_CHARS`(≈2500자)만 전달 | 입력 토큰 상한 |
| 출력 토큰 제한 | `maxOutputTokens=400`, 요약 2~3줄 제약 | 출력 토큰 상한 |
| 배치 1회/일 | GitHub Actions cron 일 1회 | 호출량 최소화 |
| 일일 상한 가드 | 신규 건수 > `MAX_ITEMS_PER_RUN`(예: 150) 시 트렌딩 상위만 가공 | 비용 폭주 방지 |

> **관리자 콘솔 비용:** 콘솔의 쓰기 동작(소스 커밋·재수집 트리거)은 on-demand serverless Route Handler에서 처리되며 호출 빈도가 매우 낮다(운영자 전용). 재수집은 기존 cron 배치를 `workflow_dispatch`로 재사용하므로 LLM 비용은 §3.4 메커니즘 안에서 동일하게 통제된다 → 추가 운영비 ≈ 0.

**Acceptance Criteria**
- [ ] 매 실행 후 호출 건수·입력/출력 토큰·추정 비용이 로그 및 `collection_runs`에 남는다.
- [ ] 신규 건수가 일일 상한을 초과하면 트렌딩 상위 N건만 LLM 가공한다.

---

### 3.5 피드/필터/정렬 (카드형 목록)

홈(`/`)에서 가공된 기사를 카드형 목록으로 제공한다. SQLite를 읽어 정적/ISR로 렌더한다.

**입력**: URL 쿼리 `?tag=`, `?source=`, `?sort=latest|importance`

**출력 (카드 1장 구성요소)**

| 필드 | 설명 |
|---|---|
| `source` | 출처(매체/플랫폼) 라벨 |
| `title_ko` | 한국어 제목 |
| `summary_ko` | 한국어 요약 2~3줄 |
| `tags[]` | 태그 칩 |
| `category` | 카테고리 배지 |
| `trending_score` / `importance` | 정렬·표시용 점수 |
| `published_at` | 게시 시각 |

**Acceptance Criteria**
- [ ] 태그·소스로 필터링되며, 최신순/중요도순 정렬이 동작한다.
- [ ] 카드 클릭 시 상세 페이지(`/article/[id]`)로 이동한다.
- [ ] 데이터는 ISR로 재검증(예: `revalidate = 3600`)되어 배치 후 자동 갱신된다.

---

### 3.6 상세 보기 (한국어 요약 + 원문 병기 + 출처 링크)

카드를 클릭하면 한국어 요약과 원문(영문/국문)을 병기한 상세 페이지를 보여준다.

**출력**

| 영역 | 내용 |
|---|---|
| 헤더 | `title_ko`, 출처·카테고리·게시 시각, 중요도/트렌딩 점수 |
| 한국어 요약 | `summary_ko` (2~3줄) |
| 원문 병기 | `title_original` + `content_raw` 발췌 |
| 태그 | `tags[]` (클릭 시 해당 태그 피드로 이동) |
| 원문 링크 | `url` 새 탭 이동 CTA |

**Acceptance Criteria**
- [ ] 한국어 요약과 원문이 함께 노출된다.
- [ ] 원문 링크는 새 탭으로 열린다.
- [ ] 태그 클릭 시 해당 태그로 필터된 피드로 이동한다.

---

### 3.7 검색

키워드로 과거 기사를 탐색한다(`/search?q=`). SQLite full-text(`FTS5`) 또는 `LIKE` 기반 단순 검색으로 구현한다.

**입력**: 검색어 `q`

**출력**: 매칭 기사 카드 목록(`title_ko`, `summary_ko`, `tags`, `source`, `published_at`)

**Acceptance Criteria**
- [ ] 한국어 제목·요약·태그를 대상으로 검색된다.
- [ ] 결과는 피드와 동일한 카드 컴포넌트로 표시된다.
- [ ] 결과 없음 상태가 명확히 표시된다.

---

### 3.8 관리자 운영 콘솔 (`/admin`)

운영자가 파일을 직접 편집하지 않고 **웹 UI(운영 콘솔)** 에서 소스를 관리하고 수집을 제어하며 비용을 모니터링한다. 공개 사이트(피드/상세/검색)와 분리된 **운영자 전용 인증 섹션**이다.

**비용 0 원칙 유지 설계**: 런타임에 쓰기 가능한 관리형 DB를 두지 않는다. 소스 변경은 **GitHub API로 `configs/sources.json`을 커밋**하여 영속화하고, 재수집은 **GitHub Actions `workflow_dispatch`** 로 기존 배치를 재사용한다. 모든 쓰기 동작은 Next.js Route Handler(serverless, 저빈도)에서 처리한다.

#### 3.8.1 소스 관리 (CRUD + 활성화 토글)

소스를 목록으로 보고 추가/수정/삭제하며 `enabled`를 토글한다. 저장 시 Route Handler가 `configs/sources.json`을 갱신해 GitHub API로 커밋한다.

**입력**: 소스 폼(`id`, `name`, `kind`(rss/web/reddit/hn/github/hf), `url`, `enabled`)

**출력 / 동작**

| 항목 | 설명 |
|---|---|
| 커밋 | `PUT /repos/{owner}/{repo}/contents/configs/sources.json` (GitHub API, `GITHUB_PAT`) |
| 반영 | 커밋 → (선택) `workflow_dispatch` → Vercel 재배포로 사이트 반영 |
| WEB 타입 | 등록 가능하나 수집 비활성(Post-MVP). 콘솔에 "수집 예정" 배지 표시 |

**Acceptance Criteria**
- [ ] 콘솔에서 소스를 추가/수정/삭제/토글하면 `configs/sources.json`이 GitHub에 커밋된다.
- [ ] 잘못된 `url`/중복 `id`는 저장 전 유효성 검증으로 차단된다.
- [ ] 커밋 성공/실패 결과가 UI에 명확히 표시된다.

#### 3.8.2 수집 재실행 트리거

"지금 수집" 버튼으로 다음 cron을 기다리지 않고 즉시 배치를 실행한다.

**입력**: 콘솔 버튼 클릭

**동작**: `POST /repos/{owner}/{repo}/actions/workflows/{collect.yml}/dispatches` (GitHub API) → Actions가 `scripts/collect.ts` 실행.

**Acceptance Criteria**
- [ ] 버튼 클릭 시 `workflow_dispatch`가 호출되고, 트리거 성공 여부가 표시된다.
- [ ] 중복 클릭으로 동시 실행되지 않도록 진행 중 상태를 비활성화한다.

#### 3.8.3 수집 통계 · 비용 대시보드

배치 실행 이력을 표/카드로 보여준다. `collection_runs` 테이블(§5)을 읽는다.

**출력 (실행별)**

| 필드 | 설명 |
|---|---|
| `started_at` | 실행 시각 |
| `items_collected` / `items_new` | 수집/신규 건수 |
| `llm_calls` | LLM 호출 수 |
| `input_tokens` / `output_tokens` | 토큰 사용량 |
| `est_cost_usd` | 추정 비용(USD) |
| `status` | success / partial / failed |

**Acceptance Criteria**
- [ ] 최근 N회 실행의 수집·신규·토큰·추정비용·상태가 한 화면에 표시된다.
- [ ] 일일 비용이 임계(예: $0.30)를 초과한 실행이 시각적으로 강조된다.

#### 3.8.4 운영자 인증

공개 사이트와 분리된 단일 운영자 인증. 회원가입·다중 사용자는 없다(§8).

**동작**: `ADMIN_PASSWORD` 검증 → 서명된 세션 쿠키 발급. `middleware.ts`가 `/admin/*` 및 admin Route Handler를 보호.

**Acceptance Criteria**
- [ ] 미인증 상태로 `/admin/*` 접근 시 로그인으로 리다이렉트된다.
- [ ] `GITHUB_PAT` 등 민감 정보는 서버(Route Handler)에서만 사용되고 클라이언트로 노출되지 않는다.

---

## 4. 시스템 아키텍처

### 4.1 데이터 흐름도

```
┌──────────────┐   일 1회 cron    ┌──────────────────────────────────────┐
│ GitHub Actions│ ───────────────▶ │  scripts/collect.ts (Node)           │
└──────────────┘                  │                                      │
                                  │  ① 수집  RSS(rss-parser) + API       │
   configs/sources.json ────────▶ │     (HN/GitHub/HF/Reddit OAuth2)     │
                                  │  ② 전처리 dedup + trendingScore()    │  ← 코드만
                                  │  ③ LLM   신규만 generateObject()     │  ← Haiku 1호출/건
                                  │  ④ 저장  SQLite (better-sqlite3)     │
                                  └──────────────┬───────────────────────┘
                                                 │ data/app.db 커밋
                                                 ▼
                                  ┌──────────────────────────┐
                                  │ Git push → Vercel 배포    │
                                  └──────────────┬───────────┘
                                                 ▼ 빌드 시 SQLite read
                ┌────────────────────────────────────────────────────────┐
                │ Next.js 15 (App Router, SSG/ISR)                        │
                │  공개:  /  피드   /article/[id] 상세   /search 검색      │
                │  운영:  /admin  운영 콘솔 (인증 필요)                    │
                └────────────────────────────────────────────────────────┘
                            ▼                              ▲
                       열람자(브라우저)              운영자(브라우저)
                                                          │
   ┌──────────────────────────────────────────────────────┘
   ▼  Admin Route Handler (serverless, 저빈도 → 비용 ≈ 0)
┌──────────────────────────────────────────────────────────────┐
│  소스 저장  → GitHub API: configs/sources.json 커밋           │
│  지금 수집  → GitHub API: workflow_dispatch (collect.yml)     │ ──▶ 위 cron 배치 재사용
│  대시보드   → SQLite read: collection_runs 통계/비용          │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 배치 스케줄

- GitHub Actions `schedule: cron` 일 1회(예: `0 21 * * *` UTC = KST 06:00).
- 수동 트리거(`workflow_dispatch`)로 즉시 실행 가능.
- 실행 후 `data/app.db` 변경분을 커밋 → Vercel 자동 배포.

### 4.3 페이지 라우팅 & 렌더링 전략

| 경로 | 페이지 | 렌더링 / 접근 |
|---|---|---|
| `/` | 피드(홈) | ISR (`revalidate` 후 정적 재생성) · 공개 |
| `/article/[id]` | 상세 | SSG (`generateStaticParams`) + ISR · 공개 |
| `/search` | 검색 | 클라이언트 필터 또는 라우트 핸들러 기반 동적 · 공개 |
| `/admin` | 운영 콘솔(대시보드/소스 관리) | 동적(SSR) · **운영자 인증 필요**(`middleware.ts`) |
| `/api/admin/sources` | 소스 커밋 Route Handler | serverless · GitHub API 호출(`GITHUB_PAT`) |
| `/api/admin/collect` | 재수집 트리거 Route Handler | serverless · `workflow_dispatch` 호출 |

> 배치 결과가 git에 커밋되어 배포가 트리거되므로, 실시간성보다 정적/ISR로 비용·성능을 우선한다. 운영 콘솔은 동적 라우트지만 호출 빈도가 낮아(운영자 전용) serverless 함수 비용은 무시 가능하다.

**환경변수**: `ANTHROPIC_API_KEY`, `LLM_MODEL`(기본 `claude-haiku-4-5`), `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`, `GITHUB_PAT`(sources.json 커밋 + workflow_dispatch), `GITHUB_REPO`(`owner/repo`), `ADMIN_PASSWORD`(운영자 인증).

---

## 5. 데이터 모델

### 5.1 SQLite 스키마 (better-sqlite3 기준)

```sql
-- sources: configs/sources.json과 동기화되는 소스 메타
CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,           -- 'techcrunch_ai', 'hn', 'reddit_localllama'
  name        TEXT NOT NULL,              -- 표시명
  kind        TEXT NOT NULL,              -- 'rss' | 'web' | 'hn' | 'github' | 'hf' | 'reddit'
  url         TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1  -- 'web'은 MVP에서 0(수집 Post-MVP)
);

-- articles: 수집 원본 + LLM 가공 결과 통합
CREATE TABLE IF NOT EXISTS articles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  dedup_key       TEXT NOT NULL UNIQUE,   -- sha256(normalize(url))
  source_id       TEXT NOT NULL REFERENCES sources(id),
  url             TEXT NOT NULL,
  -- 수집 원본
  title_original  TEXT NOT NULL,
  content_raw     TEXT,
  published_at    TEXT NOT NULL,          -- ISO8601 UTC
  -- engagement / 코드 점수
  engagement_json TEXT,                   -- '{"points":..,"ups":..,"num_comments":..,"stars":..}'
  trending_score  INTEGER NOT NULL DEFAULT 0,  -- 0~100 (코드 산출)
  -- LLM 가공 결과
  title_ko        TEXT,
  summary_ko      TEXT,
  category        TEXT,                   -- CATEGORIES enum
  importance      INTEGER,                -- 1~5 (LLM 보조)
  -- 메타
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_trending  ON articles(trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category  ON articles(category);

-- tags & 다대다 매핑
CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS article_tags (
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

-- 검색(선택): FTS5 가상 테이블
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title_ko, summary_ko, content='articles', content_rowid='id'
);

-- collection_runs: 배치 실행 이력 (관리자 콘솔 통계·비용 대시보드, §3.8.3)
CREATE TABLE IF NOT EXISTS collection_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at        TEXT NOT NULL,         -- ISO8601 UTC
  finished_at       TEXT,
  items_collected   INTEGER NOT NULL DEFAULT 0,
  items_new         INTEGER NOT NULL DEFAULT 0,
  llm_calls         INTEGER NOT NULL DEFAULT 0,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  est_cost_usd      REAL    NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL,       -- 'success' | 'partial' | 'failed'
  notes             TEXT                    -- 소스별 실패 요약 등
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON collection_runs(started_at DESC);
```

> `scripts/collect.ts`는 매 실행 종료 시 `collection_runs`에 1행을 기록한다(토큰·비용 집계 포함). 관리자 콘솔 대시보드는 이 테이블만 읽는다.

### 5.2 수집 원본 ↔ 가공 결과 매핑

| 단계 | 출처 | 채워지는 컬럼 |
|---|---|---|
| ① 수집 | RSS/API | `url`, `title_original`, `content_raw`, `published_at`, `engagement_json` |
| ② 전처리 | 코드 | `dedup_key`, `trending_score` |
| ③ LLM | generateObject | `title_ko`, `summary_ko`, `category`, `importance`, `tags`(→ tags/article_tags) |

### 5.3 렌더링용 응답 구조 (Article DTO)

```typescript
// src/lib/types.ts
export interface ArticleCard {
  id: number;
  source: { id: string; name: string };
  url: string;
  titleKo: string;
  summaryKo: string;
  titleOriginal: string;
  category: string;        // CATEGORIES
  tags: string[];
  trendingScore: number;   // 0~100
  importance: number;      // 1~5
  publishedAt: string;     // ISO8601
}
```

```typescript
// src/lib/db.ts (조회 예시)
import Database from "better-sqlite3";
import { DB_PATH } from "@/lib/paths";

export function getFeed(opts: {
  tag?: string; source?: string; sort?: "latest" | "importance"; limit?: number;
}): ArticleCard[] {
  const db = new Database(DB_PATH, { readonly: true });
  const order = opts.sort === "importance"
    ? "a.importance DESC, a.trending_score DESC"
    : "a.published_at DESC";
  // ...태그/소스 필터 결합 후 ArticleCard[] 매핑
}
```

---

## 6. UI/UX 요구사항 (공개 3페이지 + 운영자 콘솔, DESIGN.md 토큰 매핑)

DESIGN.md(Apple 디자인 분석)의 토큰을 따른다. **핵심 원칙**: 단일 강조색 Action Blue(`{colors.primary}` = `#0066cc`), SF Pro 타이포(대체 폰트 Inter), 라이트/다크 교차 섹션 리듬, 미니멀한 chrome, 카드형 레이아웃.

- **공개 사이트(열람자)**: 피드(`/`) · 상세(`/article/[id]`) · 검색(`/search`) — **3페이지 제약 유지**.
- **운영자 콘솔(`/admin`)**: 인증 후 접근하는 별도 운영 섹션(§6.6). 동일 디자인 시스템을 재사용한다.

### 6.1 페이지 1 — 피드(홈, `/`)

```
┌──────────────────────────────────────────────────────────┐  global-nav (#000, h44)
│ Daily AI Brief                              [검색] [정렬▾] │
├──────────────────────────────────────────────────────────┤  sub-nav-frosted (parchment 80%)
│ 오늘의 AI 브리핑 · 2026.06.07     [전체][LM][Agents][...] │  (카테고리/태그 칩)
├──────────────────────────────────────────────────────────┤  canvas / parchment 교차
│ ┌────────────────────────┐  ┌────────────────────────┐   │
│ │ TechCrunch · LM   ●92  │  │ HN · Agents       ●78  │   │  ← store-utility-card
│ │ OpenAI, 새 추론 모델..  │  │ 자율 에이전트 벤치마크.. │   │     rounded.lg(18px)
│ │ 한국어 요약 2~3줄...     │  │ 한국어 요약 2~3줄...     │   │
│ │ #추론 #모델 #벤치마크    │  │ #agent #eval           │   │  ← tag = rounded.pill
│ └────────────────────────┘  └────────────────────────┘   │
│ ┌────────────────────────┐  ┌────────────────────────┐   │
│ │ AI타임스 · 산업·정책 ●70│  │ GitHub · Dev Tools ●65 │   │
│ └────────────────────────┘  └────────────────────────┘   │
└──────────────────────────────────────────────────────────┘  footer (parchment)
```

### 6.2 페이지 2 — 상세(`/article/[id]`)

```
┌──────────────────────────────────────────────────────────┐  global-nav
├──────────────────────────────────────────────────────────┤
│ ‹ 피드로                                                   │
│ [TechCrunch] [Language Models] · 2026.06.07 · 중요도 ●●●●○ │
│                                                            │
│ OpenAI, 새 추론 모델 공개… (title_ko, display-md)          │
│ ─────────────────────────────────────────────────────     │  hairline #e0e0e0
│ 📌 한국어 요약                                             │
│ 핵심 사실 2~3줄...                                         │  body 17px
│                                                            │
│ 📰 원문 (English)                                          │
│ "OpenAI today announced..." title_original + 발췌          │  body-muted
│                                                            │
│ #추론 #모델 #벤치마크                                      │  tag chips (pill)
│ ┌──────────────────────┐                                  │
│ │  원문 보기 →          │  button-primary (Action Blue pill)│
│ └──────────────────────┘                                  │
└──────────────────────────────────────────────────────────┘
```

### 6.3 페이지 3 — 검색(`/search`)

```
┌──────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────┐       │  search-input
│ │ 🔍  검색어 입력...                               │       │  rounded.pill, h44
│ └────────────────────────────────────────────────┘       │
│ "agent" 검색 결과 12건                                     │
│ ┌────────────────────────┐  ┌────────────────────────┐   │
│ │ (피드와 동일 카드)      │  │ ...                     │   │  store-utility-card 재사용
│ └────────────────────────┘  └────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 6.4 카드 구성요소 → DESIGN.md 토큰 매핑

| 요소 | DESIGN.md 토큰 | 값/비고 |
|---|---|---|
| 카드 컨테이너 | `{component.store-utility-card}` | 배경 `{colors.canvas}` #fff, 1px `{colors.hairline}` #e0e0e0, `{rounded.lg}` 18px, padding `{spacing.lg}` 24px |
| 출처 라벨 | `{typography.caption-strong}` | 14px/600, `{colors.ink-muted-80}` #333 |
| 카테고리 배지 | `{typography.caption}` + `{rounded.pill}` | `{colors.canvas-parchment}` 배경 |
| 한국어 제목 | `{typography.body-strong}` | 17px/600/-0.374px, `{colors.ink}` #1d1d1f |
| 한국어 요약 | `{typography.body}` | 17px/400/1.47, `{colors.ink}` |
| 태그 칩 | `{component.configurator-option-chip}` | `{rounded.pill}`, `{typography.caption}` |
| 트렌딩/중요도 점수 | `{typography.caption-strong}` | 강조 수치는 `{colors.primary}` #0066cc |
| 카드 클릭/링크 CTA | `{component.button-primary}` / `{component.text-link}` | Action Blue `#0066cc`, pill, active `scale(0.95)` |
| 섹션 리듬 | `{component.product-tile-light}` ↔ `{component.product-tile-parchment}` | 라이트/패치먼트 교차, 색 변화가 구분선 |
| 글로벌 내비 | `{component.global-nav}` | `{colors.surface-black}` #000, h44, `{typography.nav-link}` |
| 서브 내비 | `{component.sub-nav-frosted}` | parchment 80% + backdrop-blur |
| 검색 입력 | `{component.search-input}` | `{rounded.pill}`, h44, `{typography.body}` |
| 푸터 | `{component.footer}` | `{colors.canvas-parchment}` #f5f5f7 |

> **금지 사항(DESIGN.md Don't):** 두 번째 강조색 도입 금지(모든 인터랙션은 Action Blue), 카드/버튼/텍스트에 그림자 금지(그림자는 이미지 전용), 데코 그라데이션 금지, 본문 weight 500 금지(300/400/600/700만).

### 6.5 반응형

| 브레이크포인트 | 동작 |
|---|---|
| ≥ 1441px | 콘텐츠 1440px 고정, 양쪽 여백 흡수 |
| 1069~1440px | 카드 그리드 3~4열 |
| 834~1068px | 글로벌 내비 전체, 그리드 2~3열 |
| 641~833px | 글로벌 내비 햄버거화, 그리드 2열, 서브 내비 칩 축소 |
| ≤ 640px | 단일 컬럼 스택, 헤드라인 34px↓, 패딩 축소 |

- 터치 타깃 최소 44×44px(`{component.button-primary}`, 검색 입력 준수).

### 6.6 운영자 콘솔 (`/admin`, 인증 후)

공개 사이트와 동일한 디자인 시스템을 재사용한다(별도 디자인 토큰 없음). 좌측 대시보드 + 소스 관리 테이블 구성.

```
┌──────────────────────────────────────────────────────────┐  global-nav (#000)
│ Daily AI Brief · Admin                       [로그아웃]    │
├──────────────────────────────────────────────────────────┤
│ 📊 수집 통계 (collection_runs)            [ 지금 수집 ▶ ] │  button-primary (pill)
│ ┌────────────┬────────────┬────────────┬──────────────┐  │
│ │ 06-07 06:00│ 수집 142   │ 신규 38    │ $0.21  ✅    │  │ ← store-utility-card
│ │ 06-06 06:00│ 수집 137   │ 신규 41    │ $0.24  ✅    │  │
│ │ 06-05 06:00│ 수집  90   │ 신규 12    │ $0.08  ⚠부분 │  │ ← 임계 초과 시 강조
│ └────────────┴────────────┴────────────┴──────────────┘  │
├──────────────────────────────────────────────────────────┤
│ 🗂 소스 관리                                  [ + 소스 추가 ]│
│ ┌──────────────────────────────────────────────────────┐ │
│ │ TechCrunch AI   RSS    ●활성  [수정][삭제]            │ │
│ │ Latent Space    RSS    ●활성  [수정][삭제]            │ │
│ │ AI Engineer     WEB    ○수집예정(Post-MVP)  [수정]    │ │
│ │ r/LocalLLaMA    REDDIT ●활성  [수정][삭제]            │ │
│ └──────────────────────────────────────────────────────┘ │
│ 저장 시 configs/sources.json 커밋 → 재배포                 │
└──────────────────────────────────────────────────────────┘
```

| 요소 | DESIGN.md 토큰 | 비고 |
|---|---|---|
| 통계/소스 카드·행 | `{component.store-utility-card}` | `{rounded.lg}`, 1px `{colors.hairline}` |
| "지금 수집"·"소스 추가" CTA | `{component.button-primary}` | Action Blue `#0066cc` pill |
| 수정/삭제 보조 액션 | `{component.text-link}` / `{component.button-dark-utility}` | `{rounded.sm}` |
| 소스 입력 폼 | `{component.search-input}` 계열 | `{rounded.pill}`/`{rounded.md}` |
| 분류 배지(RSS/WEB/REDDIT) | `{typography.caption-strong}` + `{rounded.pill}` | 단일 강조색 원칙 유지 |
| 비용 임계 초과 강조 | 텍스트 강조(`{colors.primary}`) + ⚠ 라벨 | 두 번째 색 도입 금지 |

---

## 7. 프롬프트 관리/구성

### 7.1 LLM 통합 가공 프롬프트 (configs/prompts/)

**시스템 프롬프트 (캐싱 대상)** — `configs/prompts/enrich.system.md`

```
당신은 글로벌 AI/IT 뉴스를 한국어로 큐레이션하는 편집자입니다.
주어진 영문/국문 기사에 대해 다음을 한국어로 생성하세요:
- title_ko: 간결하고 정확한 한국어 제목 (낚시성·과장 금지, 60자 이내)
- summary_ko: 핵심 사실 중심 2~3줄 요약 (의견·추측 배제)
- category: 아래 분류 체계 중 가장 적합한 하나
- tags: 1~5개 키워드 (소문자 영문 또는 한글)
- importance: 1~5 (업계 영향도 기준, 5=매우 중요)

[분류 체계]
- Language Models: 모델 출시·성능·아키텍처 (LLM, 멀티모달 등)
- Agents: 에이전트·자율 시스템·툴 유즈
- Dev Tools: 개발자 도구·프레임워크·SDK·IDE
- MLOps: 학습·서빙·인프라·배포·평가 운영
- 연구·논문: arXiv·논문·연구 성과
- 산업·정책: 투자·인수·규제·정책·시장 동향

[출력 규칙]
- 반드시 구조화 스키마에 맞춰 출력 (자유 서술 금지)
- 사실에 없는 내용 추가 금지 (환각 금지)
```

**few-shot 예시 (캐싱 대상)** — `configs/prompts/enrich.fewshot.json`: 카테고리별 대표 입력→출력 2~3쌍을 고정 포함.

**유저 메시지 (가변)**: `[출처]/[제목]/[본문 절단]` (§3.3 참조).

### 7.2 프롬프트 캐싱 전략

- **캐싱 대상(고정)**: 시스템 프롬프트 + 분류 체계 + few-shot 예시 → Anthropic prompt caching `cache_control` 적용.
- **비캐싱(가변)**: 기사별 유저 메시지.
- 효과: 배치 내 N건을 연속 처리할 때 고정 입력 토큰의 재청구를 절감.

### 7.3 카테고리/태그 분류 체계

- **카테고리(고정 enum, §3.3 `CATEGORIES`)**: Language Models / Agents / Dev Tools / MLOps / 연구·논문 / 산업·정책. 운영자가 `schema.ts` + 시스템 프롬프트에서 동시 조정.
- **태그(자유, 1~5개)**: LLM 생성. 정규화(소문자·trim) 후 `tags` 테이블에 누적.

---

## 8. MVP 제외 사항 (Non-Goals)

| 제외 항목 | 이유 |
|---|---|
| **열람자** 회원가입·로그인·개인화 | 정적/ISR 공개 피드로 충분(단, **운영자 단일 인증**은 §3.8.4로 포함) |
| WEB(스크래핑) 소스 실제 수집 | 비용·유지보수 부담. 콘솔 등록만 허용하고 수집은 Post-MVP(§10) |
| 다중 운영자·RBAC | 솔로 운영 전제, 단일 `ADMIN_PASSWORD`로 충분 |
| 댓글·커뮤니티·좋아요 | 상태 저장 백엔드 필요 → 운영비 ≈ 0 원칙 위배 |
| AI 용어사전 | 핵심 가치(요약 큐레이션)와 분리된 별도 기능, Post-MVP |
| 다국어(영문 UI 등) | 1차 타깃은 국내 사용자, 범위 확대는 검증 후 |
| 실시간/분 단위 수집 | LLM 호출량·비용 급증, 일 1회 배치로 비용 통제 |
| 본문 전문 저장·재배포 | 저작권 리스크, 요약 + 원문 링크로 대체 |
| 추천/랭킹 ML 모델 | 코드 기반 트렌딩 점수로 충분, 과도한 복잡도 |

---

## 9. 성공 지표 & 평가 전략

### 9.1 MVP 완료 기준 & 운영 지표

| 항목 | 목표값 |
|---|---|
| 일일 LLM 비용 | ≤ $0.30 (Haiku, 신규 50~100건/일) |
| 파이프라인 성공률 | ≥ 95% (최근 30일 cron) |
| 일일 신규 카드 수 | ≥ 30건 |
| 피드 LCP | ≤ 2.0s (데스크톱) |
| 중복 제거 정확도 | 동일 기사 중복 게시 0건(샘플 검수) |
| 공개 3페이지 동작 | 피드 필터·정렬, 상세 병기, 검색 모두 정상 |
| 소스 변경 반영 시간 | 콘솔 저장 → 재배포 완료 ≤ 10분 |
| 콘솔 재수집 트리거 | `workflow_dispatch` 성공률 ≥ 95% |

### 9.2 비용/토큰 상한 가드

- 기사당 입력 ≤ ~2500자(`MAX_INPUT_CHARS`), 출력 ≤ 400 토큰(`maxOutputTokens`).
- 일일 LLM 가공 ≤ `MAX_ITEMS_PER_RUN`(예: 150건). 초과 시 트렌딩 상위만 가공.
- 매 실행 호출 수·토큰·추정 비용 로깅, 임계 초과 시 Actions 경고.

### 9.3 LLM 출력 품질 평가 전략

- **샘플 검수(주간 20건)**: 운영자가 무작위 20건의 (요약 정확도 / 번역 자연스러움 / 분류 적합성)을 3점 척도로 채점 → 통과율 ≥ 90% 목표.
- **스키마 검증율**: `generateObject` Zod 검증 통과율 ≥ 99%(실패는 재시도 1회 후 스킵·로깅).
- **분류 일관성**: 동일 유형 기사가 일관된 카테고리로 분류되는지 월 1회 스팟 체크.
- **환각 점검**: 요약이 원문에 없는 사실을 포함하지 않는지 샘플 대조.

---

## 10. 향후 계획 (Post-MVP)

- [ ] **WEB(스크래핑) 소스 수집 활성화** (AI Engineer 등 공식 RSS 미지원 매체)
- [ ] 관리자 콘솔 고도화: 소스별 성능/품질 분석, `sources.json` 변경 diff 미리보기, 다중 운영자·RBAC
- [ ] AI 용어사전(요약 내 용어 툴팁)
- [ ] 일일/주간 다이제스트 이메일·RSS 발행
- [ ] 소스별 신뢰도 가중치 학습 및 트렌딩 점수 고도화
- [ ] 사용자 북마크(localStorage 기반 무인증)
- [ ] 추가 소스 확장(ZDNet Korea·디지털데일리 Google News RSS 우회, arXiv cs.AI)
- [ ] 카테고리별 구독/알림
- [ ] 영문 UI 등 다국어 지원
```
