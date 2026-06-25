# Daily AI Brief — GitHub Pages 배포 전환 PRD v1.0

**기존 Next.js + Vercel(ISR/SSR/serverless) 서비스를, 화면·기능·동작을 그대로 보존한 채 GitHub Pages 정적 호스팅으로 전환하기 위한 마이그레이션 요구사항 정의서**

---

| 항목           | 내용                                                            |
| -------------- | --------------------------------------------------------------- |
| 문서 버전      | v1.0                                                            |
| 작성일         | 2026년 6월 25일                                                 |
| 대상 독자      | 개발자(구현), 운영자(솔로 메인테이너)                          |
| 문서 성격      | **마이그레이션 PRD** — 원본 PRD([docs/PRD.md](PRD.md)) 대비 변경점 정의 |
| 구현 목표 기간 | 3~5일 (1인 개발)                                                |
| 핵심 제약      | 원본 동작 보존, 추가 운영비 ≈ 0, 수집 외 수작업 0(무인 자동화) |

> **원본과의 관계:** 본 PRD는 [docs/PRD.md](PRD.md)(Daily AI Brief PRD v1.0)에서 정의한 **서비스 자체를 변경하지 않는다.** 데이터 모델·수집 파이프라인·LLM 가공·디자인([DESIGN.md](../DESIGN.md))은 모두 동일하며, **배포 타깃만 Vercel → GitHub Pages**로 바꾸는 데 필요한 변경점만 다룬다.

---

## 0. Executive Summary

- **Problem Statement**: 현재 서비스는 Vercel의 ISR·SSR·serverless Route Handler에 의존한다. GitHub Pages는 순수 정적 호스팅(HTML/JS/CSS만 서빙)이므로 ISR 피드, `force-dynamic` 검색(FTS5), admin SSR+인증, `/api/*` 라우트, `middleware.ts`가 그대로는 동작하지 않는다.
- **Proposed Solution**: Next.js **정적 export(`output: 'export'`)** 로 전환한다. 빌드타임에 readonly SQLite를 조회해 피드·상세 전체를 사전 렌더하고, 검색은 **빌드 시 JSON 인덱스를 내보내 클라이언트 사이드 검색**으로 대체한다. 관리자 콘솔은 **로컬 전용 도구로 유지**(배포 산출물에서 제외)한다. GitHub Actions가 수집(DB 커밋) 이후 **정적 빌드 → Pages 배포까지 무인 자동화**한다.
- **Success Criteria (측정 가능 KPI)**:
  1. **정적 export 빌드 성공률 ≥ 95%** (`next build`가 SSR/ISR/Route Handler 의존 없이 완료, 최근 30일 Actions 기준).
  2. **수집 → 배포 자동화 ≤ 10분** (DB 커밋 → `deploy` 워크플로 → Pages 반영 완료, 수동 개입 0회).
  3. **공개 3페이지 동작 동일성 100%** (피드 필터·정렬 / 상세 원문 병기 / 검색 — 원본과 화면·UX 동일, §9.2 체크리스트 전부 통과).
  4. **피드 LCP ≤ 2.0s** (정적 HTML, 데스크톱 기준 — 원본 목표 유지).
  5. **추가 운영비 = $0** (GitHub Pages·Actions 무료 범위 내, Vercel 의존 제거).
  6. **`basePath` 경로 회귀 0건** (서브경로 배포에서 내부 링크·정적 자산 깨짐 없음).

---

## 1. 프로젝트 개요

### 1.1 전환 배경

원본 Daily AI Brief는 운영비 ≈ 0을 목표로 설계되었으나 렌더링·배포는 Vercel에 묶여 있다. GitHub Pages는 GitHub 저장소만으로 무료 정적 호스팅과 Actions 자동 배포를 제공하므로, **외부 PaaS 의존을 제거하고 저장소 단일화**가 가능하다. 다만 정적 호스팅은 서버 런타임이 없어 ISR·SSR·serverless 기능을 쓸 수 없다.

