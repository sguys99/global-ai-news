# Phase 4-1 기사·호 페이지 무게 재분석 (2026-11-05)

측정 대상: `feat/en-size-budget` HEAD `f31a11e`(Phase 3 반영, DB 최신 호 2026-11-05, 게재 1,277건·호 34개).
og 호 PNG 30일 창은 이 커밋에 아직 없다(호 PNG 34장 전부 생성).
단위는 0-4와 같다(KB = 1,000 B). "페이지" = `index.html` + `index.txt`.

```bash
npm run regress:html -- build f31a11e data/regress/out-p4-base      # Docker 정적 빌드(48초), out 155,255,323 B
npm run regress:html -- snapshot data/regress/out-p4-base data/regress/baseline-p4   # 대표 12페이지 1.38MB
```

- 기준선: `data/regress/baseline-p4`(스냅숏, DB sha256 `0c359361…`), 산출물: `data/regress/out-p4-base`. 둘 다 git 제외다.
- Phase 4 구현 후 비교: `npm run regress:html -- compare data/regress/baseline-p4 <후보 out> --text --allow …`. 이 비교는 클래스 이름 변경을 무시한다.
- 분석 스크립트: `/tmp/claude-1000/-home-sguys99-project-global-ai-news/d8c992e1-33e6-4821-bfa9-6dadd5c60b19/scratchpad/s4/`
  - `analyze.py`(0-4 재사용): 크기 분해
  - `decomp.py`: HTML 구획과 RSC 행 분해. RSC 행은 마커로 분류하고, 참조된 행은 부모 분류를 물려받는다.
  - `classes.py`: 클래스 문자열 순위
  - `sim.py`·`resid.py`: 산출물을 후처리해 축약 효과와 남는 구성을 잰다. 파일은 읽기만 한다.

## 1. 전체 크기 (0-4 대비)

| 항목                          | 0-4 (11-03, `3de9cab`) | 지금 (11-05, `f31a11e`) |
| ----------------------------- | ---------------------: | ----------------------: |
| `out/` 바이트 / 파일 수       |      144.65 MB / 2,869 |   **155.26 MB / 2,959** |
| 기사 페이지 평균 (HTML + txt) |     92.0 (60.7 + 31.3) |  **96.6 (63.2 + 33.3)** |
| 호 페이지 평균 / 최근 14호    |          382.1 / 364.8 |       **385.1 / 371.5** |

기사 페이지는 1건당 4.6 KB(+5%) 늘었다. Phase 3 레이아웃 단계(라우트 그룹, `SiteShell`)가 늘린 몫이다. 나머지 증가는 기사 45건과 호 2개가 더해진 몫이다.

| 분류                                            | 파일 수 |                  크기 |  비중 |
| ----------------------------------------------- | ------: | --------------------: | ----: |
| 기사 `index.html`                               |   1,277 |              80.73 MB | 52.0% |
| 기사 `index.txt`                                |   1,277 |              42.57 MB | 27.4% |
| 호 `index.html` / `index.txt`                   |   34/34 |        8.88 / 4.21 MB |  8.4% |
| og 기사 PNG(7일 창) / og 호 PNG                 |  163/34 |        7.00 / 2.15 MB |  5.9% |
| `_next/static`(media 3.91·chunks 0.95·css 0.11) |     122 |               4.97 MB |  3.2% |
| `fonts/`(OG TTF)                                |       1 |               2.06 MB |  1.3% |
| search-index / feed-index / latest              |       3 | 1.05 / 0.73 / 0.07 MB |  1.2% |
| 홈 `index.html` + `index.txt`                   |       2 |        0.33 + 0.15 MB |  0.3% |
| sitemap / feed / 검색 / 404 / 아이콘            |       — |               0.31 MB |  0.2% |

