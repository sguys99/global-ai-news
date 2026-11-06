# `latest.json` 변경 공지 (2026-11) — 자랑터 「한입뉴스」 담당 개발자께

대상 파일: `https://sguys99.github.io/global-ai-news/latest.json`
적용 시점: 이 변경이 들어간 뒤 첫 배포 빌드(매일 06:00 KST 수집 직후 자동 배포)

## 요약

- **항목에 영어 필드 2개가 늘어납니다.** `titleEn`(영어 제목), `summaryEn`(영어 요약). 둘 다 선택 필드입니다.
- 저희 영어판이 2026-11-06에 문을 열었습니다(`https://sguys99.github.io/global-ai-news/en/`). 두 필드는 영어판 기사 페이지에 실리는 제목·요약과 같은 값입니다.
- 기존 필드는 하나도 빠지거나 이름이 바뀌지 않습니다. 봉투·정렬·`brief`도 그대로라 **`version`은 1 그대로**입니다. **지금 코드는 고치지 않으셔도 됩니다.**

## 무엇이 바뀌나

| 필드        | 이전 | 이후                             |
| ----------- | ---- | -------------------------------- |
| `titleEn`   | 없음 | **신규·선택.** 영어 제목 한 줄   |
| `summaryEn` | 없음 | **신규·선택.** 영어 요약 2~3문장 |
| `version`   | `1`  | `1` (변경 없음, 필드 추가뿐)     |

- **두 키는 늘 같이 있거나 같이 없습니다.** 영어판에 실린 기사에만 있고, 없는 기사는 `engagement`처럼 키 자체가 없습니다(`null`·빈 문자열을 넣지 않습니다).
- 영어가 없는 경우는 두 가지입니다. ① 영어 품질 검사(한글 섞임·길이·원문에 없는 숫자나 금액)에서 떨어진 기사, ② 영어 가공을 시작하기 전에 들어와 영어를 채우지 못한 지난 기사(드뭅니다). 현재 창 안 기사의 약 97%에 영어가 있습니다(2026-11-06 기준 67건 중 65건).
- 영어는 한국어 요약을 번역한 글이 아니라 **원문을 보고 따로 쓴 글**입니다. 그래서 `titleKo`와 문장이 꼭 대응하지는 않습니다.
- 표기 규칙: 제목은 sentence case(첫 단어와 고유명사만 대문자 — `OpenAI acquires Pierre Computer Company`), 금액은 **원문 통화 그대로**입니다(원화는 `KRW 147.7 billion`처럼 쓰고 달러로 바꾸지 않습니다).
- 한국 매체 기사도 영어가 있으면 실립니다. 다만 `source.name`은 지금처럼 한국어 매체명(예: `로봇신문`) 그대로입니다.

### `brief`(세 줄 요약)

`brief.lines[].text`는 지금처럼 한국어만 싣습니다. 영어 줄은 따로 만들지 않습니다. 저희 영어판의 세 줄 요약 띠는 각 줄 `id` 기사의 `titleEn`을 그대로 씁니다. 같은 방식이 필요하시면 `lines[].id`로 `items`에서 `titleEn`을 찾아 쓰시면 됩니다. `titleEn`이 없는 줄은 빼고, 남은 줄이 2줄 미만이면 띠를 숨기는 것이 저희 규칙입니다.

## 예시 (같은 기사, 배포 전 → 후)

배포 전:

```json
{
  "id": 1356,
  "source": { "id": "openai_news", "name": "OpenAI News" },
  "url": "https://openai.com/index/openai-to-acquire-pierre",
  "titleKo": "OpenAI, Pierre Computer Company 인수",
  "summaryKo": "OpenAI가 Pierre Computer Company를 인수한다. 코딩 에이전트 Codex의 도구 확대를 목표로 한다.",
  "titleOriginal": "OpenAI to acquire Pierre Computer Company, Inc.",
  "category": "agent",
  "format": "news",
  "tags": ["openai", "agent", "codex", "code"],
  "trendingScore": 0,
  "importance": 5,
  "publishedAt": "2026-11-04T14:30:00.000Z",
  "related": [],
  "categoryLabel": "에이전트",
  "collectedAt": "2026-11-04T21:08:15Z"
}
```

배포 후 (`titleEn`·`summaryEn` 두 줄만 늘어남):

```json
{
  "id": 1356,
  "source": { "id": "openai_news", "name": "OpenAI News" },
  "url": "https://openai.com/index/openai-to-acquire-pierre",
  "titleKo": "OpenAI, Pierre Computer Company 인수",
  "summaryKo": "OpenAI가 Pierre Computer Company를 인수한다. 코딩 에이전트 Codex의 도구 확대를 목표로 한다.",
  "titleOriginal": "OpenAI to acquire Pierre Computer Company, Inc.",
  "category": "agent",
  "format": "news",
  "tags": ["openai", "agent", "codex", "code"],
  "trendingScore": 0,
  "importance": 5,
  "publishedAt": "2026-11-04T14:30:00.000Z",
  "related": [],
  "titleEn": "OpenAI acquires Pierre Computer Company",
  "summaryEn": "OpenAI is acquiring Pierre Computer Company to expand tools for Codex, its coding agent.",
  "categoryLabel": "에이전트",
  "collectedAt": "2026-11-04T21:08:15Z"
}
```

## 소비자 조치

1. **필요 없음:** 기존 필드만 읽는 코드는 그대로 동작합니다.
2. **선택:** 영어를 쓰신다면 두 필드를 옵셔널로 다루고, 없으면 한국어(`titleKo`·`summaryKo`)로 대체하거나 그 기사를 건너뛰세요.

```ts
interface LatestItem {
  titleKo: string;
  summaryKo: string;
  titleEn?: string; // 영어판에 실린 기사에만 있음
  summaryEn?: string; // titleEn 과 늘 같이 있거나 같이 없음
  // ...기존 필드
}

export const hasEnglish = (item: LatestItem) => Boolean(item.titleEn && item.summaryEn);
```

## 일정·문의

| 시점                    | 내용                                            |
| ----------------------- | ----------------------------------------------- |
| 2026-11-06              | 영어판(`/en/`) 출시                             |
| 이 변경 후 첫 배포 빌드 | `latest.json` 항목에 `titleEn`·`summaryEn` 적용 |

- 창 안의 지난 기사도 영어가 있으면 첫 배포부터 함께 실립니다(지난 기사 영어는 이미 채워 두었습니다).
- 07:00 KST 정기 fetch는 그대로 두셔도 됩니다. 06:00 수집 → 배포 흐름은 바뀌지 않습니다.
- 문의는 AI Daybook 저장소(`sguys99/global-ai-news`) 이슈나 기존 연락 채널로 주세요.
