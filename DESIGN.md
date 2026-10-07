---
version: 2.0
name: Daily-AI-Brief-design
identity: Edition
status: "확정 (2026-10-04, 시안 B 선택) — 구현: src/app/globals.css"
description: >-
  매일 발행되는 한 호(號)처럼 읽히는 에디토리얼 AI 뉴스 브리핑. 뉴스프린트 종이와 잉크,
  코발트 단일 강조, 굵은 잉크 괘선, 한글 세리프(Hahmlet) 헤드라인과 Pretendard 본문.
  편집 위계(마스트헤드 → 1면 → 섹션 밴드 → 전체 기사)와 데이터 신호(중요도·화제 지수·분야)가
  시각 언어다. v1(무채색 균일 카드 그리드)을 전면 대체한다.

colors:
  # Light (:root)
  background: "#f4f4f1" # paper
  foreground: "#141519" # ink
  foreground-soft: "#3a3c43" # ink-2 (요약·리드문)
  card: "#fbfbf9" # sheet
  primary: "#141519" # 채움 버튼 = 잉크
  primary-foreground: "#f4f4f1"
  secondary: "#eaeae5"
  muted: "#eaeae5"
  muted-foreground: "#66686f"
  accent: "#eaeae5" # hover 표면
  brand: "#2140e8" # cobalt
  brand-foreground: "#ffffff"
  brand-soft: "rgb(33 64 232 / 0.08)"
  destructive: "#c8102e"
  border: "#d8d8d2" # hairline rule
  input: "#c9c9c2"
  rule: "#141519" # 굵은 잉크 괘선
  ring: "#2140e8"
  # Dark (.dark)
  background-dark: "#0f1118"
  foreground-dark: "#eceae4"
  foreground-soft-dark: "#bcbbb5"
  card-dark: "#151823"
  primary-dark: "#eceae4"
  primary-foreground-dark: "#0f1118"
  secondary-dark: "#1c1f2b"
  muted-foreground-dark: "#8d8f9a"
  brand-dark: "#93a3ff"
  brand-foreground-dark: "#0f1118"
  destructive-dark: "#ff6b6b"
  border-dark: "#2a2d39"
  input-dark: "#3a3e4d"
  rule-dark: "#eceae4"
  ring-dark: "#93a3ff"

typography:
  serif: "var(--font-hahmlet), Noto Serif KR, AppleMyungjo, Batang, serif" # 제호·헤드라인
  sans: "var(--font-pretendard), Pretendard Variable, -apple-system, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
  nameplate:
    {
      size: "clamp(48px, 8.4vw, 120px)",
      lineHeight: 0.95,
      tracking: -0.045em,
      family: serif,
      weight: 800,
    }
  display-xl:
    {
      size: "clamp(34px, 4.6vw, 60px)",
      lineHeight: 1.14,
      tracking: -0.045em,
      family: serif,
      weight: 700,
      use: "리드 제목",
    }
  display-lg:
    {
      size: "clamp(30px, 3.6vw, 44px)",
      lineHeight: 1.2,
      tracking: -0.04em,
      family: serif,
      weight: 800,
      use: "상세·검색·필터 결과 h1",
    }
  display-md:
    {
      size: "clamp(26px, 2.6vw, 30px)",
      lineHeight: 1.2,
      tracking: -0.045em,
      family: serif,
      weight: 800,
      use: "섹션 밴드",
    }
  headline:
    {
      size: 21px,
      lineHeight: 1.38,
      tracking: -0.035em,
      family: serif,
      weight: 700,
      use: "서브 리드·섹션 대표",
    }
  dek: { size: 19px, lineHeight: 1.7, use: "리드문·상세 요약" }
  body: { size: 17px, lineHeight: 1.75, use: "상세 원문 발췌" }
  title: { size: 16px, lineHeight: 1.5, weight: 600, use: "목록 항목 제목" }
  caption: { size: 14px, lineHeight: 1.55, use: "요약·필터·내비" }
  meta: { size: 13px, lineHeight: 1.4, use: "바이라인·키커·칩" }
  label: { size: 12px, lineHeight: 1.3, use: "필드 라벨·보조 표기" }

rounded:
  sm: 6px
  md: 10px
  lg: 12px # --radius (shadcn 입력·버튼 기본)
  xl: 16px # 모바일 시트 상단
  pill: 9999px # 칩·CTA·더 보기

layout:
  container-feed: 1240px
  container-article: 720px
  gutter: "16px (mobile) / 32px (md+)"
  header-h: 52px
  tabbar-h: 56px