| 페이지 | 파일                |                        평균 |   p50 |       p90 |  최대 |  최소 |
| ------ | ------------------- | --------------------------: | ----: | --------: | ----: | ----: |
| 기사   | HTML                |                        63.2 |  62.7 |      66.2 |  89.3 |  57.4 |
| 기사   | txt                 |                        33.3 |  33.1 |      34.9 |  47.0 |  30.5 |
| 기사   | 합계                |                    **96.6** |     — | **101.1** | 136.1 |     — |
| 호     | HTML                |                       261.1 | 252.0 |     311.2 | 430.2 | 151.7 |
| 호     | txt                 |                       124.0 | 113.5 |     144.1 | 252.0 |  67.3 |
| 호     | 합계                | **385.1** (최근 14호 371.5) |     — | **453.5** | 682.2 |     — |
| og PNG | 기사 42.9 / 호 63.4 |                             |       |           |       |       |

전송 크기(gzip)는 기사 HTML 10.8 KB, `.txt` 7.1 KB다.

## 2. 기사 페이지 1건 분해 (1,277건 평균 96.6 KB)

| HTML 구성 (63.2 KB)           |        KB | 비고                                                    |
| ----------------------------- | --------: | ------------------------------------------------------- |
| 인라인 RSC(`self.__next_f`)   |      37.9 | `.txt`의 1.137배(JS 문자열 이스케이프)                  |
| 본문 마크업(스크립트 제외)    |      18.7 | **class 속성 11.8(63%)**                                |
| `<head>`                      |       4.7 | 메타 31개. 요약문이 description·og·twitter에 3번 들어감 |
| JSON-LD / 부트스트랩 스크립트 | 1.3 / 0.7 |                                                         |

| 본문 마크업 구획(HTML)                    |      KB (class) | RSC `.txt` 행(33.3 KB)                                                        | KB (className) |  비중 |
| ----------------------------------------- | --------------: | ----------------------------------------------------------------------------- | -------------: | ----: |
| 같은 분야 기사(카드 4장)                  |       7.1 (4.6) | 관련 기사 카드                                                                |      8.9 (5.0) | 26.6% |
| 데스크톱 헤더                             |       1.5 (1.2) | 루트 트리(row 0: html·body·헤더·모바일 바·notFound)                           |      5.2 (1.1) | 15.6% |
| 모바일 상단 바                            |       1.7 (1.2) | 메타데이터(head 사본)·경계                                                    |        4.0 (0) | 12.0% |
| 신호 그리드                               |       2.1 (1.7) | 본문 골격(main·제목·뒤로 링크)                                                |      3.4 (1.9) | 10.2% |
| 뒤로 링크·제목 머리                       |       1.2 (0.7) | 모듈 참조(`I[…]`·`:HL`)                                                       |        2.6 (0) |  7.7% |
| 요약 / 원문 발췌 / 태그                   | 0.5 / 0.8 / 0.4 | 푸터                                                                          |      1.4 (0.7) |  4.1% |
| CTA(데스크톱 + 모바일 바)                 |       0.7 + 0.9 | JSON-LD                                                                       |            1.3 |  3.8% |
| 푸터                                      |       1.1 (0.6) | 신호 1.1 · 모바일 CTA 1.1 · 데스크톱 CTA 0.8 · 원문 0.9 · 태그 0.7 · 요약 0.6 |              — |   16% |
| 다른 매체 목록(185건만) / 타임라인(6건만) |   평균 0.3 / ≈0 | 라우터 0.7 · notFound 행 0.5 · 다른 매체 0.4                                  |              — |    4% |

