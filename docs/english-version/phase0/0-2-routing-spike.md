# Phase 0-2 라우팅 스파이크 결과 (2026-11-03)

- 브랜치: `spike/i18n-routing` (1안, 커밋 3개) · 비교용 `spike/i18n-routing-2an` (2안, 커밋 1개). 둘 다 `deploy/github-pages`(3de9cab)에서 갈라졌고 push 하지 않았다.
- 워크트리: `/home/sguys99/project/global-ai-news/.claude/worktrees/agent-a1bcb47c1071af49e`
- Next.js 설치 버전: **15.5.15** (`experimental.globalNotFound` 지원, 15.4+)
- 검증: Docker(`node:22` → `npm run build` → nginx, CI와 같은 정적 export)로 5회 빌드, nginx 컨테이너에서 curl + 헤드리스 Chromium(playwright)으로 내비게이션 확인, 로컬 `next dev`(Node 24)로 admin/api 확인.
- 증거 파일: `/tmp/claude-1000/-home-sguys99-project-global-ai-news/603c04af-0859-4e95-9e02-e41ccb0e8bd3/scratchpad/phase0/spike02/` (`*-build.log`, `out-*/`, `probe.sh`, `nav.cjs`, `domdiff.py`)

## 결정: **1안 채택** (`(ko)/layout.tsx` + `(en)/en/layout.tsx` 두 최상위 레이아웃 + `global-not-found.tsx`)

이유

1. 다섯 가지 확인을 모두 통과했다. 정적 HTML에 `<html lang="en">`이 실제로 박힌다(2안은 `<html lang="ko">` 그대로 + `<div lang="en">`).
2. 2안과 비교해 잃는 것이 없다. 용량 증가(페이지당 +2.5KB 안팎)는 2안에서도 똑같이 생긴다(원인은 레이아웃 단계가 하나 늘어난 것이지 루트 레이아웃이 없어서가 아니다). 빌드 시간도 차이 없다.
3. 한국어 페이지 본문 마크업(스크립트·링크 태그·빌드 해시 제외)은 기준선과 **완전히 같다**(홈·호·기사·검색). Phase 3 "한국어 화면 무변화" 조건을 만족한다.
4. 대가는 두 가지다. (a) `experimental.globalNotFound`(실험 기능)에 기댄다. (b) 한국어↔영어 사이 링크 이동은 전체 페이지 새로 고침이 된다(같은 언어 안 이동은 그대로 클라이언트 내비). 둘 다 감당할 만하다. 이 사이트는 대부분 정적 문서이고, 언어 전환은 드물다.
5. 실험 기능이 나중에 깨져도 탈출구가 있다. `global-not-found.tsx`가 없으면 Next 기본 404(스타일 없는 `<html>`)가 나올 뿐 빌드는 성공한다(스파이크 A단계에서 확인). 2안으로 되돌리는 비용도 작다(레이아웃 두 파일만 바꾸면 된다).

## 확인 결과

