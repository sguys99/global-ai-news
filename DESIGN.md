---
version: 2.1
name: Daily-AI-Brief-design
identity: Edition
status: "확정 (2026-10-04, 시안 B 선택 · 2026-10-30 v2.1 콘텐츠 개편 반영) — 구현: src/app/globals.css"
description: >-
  매일 발행되는 한 호(號)처럼 읽히는 에디토리얼 AI 뉴스 브리핑. 뉴스프린트 종이와 잉크,
  코발트 단일 강조, 굵은 잉크 괘선, 한글 세리프(Hahmlet) 헤드라인과 Pretendard 본문.
  편집 위계(마스트헤드 → 1면 → 레이더 → 섹션 밴드 → 전체 기사)와 데이터 신호(중요도·화제 지수·분야·형식)가
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
  dek: { size: 19px, lineHeight: 1.7, use: "리드문·상세 요약 (1면 리드문은 md 미만 17px)" }
  body: { size: 17px, lineHeight: 1.75, use: "상세 원문 발췌" }
  title: { size: 16px, lineHeight: 1.5, weight: 600, use: "목록 항목 제목·브리핑(md+)·레이더 제목" }
  caption: { size: 14px, lineHeight: 1.55, use: "요약·필터·내비" }
  meta: { size: 13px, lineHeight: 1.4, use: "바이라인·키커·칩" }
  label: { size: 12px, lineHeight: 1.3, use: "필드 라벨·보조 표기·색인 키커" }
  badge:
    {
      size: 10.5px,
      lineHeight: 1,
      weight: 700,
      tracking: 0.09em,
      use: "형식 배지 REPO·MODEL·PAPER",
    }

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

> **v2.1 (2026-10-30)** — 콘텐츠 개편(Phase 6) 반영: 분야 6종 개편(PHY·OSS 신설, DEV·OPS 폐지), 형식 배지, 1면 11건(리드·서브·브리핑·레이더) + 지금 화제 5·'이 호의 지면', 마스트헤드 '귀'·발행 지연 줄, `cn()` 글자 크기 토큰 수정. 시안 [docs/design/mockups/front-v3.html](docs/design/mockups/front-v3.html), 결정 기록 [docs/contents-upgrade-plan.md](docs/contents-upgrade-plan.md) Phase 6.
> **SSOT:** 토큰의 실제 값은 [src/app/globals.css](src/app/globals.css)가 단일 출처이며 본 문서는 그것을 서술한다.
> v1(“모노크롬·균일 카드 그리드”)은 v2로 **전면 대체**된다. v1의 원칙 중 계승되는 것은 §2 말미에 명시한다.
> 컴포넌트 구현 위치: `Masthead`(+`IssueDelayNotice`)·`Edition`(1면·브리핑·레이더·화제·이 호의 지면·섹션)·`Story`(6개 변형)·`StoryIndex`·`ArticleMeta`(신호·형식 배지)·`FilterBar`·`HeaderWordmark` — 모두 `src/components/`. 지면 선정·통계는 [src/lib/edition.ts](src/lib/edition.ts), 레이더 메타는 [src/lib/radarMeta.ts](src/lib/radarMeta.ts).

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
2. **데이터가 곧 장식이다.** 이미지가 없는 뉴스 피드이므로, 시각적 풍부함은 LLM이 만든 신호(중요도 1–5, 트렌딩 0–100, 분야 6종)와 출처가 정한 형식(뉴스·오픈소스·모델·논문), 매체명에서 나온다. 의미 없는 장식(임의의 번호·이모지·장식 그라데이션)은 쓰지 않는다.
3. **대담함은 한 곳에.** 각 아이덴티티는 강조 요소(서체 / 색 / 레이아웃 중 하나)에 대담함을 집중하고 나머지는 조용하게 둔다.
4. **라이트·다크 동등.** 두 테마는 단순 반전이 아니라 각각 설계한다. 모든 색은 `:root` / `.dark` 쌍으로 정의한다.
5. **정적 export 친화.** 런타임 데이터 없음, 이미지 없음, 서체는 자체 호스팅(빌드타임 다운로드). 첫 페인트에 모든 콘텐츠가 보인다(애니메이션은 보이는 상태에서 시작).