- `.txt`의 className 문자열은 11.0 KB(33%)다. 클래스 문자열은 HTML·인라인 RSC·`.txt` 세 벌에 다 들어가고, 합치면 **페이지당 34.1 KB(35%)**다.
- 표본 5건(HTML + txt): #1286 101.8(타임라인 2.1 KB) · #1352 96.6(다른 매체 1.5 KB) · #1166 95.8 · #1336 95.5 · #1355 104.9(원문 발췌 2.0 KB). 모두 관련 카드가 8.6~10.0 KB로 가장 크다.
- **관련 카드 렌더 변형**: `ArticleView.tsx:203`이 `StoryEntry`(Story.tsx:404, `hideCategory`)를 서버 컴포넌트로 그린다. 그래서 RSC에는 props가 아니라 렌더된 요소 트리가 실린다. 카드 1장은 RSC 행 약 1.9 KB이고, 그중 className이 약 1.2 KB, 중요도 미터 `<i>` 5개가 약 0.4 KB다.
  - 카드가 쓰는 값: `id`·`titleKo`(원제 폴백)·`summaryKo`·`format`·`publishedAt`·`source.name`·관련 보도 개수·`importance`·`trendingScore`
  - 카드가 안 쓰는 값: `url`·`titleOriginal`·`tags`·`related` 목록 본문·`engagement`·`category`(hideCategory)
  - 이 값들은 지금 서버 렌더라 페이로드에 실리지 않는다. 클라이언트 섬으로 바꿀 때만 문제가 되므로, 그때 `toIndexCard`에서 `tags`를 빼고 넘긴다.
- **기본 notFound 트리가 모든 페이지 RSC에 실린다.** `(ko)` 레이아웃 두 단계에 `not-found.tsx`가 없다. 그래서 Next 기본 404 요소가 row 0에 1.58 KB, 별도 행에 0.47 KB로 실린다. 인라인을 포함하면 페이지당 약 4 KB다. 앱 전체 404는 `global-not-found.tsx`가 맡는다.
- 요약문(약 350 B)은 한 페이지에 약 15번 실린다: head 3, RSC 메타 3 × 2벌, JSON-LD 3벌, 본문 3벌. `twitter:title·description·image`는 og 값과 같다(HTML 0.59 + txt 0.64 + 인라인 0.73 ≈ 1.9 KB).
- 인라인 SVG(lucide, 기사당 4.3개): 기본 속성(xmlns·width·height·stroke…)을 포함해 HTML 1.2 + RSC 1.6 × 2벌 ≈ 4.5 KB다.

## 3. 호 페이지 분해

평균은 전체 34호, 표본은 11-04(평일)·11-01(일요일 주간 레이더)이다.

| 구획                            |       HTML 평균 (class) |                        RSC 평균 | 11-04 HTML / RSC | 11-01 HTML / RSC |
| ------------------------------- | ----------------------: | ------------------------------: | ---------------: | ---------------: |
| 합계                            | 261.1 (본문 class 79.5) |  124.0 (className 47.7 = 38.5%) |    246.3 / 113.2 |    292.6 / 144.1 |
| 인라인 RSC                      |                   137.2 |                               — |            125.7 |            160.0 |
| 섹션 밴드                       |             31.3 (20.7) |                            39.9 |      24.1 / 29.9 |      19.7 / 24.7 |
| **이 호의 기사(StoryIndex)**    |             48.8 (32.3) |                        **31.2** |      44.5 / 19.4 |      39.3 / 27.1 |
| 레이더                          |               4.7 (3.1) |                             5.8 |      10.4 / 12.9 |      10.5 / 13.1 |
| 오늘의 브리핑 / 서브 3 / 리드   |         5.7 / 5.4 / 1.7 | 7.1 / 4.4 / 4.9(main 골격 포함) |  5.8 / 5.3 / 1.7 |  5.8 / 5.3 / 1.7 |
| 지금 화제 / 이 호의 지면        |               2.6 / 3.4 |                       4.0 / 2.7 |        4.9 / 3.5 |        6.0 / 2.5 |
| 주간 레이더(일요일)             |                       — |                               — |                — |  **21.5 / 28.1** |
| Masthead / IssueBrief           |               4.6 / 0.4 |                       4.5 / 0.5 |        4.7 / 2.9 |        4.7 / 2.9 |
| 셸(헤더·모바일 바·하단 탭·푸터) |                     5.5 |             6.6(row 0 + footer) |             같음 |             같음 |