### 1.2 해결하려는 문제

| 문제                          | 현재 상황                                          | 전환 후                                    |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------ |
| 배포가 Vercel에 종속          | 별도 PaaS 계정·연동·환경변수 관리                  | GitHub 저장소+Actions로 일원화             |
| ISR/SSR/serverless 런타임 필요 | Vercel 서버 함수가 요청 시 DB 조회·렌더            | 빌드타임 사전 렌더(정적) 전환              |
| 요청시 검색(FTS5)             | serverless에서 SQLite full-text 쿼리              | 빌드 시 JSON 인덱스 + 클라이언트 검색      |
| 관리자 콘솔이 서버 의존       | 인증·GitHub API·workflow_dispatch가 serverless 필요 | 로컬 전용 도구로 분리(배포 제외)           |

### 1.3 핵심 가치 제안

- **원본 보존:** 디자인·데이터·수집 파이프라인·공개 화면을 그대로 유지하고 배포 방식만 교체.
- **운영비 완전 0:** Vercel 제거. GitHub Pages·Actions 무료 범위 내에서 호스팅·CI/CD 일원화.
- **무인 자동화:** 일 1회 수집이 DB를 커밋하면 정적 빌드·배포까지 자동 진행. 운영자의 추가 빌드 수작업 없음.
- **검색 기능 유지:** 서버 없이도 클라이언트 인덱스로 `/search` 화면·UX를 동일하게 제공.

---

## 2. 사용자 정의

| 역할                  | 변화 | 설명                                                                                          |
| --------------------- | ---- | --------------------------------------------------------------------------------------------- |
| **열람자 (Reader)**   | 없음 | 피드·상세·검색 경험 동일. 정적 HTML이라 초기 로드는 동일하거나 더 빠름.                        |
| **운영자 (Operator)** | 변경 | 관리자 콘솔이 **공개 사이트에서 분리**됨. 소스 관리·재수집·KPI 확인은 **로컬(`npm run dev`)** 에서 수행. |

**User Story**

- _As a 열람자, I want 정적 사이트에서도 동일한 피드·필터·정렬·검색·상세를 쓰고 싶다, so that 배포 방식이 바뀌어도 사용 경험이 달라지지 않는다._
- _As a 운영자, I want 수집만 트리거하면 빌드·배포까지 자동으로 끝나길 원한다, so that 매일 배포를 위해 따로 손댈 일이 없다._
- _As a 운영자, I want 소스 관리·KPI 모니터링을 로컬에서 그대로 쓰고 싶다, so that admin 기능을 잃지 않으면서도 정적 호스팅 제약을 지킨다._

---

## 3. 핵심 기능 / 변경 요구사항

각 항목은 **원본 동작 → 정적 전환 방식 → Acceptance Criteria** 순으로 기술한다. (우선순위는 의존 순서)

| 우선순위 | 기능                              | 의존성   |
| :------: | --------------------------------- | -------- |
|    1     | 3.1 정적 export 기반 설정         | -        |
|    2     | 3.2 피드(`/`) 정적화              | 3.1      |
|    3     | 3.3 상세(`/article/[id]`) 사전 생성 | 3.1      |
|    4     | 3.4 검색(`/search`) 클라이언트화  | 3.1, 3.2 |
|    5     | 3.5 관리자 콘솔 로컬 전용 분리    | 3.1      |
|    6     | 3.6 자동 빌드·배포 파이프라인     | 3.1~3.4  |

---

### 3.1 정적 export 기반 설정

**원본 동작:** [next.config.ts](../next.config.ts)는 `output: "standalone"`(Node 서버 번들) + `serverExternalPackages: ["better-sqlite3"]`.

