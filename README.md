# Daily AI Brief

글로벌·한국의 AI/IT 뉴스·오픈소스·모델·논문을 **매일 1회 자동 수집**해 LLM으로 한국어 요약·분류·중요도 평가를 거쳐, 매일 발행되는 한 호(號)의 편집 지면으로 보여주는 토큰 비용을 최소화한 큐레이션 웹서비스입니다.

운영비 ≈ 0을 목표로 **SQLite 파일 DB + GitHub Actions + GitHub Pages 정적 배포** 위에서 동작합니다. LLM이 하루치 후보에서 35건 이하만 골라 묶음으로 가공하고 Message Batches API(50% 할인)로 보내, 1회 수집 비용을 $0.1 상한 아래로 묶습니다.

- 요구사항: [docs/PRD.md](docs/PRD.md) · 배포 전환 [docs/PRD-github-pages.md](docs/PRD-github-pages.md)
- 개발 계획·진행 현황: [docs/WORK-PLAN.md](docs/WORK-PLAN.md) · 콘텐츠·1면 개편 [docs/contents-upgrade-plan.md](docs/contents-upgrade-plan.md)
- 디자인 토큰/원칙: [DESIGN.md](DESIGN.md)
- 스택/컨벤션: [CLAUDE.md](CLAUDE.md)

## 아키텍처 / 데이터 흐름

```
외부 크론 06:00 KST → collect.yml (workflow_dispatch, schedule 은 백업)
        │  scripts/collect.ts
        ▼
  ① 수집(RSS/HN/GitHub/HF 논문·모델/arXiv) → ② dedup·trending·선별 풀(코드)
  → ③ LLM 선별(≤35건) → 묶음 가공 → 재보도 검사 (Haiku, Batches API)
  → ④ SQLite 저장 + collection_runs 기록
        │
        ▼
  data/app.db  (deploy/github-pages 에 git 커밋 — 빌드 원천)
        │  collect.yml 이 deploy.yml 을 dispatch
        ▼
  deploy.yml: npm run build (정적 export, DB 는 빌드타임 readonly 조회) → GitHub Pages
        ├─ /                 최신 호 지면 + 전체 기사 색인
        ├─ /edition/[date]   지난 호 고정 링크
        ├─ /article/[id]     상세
        └─ /search           검색(빌드 시 만든 인덱스 + 브라우저 FlexSearch)
```

핵심 설계: 수집·가공은 **GitHub Actions 에서만** 돌면서 `data/app.db` 를 커밋하고, 공개 사이트는 그 DB를 빌드타임에 **읽기 전용**으로 조회해 정적 파일로 굽습니다. `/admin`·`/api` 는 로컬 `npm run dev` 전용 운영 도구로, 배포 산출물(`out/`)에는 포함되지 않습니다.

## 지면 구성

- **호(號) = 그날 수집분.** 기사의 호 날짜는 수집 시각(`created_at`)의 KST 날짜입니다. 홈은 최신 호만으로 1면을 꾸리고, 발행이 늦으면 마스트헤드에 "발행 전/발행 지연" 줄을 띄웁니다.
- **1면 약 11건:** 리드 1 · 서브 3 · 오늘의 브리핑 3(뉴스) + 오픈소스·논문 레이더 4(저장소·모델·논문), 사이드바에 지금 화제 5 · 이 호의 지면. 그 아래 분야별 섹션 밴드와 누적 전체 기사 색인이 이어집니다.
- **분야 6개(LLM 분류):** LLM · 에이전트 · Physical AI · 오픈소스·도구 · 연구·논문 · 산업·정책. URL 키는 `llm|agent|physical|oss|research|industry`(`?category=physical`).
- **형식 4개(소스 속성):** 뉴스 · 오픈소스(`REPO`) · 모델(`MODEL`) · 논문(`PAPER`). 뉴스가 아닌 기사에 형식 배지를 답니다.