- **클라이언트 컴포넌트에 넘기는 큰 props는 하나다.** `EditionView.tsx:25`가 `toListCards(edition.issue)`를 `StoryIndex`("use client")에 넘긴다.
  - 목록용 카드는 원문 발췌만 빼고 `url`·`titleOriginal`·`tags`·`related`(다른 매체 목록 본문)·`engagement`를 모두 싣는다.
  - 최근 14호 평균 22.1 KB가 RSC 두 벌에 들어간다. 바이트 비중은 요약 32%, 원제 11%, URL 10%, related 8%, tags 6%다.
  - 홈이 이미 쓰는 `toIndexCard`로 바꾸면 14.8 KB가 되고, `tags`까지 빼면 13.6 KB가 된다.
- 같은 호 기사가 지면에 두 번 그려진다. 한 번은 1면·섹션 밴드의 서버 렌더 트리이고, 한 번은 색인의 props와 HTML이다. 그래서 요약문이 HTML·인라인·`.txt`에 최대 5번 실린다.
- 나머지 밴드(FrontPage·RadarBand·SectionBands·WeeklyRadar)는 서버 렌더라 props 중복은 없다. 대신 렌더 트리 전체가 RSC에 실린다.
- 홈(481.5 KB = HTML 327.0 + txt 154.5)도 같은 구조다.
  - `index.txt`에는 `FeedClient` props 36 KB(issueArticles 19.2 = toListCards, indexHead 14.4)가 들어 있다.
  - 여기에 Suspense fallback인 `FeedView` 렌더 트리 약 118 KB가 함께 실린다.
  - 한 장뿐이라 용량 한도에는 영향이 없다.

## 4. 클래스 문자열 (기사 1,277 + 호 34 전체, HTML·인라인·txt 세 벌 합)

- 고유 문자열은 260개다. 페이지당 class 값은 기사 28.2 KB(435회), 호 147.4 KB(2,280회)다.
- 20자 이상 문자열을 모두 8자 이름으로 바꾸면 기사 −24.4 KB, 호 −127 KB다(최근 5호는 −144 KB).
- 아래 "절감"은 그 문자열을 8자 클래스로 바꿨을 때의 페이지당 값이다. 출현 횟수는 HTML/txt 순이고, 인라인 RSC 횟수는 txt와 같다.

