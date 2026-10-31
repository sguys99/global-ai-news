# `latest.json` 변경 공지 (2026-10) — 자랑터 「한입뉴스」 담당 개발자께

대상 파일: `https://sguys99.github.io/global-ai-news/latest.json`
적용 시점: Daily AI Brief 콘텐츠 개편 배포일(예정 2026-10-31)

## 요약

- **`category` 값이 바뀝니다.** `"Language Models"` 같은 표시용 영문·한글 값 대신 `"llm"` 같은 짧은 키가 들어갑니다. 분야도 6개로 다시 나눴습니다(Physical AI 신설, Dev Tools·MLOps는 오픈소스·도구로 합침).
- **필드 3개가 늘어납니다.** `categoryLabel`(분야 표시명), `format`(news/oss/model/paper), `engagement`(수집 시점 지표, 선택).
- 기존 필드는 하나도 빠지지 않습니다. 봉투(`version: 1`, `generatedAt`, `windowDays: 3`, `items`)와 정렬(중요도 내림차순 → 화제 점수 내림차순)도 같아서 **`version`은 1 그대로**입니다. `category` 값으로 분기하는 코드만 고치면 됩니다.

## 무엇이 바뀌나

### 필드

| 필드            | 이전                             | 이후                                                                        |
| --------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `category`      | 구 표시값 (`"Language Models"`…) | 분야 키 6종 (`"llm"`…), 아래 표                                             |
| `categoryLabel` | 없음                             | **신규.** 분야 한글 표시명. 화면에는 이 값을 그대로 쓰면 됩니다             |
| `format`        | 없음                             | **신규.** `"news"` · `"oss"` · `"model"` · `"paper"`. 매체(소스)가 정합니다 |
| `engagement`    | 없음                             | **신규·선택.** 지표가 있는 기사에만 키가 있고, 없으면 키 자체가 없습니다    |
| `version`       | `1`                              | `1` (변경 없음, 필드 추가뿐)                                                |

창 안의 지난 기사도 출력할 때 새 키로 바꿔 내보냅니다. 그래서 배포 후 파일 하나에 구 값과 새 값이 섞이지 않습니다.

### `category` 대응표

| 이전 값             | 새 `category` | `categoryLabel` |
| ------------------- | ------------- | --------------- |
| `"Language Models"` | `"llm"`       | `LLM`           |
| `"Agents"`          | `"agent"`     | `에이전트`      |
| (없음, 신설)        | `"physical"`  | `Physical AI`   |
| `"Dev Tools"`       | `"oss"`       | `오픈소스·도구` |
| `"MLOps"`           | `"oss"`       | `오픈소스·도구` |
| `"연구·논문"`       | `"research"`  | `연구·논문`     |
| `"산업·정책"`       | `"industry"`  | `산업·정책`     |

- 새 키에서 구 값으로 되돌릴 수는 없습니다. `oss`는 Dev Tools인지 MLOps인지 구분하지 않고, `physical`에 해당하는 구 값은 없습니다.
- 목록 밖의 값이 오면 `categoryLabel`에 그 값이 그대로 들어갑니다(실제로는 나오지 않는 예외 경로).

### `format` (형식)

| 값        | 의미                 | 배지    | 주요 매체                                       |
| --------- | -------------------- | ------- | ----------------------------------------------- |
| `"news"`  | 뉴스·블로그 (기본값) | 없음    | RSS 매체, Hacker News, GeekNews 등              |
| `"oss"`   | GitHub 저장소        | `REPO`  | GitHub Trending, GitHub 토픽 검색               |
| `"model"` | Hugging Face 모델    | `MODEL` | HuggingFace 트렌딩 모델 (신규 소스)             |
| `"paper"` | 논문                 | `PAPER` | HF Daily Papers, arXiv cs.CL·cs.RO, Takara TLDR |

- 저희 사이트는 뉴스에 배지를 달지 않고 나머지 세 형식에만 배지를 붙입니다.
- **`category`와 `format`은 서로 다른 축입니다.** 키 `oss`가 양쪽에 있어 헷갈리기 쉽습니다. 에이전트 프레임워크 저장소는 `category: "agent"`, `format: "oss"`이고, 개발 도구를 다룬 뉴스 기사는 `category: "oss"`, `format: "news"`입니다.

### 물량·구성 (배포 후 첫 수집 회차부터)

| 항목                     | 이전           | 이후                                                                           |
| ------------------------ | -------------- | ------------------------------------------------------------------------------ |
| 하루 게재 상한           | 30건           | 35건. 재보도 검사로 빠지는 기사가 있어 실제로는 20~30건대가 예상됩니다         |
| 비뉴스(저장소·모델·논문) | 거의 없음 (5%) | 하루 약 8건이 목표이고, 후보가 있으면 형식마다 1건 이상                        |
| Physical AI              | 분류 없음      | 하루 3건 이상이 목표, 상한 9건                                                 |
| `importance`             | 전체 후보 비교 | **같은 형식 안에서** 비교. 저장소·논문도 4~5를 받을 수 있음(5는 하루 최대 2건) |