**v1에서 계승:** Pretendard(한글 본문), shadcn 변수 **이름** 유지(값만 교체), `next-themes` `.dark` 클래스, 모바일 앱 셸(상단 바 + 하단 탭 바 + 필터 바텀시트 + safe-area), 44px 터치 타깃, `prefers-reduced-motion` 무력화.
**v1에서 폐기:** “강조색 금지”, “그림자 절대 금지”(아이덴티티가 허용하면 1단계 사용 가능), “모든 카드 동일 18px 라운드”, “카드 균일 그리드가 피드의 전부”.

## 3. 정보 구조 (피드 홈 `/`)

필터가 **없을 때**(기본 진입) 홈은 그날 **한 호(號)의 편집 지면**으로 구성된다. 1면·섹션은 **그 호 기사**(`created_at`의 KST 날짜 = 호 날짜, `getIssueArticles`)만 쓰고 다른 호 기사는 어떤 슬롯에도 섞지 않는다. 누적은 맨 아래 전체 기사 색인에만 둔다.

```
┌ Masthead ──────────────────────────────────────────────────┐
│ 폴리오: 발행일 · 제N호 · 매일 06:00 KST 발행 · 공유             │
│ (지연 시) 발행 전 / 발행 지연 안내 줄 — 헤어라인 사이 한 줄      │
│ 제호 Daily AI Brief              │ 귀: 이번 호 N건 · 매체 M곳   │
│                                  │     뉴스 22 · 오픈소스 3 …   │
│ 섹션 내비: 1면 · LLM · 에이전트 · … · 전체 기사                  │
├ 1면 #front (8) ─────────────────────┬ 사이드바 (4) ───────────┤
│ [L] 리드 1                           │ 지금 화제 Top 5          │
│ [M][M][M] 서브 3                     │ 이 호의 지면 (lg+)       │
│ 오늘의 브리핑 [Brief] 3행             │                          │
├ 오픈소스·논문 레이더 [Radar] 4 (전폭) ─┴──────────────────────────┤
├ 분야 섹션 밴드 — "N건 · 1면 M건" + 1면 외 상위 4 [S] ×≤6 ────────┤
├ 전체 기사 (누적 색인) — 필터 바 + [Row] 2열 ──────────────────────┤
└──────────────────────────────────────────────────────────────┘
```

| 영역          | 수         | 선정 규칙 (코드 기준, `buildEdition`)                                                                                | 비고                                                   |
| ------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 리드          | 1          | 뉴스 편집 순(`importance → trendingScore → publishedAt → id`) 1위                                                    | 뉴스 0건 호만 비뉴스 1위로 대체                        |
| 서브          | 3          | 다음 뉴스. 리드+서브 4건 안에서 같은 분야 최대 2건, 분야 3개 이상                                                    | 공유 메타·OG는 리드+서브만 쓴다                        |
| 오늘의 브리핑 | 3          | 남은 뉴스 편집 순. 리드·서브에 Physical AI가 없으면 중요도 3 이상 Physical AI 뉴스 1건 우선                          | 뉴스가 7건 미만이면 줄어든다                           |
| 레이더        | 4          | 비뉴스만. 오픈소스·모델·논문 각 1위를 먼저 담고 남은 자리는 편집 순. **표시도 편집 순**(형식별 고정 열 없음)         | 비뉴스 4건 미만이면 줄고, 0건이면 띠를 숨긴다          |
| 지금 화제     | 5          | `trendingScore DESC`, `> 0`만. 위 슬롯과 중복 허용(순위 정보)                                                        | 커뮤니티 신호(HN·GitHub·HF)                            |
| 이 호의 지면  | 분야 수    | `issueContents()` — 분야별 호 건수 · 1면 게재 수, 0건 분야 생략                                                      | lg 이상 사이드바만. 밴드가 없는 분야는 `#front`로 보냄 |
| 섹션 밴드     | 분야별 ≤ 4 | 분야별 편집 순, **1면 본문(리드·서브·브리핑·레이더) 제외**. 머리 건수는 호 전체 `count`와 `onFront`("5건 · 1면 2건") | 남은 기사가 없는 분야는 밴드와 내비에서 모두 뺀다      |
| 전체 기사     | 누적       | `filterAndSortFeed` (기본 정렬 = 화제순), 머리 "누적 N건 · 매체 M곳"                                                 | 30건씩 "더 보기"(`StoryIndex`)                         |