|   # | 문자열(앞 60자)                                                  | 길이 | 출현 기사 | 출현 호 | 기사 KB → 절감 |  호 KB → 절감 | 출처                                        |
| --: | ---------------------------------------------------------------- | ---: | --------: | ------: | -------------: | ------------: | ------------------------------------------- |
|   1 | `size-1.5 rounded-full border border-brand bg-brand`             |   50 |     21/21 |   85/40 |   4.01 → −3.50 | 10.34 → −9.01 | ArticleMeta.tsx:132                         |
|   2 | `story-link border-border grid grid-cols-[3.25rem_minmax(0,1f…`  |  237 |       4/4 |    26/0 |   3.01 → −2.91 |  6.46 → −6.25 | Story.tsx:423 (+ `focus` Story.tsx:29)      |
|   3 | `border-border flex min-w-0 flex-col gap-1 py-3.5 pr-3 max-md…`  |  171 |       4/4 |       — |   2.22 → −2.12 |             — | ArticleView.tsx:234 (Signal)                |
|   4 | `inline-flex items-center justify-center gap-2 whitespace-now…`  |  364 |       3/1 |     3/1 |   1.53 → −1.49 |  1.53 → −1.49 | ui/button.tsx:8 (ThemeToggle×2·모바일 검색) |
|   5 | `text-meta text-muted-foreground flex flex-wrap items-center …`  |   94 |       4/4 |    26/0 |   1.29 → −1.20 |  2.71 → −2.50 | ArticleMeta.tsx:240 (Byline)                |
|   6 | `border-border text-foreground-soft rounded-pill text-meta in…`  |  103 |   3.5/3.5 |       — |   1.23 → −1.15 |             — | ArticleMeta.tsx:313 (TagChips)              |
|   7 | `text-muted-foreground pt-0.5 font-serif text-[0.9375rem] fon…`  |   83 |       4/4 |    26/0 |   1.16 → −1.06 |  2.42 → −2.21 | Story.tsx:427                               |
|   8 | `text-caption text-muted-foreground hover:text-foreground foc…`  |  337 |       1/1 |       — |   1.05 → −1.03 |             — | ArticleView.tsx:50 (뒤로 링크)              |
|   9 | `headline text-title font-semibold tracking-[-0.02em]`           |   52 |       4/4 |   36/10 |   0.79 → −0.69 |  3.56 → −3.11 | Story.tsx:439                               |
|  10 | `size-0.5 shrink-0 rounded-full bg-current`                      |   41 |   4.5/4.5 |   51/22 |   0.74 → −0.63 |  5.02 → −4.27 | ArticleMeta.tsx:149 (Dot)                   |
|  11 | `text-caption text-muted-foreground mt-0.5 line-clamp-2`         |   54 |       4/4 |    26/0 |   0.81 → −0.72 |  1.65 → −1.44 | Story.tsx:443                               |
|  12 | `inline-flex items-center gap-[3px]`                             |   34 |       5/5 |   49/22 |   0.71 → −0.59 |  4.32 → −3.57 | ArticleMeta.tsx:126 (미터 래퍼)             |
|  13 | `bg-primary … rounded-pill text-caption … mt-10 hidden w-fit…`   |  261 |       1/1 |       — |   0.82 → −0.80 |             — | ArticleView.tsx:179                         |
|  14 | `size-1.5 rounded-full border border-muted-foreground/80`        |   55 |   2.2/2.2 |   84/37 |   0.46 → −0.41 | 10.69 → −9.42 | ArticleMeta.tsx:132                         |
|  15 | `text-label text-muted-foreground font-semibold`                 |   46 |       4/4 |       — |   0.72 → −0.62 |             — | ArticleView.tsx:235                         |
|  16 | `bg-primary … rounded-pill text-caption … flex min-h-12 w-full…` |  217 |       1/1 |       — |   0.69 → −0.67 |             — | ArticleView.tsx:222                         |
|  17 | `size-1.5 rounded-full border border-foreground bg-foreground`   |   60 |   1.8/1.8 |   74/34 |   0.39 → −0.35 | 10.22 → −9.09 | ArticleMeta.tsx:132                         |
|  18 | `text-foreground-soft font-semibold`                             |   34 |       4/4 |  30/3.5 |   0.57 → −0.48 |  1.63 → −1.34 | ArticleMeta.tsx:201                         |
|  19 | `text-caption truncate font-semibold`                            |   35 |       4/4 |       — |   0.58 → −0.49 |             — | ArticleView.tsx:236                         |
|  20 | `flex min-w-0 flex-col gap-[3px]`                                |   31 |       4/4 |    26/0 |   0.54 → −0.44 |  1.05 → −0.84 | Story.tsx:430                               |
|  21 | `hover:text-brand -my-3 inline-flex min-h-11 items-center md:…`  |   75 |       2/2 |     2/2 |   0.53 → −0.48 |  0.53 → −0.48 | Footer.tsx:14                               |
|  22 | `bg-background text-foreground flex min-h-screen flex-col pb-…`  |  122 |       1/1 |     1/1 |   0.41 → −0.38 |  0.41 → −0.38 | SiteShell.tsx:59                            |
|  23 | `text-meta text-brand -my-3 ml-auto inline-flex min-h-11 item…`  |  117 |       1/1 |       — |   0.39 → −0.37 |             — | ArticleView.tsx:197                         |
|  24 | `border-rule bg-background/90 fixed inset-x-0 bottom-0 z-40 f…`  |  117 |       1/1 |       — |   0.39 → −0.37 |             — | ArticleView.tsx:212                         |
|  25 | `text-caption focus-visible:ring-ring py-1 font-semibold unde…`  |  157 |       2/0 |     2/0 |   0.33 → −0.32 |  0.33 → −0.32 | HeaderNav.tsx:31                            |
|  26 | `mx-auto grid max-w-[1240px] gap-6 px-4 pt-7 pb-10 md:grid-co…`  |   94 |       1/1 |     1/1 |   0.32 → −0.30 |  0.32 → −0.30 | Footer.tsx:21                               |
|  27 | `border-border bg-background/85 sticky top-0 z-50 hidden bord…`  |   90 |       1/1 |     1/1 |   0.31 → −0.29 |  0.31 → −0.29 | Header.tsx:12                               |
|  28 | `border-foreground text-foreground text-badge relative inline…`  |  174 |   0.4/0.4 |   8/5.5 |   0.21 → −0.20 |  3.53 → −3.38 | ArticleMeta.tsx:59 (OUTLINE_BADGE)          |
|  29 | `border-border bg-background/85 sticky top-0 z-50 border-b ba…`  |   84 |       1/1 |     1/1 |   0.29 → −0.27 |  0.29 → −0.27 | MobileTopBar.tsx:17                         |
|  30 | `border-t-rule border-b-border mt-7 grid grid-cols-2 border-t…`  |   86 |       1/1 |       — |   0.30 → −0.28 |             — | ArticleView.tsx:73                          |