---

# Daily AI Brief — DESIGN v2

> **SSOT:** 토큰의 실제 값은 [src/app/globals.css](src/app/globals.css)가 단일 출처이며 본 문서는 그것을 서술한다.
> v1(“모노크롬·균일 카드 그리드”)은 v2로 **전면 대체**된다. v1의 원칙 중 계승되는 것은 §2 말미에 명시한다.
> 컴포넌트 구현 위치: `Masthead`·`Edition`(1면·화제·섹션)·`Story`(4개 변형)·`StoryIndex`·`ArticleMeta`(신호)·`FilterBar`·`HeaderWordmark` — 모두 `src/components/`.

## 1. 개정 배경

v1 화면에 대한 피드백(2026-10-04)은 네 가지로 수렴한다.

| 문제               | v1의 원인                              | v2의 처방                                         |
| ------------------ | -------------------------------------- | ------------------------------------------------- |
| 색이 없어 밋밋함   | 브랜드 강조색·유채색 금지 규칙         | 아이덴티티별 **강조색 체계 도입**(§9)             |
| 위계가 없음        | 170건을 같은 카드·같은 크기로 3열 나열 | **편집 위계 IA**(§3): 리드 → 랭킹 → 섹션 → 스트림 |
| 개성/브랜드가 없음 | 템플릿형 헤더·워드마크, 단일 서체      | **마스트헤드**·전용 서체 페어링·고유 표기 체계    |
| 정보 밀도·리듬     | 모든 카드 동일 패딩/동일 정보량        | 카드 **변형(L/M/S/Row)** 으로 밀도에 강약         |

## 2. 디자인 원칙

1. **위계가 먼저다.** 첫 화면에서 “오늘 무엇이 중요한가”가 3초 안에 읽혀야 한다. 가장 중요한 기사 1건은 다른 기사보다 명백히 크다.
2. **데이터가 곧 장식이다.** 이미지가 없는 뉴스 피드이므로, 시각적 풍부함은 LLM이 만든 신호(중요도 1–5, 트렌딩 0–100, 카테고리 6종, 소스 10곳)에서 나온다. 의미 없는 장식(임의의 번호·이모지·장식 그라데이션)은 쓰지 않는다.
3. **대담함은 한 곳에.** 각 아이덴티티는 강조 요소(서체 / 색 / 레이아웃 중 하나)에 대담함을 집중하고 나머지는 조용하게 둔다.
4. **라이트·다크 동등.** 두 테마는 단순 반전이 아니라 각각 설계한다. 모든 색은 `:root` / `.dark` 쌍으로 정의한다.
5. **정적 export 친화.** 런타임 데이터 없음, 이미지 없음, 서체는 자체 호스팅(빌드타임 다운로드). 첫 페인트에 모든 콘텐츠가 보인다(애니메이션은 보이는 상태에서 시작).

**v1에서 계승:** Pretendard(한글 본문), shadcn 변수 **이름** 유지(값만 교체), `next-themes` `.dark` 클래스, 모바일 앱 셸(상단 바 + 하단 탭 바 + 필터 바텀시트 + safe-area), 44px 터치 타깃, `prefers-reduced-motion` 무력화.
**v1에서 폐기:** “강조색 금지”, “그림자 절대 금지”(아이덴티티가 허용하면 1단계 사용 가능), “모든 카드 동일 18px 라운드”, “카드 균일 그리드가 피드의 전부”.

## 3. 정보 구조 (피드 홈 `/`)

필터가 **없을 때**(기본 진입) 홈은 편집 지면으로 구성된다.

```
┌ Masthead ──────────────────────────────────────────────┐
│ 워드마크 · 발행일(최신 수집일) · 에디션 통계(기사 N · 소스 M) │
├ Lead ─────────────────────────────┬ Trending Top 10 ───┤
│ [L] 리드 스토리 1건 (가장 큼)        │ 1 ─────────── 70   │
│ [M][M] 서브 리드 2–4건              │ 2 ────────── 67    │
│                                    │ … (순위 = 정보)     │
├ Category Sections ─────────────────┴────────────────────┤
│ 카테고리별 헤더(건수) + 상위 3–4건 [S] — 6개 섹션           │
├ All Stories (스트림) ───────────────────────────────────┤
│ 필터 바(정렬·소스·태그) + 전체 기사 [Row] 리스트/그리드       │
└────────────────────────────────────────────────────────┘
```