**정적 전환 방식:** `output: "export"` 로 변경하여 `next build` 가 `out/` 정적 디렉터리를 생성하게 한다. 프로젝트 페이지(서브경로) 배포이므로 `basePath`/`assetPrefix`를 저장소명으로 지정하고, 정적 export에서 필수인 `images.unoptimized`를 켠다. `better-sqlite3`는 빌드타임에만 쓰이므로 서버 번들 옵션은 정리한다.

```typescript
// next.config.ts (전환 후)
import type { NextConfig } from "next";

const repo = "global-ai-news"; // GitHub 프로젝트 페이지 서브경로

const nextConfig: NextConfig = {
  output: "export", // 정적 export → out/ 생성
  basePath: `/${repo}`, // username.github.io/global-ai-news
  assetPrefix: `/${repo}/`,
  images: { unoptimized: true }, // 정적 export는 next/image 최적화 서버 미지원
  trailingSlash: true, // /article/123/ → 폴더형 index.html 안정화
};

export default nextConfig;
```

> `better-sqlite3`는 정적 export 후 런타임 번들에 포함되지 않아야 한다(빌드타임 전용). 서버 컴포넌트의 DB 조회는 빌드 시점에 1회 실행되어 결과가 HTML/JSON으로 구워진다.

**Acceptance Criteria**

- [ ] `npm run build`가 `output: 'export'` 로 `out/` 정적 산출물을 생성하고, SSR/ISR/Route Handler 의존 오류 없이 완료된다.
- [ ] `basePath`/`assetPrefix`가 적용되어 서브경로(`/global-ai-news`)에서 정적 자산·내부 링크가 정상 동작한다.
- [ ] `next/image` 사용처가 `unoptimized`로 빌드 에러 없이 export된다.
- [ ] `better-sqlite3`가 클라이언트 번들에 포함되지 않는다(빌드타임 전용).

---

### 3.2 피드(`/`) 정적화