- **1면 본문 = 약 11건**(뉴스 축 리드 1·서브 3·브리핑 3 + 비뉴스 축 레이더 4, `frontArticles()`). 부족하면 슬롯이 줄 뿐 뉴스·비뉴스가 서로의 자리를 채우지 않고, 남는 기사는 섹션 밴드로 간다.
- **마스트헤드:** 폴리오(발행일 = 호 고정 링크 `/edition/[date]` · `제N호` · 발행 시각 · 공유) 아래 제호, 제호 옆 **'귀'**에 이번 호 통계(`issueStats()`: "이번 호 30건 · 매체 14곳" + 형식 구성 "뉴스 22 · 오픈소스 3 · 모델 2 · 논문 3", 0건 형식 생략). "오늘"이 아니라 "이번 호" — 발행이 늦은 날 "오늘"은 틀린 말이다. 태그라인은 푸터·공유 메타로 옮겼다.
- **발행 지연 줄**(`IssueDelayNotice`, 홈 전용): 정상이면 숨긴다. 오늘 호가 없으면 폴리오 아래 헤어라인 두 줄 사이에 한 줄 — 라벨(코발트, 강조 1곳)이 상태를 말한다: 1일 **"발행 전"**, 2일 이상 **"발행 지연"**(옛 라벨 "최신 호"는 폐기). 문구는 `issueDelayCopy()`, 모바일은 짧은 문구 한 줄. 빌드 시점 지연 일수를 정적 HTML에 미리 담고 마운트 후 브라우저 KST 시각으로 다시 잰다.
- **섹션 내비 순서**는 `CATEGORIES` 하나로 정한다: `1면 · LLM · 에이전트 · Physical AI · 오픈소스·도구 · 연구·논문 · 산업·정책 · 전체 기사`. 건수는 넣지 않는다(귀·이 호의 지면·섹션 머리에 이미 있다). 밴드가 없는 분야는 뺀다.
- **시각 표기:** 홈 1면·섹션 바이라인은 상대 시각(`RelativeTime`: "3시간 전"·"어제 20:12", 정적 HTML은 호 발행 시각 기준)이고, 레이더 카드는 날짜를 생략한다(논문·저장소 게시일이 수집일보다 앞서 낡아 보인다). 상세·검색·색인·지난 호(`/edition/[date]`)는 절대 날짜.
- **필터 모드:** `?category=`·`?source=`·`?tag=` 중 하나라도 있으면 마스트헤드·1면·섹션을 생략하고 결과 헤더(조건 · 건수 · 모두 해제) + 결과 목록만 보여 준다. `?sort=`만 있으면 지면을 유지하고 전체 기사 목록만 재정렬한다(링크에 `#all` 앵커).
- 선정 로직은 순수 함수 `buildEdition()`·`issueStats()`·`issueContents()`([src/lib/edition.ts](src/lib/edition.ts), `Edition.tsx`)가 단일 출처이며 단위 테스트로 고정한다.
- **랭킹 번호는 실제 순위**이므로 번호를 쓴다. 다른 곳에서는 장식용 번호(01/02/03)를 쓰지 않는다.
- URL 계약(`source`/`tag`/`sort`/`q`/`category`)은 그대로다. `category` 값은 분야 키(`?category=physical`)이고 예전 값(`?category=Language%20Models`)은 새 키로 받아 준다. 상세(`/article/[id]`)는 형식 배지·신호 패널·원제·같은 분야 기사 4건을 더한다.

