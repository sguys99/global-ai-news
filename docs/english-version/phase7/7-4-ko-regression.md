# Phase 7-4 한국어 회귀 비교 — 출시 전후 한국어 페이지 차이 (2026-11-06)

> 체크리스트 항목: "한국어 회귀 비교(3-1)에서 6-1의 메타 변경 외에 차이가 없는지 확인한다."

## 결론

- **통과.** 출시 전(`232bbfc`)과 출시 후(`c024ced`)의 한국어 페이지 차이는 계획한 두 묶음뿐이다. 하나는 5-3 언어 전환(hreflang ko·en 쌍, `EN` 링크)이고, 다른 하나는 6-1·6-2 메타(한국어만 남긴 제목·설명, x-default, `og:locale:alternate`, 사이트맵 인덱스, RSS 채널 설명)다. 그 밖의 차이는 허용 페이지인 404의 5-2 계획 변경뿐이다.
- **대표 페이지(3-1 방식) 12쪽 × 두 목록:** 차이는 모두 위 분류에 들어간다. 예상 밖 줄은 0이다.
- **전수 비교:** 한국어 HTML **1,338쪽 전부**(기사 982·보관 기사 317·호 32·보관 호 3·홈·검색·404·`404/index.html`)를 같은 정규화로 비교했다. 서명은 9종이고 **예상 밖 줄이 있는 페이지는 0쪽**이다. 한쪽 빌드에만 있는 한국어 페이지도 없다(1,338 = 1,338).
- **본문 무변화:** 바뀐 줄은 `<head>` 메타, 셸의 `EN` 링크 3곳(보관 지면은 머리 띠 1곳), 홈 WebSite JSON-LD 설명뿐이다. 1면·섹션·색인·기사 본문·사건 타임라인·푸터 문구는 한 줄도 바뀌지 않았다. canonical·og:url·og:locale(`ko_KR`)·og:title·og:image·기사 설명·NewsArticle JSON-LD도 그대로다.
- **RSC 페이로드:** `index.txt` 34쪽과 인라인 `__next_f` 1,018쪽의 내용 차이도 위 메타 행뿐이다. 나머지는 head 요소 key 번호와 행 참조 번호가 밀린 것이다. `EN` 링크는 `ShellChrome` 섬이 SSR로만 그리므로 RSC에는 싣지 않는다(5-3 "페이지 RSC 참조 추가 없음"과 같다).
- **한국어 사이트맵 URL 1,336건**은 `sitemaps/pages.xml` + `ko-2026.xml`로 옮겨졌다. 출시 전 `sitemap.xml`과 비교해 URL 집합과 lastmod가 모두 같다. 추가된 것은 `xhtml:link`뿐이다.

## 1. 비교 대상