**원본 동작:** [src/app/page.tsx:7](../src/app/page.tsx#L7)이 `export const revalidate = 3600`(ISR). 요청/재검증 시 DB를 조회.

**정적 전환 방식:** ISR을 제거하고 **빌드타임 1회 정적 생성**으로 전환한다. 피드 데이터는 빌드 시 `getFeed()`로 조회되어 HTML에 구워진다. 필터(`?tag=`/`?source=`)·정렬(`?sort=`)은 원본이 서버 쿼리 기반이므로, 정적 환경에서는 **클라이언트 측 필터·정렬(전체 카드 데이터를 페이지에 포함 후 브라우저에서 필터링)** 로 동일 UX를 유지한다. 데이터 갱신은 ISR이 아니라 **매 배포(수집 후 재빌드)** 로 반영된다.

> [src/lib/db.ts:14](../src/lib/db.ts#L14)의 readonly 조회는 빌드타임에 그대로 사용 가능하므로 DB 접근 코드는 변경 없음.

**Acceptance Criteria**

- [ ] 피드 페이지가 ISR 없이 정적으로 생성되고, 최신 `data/app.db` 내용이 빌드 결과에 반영된다.
- [ ] 태그·소스 필터, 최신순/중요도순 정렬이 정적 환경에서 원본과 동일하게 동작한다(클라이언트 필터링 허용).
- [ ] 카드 클릭 시 `/article/[id]` 정적 페이지로 이동한다.

---

### 3.3 상세(`/article/[id]`) 사전 생성

**원본 동작:** [src/app/article/[id]/page.tsx](../src/app/article/[id]/page.tsx)에 `generateStaticParams`가 없어 요청 시 `getArticle(id)`로 DB 조회.

**정적 전환 방식:** `generateStaticParams`를 추가해 **빌드타임에 전 기사 ID를 열거**하고 모든 상세 페이지를 사전 생성한다. 페이지 내부 로직(한국어 요약 + 원문 병기, 태그 클릭, 원문 링크)은 변경 없음.

```typescript
// src/app/article/[id]/page.tsx (추가)
import { getAllArticleIds } from "@/lib/db"; // 전 기사 id 반환 헬퍼 (신규)

export async function generateStaticParams() {
  return getAllArticleIds().map((id) => ({ id: String(id) }));
}
```

> `getAllArticleIds()`(또는 기존 `getFeed`를 limit 없이 활용)를 [src/lib/db.ts](../src/lib/db.ts)에 readonly 조회로 추가한다.

**Acceptance Criteria**

- [ ] 빌드 시 모든 기사의 상세 페이지가 정적으로 생성된다(`out/article/<id>/index.html`).
- [ ] 존재하지 않는 ID 접근 시 정적 404로 처리된다.
- [ ] 한국어 요약·원문 병기·태그 이동·원문 새 탭 링크가 원본과 동일하게 동작한다.

---

### 3.4 검색(`/search`) 클라이언트 사이드 전환

**원본 동작:** [src/app/search/page.tsx:9](../src/app/search/page.tsx#L9)이 `force-dynamic` + 요청 시 `searchArticles()`(SQLite FTS5).

**정적 전환 방식:** 서버 검색을 제거하고 **클라이언트 사이드 검색**으로 대체하되 화면·필터 UX는 그대로 유지한다.

1. **빌드타임 인덱스 내보내기:** 빌드 시 검색 대상 메타(`id`, `titleKo`, `summaryKo`, `tags`, `source`, `category`, `publishedAt`)를 `public/search-index.json`(또는 빌드 산출물)으로 내보낸다.
2. **클라이언트 검색:** 검색 페이지가 마운트 시 인덱스를 fetch하고 **FlexSearch 또는 Fuse.js**로 브라우저에서 검색한다. 입력 디바운스·결과 카드(피드와 동일 컴포넌트 재사용)·결과 없음 상태를 유지한다.
3. **페이지 전환:** `/search`는 정적 셸로 export되고 검색 로직은 클라이언트에서 실행되므로 `force-dynamic` 제거.

> 인덱스 생성은 별도 스크립트(예: `scripts/export-search-index.ts`)로 두고, 빌드 직전 단계(또는 `prebuild`)에서 readonly DB를 읽어 JSON을 생성한다. 검색 라이브러리는 번들 크기·한글 토크나이즈를 고려해 선정한다(§10 리스크).

**Acceptance Criteria**

- [ ] 빌드 시 검색 인덱스 JSON이 생성되고, 기사 추가/변경이 재빌드로 반영된다.
- [ ] `/search`가 정적 export되며, 한국어 제목·요약·태그를 대상으로 클라이언트에서 검색된다.
- [ ] 결과는 피드와 동일 카드 컴포넌트로 표시되고, 결과 없음 상태가 명확히 노출된다.
- [ ] 검색 화면·입력·필터 UX가 원본과 시각적으로 동일하다.

---

### 3.5 관리자 콘솔 로컬 전용 분리

**원본 동작:** [src/app/admin/](../src/app/admin/)(SSR+인증), [src/app/api/](../src/app/api/)(Route Handler), [src/middleware.ts](../src/middleware.ts)(인증 가드)가 서버 런타임·쿠키·GitHub API에 의존.

**정적 전환 방식:** admin은 **로컬 운영 도구로 유지**하고 **정적 배포 산출물에서는 제외**한다. 운영자는 `npm run dev`(로컬 Next 서버)에서 기존 소스 CRUD·재수집 트리거·KPI 대시보드를 그대로 사용한다.

- **배포 제외 메커니즘:** 정적 빌드 시 `/admin/*`, `/api/*`, `middleware.ts`가 export 대상에서 빠지도록 한다. 정적 export에서 Route Handler·middleware는 애초에 산출되지 않으므로, **빌드 전용 환경 플래그(예: `STATIC_EXPORT=1`)로 해당 라우트를 조건부 제외**하거나 export 후 산출물에서 admin 경로를 배제하는 방식을 택한다. (구현 시 가장 단순·안전한 방법 1택 — §10 참조)
- **로컬 사용:** `output: 'export'`는 `next build`에만 적용되고 `next dev`에는 영향 없으므로, 로컬 개발 서버에서는 admin·api·middleware가 정상 동작한다.
- **소스 관리 영속화:** 기존대로 admin이 GitHub API로 `configs/sources.json`을 커밋 → 다음 수집·빌드에 반영(원본 흐름 유지).

**Acceptance Criteria**

- [ ] 정적 배포 산출물(`out/`)에 `/admin/*` 및 `/api/*`가 포함되지 않는다.
- [ ] 정적 export 빌드가 admin/api/middleware 때문에 실패하지 않는다.
- [ ] `npm run dev` 로컬 환경에서는 admin 소스 CRUD·재수집·KPI가 기존과 동일하게 동작한다.
- [ ] 공개 사이트에 admin 진입점(링크/네비)이 노출되지 않는다.

---

### 3.6 자동 빌드·배포 파이프라인

**원본 동작:** [.github/workflows/collect.yml](../.github/workflows/collect.yml)이 수집 후 `data/app.db`를 `[skip ci]`로 커밋 → Vercel webhook이 재빌드.

**정적 전환 방식:** Vercel 대신 **GitHub Actions가 정적 빌드 후 GitHub Pages로 배포**한다. "수집 외 추가 수작업 0" 요구를 충족하도록 **DB 커밋이 배포 워크플로를 트리거**한다.

- **수집 워크플로(`collect.yml`)**: 기존 유지(일 1회 cron + `workflow_dispatch`). `data/app.db` 커밋 시 `[skip ci]`를 **제거하거나**, 배포 워크플로가 `data/app.db` 변경 push를 트리거하도록 조정한다.
- **배포 워크플로(신규 `deploy.yml`)**:
  - 트리거: `main`(또는 배포 브랜치)의 `data/app.db`·소스 변경 push, 및 수동 `workflow_dispatch`.
  - 단계: `npm ci` → (검색 인덱스 생성) → `npm run build`(정적 export, `STATIC_EXPORT=1`) → `actions/upload-pages-artifact`(`out/`) → `actions/deploy-pages`.
  - 권한: `pages: write`, `id-token: write`.
- **Pages 설정:** 저장소 Settings → Pages → Source = **GitHub Actions**.

```yaml
# .github/workflows/deploy.yml (골격)
name: deploy-pages
on:
  push:
    branches: [main]
    paths: ["data/app.db", "configs/**", "src/**", "next.config.ts"]
  workflow_dispatch: {}
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build # STATIC_EXPORT=1 → out/ 생성 (검색 인덱스 prebuild 포함)
        env: { STATIC_EXPORT: "1" }
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: out }
      - id: deploy
        uses: actions/deploy-pages@v4
```

**Acceptance Criteria**

- [ ] 수집(`collect.yml`)이 `data/app.db`를 커밋하면, 추가 수작업 없이 `deploy.yml`이 트리거되어 빌드·배포까지 완료된다.
- [ ] Pages 소스가 GitHub Actions로 설정되고, `out/` 산출물이 배포된다.
- [ ] `workflow_dispatch`로 즉시 재배포할 수 있다.
- [ ] 동시 배포가 `concurrency`로 직렬화된다.

---

## 4. 시스템 아키텍처

### 4.1 데이터 흐름도 (전환 후)

```
┌──────────────┐   일 1회 cron    ┌──────────────────────────────────┐
│ GitHub Actions│ ───────────────▶ │  collect.yml → scripts/collect.ts │
│   (collect)   │                  │   ① 수집 ② 전처리 ③ LLM ④ SQLite  │
└──────────────┘                  └──────────────┬───────────────────┘
                                                  │ data/app.db 커밋(push)
                                                  ▼
                                  ┌──────────────────────────────────┐
                                  │ GitHub Actions (deploy.yml)        │
                                  │  npm ci → 검색 인덱스 생성         │
                                  │  next build (output:'export')      │  ← 빌드타임 SQLite read
                                  │  → out/ (정적 HTML/JS/JSON)        │
                                  │  upload-pages-artifact → deploy    │
                                  └──────────────┬───────────────────┘
                                                  ▼
                                  ┌──────────────────────────────────┐
                                  │ GitHub Pages (정적 호스팅)         │
                                  │  /  피드   /article/[id]  /search  │
                                  │  (basePath: /global-ai-news)       │
                                  └──────────────┬───────────────────┘
                                                  ▼ 열람자(브라우저)
                                       클라이언트 검색(search-index.json)

  [로컬 전용]  npm run dev → /admin 소스 CRUD·재수집·KPI (배포 산출물 제외)
```

### 4.2 라우팅 & 렌더링 전략 (전환 후)

| 경로              | 페이지     | 렌더링 (전환 후)               | 배포 포함 |
| ----------------- | ---------- | ------------------------------ | --------- |
| `/`               | 피드(홈)   | **SSG**(빌드타임) + 클라 필터  | ✅        |
| `/article/[id]`   | 상세       | **SSG**(`generateStaticParams`) | ✅        |
| `/search`         | 검색       | **정적 셸 + 클라이언트 검색**  | ✅        |
| `/admin/*`        | 운영 콘솔  | 로컬 전용(`next dev`)          | ❌(제외)  |
| `/api/*`          | Route Handler | 로컬 전용                   | ❌(제외)  |

### 4.3 환경변수 변화

| 변수                 | 전환 후 사용처                                                   |
| -------------------- | --------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | 수집(`collect.yml`)에서만 사용 — 변화 없음                       |
| `REDDIT_*`           | 수집 전용 — 변화 없음                                            |
| `GITHUB_PAT`/`GITHUB_REPO` | **로컬 admin 전용**(소스 커밋·재수집). 배포에는 불필요    |
| `ADMIN_PASSWORD`     | **로컬 admin 전용**. 공개 배포에는 불필요                        |
| ~~Vercel 환경변수~~  | **제거** (Vercel 미사용)                                         |
| `STATIC_EXPORT`(신규) | 빌드 시 admin/api/middleware 제외 + `output:'export'` 토글       |

---

## 5. 데이터 모델

**SQLite 6개 테이블·스키마는 원본과 동일**([scripts/lib/schema.sql](../scripts/lib/schema.sql), [docs/PRD.md](PRD.md) §5). 수집·가공·DB 구조 변경 없음.

**신규 산출물 — 검색 인덱스(`public/search-index.json`)**

```typescript
// 빌드타임 생성 (scripts/export-search-index.ts)
interface SearchIndexEntry {
  id: number;
  titleKo: string;
  summaryKo: string;
  tags: string[];
  source: string; // 표시명
  category: string;
  publishedAt: string; // ISO8601
}
// 출력: SearchIndexEntry[] → public/search-index.json
```

> 인덱스는 readonly DB 조회로 생성하며, 클라이언트 검색 라이브러리(FlexSearch/Fuse.js)가 이를 로드한다. 본문 전문은 포함하지 않아(요약 메타만) 번들·전송 크기를 통제한다.

---

## 6. UI/UX 요구사항

**디자인·화면·컴포넌트는 [DESIGN.md](../DESIGN.md) 기준 그대로 유지한다.** 모노크롬·Pretendard·라이트/다크·모바일 셸(상단바+하단 탭바)·하어라인 카드·필 칩 등 모든 토큰과 레이아웃 변경 없음. 공개 3페이지(피드/상세/검색)의 시각·인터랙션은 원본과 동일하다.

**전환에 따른 유일한 주의사항 — `basePath` 경로 정합성**

- 모든 내부 링크·정적 자산(폰트 `public/fonts/*`, 이미지, `search-index.json`)이 서브경로(`/global-ai-news`) 하에서 깨지지 않아야 한다. `next/link`·`next/image`는 `basePath`를 자동 반영하지만, **수동 경로 문자열(fetch URL, `<link>`/`<a href>` 하드코딩)은 `basePath`를 명시**해야 한다.
- 클라이언트 검색 인덱스 fetch 경로는 `basePath`를 포함하도록 한다(예: `${basePath}/search-index.json`).
- `themeColor`·`viewportFit` 등 메타는 변경 없음.

**Acceptance Criteria**

- [ ] 공개 3페이지의 화면·다크모드·모바일 셸이 원본과 픽셀 단위로 동일하다.
- [ ] 서브경로 배포에서 폰트·자산·내부 링크·검색 인덱스 fetch가 모두 정상 로드된다.

---

## 7. 비호환 항목 처리 매핑 (정적 export 대응표)

| 원본 기능              | 위치                                            | 정적 비호환 이유          | 정적 대체 방식                                  |
| ---------------------- | ----------------------------------------------- | ------------------------- | ----------------------------------------------- |
| ISR 피드               | [page.tsx:7](../src/app/page.tsx#L7)            | `revalidate`는 서버 필요  | 빌드타임 SSG + 매 배포 갱신 (§3.2)              |
| 동적 상세              | [article/[id]/page.tsx](../src/app/article/[id]/page.tsx) | dynamic param 런타임 조회 | `generateStaticParams` 전체 사전 생성 (§3.3)   |
| `force-dynamic` 검색   | [search/page.tsx:9](../src/app/search/page.tsx#L9) | 요청시 FTS5 쿼리          | JSON 인덱스 + 클라이언트 검색 (§3.4)            |
| Route Handler `/api/*` | [src/app/api/](../src/app/api/)                 | serverless 미지원         | 로컬 전용 분리, 배포 제외 (§3.5)               |
| Admin SSR              | [src/app/admin/](../src/app/admin/)             | SSR+인증 미지원           | 로컬 전용(`next dev`) (§3.5)                    |
| 인증 미들웨어          | [src/middleware.ts](../src/middleware.ts)       | edge/node 런타임 필요     | 배포 제외(정적 export는 미들웨어 미산출) (§3.5) |
| `next/image` 최적화    | 컴포넌트 전반                                    | 최적화 서버 필요          | `images.unoptimized` (§3.1)                     |
| Vercel ISR 트리거 배포 | collect.yml `[skip ci]`                          | Vercel 의존               | Actions `deploy.yml`로 빌드·배포 (§3.6)        |

---

## 8. MVP 제외 사항 (Non-Goals)

| 제외 항목                            | 이유                                                          |
| ------------------------------------ | ------------------------------------------------------------- |
| 배포된 공개 사이트에서의 admin 동작  | 정적 호스팅은 서버 인증·쓰기 불가 → 로컬 전용으로 분리(§3.5)  |
| 요청시 서버 검색(FTS5)               | serverless 미지원 → 클라이언트 검색으로 대체(§3.4)            |
| ISR/온디맨드 재검증                  | 정적 호스팅 미지원 → 매 배포(재빌드) 갱신으로 대체            |
| Vercel 기능 의존(Edge·serverless 등) | 배포 타깃을 GitHub Pages로 일원화                            |
| 서비스 기능·데이터 모델 변경         | 본 PRD는 배포 전환만 다룸. 수집·LLM·스키마는 원본 유지        |
| 증분 빌드(변경분만 재생성)           | MVP는 전체 재빌드. 빌드 시간 최적화는 Post-MVP(§11)           |

---

## 9. 성공 지표 & 검증 전략

### 9.1 완료 기준 (KPI)

| 항목                  | 목표값                                       |
| --------------------- | -------------------------------------------- |
| 정적 빌드 성공률      | ≥ 95% (`next build` export, 최근 30일)       |
| 수집→배포 자동화 시간 | ≤ 10분 (DB 커밋 → Pages 반영, 수동 0회)      |
| 공개 3페이지 동일성   | 100% (§9.2 체크리스트 전부 통과)             |
| 피드 LCP              | ≤ 2.0s (데스크톱)                            |
| 추가 운영비           | $0 (Pages·Actions 무료 범위)                 |
| `basePath` 경로 회귀  | 0건 (자산·링크·검색 fetch 깨짐 없음)         |

### 9.2 동작 동일성 체크리스트 (검증 절차)

빌드 후 `out/`을 서브경로로 로컬 서빙(예: `npx serve out` + `/global-ai-news`)하거나 Pages 미리보기에서 점검:

- [ ] **피드:** 카드 렌더, 태그·소스 필터, 최신/중요도 정렬, 카드→상세 이동.
- [ ] **상세:** 한국어 요약+원문 병기, 태그 클릭 이동, 원문 새 탭 링크.
- [ ] **검색:** 인덱스 로드, 한글 제목·요약·태그 검색, 결과 카드, 결과 없음 상태.
- [ ] **셸/디자인:** 다크모드 토글, 모바일 상단바·하단 탭바·필터 시트, Pretendard 폰트 로드.
- [ ] **경로:** 모든 정적 자산·내부 링크·`search-index.json` fetch가 `/global-ai-news` 하에서 200 응답.
- [ ] **자동화:** `data/app.db` 변경 push → `deploy.yml` 자동 트리거 → 반영 확인.

### 9.3 빌드 환경 검증

- [ ] CI(Ubuntu, Node 22)에서 `better-sqlite3` 네이티브 빌드가 성공하고 빌드타임 DB 조회가 정상 동작한다.
- [ ] `out/`에 `/admin`·`/api` 경로가 부재함을 확인한다.

---

## 10. 위험 요소 & 마이그레이션 리스크

| 리스크                          | 영향                                  | 완화책                                                                 |
| ------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `basePath` 누락 경로            | 서브경로에서 자산·링크 깨짐           | §6 경로 점검, 수동 fetch에 `basePath` 명시, §9.2 회귀 체크             |
| 대량 기사 시 빌드 시간 증가     | `generateStaticParams` 전체 생성 지연 | MVP는 전체 빌드 허용. 필요 시 최신 N개만 정적+나머지 인덱스화(Post-MVP) |
| FTS5 → 클라이언트 검색 품질차   | 한글 토크나이즈·정확도 차이           | FlexSearch 한글 설정/Fuse.js 임계값 튜닝, §9.2 검색 항목으로 검수      |
| admin/api/middleware 배제 방식  | 잘못 제외 시 빌드 실패 또는 노출      | `STATIC_EXPORT` 플래그로 조건부 제외, `out/` 부재 확인(§9.3)           |
| `better-sqlite3` CI 빌드        | 네이티브 모듈 빌드 실패               | Node 22 고정, `npm ci`, 빌드 로그 점검                                  |
| 검색 인덱스 크기                | 기사 누적 시 전송량 증가              | 메타만 포함(본문 제외), 필요 시 분할·압축(Post-MVP)                    |

---

## 11. 향후 계획 (Post-MVP)

- [ ] **증분 빌드:** 변경된 기사만 재생성해 빌드 시간 단축.
- [ ] **검색 고도화:** 인덱스 분할/압축, 한글 형태소 기반 토크나이즈, 하이라이트.
- [ ] **admin 별도 호스팅:** 필요 시 admin·api를 별도 serverless(예: Vercel/Cloudflare) 또는 로컬 GUI 도구로 분리 운영.
- [ ] **커스텀 도메인:** 서브경로 → 커스텀 도메인 전환(`basePath` 제거, CNAME).
- [ ] **빌드 캐싱:** Actions 캐시로 `npm ci`·Next 빌드 캐시 재사용.