## 4. 신호 시각화 규칙

| 신호                   | 범위           | 표현                                                         | 규칙                                                                                   |
| ---------------------- | -------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 중요도 `importance`    | 1–5 (0=미가공) | **5칸 세그먼트 미터**                                        | 채운 칸 = 값. 4–5는 강조색. 0이면 미표시. 스크린리더 텍스트 `중요도 4/5`               |
| 트렌딩 `trendingScore` | 0–100          | 숫자 + **수평 바**(지금 화제), 리드·색인 바이라인은 `화제 N` | 0이면 미표시. 바 길이 = 값/100 (스케일 고정)                                           |
| 분야 `category`        | 6종            | 코발트 한글 키커(좁은 곳은 3자 코드)                         | 아래 표시명 맵 사용. 빈 값이면 미표시                                                  |
| 형식 `format`          | 4종            | **형식 배지**(비뉴스만, §5 `FormatBadge`)                    | 소스가 정한다(LLM 비용 없음). 뉴스는 배지 없음. 지금 화제 비뉴스 행은 매체명 대신 배지 |
| 소스 `source.name`     | 매체           | 메타 행 첫 요소                                              | 칩·메타에서는 축약명 맵(`shortSourceName`). 묶인 보도는 "외 N곳"                       |
| 날짜 `publishedAt`     | ISO            | 홈 1면·섹션 상대 시각 / `MM.DD`(색인) / `YYYY.MM.DD`(상세)   | 마스트헤드는 `YYYY년 M월 D일 요일`. 레이더 카드는 날짜 생략                            |

**매체 = 축약명 단위.** 수집은 한 매체를 여러 피드로 받는다(Hacker News 두 피드, Google News 질의별 피드, HuggingFace 논문·모델, GitHub 토픽 검색). 독자가 아는 매체는 바이라인에 찍힌 이름이므로, 매체 필터 칩과 "매체 N곳"(귀·전체 기사 머리)은 축약명이 같은 소스를 하나로 센다(`groupSources`, [src/lib/feedFilter.ts](src/lib/feedFilter.ts)). 칩은 매체당 하나이고, 누르면 그 매체의 모든 피드가 걸린다. URL `?source=`에는 기사가 가장 많은 피드의 id를 싣고, 묶음의 다른 id로 들어온 옛 링크도 같은 칩으로 풀린다. 논문·모델 같은 형식 구분은 매체 칩이 아니라 형식 배지가 맡는다.

**분야 표시명 맵** (저장값은 안정 키, 표시만 변환 — 단일 출처 [src/lib/labels.ts](src/lib/labels.ts) `CATEGORIES`·`CATEGORY_LABELS`·`CATEGORY_CODES`, 표 순서 = 섹션·내비·칩 순서):

| 저장 키    | 한글 표시명   | 코드 |
| ---------- | ------------- | ---- |
| `llm`      | LLM           | LLM  |
| `agent`    | 에이전트      | AGT  |
| `physical` | Physical AI   | PHY  |
| `oss`      | 오픈소스·도구 | OSS  |
| `research` | 연구·논문     | RES  |
| `industry` | 산업·정책     | BIZ  |

- 개편 전 값은 `LEGACY_CATEGORY_MAP`으로 읽을 때 변환한다(`Language Models`→`llm`, `Agents`→`agent`, `Dev Tools`·`MLOps`→`oss`, `연구·논문`→`research`, `산업·정책`→`industry`). 옛 코드 DEV·OPS는 폐지됐다.
- "Physical AI"·"오픈소스·도구"는 길다 — 칩·내비는 `whitespace-nowrap`, 섹션 머리는 `flex-wrap`(좁은 화면에서 "이 분야 전체 기사 →"가 다음 줄로).

**형식 맵** (`FORMATS`·`FORMAT_LABELS`·`FORMAT_BADGES`):