| 항목           | 기준(출시 전, 한국어 독자가 보던 것)                                                    | 후보(영어판 출시, 현재 배포)                                                           |
| -------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 커밋           | `232bbfc` (`deploy/github-pages`, PR #9 병합 첫 부모)                                   | `c024ced` (PR #9 `feat/en-pages` 병합)                                                 |
| 산출물         | `data/regress/out-p7-base` (Docker 캐시 적중 빌드)                                      | `data/regress/out-p7`                                                                  |
| DB             | `data/app.db` sha256 `1a239717b76c1f1d9e24f09a8a45699e75aa6dfb37f8e202b7880e8dd54ab94b` | 같은 DB(두 `.regress-build.json` 일치, 현재 작업 트리 DB와도 같음)                     |
| 비-`/en/` 파일 | 1,701                                                                                   | 1,911(+ 영어 썸네일 182·사이트맵 조각 3·영어 색인 10·IndexNow 키 1, `_next` 해시 교체) |

도구는 `npm run regress:html -- compare`(정규화 `scripts/lib/htmlRegress.ts` `normalizeHtml`, class 포함 전체 모드)다. 전수 비교는 같은 `normalizeHtml`·`diffLines`를 불러 쓰는 일회성 스크립트로 했다(스크래치 `regress-p7/sweep.ts`, RSC는 `rsc.py`, git 제외).

## 2. 대표 페이지 (3-1 방식, `--allow 404.html`)

두 목록으로 돌렸다.

- **고정 목록** `configs/html-regress-pages.json`: 3-1에서 날짜·id로 고정한 목록이고, Phase 3-4·4·5·6이 쓴 것과 같다. 이 파일은 커밋이 1개(`775556d`)뿐이므로 목록을 고정해 두고 다시 쓰는 것이 정해진 방식이다.
- **새 목록**: `select`로 현재 DB·`out-p7`에서 새로 골랐다(스크래치 `fresh-manifest.json`, `configs/`는 건드리지 않았다). 홈, 호 11-06·11-01, 기사 1358·1398·1250·1395·1396, 검색, 404, sitemap, feed다.

도구의 종료 코드는 1(차이 11쪽)이다. 6-1·6-2의 메타 변경이 계획된 차이라서 그렇다. 아래 표는 바뀐 줄을 분류한 결과다.

| 페이지                               | 고정 목록 | 새 목록 | (a) 5-3 언어 전환                | (b) 6-1·6-2 메타                                                                                                             | 예상 밖                          |
| ------------------------------------ | --------- | ------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 홈 `index.html`                      | +10 −3    | +10 −3  | hreflang ko·en, `EN` ×3          | 제목 `· Daily AI News Briefing` 제거, meta description·WebSite JSON-LD 설명 영어 문장 제거, x-default, `og:locale:alternate` | 0                                |
| 호(11-04 / 11-06)                    | +8 −1     | +8 −1   | hreflang ko·en, `EN` ×3          | meta description 영어 문장 제거, x-default, `og:locale:alternate`                                                            | 0                                |
| 호 11-01(일요일)                     | +8 −1     | +8 −1   | 같음                             | 같음                                                                                                                         | 0                                |
| 기사(영어 짝 있음) 5건 / 4건         | +7 −0     | +7 −0   | hreflang ko·en, `EN` ×3          | x-default, `og:locale:alternate`                                                                                             | 0                                |
| 기사 1396(논문, 영어 없음 — 새 목록) | —         | +3 −0   | `EN` ×3(→ `/en/`), hreflang 없음 | 없음(짝이 없으면 넣지 않는다 — 6-2 규칙)                                                                                     | 0                                |
| 검색                                 | +10 −3    | +10 −3  | hreflang ko·en, `EN` ×3          | meta·og·twitter description 영어 문장 제거, x-default, `og:locale:alternate`                                                 | 0                                |
| 404(허용)                            | +8 −5     | +8 −5   | `EN` ×3                          | —                                                                                                                            | 0 — 나머지는 5-2 계획 변경(아래) |
| `sitemap.xml`                        | +16 −5347 | 같음    | —                                | `<urlset>` → `<sitemapindex>`(조각 3개). 한국어 URL은 §4에서 따로 확인                                                       | 0                                |
| `feed.xml`                           | +1 −1     | 같음    | —                                | 채널 `<description>` 영어 문장 제거(항목 60건은 같음)                                                                        | 0                                |

**404의 나머지 차이(허용 페이지, 5-2 계획 변경):** 영어 단의 `Today's issue`·`Search past stories` 링크가 `/` → `/en/`, `/search/` → `/en/search/`로 바뀌었다. 이것은 5-2 "`NotFoundNotice`의 `NOT_FOUND_EN_LINK_LOCALE`을 `"en"`으로" 항목이다(`src/components/NotFoundNotice.tsx:12`). 상태 줄 세 `span`에는 `/en/` 아래에서 순서를 바꾸는 `order-*`·`lang-en:*` 클래스가 붙었다(`NotFoundNotice.tsx:68-76`). 한국어 단의 링크와 문구는 그대로다.

## 3. 전수 비교 — 서명별 페이지 수

바뀐 줄을 규칙으로 분류했다. `+a:…`·`+b:…`는 추가된 줄 수다. 어떤 규칙에도 맞지 않는 줄은 `UNEXPECTED`로 따로 셌다. 규칙은 경로까지 검사한다. 예를 들어 hreflang 줄은 `SITE/(en/)?(article/N/|edition/날짜/|search/|)` 형태만 통과한다.

| 페이지 수 | 종류                       | 서명                                                                                                    |
| --------: | -------------------------- | ------------------------------------------------------------------------------------------------------- |
|       973 | 기사                       | hreflang ko·en + x-default + `og:locale:alternate` + `EN` 헤더·모바일 바·푸터                           |
|       310 | 보관 기사                  | hreflang ko·en + x-default + `og:locale:alternate` + 머리 띠 `EN`(→ 같은 영어 기사)                     |
|        32 | 호                         | hreflang ko·en + x-default + `og:locale:alternate` + `EN` ×3 + meta description 영어 문장 제거          |
|         9 | 기사(영어 없음)            | `EN` ×3(→ `/en/`)만                                                                                     |
|         7 | 보관 기사(영어 없음)       | 머리 띠 `EN`(→ `/en/`)만                                                                                |
|         3 | 보관 호(06-07·06-09·07-07) | hreflang ko·en + x-default + `og:locale:alternate` + 머리 띠 `EN`(→ 같은 영어 호) + 설명 영어 문장 제거 |
|         2 | 404·`404/index.html`       | `EN` ×3 + 404 5-2 계획 변경(링크 2·`span` 3)                                                            |
|         1 | 홈                         | hreflang ×2 + x-default + `og:locale:alternate` + `EN` ×3 + 제목 + 설명 2줄(meta·JSON-LD)               |
|         1 | 검색                       | hreflang ×2 + x-default + `og:locale:alternate` + `EN` ×3 + 설명 3줄(meta·og·twitter)                   |
| **1,338** |                            | **예상 밖 줄이 있는 페이지 0**                                                                          |

추가 확인:

- **hreflang 짝 검증(후보 1,336쪽, 404 제외):** 짝이 있는 1,320쪽은 모두 `ko` = 자기 주소, `en` = `x-default` = `/en/` 같은 경로다. 그 영어 파일은 `out-p7/en/`에 실제로 있다. 짝이 없는 16쪽은 모두 영어 본문이 없는 기사다(1396·1368·1255·1188·757·703·670·485·471·301·221·155·27·25·23·22). DB 게재 수 ko 1,299 − en 1,283 = 16과 맞고, 이 16쪽에 대응하는 영어 파일은 없다.
- **보관 지면의 전환 링크:** 보관 지면은 셸이 없어 클래스가 `sh-ln`인 머리 띠 링크 1개만 나온다(`src/lib/archivePage.ts:312` `localeSwitchLink`). 짝이 있으면 같은 영어 페이지로, 없으면 `/en/`으로 간다. 이는 5-3 "보관 지면도 머리 띠에 정적 전환 링크 + hreflang"과 같다.
- **바뀌지 않은 것:** canonical(전부 자기 주소 그대로), og:url, `og:locale` `ko_KR`, og:title·og:image·og:image:alt, 기사 meta description·og:description(기사 요약), `article:*`, twitter 제목, NewsArticle JSON-LD, 본문 마크업과 class 전부.

## 4. HTML 밖 산출물

| 대상                                | 결과                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 한국어 사이트맵 URL                 | 출시 전 `sitemap.xml` 1,336건 = 후보 `pages.xml` + `ko-2026.xml`의 한국어 1,336건. 빠진 것·늘어난 것 0, lastmod 차이 0. 추가된 것은 `xhtml:link`(6-2)뿐 |
| `feed.xml`                          | 채널 설명 1줄만 다르다(항목 동일)                                                                                                                       |
| `search-index/ko/`·`feed-index/ko/` | 바이트 동일(`diff -rq`)                                                                                                                                 |
| `latest.json`                       | 값 차이는 `generatedAt`(빌드 시각)뿐이다. `c024ced`에는 아직 `titleEn`이 없다(b141b88에서 추가)                                                         |
| `og/`(한국어 PNG)·아이콘·`fonts/`   | 바이트 동일                                                                                                                                             |

## 5. RSC 페이로드

Flight 행을 파싱해 모듈 참조(`I`)·힌트(`HL`) 행은 뺐다. 남은 행의 JSON 문자열 토큰은 빌드 id·`_next/static` 경로·행 참조(`$L1f` 등)·폰트 해시·useId를 가린 다중집합으로 만들어 비교했다.

- **`index.txt` 34쪽(홈·검색·호 32, 보관 호는 `.txt` 없음):** 34쪽 모두 바뀌었다. 차이 토큰은 metadata 행의 hreflang `link` 3개(`ko`·`en`·`x-default`), `og:locale:alternate`/`en_US`, 사이트 설명 영어 문장 제거, 그리고 head 요소 key 번호(`"22"`~`"25"`)가 밀린 것이다. 홈에만 제목과 WebSite JSON-LD 설명 교체가 더 있다. 그 밖의 토큰은 0이다.
- **인라인 `__next_f` 1,018쪽(보관 지면 320쪽은 RSC 없음):** 1,007쪽은 위와 같은 메타 토큰만 다르다. 기사는 자기 hreflang URL 2개와 key 번호 `"26"`~`"32"`, 참조 번호 증감이 더해진다. 영어 짝이 없는 기사 9쪽은 마스킹 뒤 완전히 같다. 404 2쪽은 §2의 5-2 변경(클래스 문자열, `/en/`·`/en/search` 링크, 셸 prop `localeFromDocument`, `src/app/SiteShell.tsx:29`)이다.
- **예상 밖 내용 차이는 없다.** 본문 데이터(1면·섹션·색인 행·기사 카드)의 문자열 토큰은 두 빌드에서 같다.

## 6. 재현

```bash
# 대표 페이지 — 고정 목록
npm run regress:html -- compare data/regress/out-p7-base data/regress/out-p7 --allow 404.html
# 대표 페이지 — 새 목록(select 는 better-sqlite3 → Node 24)
PATH=$HOME/.nvm/versions/node/v24.13.0/bin:$PATH npx tsx scripts/html-regress.ts select data/regress/out-p7 --manifest <스크래치>/fresh-manifest.json
npm run regress:html -- compare data/regress/out-p7-base data/regress/out-p7 --manifest <스크래치>/fresh-manifest.json --allow 404.html
```

전수 비교(`sweep.ts`, 1,338쪽 약 80초)와 RSC 비교(`rsc.py`, 약 6초)는 스크래치 `regress-p7/`에 있는 일회성 스크립트다. 결과는 `sweep.json`·`rsc.json`에 있다. 다시 쓸 일이 생기면 `scripts/html-regress.ts`에 `sweep` 하위 명령으로 옮기는 것을 검토한다(Phase 9 후보, 이번에는 하지 않았다).