| #   | 항목                                 | 1안 결과                           | 근거                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | `<html lang>`                        | **PASS**                           | 정적 산출물: `/` `/article/1000/` `/search/` `/edition/…` → `<html lang="ko" …>`, `/en/` `/en/article/1332/` → `<html lang="en" …>` (nginx curl + Chromium `document.documentElement.lang`)                                                                                                                                                                                                                                                                                                                                                                                                  |
| ②   | 404.html 생성·동작                   | **PASS** (`global-not-found` 필요) | `globalNotFound` 없이(A): 빌드는 되지만 `404.html`이 Next 기본 화면(`<html>` lang 없음, 사이트 CSS·크롬 없음, 6.3KB)으로 바뀐다. 기준선 404는 루트 레이아웃(헤더·푸터, lang=ko)을 썼으므로 퇴보다. `global-not-found.tsx` + `experimental.globalNotFound: true`(D): `404.html` 21KB, `<html lang="ko">`, 헤더·모바일 바·푸터·globals.css 정상, `noindex`. nginx에서 `/global-ai-news/nope/`·`/en/nope/`·`/en/article/1/`(params 밖)·`/admin/`·`/api/health/` 모두 404 상태 + 이 페이지. `/en/` 아래에서는 인라인 스크립트가 lang을 `en`으로 바꾼다(Chromium 확인). 클라이언트 콘솔 오류 없음 |
| ③   | sitemap·feed·og                      | **PASS**                           | `sitemap.xml` 150,023B·`feed.xml` 37,751B(기준선과 바이트 같음), `og/edition` 32장·`og/article` 172장·`og/default.png` — 기준선과 같은 개수. 라우트 핸들러는 그룹 밖 `src/app/` 그대로 두었다                                                                                                                                                                                                                                                                                                                                                                                                |
| ④   | 로컬 `next dev` admin·api·middleware | **PASS**                           | Node 24 `next dev`: `/admin` → 307 `/admin/login`(미들웨어), `/api/admin/sources` → 401, 로그인 후 `/admin` 200·`/api/admin/sources` 200, `/api/health` 200 `{"status":"ok"}`, `/en` 200 lang=en, 없는 경로 404 = global-not-found. 프로덕션 export에는 admin/api가 없다(404) — `pageExtensions` 게이팅은 `(ko)/admin/page.local.tsx`로 옮겨도 그대로 동작                                                                                                                                                                                                                                   |
| ⑤   | basePath                             | **PASS**                           | `/en/` 의 링크 `href="/global-ai-news/en/article/1330/"`·`"/global-ai-news/"`, 아이콘 `/global-ai-news/favicon.ico`·`icon.svg`·`apple-icon.png` 모두 basePath 포함. `/en/`의 `_next/static` 자산 13개 전부 200, CSS 2개 200. Chromium: en→en 기사 이동은 소프트 내비(창 변수 유지), en→ko 이동은 전체 새로 고침(다른 루트 레이아웃 — Next 동작대로), 뒤로 가기 정상                                                                                                                                                                                                                          |

## 용량·빌드 시간 (정적 export `out/`)

| 빌드 | 구성                                                          | out 총량 | 증감            | 기사 HTML / .txt(1000번) | 페이지 스크립트 태그 |
| ---- | ------------------------------------------------------------- | -------- | --------------- | ------------------------ | -------------------- |
| base | 현재 `deploy/github-pages`                                    | 144.65MB | —               | 62,461 / 32,141          | 9                    |
| A    | 1안, global-not-found 없음                                    | 150.44MB | +5.79MB (+4.0%) | 64,935 / 34,191          | 11                   |
| B    | 1안 + global-not-found(간단한 본문)                           | 150.44MB | +5.79MB (+4.0%) | 64,935 / 34,191          | 11                   |
| D    | 1안 + global-not-found(사이트 크롬) — **스파이크 최종**       | 151.44MB | +6.78MB (+4.7%) | 65,377 / 34,513          | 12                   |
| C    | **2안** (단일 루트 + `(ko)` 크롬 레이아웃 + `en/layout` 래퍼) | 150.64MB | +5.99MB (+4.1%) | 65,092 / 34,176          | 13                   |

- 늘어난 몫은 HTML·`.txt` RSC 페이로드의 클라이언트 참조 줄(`I[…]`)이 길어진 데서 나온다. 청크 경로에 `app/(ko)/layout-…`이 들어가고, 공유 청크가 3개에서 5~6개로 쪼개져 줄마다 목록이 길어졌다. 페이지 구조가 한 단계 깊어지는 것도 약간 보탠다. **2안도 같은 크기만큼 늘었으므로** 두 안을 가르는 기준은 아니다. 크롬을 그룹 레이아웃으로 내리는 순간 생기는 비용이다.
- 한국어 페이지 1장당 HTML + .txt 합쳐 약 +4.5~5KB, 약 1,270장이면 약 +6MB다. Phase 4(용량 대책) 계산에 넣는다. 영어 페이지도 같은 구조라 같은 몫이 붙는다.
- 빌드 시간(`npm run build` 단계, 캐시 무효화 후 단독 실행): base 91.7s · 1안(B) 85.3s · 2안(C) 96.4s · 1안(D) 98.2s → **눈에 띄는 차이 없음**(±10s 잡음). 첫 회차 A/B의 127~137s는 다른 에이전트의 Docker 빌드와 겹친 탓이다.