## 수집 소스

소스 정의는 [configs/sources.json](configs/sources.json) 단일 파일로 관리하며, 로컬 `/admin` 에서 GitHub API 커밋으로 추가·수정합니다(코드 하드코딩 금지). 소스마다 `format`(생략 시 `news`), `maxItems`(회차당 신규 상한), 선택적으로 `topic`(`physical` — 선별 풀 할당 힌트)·`keywordFilter`([configs/keyword-filters.json](configs/keyword-filters.json))를 둡니다. 현재 47개 등록, 43개 활성:

| 형식 / 종류         | 소스                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 뉴스 · RSS (글로벌) | TechCrunch AI · The Verge AI · MIT Technology Review · The Decoder · MarkTechPost · Latent Space · Ahead of AI · Simon Willison · Interconnects · Anthropic News · NVIDIA Blog · Hugging Face Blog · Google AI Blog · Google DeepMind · OpenAI News · Hacker News Front Page |
| 뉴스 · RSS (한국)   | AI타임스 · 전자신문 AI · 바이라인네트워크 · GeekNews                                                                                                                                                                                                                         |
| 뉴스 · Physical AI  | TechCrunch Robotics · Science Robotics · CMU Robotics Institute · NVIDIA Technical Blog (Robotics) · Google News(humanoid·VLA·physical AI) · IEEE Spectrum Robotics · Robotics & Automation News · Autonomous Vehicle International · 로봇신문 · Robohub · The Robot Report  |
| 뉴스 · 집계 API     | Hacker News (Algolia)                                                                                                                                                                                                                                                        |
| 오픈소스 · GitHub   | GitHub Trending(AI 키워드 필터) · GitHub 토픽 검색(llm · ai-agents·mcp · robotics·embodied-ai)                                                                                                                                                                               |
| 모델 · HuggingFace  | HuggingFace 트렌딩 모델(생성 30일 이내)                                                                                                                                                                                                                                      |
| 논문                | HuggingFace Daily Papers · arXiv cs.CL · arXiv cs.RO · Takara TLDR                                                                                                                                                                                                           |
| 비활성              | Industrial AI · It Can Think!(Actions 러너에서 403) · arXiv cs.AI · arXiv cs.LG                                                                                                                                                                                              |

> RSS 수집은 별도 키가 필요 없습니다. GitHub API 는 선택적 토큰(레이트리밋 완화), arXiv 는 Semantic Scholar·OpenAlex 로 "유명 논문" 게이트를 겁니다([configs/paper-filter.json](configs/paper-filter.json)). Reddit 어댑터(OAuth2)는 남아 있지만 등록된 소스는 없습니다. 각 소스의 `enabled` 플래그로 개별 on/off 합니다.

## 로컬 개발

```bash
npm install
cp .env.example .env.local       # 아래 "환경 변수" 참고해 값 입력
npm run db:init                  # data/app.db 에 7개 테이블 생성 + sources.json 동기화
npm run collect -- --dry-run     # 수집 → 선별 풀까지만: notes·풀 구성·오늘 할당 출력 (LLM·API 키·DB 쓰기 없음)
npm run collect -- --no-save     # LLM 단계까지 실제로 돌리되 DB 는 쓰지 않음 (data/eval/ 스냅숏)
npm run collect                  # 수집 → 선별·가공 → 저장 배치 1회 (ANTHROPIC_API_KEY 필요, app.db 변경)
npm run dev                      # http://localhost:3000
```

`/admin` 은 `ADMIN_PASSWORD` 설정 후 `/admin/login` 으로 로그인합니다(로컬 `npm run dev` 전용).

> 커밋된 `data/app.db` 를 로컬에서 바꾸면 배포 브랜치의 일일 수집 커밋과 충돌합니다. 소스·프롬프트 검증은 `--dry-run`/`--no-save` 로 하세요.

### Docker (정적 사이트 미리보기)