| 저장 키 | 표시명(귀·OG) | 배지    | 스크린리더 | 출처                        |
| ------- | ------------- | ------- | ---------- | --------------------------- |
| `news`  | 뉴스          | (없음)  | —          | 기본값                      |
| `oss`   | 오픈소스      | `REPO`  | 저장소     | GitHub                      |
| `model` | 모델          | `MODEL` | 모델       | HuggingFace 모델            |
| `paper` | 논문          | `PAPER` | 논문       | arXiv·HF Papers·Takara TLDR |

## 5. 컴포넌트 해부

| 컴포넌트                      | 구성                                                                                    | 쓰임                            |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| `masthead`                    | 폴리오(발행일·호수·발행 시각·공유) · 발행 지연 줄 · 제호 + 귀(이번 호 통계) · 섹션 내비 | 홈 최상단. 전역 헤더와 별개     |
| `story-lead` (L)              | 분야 키커 · 대형 제목 · 리드문 · 메타(소스·시각·중요도·화제)                            | 리드 1건                        |
| `story-card` (M)              | 분야 키커 · 제목 · 요약 3줄 · 메타                                                      | 서브 3건                        |
| `story-brief` (Brief)         | 분야 키커 · 한 줄 세리프 제목 · 소스·시각·중요도 (아래 명세)                            | 오늘의 브리핑 3행               |
| `story-radar` (Radar)         | 형식 배지 + 분야 키커 · 제목 3줄 · 요약 2줄 · 메타 레일 (아래 명세)                     | 레이더 4건                      |
| `story-compact` (S)           | 제목 · (대표만) 요약 · 메타 1줄(비뉴스는 소스 앞 형식 배지)                             | 분야 섹션 밴드                  |
| `story-entry` (Row)           | 날짜 칼럼 · 키커 + 형식 배지 · 제목 · 요약 2줄 · 소스·중요도·화제                       | 색인·검색 결과·상세 "다른 기사" |
| `rank-item`                   | 순위 · 제목 2줄 · 소스(비뉴스는 형식 배지) · 트렌딩 바 · 수치                           | 지금 화제 Top 5                 |
| `issue-contents`              | 분야명 · 점선 리더 · 건수 · "1면 N" (행 = 섹션 앵커)                                    | 이 호의 지면 (lg+ 사이드바)     |
| `section-header`              | 섹션명 · "N건 · 1면 M건" · "이 분야 전체 기사 →"                                        | 각 섹션 상단                    |
| `format-badge`                | REPO·MODEL·PAPER 아웃라인 배지 (아래 명세)                                              | 6곳 공통                        |
| `importance-meter`            | 5칸 세그먼트                                                                            | 카드 메타                       |
| `category-label`              | 코발트 키커                                                                             | 모든 카드                       |
| `filter-bar` / `filter-sheet` | v1 구조 유지, 스타일만 교체                                                             | 스트림 상단 / 모바일 시트       |
| `article-detail`              | 형식 배지 + 분야 키커 · 대형 제목 · 신호 패널 · 요약 · 원문 발췌 · CTA                  | `/article/[id]`                 |

모든 카드는 전체가 하나의 링크(`/article/[id]`)이며 포커스 링이 보인다.

### 형식 배지 (`FormatBadge`, `ArticleMeta.tsx`)

- **문구:** `REPO`(oss) · `MODEL`(model) · `PAPER`(paper). 뉴스는 렌더하지 않는다.
- **형태:** `text-badge`(10.5px/1) 700 대문자, 자간 0.09em, 높이 17px, 좌우 5px. 잉크(`foreground`) 1px 테두리 + 잉크 글자, 배경 없음, 각진 면.
- **코발트 금지** — 단일 강조색 원칙. 코발트는 옆의 분야 키커 몫이다. 대비는 잉크 대 종이 라이트 17:1 / 다크 15:1.
- **배치 6곳:** 레이더 카드 머리(배지 → 키커) · 지금 화제 행(매체명 대신) · 섹션 밴드 바이라인(`Byline showFormat`, 소스 앞) · 전체 기사 색인 · 검색 결과(둘 다 `StoryEntry`, 키커 뒤) · 상세 머리(배지 → 키커). OG 기사 썸네일도 같은 배지(축소 표시를 고려해 2px 테두리).