## 동작한 최소 파일 배치 (1안)

```
src/app/
├── (ko)/
│   ├── layout.tsx            # 기존 src/app/layout.tsx 그대로 이동(<html lang="ko">) — import 경로만 ../globals.css, ../fonts
│   ├── page.tsx              # 홈
│   ├── article/[id]/page.tsx
│   ├── edition/[date]/page.tsx
│   ├── search/page.tsx
│   └── admin/{page.local.tsx, login/page.local.tsx}
├── (en)/en/
│   ├── layout.tsx            # <html lang="en">, globals.css·fonts·ThemeProvider·Analytics 자체 포함
│   ├── page.tsx              # /en/
│   └── article/[id]/page.tsx # generateStaticParams + dynamicParams=false
├── global-not-found.tsx      # 앱 전체 404(완전한 <html>·<body>), globals.css·fonts import, viewport·metadata(noindex)
├── fonts.ts                  # next/font(Pretendard local + Hahmlet) 인스턴스 — 두 레이아웃·404 공유
├── globals.css               # 그대로(두 레이아웃·404가 import → CSS 파일은 하나로 합쳐 나옴)
├── icon.svg, favicon.ico, apple-icon.png   # 그대로 — 루트 레이아웃이 없어도 두 그룹 모두 <head>에 들어감(확인)
├── sitemap.ts, feed.xml/route.ts, og/**    # 그대로(그룹 밖)
└── api/**/route.local.ts     # 그대로(그룹 밖, 레이아웃과 무관)
src/middleware.local.ts       # 그대로
```

## 필요한 설정 변경

1. `next.config.ts`: dev 분기와 프로덕션 분기 **둘 다**에 `experimental: { globalNotFound: true }`를 넣는다. dev에서 빠지면 dev 404만 Next 기본 화면이 된다.
2. 파일 이동: `git mv src/app/{layout.tsx,page.tsx,article,edition,search,admin} "src/app/(ko)/"`. `(ko)/layout.tsx`의 `import "./globals.css"`는 `"../globals.css"`로 바꾸고, `localFont({ src: "../../public/fonts/…" })` 상대 경로도 고친다. 스파이크는 `src/app/fonts.ts`로 빼서 해결했다.
3. 테스트 import: `src/__tests__/ArticlePage.test.tsx`의 `@/app/article/[id]/page`를 `@/app/(ko)/article/[id]/page`로 바꾼다. 다른 테스트(`api/**/route.local`, `src/app/globals.css` 경로)는 그대로 둔다.
4. 나머지(`pageExtensions` 게이팅·basePath·trailingSlash·nginx.conf·Dockerfile·deploy.yml)는 바꿀 것이 없다.

스파이크 상태에서 전체 테스트 867건 통과, `tsc --noEmit`·`eslint src/app` 통과.

## Phase 3 주의 사항