```bash
docker compose up --build        # http://localhost:8080/global-ai-news/
```

GitHub Pages 에 올라가는 것과 같은 정적 export(`out/`)를 이미지 안에서 빌드해 nginx 로 서빙합니다. 콘텐츠는 빌드 시점의 `data/app.db` 로 굳으므로 API 키·볼륨이 필요 없고, 새 수집분은 `--build` 로 다시 굽습니다. `/admin` 은 들어가지 않습니다(로컬 `npm run dev` 전용).

## 환경 변수

`.env.local`(git 미커밋)에 설정합니다. 변수는 **실행 위치별로** 필요한 곳이 다릅니다. 배포(GitHub Pages)는 정적 파일이라 런타임 환경 변수가 없습니다.

| 변수                                           | 용도                                                    | 로컬 | GitHub Actions |
| ---------------------------------------------- | ------------------------------------------------------- | :--: | :------------: |
| `ANTHROPIC_API_KEY`                            | LLM 선별·가공·재보도 검사                               |  ●   |   ● (Secret)   |
| `LLM_MODEL`                                    | 모델 전환(기본 `claude-haiku-4-5`)                      |  ○   |  ○ (Variable)  |
| `MAX_PICKS_PER_RUN` / `TRIAGE_POOL_SIZE`       | 1회 게재 상한(기본 35) / 선별 후보 상한(기본 180)       |  ○   |  ○ (Variable)  |
| `MAX_COST_USD_PER_RUN`                         | 1회 LLM 비용 상한(기본 0.1)                             |  ○   |  ○ (Variable)  |
| `LLM_USE_BATCH` / `BATCH_TIMEOUT_MIN`          | Batches API 사용(기본 1) / 배치 대기 상한(기본 25분)    |  ○   |  ○ (Variable)  |
| `SEMANTIC_SCHOLAR_API_KEY` / `OPENALEX_MAILTO` | arXiv 게이트의 인용·소속 조회 보강                      |  ○   |       –        |
| `GITHUB_PAT`                                   | GitHub API 인증(수집) · sources.json 커밋·재수집(admin) |  ○   |  ○\* (Secret)  |
| `GITHUB_REPO` (`owner/repo`)                   | admin GitHub API 대상                                   |  ○   |       –        |
| `GITHUB_BRANCH` (기본 `deploy/github-pages`)   | admin 커밋/dispatch 대상 브랜치                         |  ○   |       –        |
| `ADMIN_PASSWORD`                               | 로컬 admin 인증 + 세션 서명                             |  ○   |       –        |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`    | Reddit OAuth2 (현재 Reddit 소스 없음)                   |  ○   |   ○ (Secret)   |

● 필수 · ○ 선택 · – 불필요. Actions 의 Variable 이 비어 있으면 코드 기본값을 씁니다. Variable 을 설정해 두면 코드 기본값보다 우선합니다.

\* Actions 의 `GITHUB_PAT` 는 GitHub API(검색·트렌딩 토픽 조회) 레이트리밋 완화용(선택)입니다. `GH_SEARCH_PAT` 시크릿이 없으면 빌트인 `GITHUB_TOKEN` 으로 인증하고, DB 커밋/푸시도 `GITHUB_TOKEN` 이 처리하므로 PAT가 없어도 자동화는 잘 돌아갑니다.

## GitHub Actions 설정 (자동화)

워크플로: [.github/workflows/collect.yml](.github/workflows/collect.yml)

- 트리거: 외부 크론의 `workflow_dispatch`(06:00 KST 정시 발행, 아래 "발행 트리거") + 백업 `schedule` `47 21 * * *`(21:47 UTC = 06:47 KST) + `workflow_dispatch`(관리자 콘솔 "재수집" 버튼/수동).
- 백업 `schedule` 실행은 최근 12시간 안에 성공한 수집이 있으면 `guard` 잡에서 건너뜁니다(하루 2회 수집 시 LLM 비용 2배·호수 2씩 증가 방지). `workflow_dispatch` 는 항상 수집합니다.
- **살아 있는 워크플로 파일은 `deploy/github-pages` 의 것 하나입니다.** 이 저장소의 기본 브랜치가 `deploy/github-pages` 이고, GitHub 는 `schedule` 을 기본 브랜치의 워크플로 파일로 돌립니다. 외부 크론·관리자 콘솔의 dispatch 도 `ref: deploy/github-pages` 입니다. `main` 은 2026-07 이후 갱신하지 않은 옛 브랜치라 그쪽 `collect.yml` 은 어떤 트리거로도 실행되지 않습니다 — 워크플로는 `deploy/github-pages` 에서만 고칩니다. 확인: `gh repo view --json defaultBranchRef`, `gh run list --workflow collect.yml`(실행의 브랜치 열).
- 동작: `npm ci` → `npm run collect` → `data/app.db` 변경분만 `deploy/github-pages` 에 커밋·push → `deploy.yml` 을 dispatch 해 GitHub Pages 배포.
- `concurrency: collect` 로 실행을 직렬화해 `app.db` 동시 쓰기/푸시 경쟁을 막습니다.

### 발행 트리거(외부 크론)

GitHub `schedule` 은 정시 실행을 보장하지 않습니다. 이 저장소에서는 2026-08 말부터 예정보다 2~8시간 늦게 시작해, 06:00 발행이 08~14시로 밀렸습니다. cron 을 앞당겨도 시작 시각은 그대로였습니다. 그래서 06:00 정시 발행은 외부 크론이 GitHub API 로 `workflow_dispatch` 를 호출해 맡고(수 초 안에 시작), `schedule` 은 외부 크론이 실패한 날의 백업으로만 둡니다.

1. **토큰 발급** — GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Repository access: **Only select repositories** → 이 저장소 하나
   - Repository permissions: **Actions: Read and write** 만 부여(Metadata: Read-only 는 자동 포함). 워크플로 실행만 다룰 수 있고 코드·시크릿에는 접근하지 못합니다.
   - 만료일을 정하고, 만료 전에 새 토큰으로 바꿔 넣습니다(만료되면 백업 `schedule` 만 돌아 발행이 늦어집니다).
2. **외부 크론 등록** — [cron-job.org](https://cron-job.org)(무료) → Create cronjob
   - URL: `https://api.github.com/repos/<owner>/<repo>/actions/workflows/collect.yml/dispatches`
   - Schedule: 매일 06:00, Time zone **Asia/Seoul**
   - Advanced → Request method **POST**, Request body `{"ref":"deploy/github-pages"}`
   - Headers: `Authorization: Bearer <토큰>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json`
   - 성공 응답은 `204 No Content` 입니다. 실패 알림(Notifications)을 켜 두면 토큰 만료를 바로 알 수 있습니다.