### 오늘의 브리핑 (`StoryBrief`)

- 서브 그리드 아래, md 이상은 헤어라인 + 13px 잉크 굵은 소제목 "오늘의 브리핑"으로 구분한다(모바일은 직전 항목의 하단 헤어라인이 구분선). 행 사이는 헤어라인. 요약은 없다.
- **md 이상:** 3칸 `[키커 7.5rem | 제목 | 바이라인]`, baseline 정렬. 제목은 16px(`text-title`) 세리프 700 **한 줄 말줄임**, 바이라인은 매체 · 상대 시각 · 중요도 도트. 행 약 50px.
- **모바일:** 제목(15px/1.4 세리프, 최대 2줄) → 메타 한 줄. 키커는 바이라인 맨 앞으로 들어가고(`키커 · 매체 · 시각 · 도트`), 메타 줄은 `nowrap`이고 넘치면 **매체명만** 말줄임한다(`Byline truncateSource` — "외 N곳"이 먼저 사라지고 키커·시각·도트는 항상 온전). 1줄 62px / 2줄 83px, `min-h-11`(44px).

### 레이더 (`RadarBand` / `StoryRadar`)

- **띠(`RadarBand`):** 1면 아래 전폭(사이드바 아래까지). 머리는 섹션 밴드와 같은 문법 — 2px 잉크 괘선 + "오픈소스·논문 레이더"(`text-display-md` 세리프 800) + 보조 "이번 호의 저장소·모델·논문". 비뉴스가 0건이면 띠 전체를 숨긴다.
- **반응형:** lg 4열 / md 2열(세로 헤어라인으로 칼럼 구분) / 모바일 가로 스크롤 스냅 — 카드 폭 **64%**(360px에서 약 210px, 다음 카드 절반이 보여 밀어 볼 수 있다는 신호), `snap-start`, 스크롤러만 `-mx-4`로 화면 끝까지 닿고 `px-4`로 거터를 되돌린다. 스크롤바 숨김, 카드 사이는 세로 헤어라인, 페이지 가로 스크롤 없음.
- **카드(`StoryRadar`):** 머리(형식 배지 + 분야 키커, 키커 말줄임) → 세리프 700 제목 16px(md 17px) 최대 3줄 → 요약(`caption`, 흐림) 최대 2줄 → **메타 레일**. 박스 없음, 날짜 없음.
- **메타 레일**(`radarMetaBlock()`, [src/lib/radarMeta.ts](src/lib/radarMeta.ts)): 카드 바닥(`mt-auto`)에 헤어라인을 깔고 붙여 네 카드의 메타가 같은 높이에 맞는다 — 한 줄짜리 데이터 표처럼 읽힌다.

| 형식  | 식별자 줄    | 수치 줄                                                      |
| ----- | ------------ | ------------------------------------------------------------ |
| REPO  | `owner/repo` | ★ 스타 · `오늘 +1,190` · 주 언어                             |
| MODEL | `org/model`  | 파라미터(`8B`·`1.5B`) · 태스크(`pipeline_tag`) · ♥ · ↓(30일) |
| PAPER | `arXiv ID`   | ▲ 추천(HF) · `인용 N`                                        |

- 식별자 줄: 13px `foreground-soft` 600, 한 줄 말줄임. 수치 줄: 13px 흐림, 값만 `foreground-soft` 600, 항목 단위로 줄바꿈. 전부 `tabular-nums`.
- **숫자:** 1만 미만은 쉼표 정수(`7,406`), 1만 이상은 축약(`12.4k`·`1.2M`). 파라미터는 `40B`·`8B`·`1.5B`(1M 미만 생략). 0·비숫자는 "없음"으로 본다. `Intl` 없이 직접 포맷해 빌드와 브라우저 출력이 같다.
- 스타 증가분은 `오늘 +1,190`(괄호 `(+Δ)`는 무엇의 증가인지 모호해 쓰지 않는다). 소속 기관은 데이터가 없어 표시하지 않는다.
- **아이콘** ★ ♥ ↓ ▲는 11px 인라인 SVG(`currentColor`, `aria-hidden`) — 문자로 두면 모바일이 ♥를 빨간 이모지로 바꾼다.
- **강등 순서:** 빠진 값은 그 조각만 뺀다 → 수치가 하나도 없으면 식별자 한 줄만 → 식별자도 없으면 매체명(축약명). 줄 수는 1–2줄, 헤어라인은 늘 남는다.

