# Phase 6-3 검색엔진 등록·확인 — 출시 때 할 일 (2026-11-06)

> **결정 (2026-11-06 사용자):** 6-3 중 자동으로 할 수 있는 것만 Phase 6에서 한다. 영어 페이지가 공개돼야 할 수 있는 등록·색인 요청은 이 안내서대로 **Phase 7 출시 때** 한다. IndexNow는 구현해 두고 출시 때 켠다.

## Phase 6에서 끝낸 것 (자동)

| 무엇                                                         | 어디서                                                                                                                                                      | 하는 일                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEO 정합성 검사 `npm run seo:check -- [out] [--ci] [--json]` | `deploy.yml` "Check SEO"(`en:hangul-check` 다음). 오류가 있으면 업로드 전에 배포를 멈춘다                                                                   | 모든 페이지(보관 지면 포함, 404 제외)를 본다. canonical = 자기 주소 = og:url인지, `<html lang>` = 경로 언어 = og:locale인지 확인한다. hreflang `ko`·`en`·`x-default`가 **서로 가리키는지**(상호 참조), og:image·RSS 파일이 있는지 본다. JSON-LD는 NewsArticle·WebSite의 필수 필드를 본다(리치 결과 사전 점검). 사이트맵 인덱스·조각은 모든 페이지가 들어 있는지, `xhtml:link`가 페이지 hreflang과 같은지, 5만 URL·50MB 한도를 넘지 않는지 본다. RSS는 `language`와 항목 링크를 본다 |
| IndexNow `npm run indexnow -- [out] [--dry-run]`             | `deploy.yml` "Prepare IndexNow payload"(build 잡) → "Notify IndexNow"(Pages 배포 뒤). 둘 다 `vars.INDEXNOW_ENABLED == '1'`일 때만 돌고, `continue-on-error` | DB 최신 호의 두 언어 홈·호·기사 URL(out/에 있는 것만, 제143호 기준 47개)을 `api.indexnow.org`에 보낸다. 키 `6ed9c8afd10bad2985364bb10abc22d7`(공개 값, `scripts/lib/indexNow.ts` 한 곳)이고, 키 파일은 `public/<키>.txt`다. `keyLocation`이 `/global-ai-news/` 아래라 제출 범위도 그 아래로 한정된다(IndexNow 규약). 사이트맵·지난 호·검색 페이지는 보내지 않는다(규약 FAQ: 바뀐 URL만, 사이트맵은 따로)                                                                            |

검증(2026-11-06, Docker 빌드 `out-p6-a`): 2,656쪽(ko 1,336 · en 1,320, 그중 보관 633)에서 오류 0·경고 0이 나왔고 0.9초 걸렸다. Phase 6 이전 빌드(`out-p6-base`)에서는 오류 14,485건으로 실패해, 검사가 실제로 잡는다는 것을 확인했다.

> **주의:** `seo:check`도 `en:hangul-check`처럼 Phase 6 이후 산출물을 전제로 한다. Phase 7 병합 전에 이 단계만 `deploy/github-pages`로 옮기면 배포가 실패한다.

## Phase 7 출시 때 할 일 (직접)

순서는 **병합 → 배포 성공(`seo:check` 통과) → 아래 1~6**이다. 영어 페이지가 실제로 열린 뒤에 한다.

### 1. Google Search Console

속성은 이미 등록돼 있다(URL 접두어 `https://sguys99.github.io/global-ai-news/`, 루트 저장소의 확인 파일로 자동 확인됨).

1. **사이트맵:** 왼쪽 메뉴 `Sitemaps`에서 이미 제출한 `sitemap.xml`을 연다. 주소는 같고 내용만 인덱스로 바뀌었다. "다시 제출"이 없으면 같은 주소를 한 번 더 제출한다. 상태가 "성공"이고 하위 사이트맵 3개(`sitemaps/pages.xml`·`ko-2026.xml`·`en-2026.xml`)가 보이는지 확인한다.
2. **URL 검사 → 색인 생성 요청:** 하루 할당량이 적으므로(약 10건) 다음 순서로 한다.
   - `/en/`
   - `/en/edition/<최신 호>/`
   - `/en/search/`
   - 최신 호 영어 기사 2~3건(한국 매체 1건 포함)
3. 같은 화면에서 **"사용자 선언 표준 URL"이 자기 주소(`/en/…`)인지** 확인한다. 한국어 주소로 잡히면 canonical·hreflang 문제다.
4. 며칠 뒤 `페이지` 보고서에서 `/en/` 색인 수를 보고, `향상 → 기사`(구조화 데이터) 보고서를 본다.