3. **확인** — 다음 날 06:00 직후 Actions 의 `collect` 실행이 `workflow_dispatch` 이벤트로 떠 있고, 06:47 이후의 `schedule` 실행은 `guard` 에서 `skip — already published` 로 끝났는지 봅니다.

> 바로 시험하려면 cron-job.org 의 "Test run" 이나 아래 `curl` 을 씁니다. **실제 수집이 한 번 돌아** LLM 비용(약 $0.03)이 들고 호수가 1 오릅니다.
>
> ```bash
> curl -X POST https://api.github.com/repos/<owner>/<repo>/actions/workflows/collect.yml/dispatches \
>   -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
>   -H "X-GitHub-Api-Version: 2022-11-28" -d '{"ref":"deploy/github-pages"}'
> ```
>
> Cloudflare Workers 의 Cron Trigger(무료)로 같은 요청을 보내도 됩니다.

**Repository → Settings → Secrets and variables → Actions** 에서 등록합니다.

- Secrets: `ANTHROPIC_API_KEY`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, (선택) `GH_SEARCH_PAT`
- Variables(모두 선택 — 비우면 코드 기본값): `LLM_MODEL`, `MAX_PICKS_PER_RUN`, `TRIAGE_POOL_SIZE`, `MAX_COST_USD_PER_RUN`, `LLM_USE_BATCH`, `BATCH_TIMEOUT_MIN`

