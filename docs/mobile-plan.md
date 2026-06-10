# 모바일 화면 구현 계획 (Mobile Plan)

> Daily AI Brief의 모바일 전용 화면 구현 계획. 단계별 트레이서 불릿으로 구분하며, 각 단계는 독립적으로 검증 가능합니다.
> 진행 시 각 체크박스를 갱신하세요. 관련 문서: [PRD.md](PRD.md) · [WORK-PLAN.md](WORK-PLAN.md) · [../DESIGN.md](../DESIGN.md)

## 배경 (왜)

현재 서비스는 데스크톱 기준으로 설계된 뒤 **그리드 컬럼 축소(3→2→1)와 flex-wrap 정도의 기본 반응형만** 적용된 상태로, 모바일 전용 설계가 없습니다. 확인된 문제:

- `src/app/layout.tsx`에 **viewport 메타데이터 부재** → notch/safe-area 대응 불가
- 터치 타겟이 가이드라인(44px) 미달: 아이콘 버튼 36px, 필터 칩 ~22px, 배지 ~18px
- `--text-display-md`(34px) 등 타이포가 화면 크기와 무관하게 고정
- 컨테이너 패딩 `px-6`이 전 구간 고정 (모바일에서 과도)
- 모바일 내비게이션 부재

**구현 방향(확정):** ① 전용 모바일 레이아웃(상·하단 셸) ② 하단 탭 바 추가 ③ 범위 = 공개 페이지(`/`, `/article/[id]`, `/search`) + 관리자(`/admin`).

---

## 핵심 설계 결정

### 1. 강조색은 `#0066cc`가 아니라 **shipped ink `--primary`(#1d1d1f)** 사용

DESIGN.md는 Action Blue를 명시하지만 **실제 코드베이스는 의도적으로 무채색 잉크를 채택**했습니다 (`globals.css`: `--primary: #1d1d1f`, "활성/호버는 색조 없이 대비로 표현"). FilterBar·ArticleMeta·상세 CTA 모두 ink 토큰으로 active를 표현하므로, 신규 모바일 UI도 `text-primary`/`bg-primary`/`border-primary`를 사용합니다. 파란색 하드코딩은 제2 강조색 도입 + 다크모드 파손이므로 금지(Blue 전환은 별도 티켓).

### 2. 모바일/데스크톱 전환 = **CSS 가시성(`md:hidden` / `hidden md:flex`), 크롬에만 적용**

- **셸(상단바·하단 탭바)만** 양쪽 렌더 후 Tailwind 반응형 클래스로 토글 → 마크업 SSR↔CSR 동일 → **하이드레이션 미스매치 0, JS 불필요, ISR/SEO 안전.**
- **본문은 1회만 렌더** + 반응형 클래스 (중복 렌더 없음).
- `useMediaQuery`/`matchMedia` 뷰포트 훅 **금지** (SSR 플래시/미스매치, 서버 컴포넌트 기본 원칙 위반).
- 인터랙션 위젯(탭바 active, 필터 시트)만 `usePathname()`/`useState` 기반 `"use client"` — 기존 `SearchInput`/`ThemeToggle` 선례 준수.

### 3. 브레이크포인트

Tailwind 기본 `md:768`을 셸 전환점으로 사용. DESIGN.md의 834px 햄버거 경계와 미세 차이 → Phase 6에서 픽셀 정합 필요 시 `@theme` 커스텀 브레이크포인트 검토.

---

## 단계별 구현 계획

> 각 단계 종료 시 `npm run lint && npm run typecheck && npm test` green 유지 (현재 81 테스트 통과, TS strict).

### Phase 1 — 기반 셸 (viewport + 스왑 + 하단 탭바 골격)

- [x] `layout.tsx`에 `export const viewport` 추가 (`width:device-width`, `viewportFit:"cover"`, light/dark `themeColor`)
- [x] body 하단 패딩 `pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0` (탭바 가림 방지)
- [x] `globals.css`에 `--tabbar-h` 토큰 + `@media (max-width:419px){ --text-display-md:28px }` 추가
- [x] `Header.tsx` → `hidden md:block`으로 데스크톱 전용화
- [x] `MobileTopBar.tsx` 신규 (`flex md:hidden`, 로고+검색+테마토글)
- [x] `BottomTabBar.tsx` 신규: 2탭(피드/검색), frosted(`bg-background/80 backdrop-blur`)+hairline(`border-t`), active=`text-primary font-semibold`, safe-area 패딩, `/article/*`에서 `null`
- [x] 검증: `BottomTabBar.test.tsx` 5케이스 green, `npm run lint && typecheck && test` 97 통과 (RTL `@testing-library/react` 신규 devDep)