| 영역     | 선정 규칙 (코드 기준)                                                   | 비고                                                      |
| -------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| Lead     | `importance DESC, trendingScore DESC, publishedAt DESC` 상위 1 + 다음 3 | 편집 판단(LLM 중요도)                                     |
| Trending | `trendingScore DESC` 상위 10, `trendingScore > 0`만                     | 커뮤니티 신호(HN·Reddit·GitHub)                           |
| Category | 카테고리별 Lead 정렬 상위 4, 1면에 실린 기사 제외                       | 빈 카테고리는 섹션 생략, "섹션 전체 보기" → `/?category=` |
| Stream   | `filterAndSortFeed` (기본 정렬 = 화제순)                                | 30건씩 "더 보기"(`StoryIndex`)                            |

- **필터 모드:** `?category=`·`?source=`·`?tag=` 중 하나라도 있으면 마스트헤드·1면·섹션을 생략하고 결과 헤더(조건 · 건수 · 모두 해제) + 결과 목록만 보여 준다. `?sort=`만 있으면 지면을 유지하고 전체 기사 목록만 재정렬한다(링크에 `#all` 앵커).
- 선정 로직은 순수 함수 `buildEdition()`([src/lib/edition.ts](src/lib/edition.ts))이 단일 출처이며 단위 테스트로 고정한다.
- **랭킹 번호는 실제 순위**이므로 번호를 쓴다. 다른 곳에서는 장식용 번호(01/02/03)를 쓰지 않는다.
- 기존 URL 계약(`source`/`tag`/`sort`/`q`)은 그대로이고 `category`만 추가됐다. 상세(`/article/[id]`)는 신호 패널·원제·같은 분야 기사 4건을 더한다.

## 4. 신호 시각화 규칙

| 신호                   | 범위           | 표현                                         | 규칙                                                                     |
| ---------------------- | -------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| 중요도 `importance`    | 1–5 (0=미가공) | **5칸 세그먼트 미터**                        | 채운 칸 = 값. 4–5는 강조색. 0이면 미표시. 스크린리더 텍스트 `중요도 4/5` |
| 트렌딩 `trendingScore` | 0–100          | 숫자 + **수평 바**(랭킹), 카드에선 숫자 배지 | 0이면 미표시. 바 길이 = 값/100 (스케일 고정)                             |
| 카테고리 `category`    | 6종            | 아이덴티티별 표기(코드 / 한글 키커 / 색 칩)  | 아래 표시명 맵 사용. 빈 값이면 미표시                                    |
| 소스 `source.name`     | 10곳           | 메타 행 첫 요소                              | 칩에서는 축약명 맵(기존 `SOURCE_SHORT_LABEL`)                            |
| 날짜 `publishedAt`     | ISO            | `MM.DD` (카드) / `YYYY.MM.DD` (상세)         | 마스트헤드는 `YYYY년 M월 D일 (요일)`                                     |

**카테고리 표시명 맵** (데이터 값은 불변, 표시만 변환):

| 데이터 값         | 한글 표시명 | 코드(3–4자) |
| ----------------- | ----------- | ----------- |
| `Language Models` | 언어 모델   | LLM         |
| `Agents`          | 에이전트    | AGT         |
| `Dev Tools`       | 개발 도구   | DEV         |
| `MLOps`           | MLOps       | OPS         |
| `연구·논문`       | 연구·논문   | RES         |
| `산업·정책`       | 산업·정책   | BIZ         |

## 5. 컴포넌트 해부

| 컴포넌트                      | 구성                                                                   | 쓰임                            |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `masthead`                    | 워드마크 · 발행일 · 에디션 통계 · (데스크톱) 섹션 내비                 | 홈 최상단. 전역 헤더와 별개     |
| `story-lead` (L)              | 카테고리 표기 · 대형 제목 · 요약 2–3줄 · 메타(소스·날짜·중요도·트렌딩) | 리드 1건                        |
| `story-card` (M)              | 카테고리 · 제목 · 요약 2줄 · 메타                                      | 서브 리드                       |
| `story-compact` (S)           | 카테고리(섹션 안에서는 생략) · 제목 · 메타 1줄                         | 카테고리 섹션                   |
| `story-entry` (Row)           | 날짜 칼럼 · 키커 · 제목 · 요약 2줄 · 소스·중요도·화제                  | 스트림·검색 결과·상세 관련 기사 |
| `rank-item`                   | 순위 · 제목 · 소스 · 트렌딩 바                                         | Trending Top 10                 |
| `section-header`              | 섹션명 · 건수 · (선택) 보조 링크                                       | 각 섹션 상단                    |
| `importance-meter`            | 5칸 세그먼트                                                           | 카드 메타                       |
| `category-label`              | 아이덴티티별 표기                                                      | 모든 카드                       |
| `filter-bar` / `filter-sheet` | v1 구조 유지, 스타일만 교체                                            | 스트림 상단 / 모바일 시트       |
| `article-detail`              | 카테고리 · 대형 제목 · 신호 패널 · 요약 · 원문 발췌 · CTA              | `/article/[id]`                 |