> GitHub은 `GITHUB_` 으로 시작하는 Secret 이름을 금지합니다. Search용 PAT은 **`GH_SEARCH_PAT`** 시크릿으로 만들면 워크플로가 이를 `GITHUB_PAT` 환경변수로 매핑합니다.
>
> 관리자 콘솔의 "재수집" 은 정확히 `collect.yml` 파일명으로 dispatch 합니다. **파일명을 바꾸지 마세요.**

## GitHub Pages 배포

워크플로: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

1. 저장소 **Settings → Pages → Source = "GitHub Actions"** 로 설정합니다.
2. 트리거: `deploy/github-pages` 브랜치에 `data/app.db`·`configs/**`·`src/**`·`next.config.ts`·`package.json` 변경이 push 되거나, `collect.yml` 이 수집 후 직접 dispatch 할 때(빌트인 `GITHUB_TOKEN` 의 push 는 다른 워크플로를 트리거하지 못하기 때문), 또는 수동 `workflow_dispatch`.
3. 빌드: Node 22 → `npm ci` → `npm run build`. `prebuild` 가 `initDb --existing`(스키마·sources 동기화, DB 가 없으면 실패) → `public/search-index.json` → `public/feed-index.json` → `public/latest.json` 을 만든 뒤 `next build` 가 정적 export(`out/`, `basePath` `/global-ai-news`)를 산출하고 Pages 에 올립니다.

`npm run start`(`next start`)는 정적 export 와 함께 쓸 수 없습니다. 로컬에서 산출물을 확인하려면 `out/` 을 `/global-ai-news` 서브경로로 서빙하세요.

## 운영 · 모니터링

- 로컬 `/admin` — 소스 CRUD(GitHub 커밋), 즉시 재수집, **KPI 요약**, **소스 헬스**, 실행 이력·비용 표.
- GitHub Actions → `collect` 실행 이력으로 파이프라인 성공/실패를, `deploy` 실행 이력으로 배포 시각·로그를 확인합니다. `collect` 실행 요약(Summary)에는 소스 헬스 표가 붙고, 오류·경고 소스는 `::warning::` 주석으로 뜹니다.
- **소스 헬스** — 최근 30회 notes 의 소스별 결과로 판정합니다(`src/lib/sourceHealth.ts`): 연속 실패 2회 이상 = 오류, 연속 신규 0건 3회 이상 = 경고(피드는 응답하는데 새 글만 없으면 7회), 최근 1회 실패 = 주의. 비활성 소스는 제외합니다.
- 회차별 notes(`collection_runs.notes`)에 소스별 결과, 형식별 후보→풀→게재 수, 할당 미달·초과, 재보도 제외 건수가 남습니다.

## KPI 확인

```bash
npm run kpi              # 최근 30일 집계 (npm run kpi 14 → 최근 14일)
npm run kpi -- baseline  # 콘텐츠 개편 지표(형식·분야 비율, Physical AI, 1면 구성, 회차 비용 등)
npm run kpi -- health    # 소스 헬스(연속 실패·연속 0건) Markdown 표 — --ci 는 collect.yml 용(요약·주석, 항상 exit 0)
```

`collection_runs`/`articles` 에서 자동으로 뽑아낼 수 있는 KPI를 목표 대비 PASS/FAIL 로 출력합니다. 같은 지표가 `/admin` "KPI 요약" 패널에도 표시됩니다. `baseline` 하위 명령은 [docs/contents-upgrade-plan.md](docs/contents-upgrade-plan.md) 의 기준선·목표 지표를 측정합니다(DB 읽기 전용).

