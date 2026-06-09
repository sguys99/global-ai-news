# Daily AI Brief

글로벌·한국의 AI/IT 뉴스를 **매일 1회 자동 수집**해 LLM으로 한국어 요약·분류·중요도 평가를 거쳐 카드형 피드로 보여주는, 토큰 비용을 최소화한 큐레이션 웹서비스입니다.

운영비 ≈ 0을 목표로 **SQLite 파일 DB + GitHub Actions cron + Vercel ISR** 위에서 동작합니다. 신규 항목만 LLM 단일 호출로 가공해 토큰 비용을 구조적으로 줄입니다.

- 요구사항: [docs/PRD.md](docs/PRD.md)
- 개발 계획·진행 현황: [docs/WORK-PLAN.md](docs/WORK-PLAN.md)
- 디자인 토큰/원칙: [DESIGN.md](DESIGN.md)
- 스택/컨벤션: [CLAUDE.md](CLAUDE.md)

## 아키텍처 / 데이터 흐름

```
GitHub Actions cron (일 1회, 06:00 KST)
        │  scripts/collect.ts
        ▼
  ① 수집(RSS/HN/GitHub/HF/Reddit) → ② dedup·trending(코드)
  → ③ 신규만 LLM 1호출 가공(Haiku) → ④ SQLite upsert + collection_runs 기록
        │
        ▼
  data/app.db  (git 커밋 — 재빌드 원천)
        │  push → Vercel Git 연동 자동 배포
        ▼
  Vercel (Next.js ISR, DB readonly 조회)
        ├─ /            피드(ISR, revalidate 3600)
        ├─ /article/[id] 상세(SSG+ISR)
        ├─ /search       검색(동적, FTS5)
        └─ /admin        운영 콘솔(SSR + 인증)
```

핵심 설계: 수집·가공은 **GitHub Actions 에서만** 돌면서 `data/app.db` 를 커밋하고, Vercel 웹은 그 DB를 **읽기 전용**으로만 조회합니다(서버리스 read-only FS와 호환).

## 로컬 개발

```bash
npm install
cp .env.example .env.local       # 아래 "환경 변수" 참고해 값 입력
npm run db:init                  # data/app.db 에 6개 테이블 생성
npm run collect                  # 수집 → 가공 → 저장 배치 1회 (ANTHROPIC_API_KEY 필요)
npm run dev                      # http://localhost:3000
```

`/admin` 은 `ADMIN_PASSWORD` 설정 후 `/admin/login` 으로 로그인합니다.

## 환경 변수

`.env.local`(git 미커밋)에 설정합니다. 변수는 **실행 위치별로** 필요한 곳이 다릅니다.

| 변수                                        | 용도                                | 로컬 | GitHub Actions | Vercel |
| ------------------------------------------- | ----------------------------------- | :--: | :------------: | :----: |
| `ANTHROPIC_API_KEY`                         | LLM 가공                            |  ●   |   ● (Secret)   |   ●    |
| `LLM_MODEL`                                 | 모델 전환(기본 `claude-haiku-4-5`)  |  ○   |  ○ (Variable)  |   ○    |
| `MAX_ITEMS_PER_RUN`                         | 비용 가드 상한(기본 150)            |  ○   |  ○ (Variable)  |   –    |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Reddit OAuth2                       |  ●   |   ● (Secret)   |   –    |
| `GITHUB_PAT`                                | sources.json 커밋 · 재수집 dispatch |  –   |  ○\* (Secret)  |   ●    |
| `GITHUB_REPO` (`owner/repo`)                | Admin GitHub API 대상               |  –   |       –        |   ●    |
| `GITHUB_BRANCH` (기본 `main`)               | 커밋/dispatch 대상 브랜치           |  –   |       –        |   ●    |
| `ADMIN_PASSWORD`                            | 운영자 인증 + 세션 서명             |  –   |       –        |   ●    |

● 필수 · ○ 선택 · – 불필요. 수집은 Actions(와 로컬)에서만 돌므로 Reddit 키는 Vercel 엔 둘 필요가 없습니다.

\* Actions 의 `GITHUB_PAT` 는 GitHub Search 레이트리밋 완화용(선택)입니다. DB 커밋/푸시는 빌트인 `GITHUB_TOKEN` 이 처리하므로, PAT가 없어도 자동화는 잘 돌아갑니다.

## GitHub Actions 설정 (자동화)

워크플로: [.github/workflows/collect.yml](.github/workflows/collect.yml)

- 트리거: `schedule` `0 21 * * *`(21:00 UTC = 06:00 KST) + `workflow_dispatch`(관리자 콘솔 "재수집" 버튼/수동).
- 동작: `npm ci` → `npm run collect` → `data/app.db` 변경분만 커밋(`[skip ci]`) 후 push.
- `concurrency: collect` 로 실행을 직렬화해 `app.db` 동시 쓰기/푸시 경쟁을 막습니다.

**Repository → Settings → Secrets and variables → Actions** 에서 등록합니다.

- Secrets: `ANTHROPIC_API_KEY`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, (선택) `GH_SEARCH_PAT`
- Variables: `LLM_MODEL`, `MAX_ITEMS_PER_RUN`