- **404는 한 장뿐이다.** GitHub Pages·nginx 모두 `/global-ai-news/404.html` 하나를 모든 없는 경로에 쓴다. 1안이든 2안이든 `/en/…` 전용 404 파일은 만들 수 없다. 그래서 404는 두 언어 문구를 함께 싣고, `/en/` 경로면 인라인 스크립트로 `lang="en"`을 바꾸는 방식이 현실적이다(스파이크 방식). 더 나아가면 클라이언트에서 문구를 바꿀 수도 있다. 404 정적 HTML의 lang은 ko로 남지만, 404는 색인되지 않으므로 SEO 영향은 없다.
- **404 회귀 비교(3-1):** 기준선 404는 사이트 크롬 + Next 기본 본문("404: This page could not be found.")이다. global-not-found로 바꾸면 크롬은 같게 둘 수 있지만 본문·title은 달라진다. 의도된 차이로 허용 목록에 넣는다. global-not-found는 레이아웃을 거치지 않으므로 **viewport(viewportFit·themeColor)와 Header/MobileTopBar/Footer/BottomTabBar·ThemeProvider·Analytics를 직접 넣어야** 기존과 같다. 스파이크 D에서 넣었고 하이드레이션 오류는 없었다.
- **레이아웃 공통부 중복:** 두 레이아웃과 global-not-found 세 곳이 `<html>`·`<body>` 클래스, ThemeProvider, Analytics, viewport, fonts, globals.css를 각자 가진다. Phase 3에서 `src/app/fonts.ts`(또는 `src/lib/fonts.ts`)와 공용 `SiteShell`/`siteViewport` 같은 모듈로 모아 세 곳이 다르게 갈라지지 않게 한다. ThemeProvider·Analytics는 레이아웃마다 따로 마운트되지만, 언어를 넘나들 때 어차피 전체 새로 고침이 되므로 문제없다. 테마는 next-themes가 localStorage로 이어 받는다.
- **언어 사이 이동은 전체 새로 고침이다**(루트 레이아웃이 다르면 Next가 MPA 내비로 처리 — 확인함). 언어 전환 링크에 `prefetch={false}`를 주면 쓸모없는 RSC 프리페치를 줄일 수 있다(검토).
- **metadata:** 사이트 공통 metadata(`metadataBase`, verification, 기본 공유 메타)가 지금은 `(ko)/layout.tsx`에만 있다. 영어 레이아웃에도 `metadataBase`를 꼭 넣는다(없으면 og:image 상대 경로 경고·오류). 검색엔진 소유 확인 메타(`GOOGLE_SITE_VERIFICATION`·`NAVER_…`, 현재 빈 값)는 홈 한 곳이면 충분하다. `robots`는 사이트 루트 저장소에 있어 이 앱과 무관하다.
- **아이콘(icon.svg·favicon.ico·apple-icon.png):** `src/app/` 바로 아래에 두면 루트 레이아웃이 없어도 두 그룹 모든 페이지 `<head>`에 들어간다(확인). 옮기지 않는다.
- **JSON-LD:** 페이지(`(ko)/page.tsx`의 WebSite, 기사 NewsArticle) 안에 있으므로 영향 없다. 영어판은 `inLanguage: "en"` 버전을 따로 만든다(Phase 6).
- **`.txt`(RSC 페이로드) 크기:** 청크 경로 문자열에 `(ko)`가 들어가고 공유 청크가 쪼개져 페이지마다 수 KB가 는다(위 표). 2안도 같다. Phase 4 용량 계산에 페이지당 약 +5KB를 반영한다.
- **dev 경고:** 워크트리에서 `node_modules`를 심볼릭 링크로 쓰면 "multiple lockfiles" 경고가 뜨지만 무시해도 된다. dev에는 trailingSlash가 없어 `/en/` → 308 `/en`이 된다(기존 동작과 같다).
- **실험 기능 위험:** `experimental.globalNotFound`는 15.5에서 실험 기능이다. Next 메이저 업그레이드 때 이 404를 먼저 확인한다. 빠지더라도 빌드는 성공하고 404 화면만 기본으로 돌아간다.
- **`(en)/en/layout.tsx` 위치:** `(en)` 그룹 안에 `en` 세그먼트를 두는 배치에서 문제가 없었다. `(en)/layout.tsx`로 올려도 되지만 지금 배치가 경로와 1:1이라 읽기 쉽다.
- **빌드 경고:** `'_contentRaw' is assigned a value but never used`는 기준선에도 있는 기존 경고다.