PRD §9 목표:

| 항목              | 목표                 | 측정                               |
| ----------------- | -------------------- | ---------------------------------- |
| 일일 LLM 비용     | ≤ $0.30              | `npm run kpi` (자동)               |
| 파이프라인 성공률 | ≥ 95% (최근 30일)    | `npm run kpi` (자동)               |
| 일일 신규 카드    | ≥ 30건               | `npm run kpi` (자동)               |
| 중복 제거         | 0건                  | `npm run kpi` (자동)               |
| 피드 LCP          | ≤ 2.0s (데스크톱)    | Lighthouse (수동)                  |
| 한국어 요약 품질  | 주간 20건 ≥ 90%      | 샘플 리뷰 (수동)                   |
| 소스 변경 반영    | 저장 → 재배포 ≤ 10분 | `deploy` 워크플로 완료 시각 (수동) |

## 스크립트

| 명령                                    | 설명                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                           | 개발 서버(admin/api 포함)                                              |
| `npm run build`                         | 정적 export(`out/`) — prebuild 로 검색 인덱스·latest.json 생성         |
| `npm run db:init`                       | `data/app.db` 7개 테이블 생성 + sources.json 동기화                    |
| `npm run db:reindex`                    | FTS5 인덱스 재색인                                                     |
| `npm run db:reclassify`                 | 구 분야값 → 6개 키 LLM 재분류(기본 dry-run, `--apply` 로 백업 후 적용) |
| `npm run collect`                       | 수집→선별·가공→재보도 검사→저장 배치 1회                               |
| `npm run collect -- --dry-run`          | 수집→선별 풀까지만(비용·DB 변경 없음)                                  |
| `npm run collect -- --no-save`          | LLM 단계까지 실행, DB 쓰기 없이 `data/eval/` 스냅숏                    |
| `npm run triage:compare -- <스냅숏>`    | 같은 풀로 개편 전후 선별 비교                                          |
| `npm run export-search-index`           | `public/search-index.json` 생성(prebuild 가 자동 실행)                 |
| `npm run export-feed-index`             | `public/feed-index.json`(홈 색인 누적분) 생성(prebuild 가 자동 실행)   |
| `npm run export-latest`                 | `public/latest.json`(최근 3일 수집분, 외부 소비용) 생성                |
| `npm run kpi`                           | 최근 N일 KPI 집계(기본 30), `-- baseline` 콘텐츠 개편 지표             |
| `npm run lint` / `format` / `typecheck` | ESLint / Prettier / 타입체크                                           |
| `npm test` / `test:watch`               | Vitest                                                                 |

## 트러블슈팅

- **관리자 "재수집" 이 409** — `.github/workflows/collect.yml` 이 기본 브랜치에 배포돼야 dispatch 가 성공합니다.
- **CI 네이티브 빌드 실패(`better-sqlite3`)** — 프리빌드가 없으면 node-gyp 로 폴백합니다(ubuntu-latest 에 빌드 도구 포함). 그래도 안 되면 워크플로에 `npm rebuild better-sqlite3` 스텝을 추가하거나 버전을 고정하세요.
- **`data/app.db` 푸시 경쟁/머지 충돌** — SQLite 바이너리는 3-way 머지가 안 됩니다. `concurrency` 로 단일 실행을 보장하며, 충돌이 나면 Actions 산출본을 취하거나 `npm run collect` 로 다시 만드세요.
- **사이트에 새 호가 안 보임** — `collect` 실행이 DB 를 커밋했는지, 이어서 `deploy` 워크플로가 dispatch 돼 성공했는지 Actions 에서 확인하세요. Pages Source 가 "GitHub Actions" 인지도 확인합니다.

## 라이선스

Apache 2.0. [LICENSE](LICENSE) 참고.
