# Phase 8-1 검색엔진 등록·확인 체크리스트 (2026-11-07)

[영어판 계획](../../english-version-plan.md) Phase 8-1 첫 항목 ①~⑤를 한 번에 따라 하는 순서표다. 막히는 곳의 자세한 설명은 [6-3 안내서](../phase6/6-3-search-engines.md)를 본다. 끝나면 맨 아래 "결과 회신 양식"을 채워 돌려준다.

- 속성(공통): `https://sguys99.github.io/global-ai-news/`
- 최신 호: **2026-11-07 제144호**(11-07 06:08 KST 배포). 아래 주소는 고정 링크라 다음 호가 나와도 그대로 쓴다.

## 사전 확인 (2026-11-07, curl)

모두 **200**이다(리다이렉트 따라감). 문제는 찾지 못했다.

| 확인                  | 결과                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sitemap.xml`         | 사이트맵 인덱스, 하위 3개 — `sitemaps/pages.xml`(4 URL)·`sitemaps/ko-2026.xml`(1,355)·`sitemaps/en-2026.xml`(1,339). 합계 2,698 URL, `lastmod` 2026-11-06T21:08Z |
| 루트 `robots.txt`     | `Sitemap: https://sguys99.github.io/global-ai-news/sitemap.xml` 줄 있음(루트 `sitemap.xml` 줄과 함께). 고칠 것 없다                                              |
| IndexNow 키 파일      | `…/global-ai-news/6ed9c8afd10bad2985364bb10abc22d7.txt` → 키 그대로 반환                                                                                         |
| 영어 페이지 canonical | 아래 영어 주소 7개 모두 canonical = 자기 `/en/…` 주소, `<html lang="en">`                                                                                        |
| hreflang              | 7개 모두 `ko`·`en`·`x-default` 3줄. `ko`는 같은 경로의 한국어 주소, `x-default`는 영어 주소(Phase 6 설계 — 한국어 페이지도 `x-default` = 영어)                   |
| JSON-LD               | 영어 기사 3건·한국어 기사 1건 `NewsArticle`, `/en/` `WebSite`. 보관 기사 `/en/article/68/`도 `NewsArticle`(이미지 = `og/en/default.png`, 8KB 보관 지면)          |
| 공유 썸네일           | `og/en/edition/2026-11-07.png`·`og/en/article/1413.png`·`1403.png`·`1407.png` 200. 영어 호 `og:locale` en_US + `og:locale:alternate` ko_KR, 한국어 호는 그 반대  |
| RSS                   | `/feed.xml`·`/en/feed.xml` 200(영어 60항목)                                                                                                                      |

### 고른 주소

| 용도                  | 주소                                                              | 비고                                                 |
| --------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| 영어 홈               | `https://sguys99.github.io/global-ai-news/en/`                    |                                                      |
| 영어 최신 호          | `https://sguys99.github.io/global-ai-news/en/edition/2026-11-07/` | 제144호                                              |
| 영어 검색             | `https://sguys99.github.io/global-ai-news/en/search/`             |                                                      |
| 영어 기사 — KOREA     | `https://sguys99.github.io/global-ai-news/en/article/1413/`       | 한국 매체, Anthropic 개발 속도 2배(원제 한국어 병기) |
| 영어 기사 — 해외 리드 | `https://sguys99.github.io/global-ai-news/en/article/1403/`       | 제144호 1면 리드(METR)                               |
| 영어 기사 — 해외      | `https://sguys99.github.io/global-ai-news/en/article/1407/`       | Perplexity Teammates                                 |
| 영어 보관 기사        | `https://sguys99.github.io/global-ai-news/en/article/68/`         | 2026-06 호, 90일 지난 보관 지면                      |
| 한국어 기사           | `https://sguys99.github.io/global-ai-news/article/1413/`          | 1413의 한국어판                                      |
| 한국어 최신 호        | `https://sguys99.github.io/global-ai-news/edition/2026-11-07/`    | 공유 미리보기 비교용                                 |

## ① Google Search Console

<https://search.google.com/search-console> → 속성 `https://sguys99.github.io/global-ai-news/` 선택.

- [ ] **사이트맵:** `Sitemaps` → "새 사이트맵 추가"에 `sitemap.xml` 입력 → 제출(이미 있어도 같은 주소로 다시 제출).
  - 성공: 상태 **"성공"**, 항목을 열면 하위 사이트맵 3개(`pages.xml`·`ko-2026.xml`·`en-2026.xml`)가 보인다. "발견된 페이지" 수는 처리 뒤 채워진다(약 2,698).
  - 기록: 상태, 하위 3개 보임 여부, 발견된 페이지 수(아직 비면 "처리 중").