### Phase 2 — 터치 타겟 프리미티브

- [x] `button.tsx` cva: `default:"h-11 px-4 py-2 md:h-9"`, `icon:"h-11 w-11 md:h-9 md:w-9"`
- [x] `input.tsx`: `h-11 md:h-9`
- [x] `FilterBar.tsx` chip: `min-h-11 md:min-h-0 py-2 md:py-1`
- [x] 검증: 모바일 인터랙션 컨트롤 ≥44px(h-11), 데스크톱 밀도 보존(md:h-9), `lint && typecheck && test` 97 통과

### Phase 3 — 피드 + 상세 모바일 다듬기

- [x] 피드/상세/검색 컨테이너 `px-4 py-6 md:px-6 md:py-12`
- [x] `ArticleCard.tsx` `p-4 md:p-6`
- [x] 상세: `← 피드로` 링크를 모바일 sticky frosted 백바로 (`sticky top-13`=MobileTopBar h-13 아래, `-mx-4` 풀블리드, `md:static`)
- [x] 상세: `원문 보기` CTA 모바일 풀폭 (`flex w-full justify-center md:inline-flex md:w-fit`)
- [x] 검증: `lint && typecheck && test` 97 통과, 상세 백바는 MobileTopBar(z-50) 아래 z-10, 하단 탭바는 `/article/*`에서 `null`(Phase 1)

### Phase 4 — 검색 필터 UX

- [x] (선) 인라인 가로 스크롤 트레이서는 미적용 — 모바일은 인라인을 숨기고 시트로 대체(아래)하여 불필요
- [x] `FilterSheet.tsx` 신규: "필터" 트리거(`min-h-11`, `md:hidden`, 활성 소스·태그 수 배지) → 바텀시트(frosted `bg-background/95 backdrop-blur` + hairline `border-t` + safe-area 패딩, z-60으로 탭바 위)에 **기존 FilterBar 재사용**. ESC·배경탭·"결과 보기"로 닫힘, 열린 동안 body 스크롤 잠금
- [x] 데스크톱 인라인 FilterBar는 `hidden md:block`으로 유지(`/`·`/search` 양쪽)
- [x] 검증: `FilterSheet.test.tsx` 6케이스 green(열림/닫힘·재사용 FilterBar 칩·ESC·배지), `lint && typecheck && test` 103 통과

### Phase 5 — 관리자 모바일

- [x] `RunsTable.tsx`: 모바일 카드 목록(`<ul md:hidden>`) + 데스크톱 표(`<div hidden md:block>`) 이중 렌더 — `fmtTime`·`statusLabel`·`COST_THRESHOLD` 공유, 임계 초과 시 양쪽 `bg-destructive/5`+`text-destructive`(단일 컴포넌트)
- [x] `SourceManager.tsx`: 폼은 이미 `grid-cols-1`(모바일 세로 스택), 입력 높이를 Input 프리미티브 `h-11 md:h-9` 상속으로 복원(기존 `h-10`<44px 제거), `select` `h-11 md:h-9`, 행 작업 버튼 `min-h-11 md:min-h-0`(≥44px)
- [x] admin/login 컨테이너 패딩 반응형화(`px-4 py-8 md:px-6 md:py-12`, login `py-16 md:py-24`)
- [x] 하단 탭바 admin 처리: 공개 바엔 admin 탭 미노출, `/admin/*`는 자체 바 변형(피드/콘솔, `LayoutDashboard` 아이콘), `/admin/login`은 `null`(로그인 몰입)
- [x] 검증: `RunsTable.test.tsx`(4) + `BottomTabBar.test.tsx` admin 변형 2케이스 추가 green, `lint && typecheck && test` 109 통과

### Phase 6 — DESIGN 준수 + 접근성 마무리 (선택 폴리시)

- [ ] 상세 CTA를 floating-sticky-bar(64px frosted)로 격상
- [ ] `aria-current="page"` 활성 탭, focus ring, reduced-motion
- [ ] DESIGN.md 최종 감사: 그림자 0, 단일 ink 강조, weight 300/400/600/700, frosted blur 값
- [ ] (선) 834px 커스텀 브레이크포인트 픽셀 정합

---

## 신규/수정 파일