> GitHub은 `GITHUB_` 으로 시작하는 Secret 이름을 금지합니다. Search용 PAT은 **`GH_SEARCH_PAT`** 시크릿으로 만들면 워크플로가 이를 `GITHUB_PAT` 환경변수로 매핑합니다.
>
> 관리자 콘솔의 "재수집" 은 정확히 `collect.yml` 파일명으로 dispatch 합니다. **파일명을 바꾸지 마세요.**

## Vercel 배포

별도 `vercel.json` 은 필요 없습니다(ISR·`serverExternalPackages` 가 코드에 반영돼 있습니다).

1. Vercel 에 GitHub 저장소를 Import (Framework: Next.js 자동 감지).
2. Production Branch = `main`.
3. Environment Variables(Production): `ADMIN_PASSWORD`, `GITHUB_PAT`, `GITHUB_REPO`, `GITHUB_BRANCH`, `ANTHROPIC_API_KEY`, `LLM_MODEL`.
4. "Ignored Build Step" 은 기본값으로 둡니다 — Actions 의 데이터 커밋 push 가 production 재배포를 트리거해야 하기 때문입니다.

재배포 흐름: Actions 가 `chore(data): … [skip ci]` 로 `app.db` 를 push → Vercel Git 연동이 새 DB로 재빌드 → ISR 피드 갱신("소스 변경→재배포 ≤10분" KPI).

> 환경상 `[skip ci]` 커밋이 배포되지 않으면, 워크플로 마지막에 **Vercel Deploy Hook URL** 을 호출하는 스텝을 폴백으로 추가하세요.

## 운영 · 모니터링

- `/admin` — 소스 CRUD(GitHub 커밋), 즉시 재수집, **KPI 요약**, 실행 이력·비용 표.
- GitHub Actions → `collect` 워크플로 실행 이력으로 파이프라인 성공/실패를 추적합니다.
- Vercel → Deployments 로 배포 시각·로그를 확인합니다.

## KPI 확인

```bash
npm run kpi          # 최근 30일 집계 (npm run kpi 14 → 최근 14일)
```

`collection_runs`/`articles` 에서 자동으로 뽑아낼 수 있는 KPI를 목표 대비 PASS/FAIL 로 출력합니다. 같은 지표가 `/admin` "KPI 요약" 패널에도 표시됩니다.

PRD §9 목표:

| 항목              | 목표                 | 측정                                 |
| ----------------- | -------------------- | ------------------------------------ |
| 일일 LLM 비용     | ≤ $0.30              | `npm run kpi` (자동)                 |
| 파이프라인 성공률 | ≥ 95% (최근 30일)    | `npm run kpi` (자동)                 |
| 일일 신규 카드    | ≥ 30건               | `npm run kpi` (자동)                 |
| 중복 제거         | 0건                  | `npm run kpi` (자동)                 |
| 피드 LCP          | ≤ 2.0s (데스크톱)    | Vercel Analytics / Lighthouse (수동) |
| 한국어 요약 품질  | 주간 20건 ≥ 90%      | 샘플 리뷰 (수동)                     |
| 소스 변경 반영    | 저장 → 재배포 ≤ 10분 | Vercel 배포 타임스탬프 (수동)        |

## 스크립트

| 명령                                    | 설명                                       |
| --------------------------------------- | ------------------------------------------ |
| `npm run dev`                           | 개발 서버                                  |
| `npm run build` / `npm run start`       | 프로덕션 빌드(`output: standalone`) / 실행 |
| `npm run db:init`                       | `data/app.db` 6개 테이블 생성              |
| `npm run db:reindex`                    | FTS5 인덱스 재색인                         |
| `npm run collect`                       | 수집→가공→저장 배치 1회                    |
| `npm run kpi`                           | 최근 N일 KPI 집계(기본 30)                 |
| `npm run lint` / `format` / `typecheck` | ESLint / Prettier / 타입체크               |
| `npm test` / `test:watch`               | Vitest                                     |

## 트러블슈팅

- **관리자 "재수집" 이 409** — `.github/workflows/collect.yml` 이 기본 브랜치에 배포돼야 dispatch 가 성공합니다.
- **CI 네이티브 빌드 실패(`better-sqlite3`)** — 프리빌드가 없으면 node-gyp 로 폴백합니다(ubuntu-latest 에 빌드 도구 포함). 그래도 안 되면 워크플로에 `npm rebuild better-sqlite3` 스텝을 추가하거나 버전을 고정하세요.
- **`data/app.db` 푸시 경쟁/머지 충돌** — SQLite 바이너리는 3-way 머지가 안 됩니다. `concurrency` 로 단일 실행을 보장하며, 충돌이 나면 Actions 산출본을 취하거나 `npm run collect` 로 다시 만드세요.
- **Vercel 에서 카드가 갱신 안 됨** — 데이터 커밋이 배포를 트리거했는지(Deployments), Production Branch 설정과 ISR `revalidate` 를 확인하세요.

## 라이선스

Apache 2.0. [LICENSE](LICENSE) 참고.