호에서만 큰 문자열(호 KB → 절감):

| 문자열                                          | 호 KB → 절감 | 출처                |
| ----------------------------------------------- | ------------ | ------------------- |
| `story-link flex h-full flex-col gap-2 + focus` | 7.49 → −7.15 | Story.tsx:104·64    |
| compact Byline `… md:flex-col md:items-start`   | 5.07 → −4.76 | ArticleMeta.tsx:223 |
| 마스트헤드 섹션 내비 링크                       | 3.68 → −3.53 | Masthead.tsx:117    |
| 섹션 "전체 보기"                                | 3.32 → −3.19 | Edition.tsx:488     |
| Byline 매체 칸                                  | 3.06 → −2.82 | ArticleMeta.tsx:204 |
| 이 호의 지면 행                                 | 2.88 → −2.74 | Edition.tsx:354     |
| 요약 `line-clamp-3 max-md:hidden max-w-[42em]`  | 2.61 → −2.38 | Story.tsx:125       |

**중요도 미터가 가장 무겁다.** 미터 1개는 `<i class="size-1.5 rounded-full border …">` 5개다. 호 한 장에 미터가 48.6개(기사는 5개) 있다.

- 미터만 따로 재면 호 HTML 21.7 + txt 11.8 + 인라인 10.6 ≈ **44 KB/호**, 기사 ≈ 7 KB다.
- 공통 `focus` 상수(Story.tsx:29, 110자)는 Story 변형의 모든 링크에 붙는다.

## 5. `index.txt`를 받는 시점

- `src`에 `prefetch` 지정이 하나도 없다. 그래서 모든 `next/link`가 Next 15.5 기본값(auto)을 따른다. 프로덕션에서는 링크가 화면에 들어오면 정적 라우트의 RSC 전체를 미리 받는다.
- 클라이언트 라우터(`_next/static/chunks/255-*.js`)는 `/article/1286/` 요청을 `/article/1286/index.txt`로 바꿔 받는다. 그래서 홈·호·기사 화면에 보이는 기사 링크마다 `.txt`를 미리 받고, 클릭 이동도 이 파일을 쓴다. 기사 링크를 만드는 곳은 Story 변형 전부, TrendingList, FollowUpThread, 검색 결과다.
- `.txt`가 없으면 404 응답이 온다. GitHub Pages는 이때 `404.html`(약 30 KB)을 돌려주고, Next는 RSC가 아닌 응답을 받으면 전체 페이지 이동(MPA)으로 넘어간다. 기능은 유지되지만 링크마다 30 KB 404 응답을 헛받는다.
- 그래서 `.txt`를 지울 거면 기사 링크를 `prefetch={false}`로 끄는 것만으로는 부족하다. 클릭할 때 한 번 더 헛받기 때문이다. **basePath를 붙인 일반 `<a>`**로 바꾸는 편이 낫다.

