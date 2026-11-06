# Phase 7-3 링크 검사 — `/en/**` 언어 누수·깨진 링크 (2026-11-06)

대상: `deploy/github-pages` `c024ced`(PR #9 병합) Docker 정적 빌드 `data/regress/out-p7`. 비교 기준은 출시 전 `232bbfc` 빌드 `data/regress/out-p7-base`이고, 두 빌드는 같은 `data/app.db`를 쓴다([7-1 보고서](7-1-build-size.md)).
실서비스 표본은 `https://sguys99.github.io/global-ai-news/`에서 받았다. 확인 시점의 배포는 `b141b88`(`latest.json` 필드 추가)이다. HTML은 빌드 id 몇 바이트만 다르다(`/en/` 123,381 B, `out-p7` 123,376 B).

## 요약

- **깨진 내부 링크 0건.** ko·en 모두 0건이다. 2,658쪽(ko 1,336·en 1,320·404 2), RSC `index.txt` 68개, XML 6개에서 내부 URL 164,838개를 뽑았고, 고유 대상 3,129개가 전부 `out-p7`의 파일로 풀린다. 슬래시 301에 기대는 링크도 0건이다.
- **언어 누수 0건.** `/en/**`에서 한국어판으로 가는 링크는 허용된 네 종류뿐이다. ① `한국어` 전환 링크: 일반 쪽 3곳(헤더·모바일 바·푸터), 보관 지면 1곳 ② hreflang `ko` 대체 링크 ③ 공용 자산 ④ JSON-LD `publisher`·`author`의 Organization `url`(사이트 루트, 아래 "발견" 1). 반대 방향도 같다. 한국어 쪽에서 `/en/`으로 가는 링크는 `EN` 전환 링크와 hreflang `en`·`x-default`뿐이다.
- **클라이언트 섬 데이터도 모두 존재하는 페이지를 가리킨다.** 대상은 `feed-index/en`·`search-index/en`의 1,283행과 홈 색인 머리 120행, 영어 호 32쪽의 지면 페이로드 973 id, 일요일 호 4쪽의 주간 레이더 39항목(기사·호 날짜), 영어 홈 페이로드 49 id다. 이 id마다 `/en/article/<id>/`가 있다(일반 쪽이든 보관 지면이든). `next/link` 대상 68개는 모두 RSC `index.txt`가 있다.
- **영어 본문이 없는 한국어 기사 16건은 영어판 어디에도 나오지 않는다.** 대상은 HTML·RSC·색인·`en/feed.xml`·`sitemaps/en-2026.xml`이다. 이 기사들의 한국어 쪽에는 hreflang `en`이 없고, `EN` 전환 링크는 `/en/` 홈으로 간다. `/en/article/1188/`은 실서비스에서 404로 응답한다(의도한 동작).
- **실서비스 표본 32개는 기대한 상태 코드와 모두 맞았다.** 200이 29개, `/en` 301이 1개, 404가 2개(`/en/xyz/`, 영어 없는 기사)다.
- 출시 전 빌드(`out-p7-base`, 1,338쪽·내부 링크 67,532개)에서도 깨진 링크·영어 링크는 0건이다. 출시로 새로 깨진 한국어 링크는 없다.
- **고칠 버그는 없다.**

## 방법

크롤러는 `/tmp/claude-1000/-home-sguys99-project-global-ai-news/5bec66c8-e7b1-4592-a15d-595909fe834d/scratchpad/linkcheck.py`다(Python 표준 라이브러리 `html.parser`, 서버 없이 정적 분석). 저장소에는 넣지 않았다. 실행: `python3 -I linkcheck.py <out> --json <결과>`, 약 6초.

- **추출 대상**
  - HTML: `a[href]`(글자·`lang`·`hreflang` 포함), `link[href]`(canonical·hreflang 대체·RSS·아이콘·글꼴 preload·CSS), `meta[content]`(`og:url`·`og:image`·`twitter:image` 등 사이트 URL), `script[src]`, `img[src|srcset]`, `form[action]`
  - JSON-LD: JSON으로 파싱해 키 경로와 함께 URL 값을 뽑는다. `headline`이 `http2shell…`로 시작하는 기사가 있어 공백 없는 URL 값만 센다.
  - RSC 인라인(`self.__next_f`)·`index.txt`: Flight 데이터의 `"href"`를 뽑고, 같은 요소의 `rel`·`hrefLang`·`lang`을 함께 읽는다(메타 hreflang이 RSC에도 다시 실리기 때문).
  - XML: RSS `feed.xml`·`en/feed.xml`의 `<link>`·`<guid>`·`atom:link`, 사이트맵 인덱스와 조각 `pages.xml`·`ko-2026.xml`·`en-2026.xml`의 `<loc>`·`xhtml:link`(hreflang별).
- **내부 URL 판정**: `https://sguys99.github.io/global-ai-news/…`, `/global-ai-news/…`, 상대 경로. 같은 호스트의 basePath 밖 경로는 따로 센다(0건).
- **GitHub Pages식 해석**: 쿼리·해시를 떼고 URL 디코드한 뒤 아래 순서로 찾는다. 트레일링 슬래시 → `index.html` / 정확한 파일 / `x.html` / `x/index.html`(301 — 링크·RSC에서 이 경우를 따로 셌고 0건이다).
- **`next/link` 대상**: RSC에서 basePath 없이 `/…`로 시작하는 href는 클라이언트 라우터가 `<경로>/index.txt`를 받는다. 그래서 그 페이지와 `.txt`가 둘 다 있는지 본다.
- **언어 판정**: 경로가 `en/`, `og/en/`, `feed-index/en/`, `search-index/en/`, `sitemaps/en-`로 시작하면 영어, 그 밖은 한국어다. 404, 사이트맵 인덱스, `pages.xml`은 중립이다.
- **허용 목록**
  - 영어 → 한국어: hreflang `ko`, `a[hreflang=ko|lang=ko]`(전환 링크), 공용 자산(`_next/`·`fonts/`·`favicon.ico`·`icon.svg`·`apple-icon.png`·`og/default.png`·루트 키 `.txt`), JSON-LD Organization `url`
  - 한국어 → 영어: hreflang `en`·`x-default`, `a[hreflang=en|lang=en]`
- **클라이언트 데이터**: `feed-index/<언어>`·`search-index/<언어>`의 목록과 월별 조각 행 id, 목록 `head`, 호 RSC의 지면 페이로드(`rows`·`lead`·`seconds`·`briefs`·`radar`·`trending`·`sections`·`desk`), 주간 레이더(`weekly.items[].id`·`issueDate`·영어 `titleEn`), 홈 RSC의 카드 id. 각각 해당 언어판의 기사·호 페이지가 있는지 본다.
- **크롤러 자체 검증**: 일부러 만든 작은 산출물을 넣어 깨진 `a`·`script`, `next/link` `.txt` 누락, 언어 누수 `a`, 색인의 없는 id가 모두 잡히고, 전환 링크와 hreflang은 허용으로 분류되는 것을 확인했다.
- 실서비스는 `curl`로 한 번에 하나씩 32개 URL을 받았다. 하이드레이션 뒤 링크(전환 링크가 hreflang 대체 링크로 바뀌는 것 등)는 Phase 5-4에서 브라우저로 516개를 이미 크롤했다. 이번에는 Playwright용 Chrome이 이 환경에 없어 다시 돌리지 않았다. 대신 전환 링크가 읽는 hreflang 대상이 모두 있다는 것을 정적으로 확인했다(아래 표).

## 결과

### 페이지·링크

| 구분                                      |                               ko |                                  en |  중립 | 합계         |
| ----------------------------------------- | -------------------------------: | ----------------------------------: | ----: | ------------ |
| 기사(일반)                                |                              982 |                                 973 |       | 1,955        |
| 기사 보관 지면                            |                              317 |                                 310 |       | 627          |
| 호(일반) / 보관 호                        |                           32 / 3 |                              32 / 3 |       | 70           |
| 홈 / 검색                                 |                            1 / 1 |                               1 / 1 |       | 4            |
| 404(`404.html`·`404/index.html`)          |                                  |                                     |     2 | 2            |
| **HTML 계**                               |                        **1,336** |                           **1,320** | **2** | **2,658**    |
| RSC `index.txt`                           |                               34 |                                  34 |       | 68           |
| XML(RSS·사이트맵)                         | `feed.xml` 122 · `ko-2026` 5,288 | `en/feed.xml` 122 · `en-2026` 5,272 |    19 | 6파일 10,823 |
| **내부 링크**(HTML+RSC+XML)               |                       **82,865** |                          **81,858** |   115 | **164,838**  |
| 외부 링크(원문·GoatCounter 등, 검사 제외) |                                  |                                     |       | 13,006       |
| 고유 내부 대상                            |                                  |                                     |       | 3,129        |
| **깨진 내부 대상**                        |                            **0** |                               **0** | **0** | **0**        |
| basePath 밖 같은 호스트 링크              |                                0 |                                   0 |     0 | 0            |
| 슬래시 301에 기대는 링크                  |                                  |                                     |       | 0            |
| `next/link` 대상(페이지+`.txt`)           |                               34 |                                  34 |       | 68, 누락 0   |

### 언어 간 링크

| 방향        | 종류                                                             |          개수 | 판정                                                            |
| ----------- | ---------------------------------------------------------------- | ------------: | --------------------------------------------------------------- |
| en → ko     | `한국어` 전환 링크(`lang="ko" hreflang="ko"`)                    |         3,334 | 허용 — 일반 쪽 3곳 × 1,007쪽 + 보관 지면 1곳 × 313쪽, 예외 없음 |
| en → ko     | hreflang `ko`(HTML `<link>`·RSC 메타·`en-2026.xml`)              |         3,679 | 허용                                                            |
| en → ko     | 공용 자산                                                        |        29,826 | 허용                                                            |
| en → ko     | JSON-LD Organization `url`(사이트 루트)                          |         2,567 | 허용(발견 1)                                                    |
| **en → ko** | **그 밖(본문·내비·관련 기사·후속 보도·태그·RSS·사이트맵 `loc`)** |         **0** | **누수 없음**                                                   |
| ko → en     | `EN` 전환 링크(`lang="en" hreflang="en"`)                        |         3,368 | 허용 — 일반 쪽 3곳 × 1,016쪽 + 보관 지면 1곳 × 320쪽            |
| ko → en     | hreflang `en` / `x-default`(= en)                                | 3,679 / 3,679 | 허용                                                            |
| **ko → en** | **그 밖**                                                        |         **0** | **누수 없음**                                                   |

- `x-default`는 7,362개 모두 영어판을 가리킨다(계획 기본값).
- 영어 페이지의 `og:image`·`twitter:image`는 모두 `og/en/…`이다. 한국어 썸네일을 가리키는 것은 0건이다.
- 영어 페이지에서 나가는 링크는 `/en/…`(홈·호·기사·검색·`?category=`·`?tag=`·`?source=`·`#섹션`)뿐이다. 관련 기사(`RelatedStories`)·사건 타임라인(`FollowUpThread`)·호 이동(`EditionPager`)·마스트헤드 날짜 링크도 모두 영어 쪽 안에 있다.

### 클라이언트 섬 데이터

| 페이로드                                                                                    | 항목                                   |              해당 언어 페이지 없음 |
| ------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------: |
| `feed-index/en`(목록 + 조각 4개월)                                                          | 1,283행(중복 0, total 일치) + head 120 |                                  0 |
| `search-index/en`                                                                           | 1,283행                                |                                  0 |
| `feed-index/ko`·`search-index/ko`                                                           | 각 1,299행                             |                                  0 |
| 영어 호 지면 페이로드(32쪽)                                                                 | 973 id(모든 슬롯 id가 `rows` 안)       |                                  0 |
| 한국어 호 지면 페이로드(32쪽)                                                               | 982 id                                 |                                  0 |
| 주간 레이더(일요일 호 en 4·ko 4)                                                            | 각 39항목, 기사·`issueDate` 호         | 0(영어 항목은 모두 `titleEn` 있음) |
| 영어 / 한국어 홈 RSC 카드                                                                   | 49 / 50 id                             |                                  0 |
| 영어 없는 한국어 기사 16건(1188·1255·1368·1396·155·22·221·23·25·27·301·471·485·670·703·757) | 영어 HTML·RSC·색인·RSS·사이트맵 언급   |                     0건(제외 확인) |

검색 결과·색인 "더 보기"·필터 결과의 기사 링크는 행 id로 `ArticleLink`가 만들고, 호 링크는 데이터에서 만들지 않는다. 그래서 위 id 검사가 런타임 링크 검사 역할을 한다.

### 실서비스 표본 (`curl`, 2026-11-06, 배포 `b141b88`)

| URL(basePath 뒤)                                                                                                   |      상태 | 비고                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | --------: | --------------------------------------------------------------------------- |
| `/en/`                                                                                                             |       200 | 123,381 B                                                                   |
| `/en`                                                                                                              |       301 | → `/global-ai-news/en/`                                                     |
| `/en/edition/2026-11-06/`                                                                                          |       200 | 최신 호                                                                     |
| `/en/edition/2026-11-01/`                                                                                          |       200 | 일요일(주간 레이더)                                                         |
| `/en/edition/2026-10-06/`                                                                                          |       200 | 대량 호(살아 있는 쪽)                                                       |
| `/en/edition/2026-06-09/`                                                                                          |       200 | 보관 호                                                                     |
| `/en/article/1399/`                                                                                                |       200 | 일반 기사                                                                   |
| `/en/article/1/`                                                                                                   |       200 | 보관 기사 7,328 B                                                           |
| `/en/article/1188/`                                                                                                |       404 | 영어 없는 기사 — 의도대로 없음                                              |
| `/en/search/`, `/en/search/?q=openai`                                                                              | 200 / 200 |                                                                             |
| `/en/feed.xml`                                                                                                     |       200 | application/xml                                                             |
| `/en/edition/2026-11-06/index.txt`                                                                                 |       200 | `next/link` RSC                                                             |
| `/og/en/default.png`, `/og/en/article/1399.png`, `/og/en/edition/2026-11-06.png`                                   |    200 ×3 | image/png                                                                   |
| `/feed-index/en/manifest.json`, `/search-index/en/manifest.json`                                                   |    200 ×2 | application/json                                                            |
| `/sitemap.xml`, `/sitemaps/pages.xml`, `/sitemaps/en-2026.xml`, `/sitemaps/ko-2026.xml`                            |    200 ×4 |                                                                             |
| `/en/xyz/`                                                                                                         |       404 | 이중 언어 404(24,649 B, `/en` 아래면 스크립트가 `lang=en`·영어 단을 앞으로) |
| `/`, `/edition/2026-11-06/`, `/edition/2026-06-09/`, `/article/1399/`, `/article/1/`, `/article/1188/`, `/search/` |    200 ×7 | 한국어 대응 쪽(1188은 한국어에만 있음)                                      |
| `/feed.xml`, `/og/default.png`                                                                                     |    200 ×2 |                                                                             |

32개 모두 기대한 대로 응답했다.

## 발견·권고

1. **JSON-LD Organization `url`이 영어 페이지에서도 사이트 루트(한국어 홈)를 가리킨다**(`src/lib/seo.ts:288` `ORGANIZATION.url = abs("/")`, 영어 `NewsArticle`의 `publisher`·`author`, 영어 홈 `WebSite.publisher`). 화면에 보이는 링크가 아니고, 발행 조직은 언어판과 상관없이 한 곳이라 Google 권장(조직 홈페이지 하나)과도 맞는다. **바꾸지 않는 것을 권한다.** 영어 홈을 가리키게 하면 조직이 언어별로 둘로 보인다.
2. **영어 없는 기사(16건)의 한국어 쪽 `EN` 전환 링크는 `/en/` 홈으로 간다**(`src/lib/localeSwitch.ts:20`, hreflang 대체 링크가 없을 때). 404 대신 홈으로 보내는 것이 계획대로의 동작이고, 해당 쪽에는 hreflang `en`도 없다. 그대로 둔다.
3. 고칠 버그는 없다. 이 검사를 배포 검사로 만들 필요는 크지 않아 보인다. `seo:check`가 이미 hreflang·canonical·사이트맵·RSS 대상이 있는지 보고, 본문 링크는 같은 `ArticleLink`·`localePath` 한 곳에서 만들기 때문이다. 다시 돌릴 때는 위 스크립트를 `scripts/`로 옮기면 된다(`out/` 2,658쪽 6초).
4. 하이드레이션 뒤 링크 검사는 이번에 브라우저(Chrome 없음)로 다시 하지 못했다. Phase 5-4 크롤(516개 전부 200, `/en/` 밖은 `한국어` 전환뿐)과, 이번에 확인한 "hreflang 대상 전부 있음"·"색인·페이로드 id 전부 있음"으로 대신한다.