**신규**

- `src/components/mobile/BottomTabBar.tsx` — 하단 탭 바 (`"use client"`, usePathname)
- `src/components/mobile/MobileTopBar.tsx` — 모바일 상단 바
- `src/components/mobile/FilterSheet.tsx` — 모바일 필터 바텀시트 (`"use client"`, 기존 FilterBar 재사용)
- `src/__tests__/BottomTabBar.test.tsx` — 탭바 active/숨김 + admin 변형 테스트
- `src/__tests__/RunsTable.test.tsx` — 모바일 카드/데스크톱 표 동일 데이터·임계 하이라이트 테스트

**수정 (핵심 leverage 지점)**

- `src/app/layout.tsx` — viewport export, safe-area body padding, 크롬 스왑, 셸 마운트
- `src/app/globals.css` — `--text-display-md` 34→28(≤419px), tabbar/safe-area 토큰
- `src/components/ui/button.tsx` — 모바일 터치 사이즈 ≥44px (`h-11 md:h-9`) — **최고 leverage**
- `src/components/ui/input.tsx` — `h-11 md:h-9`
- `src/components/Header.tsx` — `hidden md:flex`
- `src/app/page.tsx` · `article/[id]/page.tsx` · `search/page.tsx` — 컨테이너 반응형 패딩
- `src/components/ArticleCard.tsx` — `p-4 md:p-6`
- `src/components/FilterBar.tsx` — chip `min-h-11 md:min-h-0`
- `src/components/admin/RunsTable.tsx` — 모바일 카드 변형
- `src/components/admin/SourceManager.tsx` — 필드 세로 스택 + 터치 사이즈

### 컴포넌트 처리 방식 요약

| 컴포넌트                 | 방식                                                      |
| ------------------------ | --------------------------------------------------------- |
| `Header`                 | `hidden md:flex` + 신규 `MobileTopBar`                    |
| `Footer`                 | className(반응형 패딩), 전 구간 유지                      |
| `ArticleCard`            | className(`p-4 md:p-6`)                                   |
| `FilterBar`              | 그대로 재사용, 모바일은 `FilterSheet`가 래핑              |
| `SearchInput`            | 변경 없음 (이미 44px)                                     |
| `ArticleMeta` 배지       | 카드 내 배지는 탭 타겟 아님 → 시각 크기 유지(과확대 금지) |
| `RunsTable`              | 내부 모바일 카드 변형(스코프 한정 이중 렌더)              |
| `button.tsx`/`input.tsx` | 반응형 ≥44px 사이즈 추가                                  |

---

## 검증

- **수동 반응형:** Chrome devtools 디바이스 툴바 — 375px(28px hero+frosted+safe-area), 414/640px, **768px(md 스왑 경계)**, 1024/1440px. 실제 notch 기기/iOS 시뮬레이터에서 `env(safe-area-inset-bottom)` 패딩 확인.
- **Vitest+RTL(jsdom):**
  - `BottomTabBar.test.tsx`: 라우트별 active 탭 `text-primary`/`aria-current` 검증, `/article/123`에서 `null` (`vi.mock("next/navigation")`)
  - `RunsTable`: 데스크톱 테이블·모바일 카드 동일 데이터 렌더 + 임계 하이라이트
  - `FilterSheet`(구현 시): 열림/닫힘 + 재사용 FilterBar 링크 렌더
- **게이트:** `npm run lint && npm run typecheck && npm test` (81 테스트 green 유지)
- (선) `mcp__playwright` 브레이크포인트 스크린샷 회귀 — 필수 아님

---

## 리스크

| 리스크                      | 완화                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| 하이드레이션 미스매치       | 크롬 가시성=순수 CSS 미디어쿼리(SSR↔CSR 동일). 렌더 경로에 `matchMedia`/뷰포트 JS 금지 |
| SSR 이중 렌더 비용          | 소형 크롬+관리자 runs 목록에 한정 → 무시 가능. 피드 ISR·상세 static 유지               |
| 관리자 인증 노출            | 공개 하단 바에 admin 탭 미노출(미인증 탭 시 리다이렉트 혼란 방지). 탭바는 링크만 보유  |
| DESIGN 신규 패턴(하단 탭바) | frosted+hairline+단일 ink active+무그림자+safe-area로 구성. 컬러 pill/그림자 금지      |
| `md:768` vs DESIGN 834px    | Phase 1은 768 수용, Phase 6에서 정합 재검토                                            |