> 국제 타기팅(hreflang) 보고서는 2022년에 없어졌다. hreflang은 빌드마다 `seo:check`가 상호 참조를 보고, 출시 뒤에는 URL 검사의 표준 URL로 확인한다.

### 2. Bing Webmaster Tools

1. <https://www.bing.com/webmasters>에 Microsoft 계정으로 로그인한다.
2. **"Import from Google Search Console"**을 고르고, 같은 Google 계정을 연결해 `https://sguys99.github.io/global-ai-news/` 속성을 가져온다. 소유 확인과 사이트맵이 함께 넘어온다.
3. `Sitemaps`에 `https://sguys99.github.io/global-ai-news/sitemap.xml`이 있는지 확인한다(없으면 제출).
4. `URL Submission`에서 `/en/`과 `/en/edition/<최신 호>/`를 제출한다.

Bing 색인은 DuckDuckGo·Yahoo·ChatGPT 검색 결과에도 쓰인다.

### 3. IndexNow 켜기

1. GitHub 저장소 `Settings → Secrets and variables → Actions → Variables`에 `INDEXNOW_ENABLED` = `1`을 추가한다(저장소 변수라 모든 브랜치에 적용된다).
2. 다음 배포에서 build 잡 로그에 "Prepare IndexNow payload"가 있는지, deploy 잡에 "Notify IndexNow 응답 200/202"가 찍혔는지 확인한다. 첫 회에는 키 확인 대기 상태라 **202**가 나올 수 있다.
3. 확인용으로 `https://sguys99.github.io/global-ai-news/6ed9c8afd10bad2985364bb10abc22d7.txt`가 열리는지 본다.
4. 며칠 뒤 Bing Webmaster `IndexNow` 메뉴에서 받은 URL 수를 본다.
5. 끄려면 변수를 지우거나 `0`으로 바꾼다. 실패해도 배포 결과에는 영향이 없다(`::warning::`만 남는다).

### 4. 네이버 서치어드바이저

호스트 단위(`https://sguys99.github.io`)로 이미 등록돼 있다.

1. `요청 → 사이트맵 제출`에서 기존 `global-ai-news/sitemap.xml` 항목의 최근 수집 결과를 확인한다. **사이트맵 인덱스 지원은 공식 문서로 확인하지 못했다.** 호스팅 가이드들은 인덱스 파일을 그대로 제출한다. 오류가 나면 조각 `global-ai-news/sitemaps/ko-2026.xml`·`global-ai-news/sitemaps/pages.xml`을 따로 제출한다(네이버는 한국어판만 있어도 된다).
2. RSS는 지금 `feed.xml`(한국어) 그대로 둔다. `/en/feed.xml`은 네이버에 제출하지 않는다.

### 5. 리치 결과 테스트

1. <https://search.google.com/test/rich-results>에 다음 주소를 넣고 "기사(Article)"가 유효한지 확인한다.
   - 영어 기사(최근 7일, 전용 썸네일) 1건
   - 영어 보관 기사(90일 지난 것, 예: `/en/article/68/`) 1건
   - 한국어 기사 1건
2. 경고만 있으면 그대로 둔다. 보관 기사의 description은 예산 때문에 일부러 뺐다.
3. 필요하면 <https://validator.schema.org>에서 `/en/` WebSite도 확인한다.

### 6. 공유 미리보기 (선택)

- 카카오톡 공유 디버거·X·LinkedIn Post Inspector에 `/en/edition/<최신 호>/`를 넣어 영어 썸네일(`/og/en/edition/<날짜>.png`)과 영어 제목·설명이 나오는지 본다.
- 한국어 호도 한 번 넣어 `og:locale:alternate`가 추가된 뒤에도 미리보기가 그대로인지 본다.

## 루트 저장소(robots.txt)

`sguys99/sguys99.github.io`의 `robots.txt`에 있는 `Sitemap: https://sguys99.github.io/global-ai-news/sitemap.xml`은 바꾸지 않는다. 주소가 같고, 인덱스가 조각을 가리킨다.

## 출시 뒤 (Phase 8-1로 이어짐)

- Search Console: 영어 검색어의 노출·클릭, 국가별 노출, `/en/` 색인 페이지 수
- Bing Webmaster: 색인과 노출, IndexNow로 받은 URL 수