- [ ] **URL 검사 → 색인 생성 요청** (하루 약 10건 한도 — 아래 순서대로 6건). 상단 검사창에 주소를 붙여넣고, 결과가 나오면 "색인 생성 요청"을 누른다.
  1. `…/en/`
  2. `…/en/edition/2026-11-07/`
  3. `…/en/search/`
  4. `…/en/article/1413/`
  5. `…/en/article/1403/`
  6. `…/en/article/1407/`
  - 성공: "URL이 Google에 등록되어 있지 않음"이어도 정상이다(새 주소). "실제 URL 테스트" → **"URL을 Google에 등록할 수 있음"**, 이어서 "색인 생성 요청됨".
  - **표준 URL 확인:** 결과의 `페이지 색인 생성 → 사용자 선언 표준 URL`이 넣은 `/en/…` 주소 그대로여야 한다. `Google 선택 표준 URL`은 색인된 뒤에만 나온다 — 비어 있으면 "아직 없음"으로 적는다. 이미 색인된 주소에서 한국어 주소가 잡히면 실패다.
  - 기록: 6건 각각 실제 URL 테스트 결과, 사용자 선언 표준 URL, (있으면) Google 선택 표준 URL.
- [ ] (며칠 뒤, 오늘은 생략 가능) `페이지` 보고서의 `/en/` 색인 수, `향상 → 기사` 보고서.
- 실패하면: 사이트맵 "가져올 수 없음" → 브라우저로 주소가 열리는지 보고 하루 뒤 다시 제출. 표준 URL이 한국어로 잡힘 → [6-3 §1-3](../phase6/6-3-search-engines.md#1-google-search-console) 메모와 함께 그대로 회신한다(코드 쪽 확인 필요).

## ② Bing Webmaster Tools

<https://www.bing.com/webmasters> → Microsoft 계정 로그인.

- [ ] 사이트가 없으면 **"Import from Google Search Console"** → 같은 Google 계정 연결 → `https://sguys99.github.io/global-ai-news/` 선택해 가져온다. 이미 있으면 건너뛴다.
  - 성공: 사이트 목록에 `sguys99.github.io/global-ai-news/`가 "확인됨"으로 보인다.
  - 기록: 가져온 사이트 수·이름, 확인 상태.
- [ ] `Sitemaps`에 `https://sguys99.github.io/global-ai-news/sitemap.xml`이 있는지 본다(없으면 "Submit sitemap"). 기록: 상태, 발견된 URL 수.
- [ ] `URL Submission`에 두 줄 제출: `https://sguys99.github.io/global-ai-news/en/`, `https://sguys99.github.io/global-ai-news/en/edition/2026-11-07/`. 기록: 남은 일일 할당량.
- [ ] `IndexNow` 메뉴: 받은 URL 수를 본다. 11-06(47개·202)·11-07(44개·200)에 보냈지만 사이트 등록 전 전송분은 안 보일 수 있다 — 0이면 "0"으로 적고 며칠 뒤 다시 본다.
- 실패하면: 가져오기가 안 되면 "Add your site manually" → URL 입력 → 확인 방법은 GSC 연결 또는 XML 파일. XML 파일 방식은 루트 저장소(`sguys99.github.io`)에 파일을 올려야 하므로 회신해 준다. 나머지는 [6-3 §2](../phase6/6-3-search-engines.md#2-bing-webmaster-tools).

## ③ 네이버 서치어드바이저

<https://searchadvisor.naver.com/console/board> → 사이트 `https://sguys99.github.io` 선택(호스트 단위로 이미 등록됨).

- [ ] `요청 → 사이트맵 제출` 목록에서 `global-ai-news/sitemap.xml` 항목의 **최근 수집 결과**를 본다. 항목이 없으면 `global-ai-news/sitemap.xml`을 입력해 제출한다.
  - 성공: 수집 상태 "성공"(또는 정상), 수집 일시가 11-06 이후.
  - 기록: 상태, 수집 일시, 오류 문구(있으면 그대로).
- [ ] 결과가 **오류**거나 인덱스를 못 읽으면 조각 2개를 따로 제출한다: `global-ai-news/sitemaps/ko-2026.xml`, `global-ai-news/sitemaps/pages.xml`. 영어 조각·`/en/feed.xml`은 네이버에 내지 않는다([6-3 §4](../phase6/6-3-search-engines.md#4-네이버-서치어드바이저)).
- [ ] (선택) `요청 → RSS 제출` 목록에 `global-ai-news/feed.xml`(한국어)만 있는지 본다.

## ④ 리치 결과 테스트

아래 링크를 열면 주소가 들어간 채로 테스트가 시작된다(안 되면 <https://search.google.com/test/rich-results>에 주소를 붙여넣는다).

- [ ] 영어 기사: <https://search.google.com/test/rich-results?url=https%3A%2F%2Fsguys99.github.io%2Fglobal-ai-news%2Fen%2Farticle%2F1413%2F>
- [ ] 영어 보관 기사: <https://search.google.com/test/rich-results?url=https%3A%2F%2Fsguys99.github.io%2Fglobal-ai-news%2Fen%2Farticle%2F68%2F>
- [ ] 한국어 기사: <https://search.google.com/test/rich-results?url=https%3A%2F%2Fsguys99.github.io%2Fglobal-ai-news%2Farticle%2F1413%2F>
- 성공: "유효한 항목 감지됨"에 **기사(Article) 1개 유효**. 경고(선택 필드 누락 등)는 그대로 둔다 — 보관 기사의 description·전용 썸네일 없음은 일부러 뺀 것이다.
- 기록: 각 주소의 유효 항목 이름·개수, 경고 수와 경고 문구, 오류(있으면 문구 그대로).
- (선택) <https://validator.schema.org/#url=https%3A%2F%2Fsguys99.github.io%2Fglobal-ai-news%2Fen%2F>에서 `/en/` `WebSite` 오류 0.

## ⑤ 공유 미리보기 (선택)

넣을 주소: `https://sguys99.github.io/global-ai-news/en/edition/2026-11-07/`, 비교용 `https://sguys99.github.io/global-ai-news/edition/2026-11-07/`.

- [ ] 카카오 공유 디버거 <https://developers.kakao.com/tool/debugger/sharing> (예전 결과가 보이면 "캐시 초기화").
- [ ] LinkedIn Post Inspector <https://www.linkedin.com/post-inspector/>.
- [ ] X는 카드 검사기가 미리보기를 더는 보여 주지 않는다 — 글쓰기 창에 주소만 붙여 카드가 뜨는지 보고 게시하지 않는다.
- 성공(영어 호): 제목 "METR finds Anthropic's model development pace roughly doubled, driven by AI-assisted research", 설명 "AI Daybook · Sat, Nov 7, 2026 · No. 144 — …", 이미지 = 영어 호 썸네일(`og/en/edition/2026-11-07.png`). 한국어 호는 한국어 제목("METR 감시 보고, …")·한국어 썸네일 그대로.
- 기록: 도구별로 영어 제목·이미지가 나왔는지, 한국어 호가 그대로인지.

## 결과 회신 양식

아래를 채워 그대로 붙여 준다. 모르는 칸은 "-"로 둔다.

```text
[8-1 검색엔진 등록 결과 — 2026-11-__]
① GSC
- 사이트맵: 상태=____ / 하위 3개 보임=예·아니오 / 발견된 페이지=____
- URL 검사(실제 URL 테스트 / 사용자 선언 표준 / Google 선택 표준 / 색인 요청):
  /en/                     : ____ / ____ / ____ / 요청함·실패
  /en/edition/2026-11-07/  : ____ / ____ / ____ / ____
  /en/search/              : ____ / ____ / ____ / ____
  /en/article/1413/        : ____ / ____ / ____ / ____
  /en/article/1403/        : ____ / ____ / ____ / ____
  /en/article/1407/        : ____ / ____ / ____ / ____
② Bing
- 사이트: 가져옴·이미 있음·수동 추가 / 확인 상태=____
- 사이트맵: 상태=____ / 발견 URL=____
- URL 제출 2건: 성공·실패 / 남은 할당량=____
- IndexNow 받은 URL 수=____
③ 네이버
- global-ai-news/sitemap.xml: 상태=____ / 수집 일시=____ / 오류 문구=____
- 조각 따로 제출: 안 함·함(결과=____)
④ 리치 결과 (유효 항목·개수 / 경고 수 / 오류)
- /en/article/1413/ : ____ / ____ / ____
- /en/article/68/   : ____ / ____ / ____
- /article/1413/    : ____ / ____ / ____
⑤ 공유 미리보기 (선택)
- 카카오: 영어 제목·썸네일 정상=예·아니오 / 한국어 호 그대로=예·아니오
- LinkedIn: ____ / X: ____
기타 메모:
```