## 6. 레이아웃 & 반응형

- 컨테이너: 피드·검색 `max-w-[1240px]`, 상세 본문 `max-w-[720px]`(읽기 폭 ≈ 65자). 좌우 여백 16px → `md` 32px.
- 피벗은 v1과 같이 **`md`(768px)**: 데스크톱 헤더 ↔ 모바일 상단 바 + 하단 탭 바.
- 마스트헤드: `md` 이상 제호 오른쪽에 귀(왼쪽 헤어라인, 세리프 34px 숫자), 미만은 제호 아래 두 줄. 섹션 내비는 모바일에서 자체 가로 스크롤.
- 1면: `lg` 이상 2열(본문 8 : 사이드바 4 — 리드·서브·브리핑 | 지금 화제·이 호의 지면, 사이드바 왼쪽 헤어라인), 미만 1열(리드 → 서브 → 브리핑 → 지금 화제, 이 호의 지면은 숨김). 서브는 `md` 이상 3열(세로 헤어라인).
- 레이더 띠: 1면 아래 전폭, `lg` 4열 / `md` 2열 / 모바일 가로 스냅 카드 64%(§5).
- 분야 섹션 밴드: `lg` 4열(대표 1.5fr + 3) / `md` 2열 / 모바일 1열(대표 외 요약 생략).
- 스트림: 모바일 1열, `lg` 이상 2열 색인(`StoryEntry`).
- safe-area·44px 터치 타깃·하단 탭 바 여백은 v1 규칙 그대로.

## 7. 모션

- 첫 로드에 한해 섹션 단위 **스태거 리빌**(opacity·translateY 8px, 40ms 간격, 총 ≤ 400ms). 정적 첫 프레임에서도 콘텐츠는 보인다(애니메이션은 `from` 상태가 아니라 보이는 상태에서 시작하는 fade-up만 사용).
- 호버: 카드 제목 밑줄/색 전환, 랭킹 바 강조. 150–200ms `ease-out`.
- `prefers-reduced-motion: reduce`에서 전부 제거.

## 8. 접근성

- 본문 대비 WCAG AA(4.5:1) 이상, 큰 제목 3:1 이상. 강조색 위 텍스트도 동일 기준. 형식 배지는 잉크 대 종이(17:1 / 다크 15:1).
- 신호(중요도·트렌딩)는 색만으로 전달하지 않는다(숫자·칸 수·`aria-label` 병행).
- 랭킹은 `<ol>`, 섹션·브리핑·레이더는 `<section aria-labelledby>`, 이 호의 지면은 `<nav>`, 카드 링크에는 제목이 접근 가능한 이름이 된다.
- **형식 배지:** 화면의 대문자(REPO·MODEL·PAPER)는 `aria-hidden`, 스크린리더는 sr-only 한국어 "저장소·모델·논문"을 읽는다.
- **레이더 메타:** SVG 아이콘과 축약 표기는 `aria-hidden`, 항목마다 sr-only 문장("스타 7,406개", "오늘 스타 1,190개 증가")을 읽힌다. 가로 스크롤러·배지 안의 sr-only(absolute)는 `relative` 기준 상자로 묶는다 — 없으면 스크롤러 클립을 벗어나 페이지 폭을 늘린다.
- 발행 지연 줄은 `role="status"`. 44px 터치 타깃: 브리핑 행 `min-h-11`, 섹션 내비 탭 약 46px.

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
| 괘선     | `rule`             | `#141519` | `#eceae4` | 섹션·레이더 상단 2px·마스트헤드 4px+1px·푸터 4px             |
| 헤어라인 | `border`           | `#d8d8d2` | `#2a2d39` | 항목 구분·칼럼 세로선                                        |
| 위험     | `destructive`      | `#c8102e` | `#ff6b6b` | Admin 파괴적 동작·임계 초과만                                |