## 6. 감축 계획 (순위·추정)

"실측"은 산출물을 후처리해 잰 값이다. 시뮬레이션은 8자 클래스 이름과 `<i>` 5개 + `.imp` 미터를 가정했다. "추정"은 RSC 바이트 × 2.137(txt + 인라인 1.137)로 계산했다. 호 수치는 최근 14호 평균 371.5 KB 기준이다.

| 순위 | 수단                                                                                                                                                                                                                                                                                   | 화면                           |                           기사 |                          호 | 근거 |
| ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -----------------------------: | --------------------------: | ---- |
|    1 | 중요도 미터 축약: `<i>` 5개는 클래스 없이 두고 래퍼 `.imp` + `data-v`(또는 `aria-label` 값), CSS `nth-child`로 채움·테두리 (ArticleMeta.tsx:112-144, globals.css)                                                                                                                      | 같음                           |                       **−5.2** |                   **−32.5** | 실측 |
|    2 | 20자 이상 클래스 묶음을 `@layer components { .x { @apply … } }`로 묶는다. Story 변형·`focus`·Byline·Signal·CTA·셸·shadcn Button이 대상이다. 상위 40개만 바꾸면 기사 −19.4, 호 −73.2                                                                                                    | 같음(클래스명만 바뀜)          |                      **−21.1** |                  **−107.0** | 실측 |
|    3 | 호 본문 클라이언트 섬: FeedView 패턴을 재사용한다. 호 카드 배열(IndexCard + 레이더용 engagement) 한 벌로 1면·밴드·색인을 그린다. 2 다음에 하면 RSC가 79.7 → 약 34 KB가 된다. 최소안은 EditionView.tsx:25의 `toListCards`를 `toIndexCard`(tags 제외)로 바꾸는 것이고, 이것만 하면 −18.3 | 같음                           |                              — |    **≈ −98** (최소안 −18.3) | 추정 |
|    4 | 기본 notFound 트리 제거: `(ko)`·`(en)/en`에 최소 `not-found.tsx`를 둔다. 시험 빌드로 RSC 감소와 `404.html` 무변화를 확인해야 한다                                                                                                                                                      | 같음                           |                           −4.0 |                        −4.0 | 추정 |
|    5 | 관련 기사 카드 클라이언트 섬(slim props, `StoryEntry` 재사용). 2 다음이라 효과가 작다                                                                                                                                                                                                  | 같음                           |                           −5.3 |                           — | 추정 |
|    6 | `twitter:title·description·image` 삭제(`twitter:card`만 남김, X는 og로 대체한다)                                                                                                                                                                                                       | 같음(SEO 메타 변경, 결정 필요) |                           −1.9 |                        −1.5 | 추정 |
|    7 | 셸 클라이언트 모듈 합치기: HeaderWordmark·HeaderNav·ThemeToggle(+ 모바일)을 한 섬으로 묶어 `I[…]` 행(행당 270 B)을 줄인다                                                                                                                                                              | 같음                           |                           −2.2 |                        −2.2 | 추정 |
|    8 | lucide 아이콘 기본 속성을 공통 CSS로 옮긴다(작은 `Icon` 래퍼)                                                                                                                                                                                                                          | 같음                           |                           −1.8 |                        −0.5 | 추정 |
|    — | **1~8 합계 (`.txt` 유지)**                                                                                                                                                                                                                                                             |                                |                    **≈ 55 KB** | **≈ 125 KB** (일요일 ≈ 145) |      |
|    9 | 대안: 기사 `index.txt` 삭제(빌드 후처리 — deploy.yml·Dockerfile·regress 모두) + 기사 링크를 일반 `<a>`로                                                                                                                                                                               | 기사 이동이 전체 페이지 로드   | **−18.5 → ≈ 37 KB** (p90 ≈ 40) | (호에 적용 시 3 없이 ≈ 139) | 추정 |