모든 카드는 전체가 하나의 링크(`/article/[id]`)이며 포커스 링이 보인다.

## 6. 레이아웃 & 반응형

- 컨테이너: 피드·검색 `max-w-[1240px]`, 상세 본문 `max-w-[720px]`(읽기 폭 ≈ 65자). 좌우 여백 16px → `md` 32px.
- 피벗은 v1과 같이 **`md`(768px)**: 데스크톱 헤더 ↔ 모바일 상단 바 + 하단 탭 바.
- Lead 영역: `lg` 이상 2열(리드 8 : 랭킹 4), 미만 1열(리드 → 랭킹 순 적층).
- Category 섹션 밴드: `lg` 4열(대표 1.5fr + 3) / `md` 2열 / 모바일 1열(대표 외 요약 생략).
- 스트림: 모바일 1열, `lg` 이상 2열 색인(`StoryEntry`).
- safe-area·44px 터치 타깃·하단 탭 바 여백은 v1 규칙 그대로.

## 7. 모션

- 첫 로드에 한해 섹션 단위 **스태거 리빌**(opacity·translateY 8px, 40ms 간격, 총 ≤ 400ms). 정적 첫 프레임에서도 콘텐츠는 보인다(애니메이션은 `from` 상태가 아니라 보이는 상태에서 시작하는 fade-up만 사용).
- 호버: 카드 제목 밑줄/색 전환, 랭킹 바 강조. 150–200ms `ease-out`.
- `prefers-reduced-motion: reduce`에서 전부 제거.

## 8. 접근성

- 본문 대비 WCAG AA(4.5:1) 이상, 큰 제목 3:1 이상. 강조색 위 텍스트도 동일 기준.
- 신호(중요도·트렌딩)는 색만으로 전달하지 않는다(숫자·칸 수·`aria-label` 병행).
- 랭킹은 `<ol>`, 섹션은 `<section aria-labelledby>`, 카드 링크에는 제목이 접근 가능한 이름이 된다.

## 9. 비주얼 아이덴티티 — Edition (확정)

> 2026-10-04 시안 A(Signal)·B(Edition)·C(Spectrum) 중 **B Edition** 선택. 시안 원본: [docs/design/mockups/](docs/design/mockups/index.html).
> 토큰 값은 frontmatter와 [src/app/globals.css](src/app/globals.css)가 같다(globals.css가 SSOT).

**콘셉트.** 매일 아침 발행되는 한 호(號). 대형 세리프 제호, 발행일·호수 폴리오, 굵은 잉크 괘선으로 나뉜 지면.
대담함은 **헤드라인 타이포그래피** 한 곳에 두고 색은 절제한다.

### 색

| 역할     | 토큰               | Light     | Dark      | 쓰임                                                         |
| -------- | ------------------ | --------- | --------- | ------------------------------------------------------------ |
| 종이     | `background`       | `#f4f4f1` | `#0f1118` | 페이지 바탕                                                  |
| 잉크     | `foreground`       | `#141519` | `#eceae4` | 제목·본문                                                    |
| 잉크 2   | `foreground-soft`  | `#3a3c43` | `#bcbbb5` | 리드문·요약·바이라인 소스                                    |
| 흐림     | `muted-foreground` | `#66686f` | `#8d8f9a` | 날짜·보조 메타 (종이 대비 ≥ 4.5:1)                           |
| 코발트   | `brand`            | `#2140e8` | `#93a3ff` | 키커·순위 1–3·중요도 4–5·활성 밑줄·hover 제목·링크·포커스 링 |
| 괘선     | `rule`             | `#141519` | `#eceae4` | 섹션 상단 2px·마스트헤드 4px+1px·푸터 4px                    |
| 헤어라인 | `border`           | `#d8d8d2` | `#2a2d39` | 항목 구분·칼럼 세로선                                        |
| 위험     | `destructive`      | `#c8102e` | `#ff6b6b` | Admin 파괴적 동작·임계 초과만                                |