- **강조색은 코발트 하나.** 채움 버튼(원문 읽기·더 보기·활성 칩)은 잉크로 채운다 — 코발트는 "선·글자"에만. 형식 배지도 잉크 아웃라인이다(코발트는 옆 키커 몫).
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

| 신호      | Edition 표기                                                                       |
| --------- | ---------------------------------------------------------------------------------- |
| 분야      | 코발트 굵은 키커(13px, 색인은 12px, 한글 표시명)                                   |
| 형식      | 잉크 1px 아웃라인 배지 10.5px 대문자(REPO·MODEL·PAPER), 뉴스는 없음                |
| 중요도    | 지름 6px 원형 도트 5칸. 채움 = 잉크, 4–5는 코발트, 빈칸 = 흐림 테두리(80%, 3:1)    |
| 화제 지수 | 세리프 순위 숫자(1–3 코발트) + 2px 코발트 바(고정 0–100 스케일) + 수치             |
| 발행      | 폴리오 `YYYY년 M월 D일 요일 · 제N호 · 매일 06:00 KST 발행` (N = 실패 제외 실행 수) |
| 호 통계   | 귀 `이번 호 N건 · 매체 M곳` (N은 세리프 34px) + `뉴스 22 · 오픈소스 3 · …`         |

### 모션

- 마스트헤드 괘선 `animate-draw`(왼쪽에서 그어짐 0.9s), 제호·리드·서브·브리핑·화제·이 호의 지면·레이더 `animate-rise` 스태거(80/160/200/240/280/320ms).
- 헤더 워드마크: 홈에선 제호가 보이는 동안 숨기고 지나가면 페이드인(`HeaderWordmark`).
- hover는 제목 색(코발트)만 바뀐다(`story-link` 유틸리티). `prefers-reduced-motion`에서 전부 제거.

## 10. 구현 원칙

1. 토큰은 [src/app/globals.css](src/app/globals.css)의 `:root` / `.dark` / `@theme inline`에만 정의한다. 컴포넌트에 hex 하드코딩 금지.
2. shadcn 변수 이름(`--background`, `--primary` …)은 유지하고 값만 교체한다. 신규 토큰(강조·카테고리·신호)은 같은 방식으로 `:root`/`.dark` 쌍을 추가한다. 글자 크기 토큰은 `@theme inline`의 `--text-*`(v2.1에 `--text-badge` 10.5px 추가).
3. 서체는 `next/font`로 자체 호스팅(빌드타임 다운로드, 런타임 외부 요청 없음).
4. 신호 컴포넌트(`CategoryKicker`, `FormatBadge`, `ImportanceMeter`, `TrendBar`, `Byline`)는 단일 구현을 피드·검색·상세가 공유한다. 분야·형식 표시명은 [src/lib/labels.ts](src/lib/labels.ts)에서만 관리한다.
5. 피드의 편집 위계 계산(리드·서브·브리핑·레이더·화제·섹션 선정, 호 통계, 레이더 메타)은 순수 함수(`buildEdition`·`issueStats`·`issueContents`·`radarMetaBlock`)로 분리해 단위 테스트로 고정한다.
6. **글자 크기 토큰과 `cn()`:** `twMerge`는 모르는 `text-*`를 색상 클래스로 읽어 `cn("text-meta", "text-brand")`에서 크기를 지운다(키커·바이라인이 13px 대신 상속 16px로 그려지던 버그). 그래서 [src/lib/utils.ts](src/lib/utils.ts)가 `extendTailwindMerge`에 `FONT_SIZE_TOKENS`를 font-size 그룹으로 등록한다. globals.css에 `--text-*` 토큰을 추가·삭제하면 `FONT_SIZE_TOKENS`도 함께 고친다 — 두 목록이 같은지 `src/__tests__/utils.test.ts`가 검사한다.