판정:

- **기사 40 KB는 `index.txt`를 지우지 않으면 닿지 않는다.**
  - 1+2만 하면 70.3 KB(실측)이고, 1~8을 모두 해도 약 55 KB다.
  - 남는 몫은 고정 비용이다. 메타데이터 사본 4.0, 루트 트리 4.4, 모듈 참조 2.6, JSON-LD 1.0, 라우터 0.7이 RSC 두 벌에 실리고, `<head>` 4.6이 더해져 약 32 KB다.
  - 9를 더하면 약 37 KB(p90 약 40 KB)로 아슬아슬하게 들어온다. 이때 1·2·4·6은 필수다. 1+2만 하고 9를 하면 HTML이 45.4 KB라 넘는다.
- **호 150 KB는 `.txt`를 유지한 채 1+2+3(섬)으로 닿는다**(최근 평균 약 125 KB, 일요일 약 145 KB).
  - 3을 최소안(props 축소)만 하면 약 206 KB라 못 미친다. 그때는 호 `index.txt`도 지워야 한다(약 139 KB).
- 1+2만 해도 사이트는 155 MB에서 약 117 MB(−25%)가 된다. 1~8 + 9를 하면 약 71 MB다(기사 47 + 호 4 + 공용·og·색인 19).
  - 홈 페이지도 1+2로 481.5 → 300.0 KB(실측)가 된다.

화면이 바뀌어 지금 계획에서 뺀 수단(필요하면 사용자 결정):

| 수단                                            | 효과                               |
| ----------------------------------------------- | ---------------------------------- |
| 관련 카드 4 → 3장                               | 2 이후 약 −3 KB                    |
| 관련 카드에서 요약 줄 제거                      | 약 −2 KB                           |
| 원문 발췌 길이 상한                             | 평균 0.8 KB × 3벌                  |
| 호 "이 호의 기사"에서 1면·밴드에 실린 기사 빼기 | HTML 약 −15 KB(2 이후), props −50% |

## 7. 구현 시 주의

- **클래스 축약**
  - 컴포넌트 클래스는 `@layer components`에 둔다. 그래야 호출부가 넘기는 덮어쓰기 유틸리티가 이긴다. 예: `CategoryKicker className="text-label"`, `Byline className="min-w-0 flex-nowrap gap-x-2 …"`. 지금은 `twMerge`가 충돌 클래스를 지워서 맞추지만, 축약 후에는 cascade layer가 같은 결과를 낸다.
  - `@utility`로 만들면 유틸리티 층에서 정렬 순서가 바뀔 수 있다.
  - `story-link`(globals.css:184)와 `.headline` 선택자는 그대로 둔다.
- **테스트**: `toHaveClass` 검사가 FrontPage.test 31개, ArticleMeta.test 8개, BottomTabBar.test 7개 등 클래스명에 묶여 있다. 축약할 때 함께 고친다.
- **회귀 확인**
  - `compare data/regress/baseline-p4 <후보> --text`로 구조·텍스트가 같은지 본다.
  - 계산된 스타일이 같은지는 기준선 이미지(`daybook-regress:f31a11e`)와 스크린숏을 픽셀 단위로 비교해 확인한다(Phase 3-4 방식).
- **3(호 클라이언트 섬)**
  - HTML은 SSR 결과라 같아야 한다. 홈 FeedView가 이미 같은 컴포넌트를 클라이언트에서 그린다.
  - `IssueContents`·주간 레이더 입력(`WeeklyRadar`)도 props로 넘겨야 한다.
  - Masthead·IssueBrief는 서버에 남겨도 된다(합계 약 3 KB).
- **9**: 일반 `<a>`로 바꾸면 홈·호에서 기사로 가는 이동이 소프트 내비게이션에서 전체 로드로 바뀐다. 기사 HTML은 gzip 약 8 KB이고 공용 JS는 캐시된다. 화면 표시는 같다.