- **강조색은 코발트 하나.** 채움 버튼(원문 읽기·더 보기·활성 칩)은 잉크로 채운다 — 코발트는 "선·글자"에만.
- 다크는 단순 반전이 아닌 **심야 잉크블루** 바탕에 밝힌 코발트(`#93a3ff`).
- 그라데이션·그림자 없음. 깊이는 괘선과 헤어라인, 프로스티드 바(`bg-background/85 backdrop-blur-md`)로만.

### 서체

- **Hahmlet**(한글 세리프, 가변 100–900) — 제호·리드·서브·섹션명·순위 숫자·날짜 칼럼. `next/font/google`로 빌드타임 다운로드·자체 호스팅(unicode-range 조각 93개, 필요한 조각만 로드). `preload: false`.
- **Pretendard Variable** — 본문·메타·내비·칩. `public/fonts` 자체 호스팅.
- 한글 줄바꿈은 `word-break: keep-all` + `overflow-wrap: anywhere`(전역). 제목은 `text-wrap: balance`.
- 굵기: 세리프 700/800, 산세리프 400/600/700. 제목 자간은 음수(-0.02 ~ -0.045em).

### 형태

- 지면은 **각진 면**이 기본: 카드 박스 없이 괘선·헤어라인·칼럼 세로선으로 구획한다.
- pill은 칩·태그·CTA·"더 보기"·필터 트리거에만. 입력은 검색창처럼 **밑줄형**(2px 잉크, 포커스 시 코발트).

### 아이콘 (파비콘)

- **이니셜 "D."**(2026-10-07 시안 A 확정): 잉크 `#141519` 정사각형 + 종이색 `#f4f4f1` Hahmlet 800 **D** + 밝힌 코발트 `#93a3ff` 점(잉크 면 위라 다크 코발트 사용 — 기본 코발트는 대비 2.6:1로 16px에서 묻힘).
- 원본은 [src/app/icon.svg](src/app/icon.svg)(32단위 격자, 글자는 윤곽선 path라 폰트 의존 없음). `favicon.ico`(16·32·48)·`apple-icon.png`(180)는 이 SVG에서 래스터화한다. 잉크 면이 밝은·어두운 브라우저 모두에서 글자를 받쳐 다크 변형은 두지 않는다.
- `src/app/`의 메타데이터 파일 규약이 `<link rel="icon">`·`apple-touch-icon`을 basePath 포함으로 자동 삽입한다(`layout.tsx` 설정 불필요).

### 신호 표기 (§4 구체화)

| 신호      | Edition 표기                                                                        |
| --------- | ----------------------------------------------------------------------------------- |
| 분야      | 코발트 굵은 키커(13px, 한글 표시명)                                                 |
| 중요도    | 지름 6px 원형 도트 5칸. 채움 = 잉크, 4–5는 코발트, 빈칸 = 흐림 테두리               |
| 화제 지수 | 세리프 순위 숫자(1–3 코발트) + 2px 코발트 바(고정 0–100 스케일) + 수치              |
| 발행      | 폴리오 `YYYY년 M월 D일 요일 · 제 N호 · 기사 N건 · 매체 M곳` (N = 실패 제외 실행 수) |

### 모션

- 마스트헤드 괘선 `animate-draw`(왼쪽에서 그어짐 0.9s), 제호·리드·서브·화제 `animate-rise` 스태거(80/160/240ms).
- 헤더 워드마크: 홈에선 제호가 보이는 동안 숨기고 지나가면 페이드인(`HeaderWordmark`).
- hover는 제목 색(코발트)만 바뀐다(`story-link` 유틸리티). `prefers-reduced-motion`에서 전부 제거.

## 10. 구현 원칙

1. 토큰은 [src/app/globals.css](src/app/globals.css)의 `:root` / `.dark` / `@theme inline`에만 정의한다. 컴포넌트에 hex 하드코딩 금지.
2. shadcn 변수 이름(`--background`, `--primary` …)은 유지하고 값만 교체한다. 신규 토큰(강조·카테고리·신호)은 같은 방식으로 `:root`/`.dark` 쌍을 추가한다.
3. 서체는 `next/font`로 자체 호스팅(빌드타임 다운로드, 런타임 외부 요청 없음).
4. 신호 컴포넌트(`ImportanceMeter`, `CategoryLabel`, `TrendBar`)는 단일 구현을 피드·검색·상세가 공유한다.
5. 피드의 편집 위계 계산(리드·랭킹·섹션 선정)은 순수 함수로 분리해 단위 테스트로 고정한다.