- 창이 3일이라 파일에는 대략 60~105건이 담깁니다.
- 중요도 순으로 앞에서 N건을 자르면 이제 저장소·논문이 섞여 들어옵니다. 뉴스만 원하시면 `format === "news"`로 거르세요.
- 형식 필드는 배포 즉시 나옵니다. 물량·구성 변화는 배포 후 첫 06:00 KST 수집분부터 반영됩니다.

## 소비자 조치

1. **필수:** `category`를 구 값(`"Language Models"` 등)과 비교하는 코드가 있으면 새 키로 바꾸세요. 전환 기간에는 아래처럼 두 값을 모두 받으면 안전합니다.
2. **권장:** 표시명은 직접 매핑하지 말고 `categoryLabel`을 쓰세요.
3. **선택:** `format`으로 뉴스와 비뉴스를 나누거나 배지를 다세요. 값이 없으면 `"news"`로 보면 됩니다.
4. `engagement`는 키가 없을 수 있으니 옵셔널로 다루세요.

```ts
type Category = "llm" | "agent" | "physical" | "oss" | "research" | "industry";
type Format = "news" | "oss" | "model" | "paper";

const LEGACY_CATEGORY: Record<string, Category> = {
  "Language Models": "llm",
  Agents: "agent",
  "Dev Tools": "oss",
  MLOps: "oss",
  "연구·논문": "research",
  "산업·정책": "industry",
};

const CATEGORY_LABEL: Record<Category, string> = {
  llm: "LLM",
  agent: "에이전트",
  physical: "Physical AI",
  oss: "오픈소스·도구",
  research: "연구·논문",
  industry: "산업·정책",
};

interface LatestItem {
  category: string;
  categoryLabel?: string; // 배포 전 파일에는 없음
  format?: Format; // 배포 전 파일에는 없음
  // ...기존 필드
}

/** 구 값·새 키를 모두 새 키로 맞춘다. 모르는 값은 그대로 둔다. */
export function categoryKey(value: string): string {
  return Object.hasOwn(LEGACY_CATEGORY, value) ? LEGACY_CATEGORY[value] : value;
}

export function categoryLabelOf(item: LatestItem): string {
  if (item.categoryLabel) return item.categoryLabel;
  const key = categoryKey(item.category);
  return Object.hasOwn(CATEGORY_LABEL, key) ? CATEGORY_LABEL[key as Category] : item.category;
}

export const formatOf = (item: LatestItem): Format => item.format ?? "news";
```

## 예시 (같은 기사, 배포 전 → 후)

배포 전:

```json
{
  "id": 1245,
  "source": { "id": "github_llm", "name": "GitHub (topic:llm)" },
  "url": "https://github.com/N1nEmAn/sapper-v2",
  "titleKo": "N1nEmAn, 자율형 침투 테스트 에이전트 'Sapper-v2' 공개",
  "summaryKo": "텐센트 지능형 공격-방어 대회 3위 우승팀이 …",
  "titleOriginal": "N1nEmAn/sapper-v2",
  "category": "Agents",
  "tags": ["agent", "autonomous", "pentest"],
  "trendingScore": 18,
  "importance": 2,
  "publishedAt": "2026-10-30T15:13:01.000Z",
  "related": [],
  "collectedAt": "2026-10-30T21:04:21Z"
}
```

배포 후 (바뀐 줄만 다름):

```json
{
  "id": 1245,
  "source": { "id": "github_llm", "name": "GitHub (topic:llm)" },
  "url": "https://github.com/N1nEmAn/sapper-v2",
  "titleKo": "N1nEmAn, 자율형 침투 테스트 에이전트 'Sapper-v2' 공개",
  "summaryKo": "텐센트 지능형 공격-방어 대회 3위 우승팀이 …",
  "titleOriginal": "N1nEmAn/sapper-v2",
  "category": "agent",
  "format": "oss",
  "tags": ["agent", "autonomous", "pentest"],
  "trendingScore": 18,
  "importance": 2,
  "publishedAt": "2026-10-30T15:13:01.000Z",
  "related": [],
  "engagement": { "stars": 92 },
  "categoryLabel": "에이전트",
  "collectedAt": "2026-10-30T21:04:21Z"
}
```

`engagement`에 들어올 수 있는 키: `points`·`num_comments`(HN), `ups`(Reddit·HF 논문), `stars`·`stars_today`·`language`(GitHub), `likes`·`downloads`·`hf_trending`·`pipeline_tag`·`params`(HF 모델), `citations`·`influential`(arXiv). 모두 선택 키입니다.

## 일정·문의

| 시점                      | 내용                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| 배포일(예정 2026-10-31)   | 배포 빌드부터 `category` 새 키, `categoryLabel`·`format`·`engagement` 적용 |
| 배포 후 첫 06:00 KST 수집 | 새 선별 기준(35건 상한, 비뉴스·Physical AI 할당) 첫 반영                   |

- 07:00 KST 정기 fetch는 그대로 두셔도 됩니다. 06:00 수집 → 배포 흐름은 바뀌지 않습니다.
- 배포일이 바뀌면 다시 알려 드립니다. 문의는 Daily AI Brief 저장소(`sguys99/global-ai-news`) 이슈나 기존 연락 채널로 주세요.
