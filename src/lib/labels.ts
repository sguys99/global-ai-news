/**
 * 표시용 라벨·날짜 포맷 단일 출처 (DESIGN.md §4).
 * 데이터 값(분야 키·소스명)은 불변이고, 화면 표기만 여기서 변환한다.
 * 날짜는 빌드(UTC)·브라우저(사용자 TZ) 간 하이드레이션 불일치를 막기 위해 KST로 고정한다.
 *
 * 영어판(Phase 3-2): 독자 화면용 표시명·날짜·상대 시각·발행 지연 문구는 마지막 인자 `locale`(기본 "ko")로 영어를 낸다.
 * 기본값이 ko 라 기존 호출(웹·scripts/)은 출력이 그대로다. 운영·프롬프트용 이름(FORMAT_LABELS 등)은 한국어 전용이다.
 */
import type { Locale } from "@/lib/i18n";

/**
 * 분야(카테고리) 저장 키 — articles.category 와 LLM 가공 출력 enum(scripts/lib/schema.ts)의 단일 출처.
 * 순서 = 섹션·내비·필터 칩 순서. 키는 URL-safe 라 `?category=physical`·`#section-physical`에 그대로 쓴다.
 */
export const CATEGORIES = ["llm", "agent", "physical", "oss", "research", "industry"] as const;

export type Category = (typeof CATEGORIES)[number];

/** 분야 키 → 한글 표시명. */
export const CATEGORY_LABELS: Record<Category, string> = {
  llm: "LLM",
  agent: "에이전트",
  physical: "Physical AI",
  oss: "오픈소스·도구",
  research: "연구·논문",
  industry: "산업·정책",
};

/** 분야 키 → 영어 표시명(영어판, Phase 0-5 확정). */
export const CATEGORY_LABELS_EN: Record<Category, string> = {
  llm: "LLM",
  agent: "Agents",
  physical: "Physical AI",
  oss: "Open Source & Tools",
  research: "Research",
  industry: "Industry & Policy",
};

/** 언어 → 분야 표시명 맵(칩·내비처럼 키 순회로 그릴 때). */
export const CATEGORY_LABELS_BY_LOCALE: Record<Locale, Record<Category, string>> = {
  ko: CATEGORY_LABELS,
  en: CATEGORY_LABELS_EN,
};

/** 분야 키 → 3자 코드(좁은 키커·배지용). */
export const CATEGORY_CODES: Record<Category, string> = {
  llm: "LLM",
  agent: "AGT",
  physical: "PHY",
  oss: "OSS",
  research: "RES",
  industry: "BIZ",
};

/**
 * 구 저장값(분야 개편 전 6종) → 새 키. 마이그레이션(scripts/reclassify.ts)의 규칙 폴백이자,
 * 아직 변환 전인 행·예전 공유 URL(`?category=Language%20Models`)을 받아 주는 호환 맵이다.
 * Dev Tools·MLOps 는 오픈소스·도구로 흡수한다. Physical AI 는 신설이라 구 값이 없다.
 */
export const LEGACY_CATEGORY_MAP: Readonly<Record<string, Category>> = {
  "Language Models": "llm",
  Agents: "agent",
  "Dev Tools": "oss",
  MLOps: "oss",
  "연구·논문": "research",
  "산업·정책": "industry",
};

export function isCategory(value: string): value is Category {
  return Object.hasOwn(CATEGORY_LABELS, value);
}

/** 저장값 → 새 키. 구 값은 매핑하고, 이미 키이거나 미정의 값은 그대로 둔다. */
export function normalizeCategory(value: string): string {
  return Object.hasOwn(LEGACY_CATEGORY_MAP, value) ? LEGACY_CATEGORY_MAP[value] : value;
}

/** 분야 키에 해당하는 저장값 전체(키 + 구 값). 변환 전 행도 같은 분야로 조회하기 위한 SQL 바인딩용. */
export function categoryAliases(category: string): string[] {
  const key = normalizeCategory(category);
  return [key, ...Object.keys(LEGACY_CATEGORY_MAP).filter((v) => LEGACY_CATEGORY_MAP[v] === key)];
}

/** 카테고리 → 섹션 앵커 슬러그(`#section-<slug>`). 키가 곧 슬러그, 미정의 값은 "etc". */
export function categorySlug(category: string): string {
  const key = normalizeCategory(category);
  return isCategory(key) ? key : "etc";
}

/** 카테고리 표시명. 구 값은 새 분야명으로, 미정의 값은 원문, 빈 값은 빈 문자열(두 언어 같은 규칙). */
export function categoryLabel(category: string, locale: Locale = "ko"): string {
  const key = normalizeCategory(category);
  return isCategory(key) ? CATEGORY_LABELS_BY_LOCALE[locale][key] : category;
}

/** 카테고리 3자 코드(LLM/AGT/PHY/OSS/RES/BIZ). 미정의·빈 값은 빈 문자열. */
export function categoryCode(category: string): string {
  const key = normalizeCategory(category);
  return isCategory(key) ? CATEGORY_CODES[key] : "";
}

/**
 * 형식(format) 키 — 소스 속성(configs/sources.json `format`, 생략 시 news)이자 sources.format 컬럼 값.
 * 분야와 달리 LLM 이 정하지 않고 소스가 정하므로, JOIN 으로 지난 기사에도 소급 적용된다.
 */
export const FORMATS = ["news", "oss", "model", "paper"] as const;

export type Format = (typeof FORMATS)[number];

/**
 * 형식 키 → LLM·운영 도구용 이름. 선별 프롬프트의 형식 칸·가공 `[형식]` 줄(configs/prompts 의 정의와 짝)과
 * 수집 로그·KPI·Admin 이 쓴다. 프롬프트 계약이라 바꾸지 않는다 — 독자 화면은 FORMAT_DISPLAY_LABELS.
 */
export const FORMAT_LABELS: Record<Format, string> = {
  news: "뉴스",
  oss: "오픈소스",
  model: "모델",
  paper: "논문",
};

/**
 * 형식 키 → 독자 화면 표시명(마스트헤드 귀·OG 형식 구성·레이더 머리·형식 배지 스크린리더).
 * oss 는 "오픈소스"가 아니라 대상을 가리키는 "저장소" — 같은 지면의 분야 "오픈소스·도구"와 낱말이 겹쳐
 * "오픈소스 1"과 "오픈소스·도구 2건"처럼 다른 건수가 같은 말로 읽히지 않게 한다.
 */
export const FORMAT_DISPLAY_LABELS: Record<Format, string> = {
  news: "뉴스",
  oss: "저장소",
  model: "모델",
  paper: "논문",
};

/**
 * 형식 키 → 영어판 화면 표시명(Phase 0-5 확정). oss 는 "Repo" — 분야 "Open Source & Tools"와 겹치지 않는다
 * (한국어판 "저장소"와 같은 이유). FORMAT_LABELS(프롬프트·운영용)의 영어판은 두지 않는다.
 */
export const FORMAT_DISPLAY_LABELS_EN: Record<Format, string> = {
  news: "News",
  oss: "Repo",
  model: "Model",
  paper: "Paper",
};

/** 언어 → 형식 화면 표시명 맵. */
export const FORMAT_DISPLAY_LABELS_BY_LOCALE: Record<Locale, Record<Format, string>> = {
  ko: FORMAT_DISPLAY_LABELS,
  en: FORMAT_DISPLAY_LABELS_EN,
};

/** 형식 화면 표시명(FORMAT_DISPLAY_LABELS / _EN). */
export function formatLabel(format: Format, locale: Locale = "ko"): string {
  return FORMAT_DISPLAY_LABELS_BY_LOCALE[locale][format];
}

/**
 * 영어 건수 명사(단수·복수). 뉴스는 불가산 "news" 가 아니라 "stories" 로 센다(Phase 0-5: `31 stories · 18 outlets`).
 * 레이더 보조 문구(messages/frontPage.ts "Repos and papers in this issue")도 이 복수형을 쓴다.
 */
export const FORMAT_COUNT_NOUNS_EN: Record<Format, readonly [one: string, other: string]> = {
  news: ["story", "stories"],
  oss: ["repo", "repos"],
  model: ["model", "models"],
  paper: ["paper", "papers"],
};

/**
 * 형식별 건수 문구 — 귀·레이더 머리·OG 형식 구성의 한 칸.
 * ko "저장소 4"(표시명 + 공백 + 수, weeklyRadar·ogImage 와 같은 모양), en "4 repos"·"1 story"(수가 앞, 복수형).
 */
export function formatCountLabel(format: Format, count: number, locale: Locale = "ko"): string {
  const noun = formatCountNoun(format, count, locale);
  return locale === "en" ? `${count} ${noun}` : `${noun} ${count}`;
}

/**
 * 형식별 건수 문구의 명사 부분만(수 없음) — 수를 따로 꾸미는 자리(마스트헤드 귀의 굵은 수)용.
 * ko 는 화면 표시명("저장소", 수와 무관), en 은 수에 맞춘 단·복수("repo"·"repos"). formatCountLabel 이 이것으로 조립한다.
 */
export function formatCountNoun(format: Format, count: number, locale: Locale = "ko"): string {
  if (locale === "en") {
    const [one, other] = FORMAT_COUNT_NOUNS_EN[format];
    return count === 1 ? one : other;
  }
  return FORMAT_DISPLAY_LABELS[format];
}

/** 형식 키 → 카드 배지 문구. 뉴스는 배지를 달지 않는다(빈 문자열). */
export const FORMAT_BADGES: Record<Format, string> = {
  news: "",
  oss: "REPO",
  model: "MODEL",
  paper: "PAPER",
};

export function isFormat(value: unknown): value is Format {
  return typeof value === "string" && Object.hasOwn(FORMAT_LABELS, value);
}

/** 저장값 → 형식 키. 미정의·빈 값(컬럼 추가 전 행 등)은 news. */
export function toFormat(value: unknown): Format {
  return isFormat(value) ? value : "news";
}

/**
 * 지역(region) 키 — 소스 속성(configs/sources.json `region`)이자 sources.region 컬럼 값. 생략(NULL) = 해외 매체.
 * 형식처럼 소스가 정하고 JOIN 으로 지난 기사에도 소급된다. 영어판 Korea Desk·`KOREA` 표시가 LLM 비용 없이 이 값을 쓴다.
 * 한국어 커뮤니티라도 해외 소식을 소개하는 소스(geeknews)는 두지 않는다 — 다루는 사건이 해외라 Korea Desk 감이 아니다.
 */
export const REGIONS = ["kr"] as const;

export type Region = (typeof REGIONS)[number];

/** 지역 키 → 운영 도구·스크린리더 이름. */
export const REGION_LABELS: Record<Region, string> = {
  kr: "한국 매체",
};

/** 지역 키 → 영어판 스크린리더 이름(KOREA 배지의 sr-only). 배지 문구 KOREA 는 두 언어 같다. */
export const REGION_LABELS_EN: Record<Region, string> = {
  kr: "Korean outlet",
};

/** 지역 표시명(REGION_LABELS / _EN). */
export function regionLabel(region: Region, locale: Locale = "ko"): string {
  return (locale === "en" ? REGION_LABELS_EN : REGION_LABELS)[region];
}

/** 지역 키 → 배지 문구(형식 배지와 같은 잉크 아웃라인 칩). 해외는 배지가 없다. */
export const REGION_BADGES: Record<Region, string> = {
  kr: "KOREA",
};

export function isRegion(value: unknown): value is Region {
  return typeof value === "string" && (REGIONS as readonly string[]).includes(value);
}

/**
 * 바이라인·칩·메타·상세 신호 패널에서 쓰는 매체 축약명 맵 — 독자가 아는 매체 이름(공식 표기, 예: "Hugging Face").
 * 축약명이 같은 소스는 매체 하나로 묶인다(feedFilter `groupSources`, 귀의 "매체 N곳"). 원래 이름은 title 툴팁에 둔다.
 */
const SOURCE_SHORT_LABELS: Record<string, string> = {
  "TechCrunch AI": "TechCrunch",
  "GitHub (topic:llm)": "GitHub",
  "GitHub (topic:ai-agents·mcp)": "GitHub",
  "GitHub (topic:robotics·embodied-ai)": "GitHub",
  "HuggingFace Daily Papers": "Hugging Face",
  "HuggingFace 트렌딩 모델": "Hugging Face",
  // 영어판 페이로드는 매체 name 을 영문명으로 바꿔 싣는다(englishSource) — 같은 묶음이 되게 영문명도 둔다.
  "HuggingFace Trending Models": "Hugging Face",
  // arXiv 카테고리 피드는 한 매체다(분야는 키커가 보여 준다). HF Papers·Takara TLDR 은 다른 매체라 따로 둔다.
  "arXiv cs.CL (NLP)": "arXiv",
  "arXiv cs.AI": "arXiv",
  "arXiv cs.LG (ML)": "arXiv",
  "arXiv cs.RO (Robotics)": "arXiv",
  "MIT Technology Review": "MIT Tech Review",
  "NVIDIA Technical Blog (Robotics)": "NVIDIA Dev",
  "IEEE Spectrum Robotics": "IEEE Spectrum",
  "Autonomous Vehicle International": "AV International",
  "Google News: humanoid robot": "Google News",
  "Google News: VLA": "Google News",
  "Google News: physical/embodied AI": "Google News",
  "Hacker News Front Page": "Hacker News",
};

export function shortSourceName(name: string): string {
  return SOURCE_SHORT_LABELS[name] ?? name;
}

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

/** 한글(자모·호환 자모·음절)이 섞였는지 — 영어판 표시 폴백 판정용. */
export function hasHangul(text: string): boolean {
  return HANGUL.test(text);
}

/**
 * 언어판에 보일 태그 — en 은 한글이 섞인 태그를 뺀다(english-version-plan 기본값: 영어판은 라틴 문자 태그만), ko 는 그대로.
 * 화면(ArticleMeta `visibleTags`)·영어 목록 카드(db.ts `toListCard`)·영어 색인 행(indexShards `encodeRow`)·
 * 영어 필터 칩(views/data.ts)이 같은 규칙을 쓴다.
 */
export function localeTags(tags: string[], locale: Locale = "ko"): string[] {
  return locale === "en" ? tags.filter((tag) => !hasHangul(tag)) : tags;
}

/**
 * 언어별 매체 표시명. `full` 이면 원래 이름(툴팁·상세 신호 패널), 아니면 축약명(바이라인·칩).
 *  - ko: 지금 그대로 — 축약 `shortSourceName(name)`, 전체 `name`.
 *  - en: 축약명 맵에 라틴 문자 이름이 있으면 그것(예: "HuggingFace 트렌딩 모델" → "Hugging Face"),
 *    없으면 영문 매체명 `nameEn`(sources.name_en, 한글 이름 매체만 있다), 그것도 없으면 `name`.
 *    전체 이름은 `nameEn ?? name`. 해외 매체 대부분은 nameEn 이 없고 name 이 이미 영문이다.
 */
export function sourceDisplayName(
  source: { name: string; nameEn?: string },
  locale: Locale = "ko",
  full = false,
): string {
  if (locale !== "en") return full ? source.name : shortSourceName(source.name);
  if (full) return source.nameEn || source.name;
  const short = SOURCE_SHORT_LABELS[source.name];
  if (short && !hasHangul(short)) return short;
  return source.nameEn || source.name;
}

/**
 * 영어판 페이로드에 싣는 매체 — 한글 이름 매체(nameEn 이 있는 매체)는 `name` 을 영문명으로 바꾸고 `nameEn` 키를 뗀다
 * (english-version-plan Phase 5-4: 영어 페이지 RSC·색인에 한글이 실리지 않게). 그 밖의 키(id·region …)는 그대로,
 * 이미 바꾼 매체를 다시 넣어도 같다(멱등).
 *
 * 영어판 표시·묶음은 그대로다: `sourceDisplayName(…, "en")` 은 원래도 `SOURCE_SHORT_LABELS[name]`(라틴) → `nameEn` → `name`
 * 순이었고, 바꾼 뒤에는 `name` 이 곧 영문명이다. 매체 칩 묶음(feedFilter `groupSources`)·귀의 "매체 N곳"(`issueStats`)은
 * `shortSourceName(name)` 단위인데, 한국 매체 영문명은 서로 다르고 HuggingFace 두 피드는 영문명도 축약 맵에 있어
 * (`HuggingFace Trending Models` → `Hugging Face`) 묶음이 같다. `?source=` 는 소스 id 라 바뀌지 않는다.
 * 한국어판은 이 함수를 쓰지 않는다(한국어 페이로드 바이트 동일).
 */
export function englishSource<T extends { name: string; nameEn?: string }>(source: T): T {
  if (!source.nameEn) return source;
  const { nameEn, ...rest } = source;
  return { ...rest, name: nameEn } as T;
}

const TZ = "Asia/Seoul";
/** 요일 한 글자(0 = 일요일) — 날짜 표기와 주간 레이더 "화요일 호"(messages/radar.ts) 공용. */
export const KO_WEEKDAYS: readonly string[] = ["일", "월", "화", "수", "목", "금", "토"];

/** ISO → KST 기준 { y, m, d, w, hh, mm } 분해. 잘못된 입력이면 null. */
function kstParts(
  iso: string | number | Date,
): { y: number; m: number; d: number; w: number; hh: number; mm: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const w = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    w,
    hh: Number(get("hour")) % 24,
    mm: Number(get("minute")),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/*
 * 영어 날짜는 Intl 의 문장형 출력(toLocaleDateString 등)을 쓰지 않고 KST 분해값을 고정 표에서 조립한다 —
 * ICU 버전(Node·브라우저)마다 쉼표·공백(AM/PM 앞 U+202F 등)이 달라 빌드 HTML 과 하이드레이션이 어긋날 수 있다.
 * 시각은 24시간제(한국어판·"06:00 KST 발행"과 같은 표기)라 AM/PM 이 없다.
 */
/** 영어 요일·월 이름(0 = 일요일, 0 = 1월) — 날짜 표기와 주간 레이더(messages/radar.ts) 공용. */
export const EN_WEEKDAYS: readonly string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const EN_WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const EN_MONTHS: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** "Jan"…"Dec". */
export const EN_MONTHS_SHORT: readonly string[] = EN_MONTHS.map((m) => m.slice(0, 3));

/** 'Nov 3' */
const enMonthDay = (p: { m: number; d: number }) => `${EN_MONTHS_SHORT[p.m - 1]} ${p.d}`;
/** 'Nov 3, 2026' */
const enDate = (p: { y: number; m: number; d: number }) => `${enMonthDay(p)}, ${p.y}`;
/** 'Tuesday, November 3' */
const enLongMonthDay = (p: { m: number; d: number; w: number }) =>
  `${EN_WEEKDAYS[p.w]}, ${EN_MONTHS[p.m - 1]} ${p.d}`;

/** 'MM.DD' (카드·목록) / en 'Nov 3'. */
export function formatShortDate(iso: string, locale: Locale = "ko"): string {
  const p = kstParts(iso);
  if (!p) return "";
  return locale === "en" ? enMonthDay(p) : `${pad(p.m)}.${pad(p.d)}`;
}

/** 'YYYY.MM.DD' (바이라인·상세) / en 'Nov 3, 2026'. */
export function formatDate(iso: string, locale: Locale = "ko"): string {
  const p = kstParts(iso);
  if (!p) return "";
  return locale === "en" ? enDate(p) : `${p.y}.${pad(p.m)}.${pad(p.d)}`;
}

/** 'YYYY-MM-DD' KST (호 고정 링크 `/edition/[date]` 경로 키). */
export function kstDateKey(iso: string | number | Date): string {
  const p = kstParts(iso);
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : "";
}

/**
 * 'M월 D일(요)' (공유 미리보기 문구·지난 호 이동) / en 'Tue, Nov 3, 2026'.
 * 영어는 연도를 붙인다 — 요일·월 약칭 뒤에 연도 없는 날짜는 영어 지면에서 지난 호인지 읽히지 않는다(계획서 짧은 표기).
 */
export function formatMonthDay(iso: string, locale: Locale = "ko"): string {
  const p = kstParts(iso);
  if (!p) return "";
  return locale === "en"
    ? `${EN_WEEKDAYS_SHORT[p.w]}, ${enDate(p)}`
    : `${p.m}월 ${p.d}일(${KO_WEEKDAYS[p.w]})`;
}

/** 'YYYY년 M월 D일 (요)요일' (마스트헤드) / en 'Tuesday, November 3, 2026'. */
export function formatLongDate(iso: string, locale: Locale = "ko"): string {
  const p = kstParts(iso);
  if (!p) return "";
  return locale === "en"
    ? `${enLongMonthDay(p)}, ${p.y}`
    : `${p.y}년 ${p.m}월 ${p.d}일 ${KO_WEEKDAYS[p.w]}요일`;
}

/**
 * 'YYYY.MM.DD HH:mm' KST (상대 시각의 툴팁·절대 일시) / en 'Nov 3, 2026, 14:05'.
 * 두 언어 모두 "KST" 를 붙이지 않는다 — 호출하는 쪽(RelativeTime 툴팁 `${…} KST`)이 붙인다.
 */
export function formatDateTime(iso: string, locale: Locale = "ko"): string {
  const p = kstParts(iso);
  if (!p) return "";
  const time = `${pad(p.hh)}:${pad(p.mm)}`;
  return locale === "en" ? `${enDate(p)}, ${time}` : `${p.y}.${pad(p.m)}.${pad(p.d)} ${time}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * `now` 기준 상대 시각 (KST 고정, 바이라인용).
 * 1분 미만(시계 오차로 미래인 경우 포함) '방금' → 'N분 전' → 24시간 미만 'N시간 전'
 * → KST 달력상 전날이면 '어제 HH:mm' → 같은 해 'M.D' / 다른 해 'YYYY.M.D'.
 * en 은 같은 경계로 'just now' → '1 minute ago'·'N minutes ago' → '1 hour ago'·'N hours ago'
 * → 'yesterday, HH:mm KST'(시각이 보이는 유일한 자리라 KST 를 붙인다) → 'Nov 3' / 'Nov 3, 2025'.
 * 바이라인 중간에 들어가므로 소문자로 시작한다.
 * 정적 빌드에서 값이 고정되도록 `now`는 호출자가 넘긴다(호 발행 시각 등).
 */
export function formatRelativeKst(
  iso: string,
  now: string | number | Date,
  locale: Locale = "ko",
): string {
  const t = new Date(iso).getTime();
  const n = new Date(now).getTime();
  if (Number.isNaN(t) || Number.isNaN(n)) return "";
  const en = locale === "en";

  const diff = n - t;
  if (diff < MINUTE) return en ? "just now" : "방금";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return en ? `${m} ${m === 1 ? "minute" : "minutes"} ago` : `${m}분 전`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return en ? `${h} ${h === 1 ? "hour" : "hours"} ago` : `${h}시간 전`;
  }

  const p = kstParts(t)!;
  const q = kstParts(n)!;
  // '어제'는 UTC가 아니라 KST 달력 날짜 차이로 판정한다.
  const dayGap = (Date.UTC(q.y, q.m - 1, q.d) - Date.UTC(p.y, p.m - 1, p.d)) / DAY;
  const time = `${pad(p.hh)}:${pad(p.mm)}`;
  if (dayGap === 1) return en ? `yesterday, ${time} KST` : `어제 ${time}`;
  if (en) return p.y === q.y ? enMonthDay(p) : enDate(p);
  return p.y === q.y ? `${p.m}.${p.d}` : `${p.y}.${p.m}.${p.d}`;
}

/** 발행 지연 안내를 띄우기 시작하는 KST 시각(시). 06:00 cron + 배치(~30분) + 배포 + 06:47 백업을 넘긴 뒤. */
export const PUBLISH_GRACE_HOUR_KST = 8;

/** KST 달력 날짜 'YYYY-MM-DD' 두 개의 일수 차(b - a). 잘못된 입력이면 NaN. */
export function kstDayDiff(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return (tb - ta) / DAY;
}

/**
 * 홈 최신 호가 "오늘 호"보다 낡아 안내가 필요한지(KST 기준).
 * 호 날짜가 오늘보다 이전이고, (08:00 KST 이후이거나 어제보다 오래된 호)일 때만 true —
 * 정상 발행 시간대(06:00 cron → 배포) 전에는 재촉하지 않는다. 반환값 = 오늘과의 일수 차(0 = 안내 없음).
 */
export function issueDelayDays(issueDate: string, now: string | number | Date): number {
  const p = kstParts(now);
  if (!p) return 0;
  const gap = kstDayDiff(issueDate, `${p.y}-${pad(p.m)}-${pad(p.d)}`);
  if (!(gap >= 1)) return 0;
  return gap >= 2 || p.hh >= PUBLISH_GRACE_HOUR_KST ? gap : 0;
}

/** 'YYYY-MM-DD'(KST 달력 날짜) 정오 기준 분해 — 날짜 키를 요일 있는 표기로 바꿀 때 쓴다. */
const kstDateParts = (dateKey: string) => kstParts(`${dateKey}T12:00:00+09:00`);

/** 호수 표기: ko '제135호', en 'No. 135'. */
export function issueNoLabel(issueNo: number, locale: Locale = "ko"): string {
  return locale === "en" ? `No. ${issueNo}` : `제${issueNo}호`;
}

/** 발행 지연 안내 문구(상태 라벨 + 전체 문장 + 좁은 화면용 짧은 문구). */
export interface IssueDelayCopy {
  /** 상태 라벨 — 1일 "발행 전"(en "Not out yet"), 2일 이상 "발행 지연"(en "Delayed"). */
  label: "발행 전" | "발행 지연" | "Not out yet" | "Delayed";
  /** md 이상 전체 문장: 잉크로 강조할 앞 구절 + 이어지는 문장. */
  strong: string;
  rest: string;
  /** 좁은 화면용 짧은 문구 — 라벨과 한 줄에 들어가게 한다. */
  short: string;
}

/**
 * 발행 지연 안내 문구. gap 은 issueDelayDays 결과(≥1), issueNo 는 보고 있는 호의 호수(0 = 미상 → 생략).
 *  - 1일: "10월 30일 금요일 호는 아직 발행 전입니다 — 지금은 10월 29일 목요일 제135호를 보고 계십니다."
 *  - 2일+: "10월 28일 수요일 제134호 이후 새 호가 나오지 않았습니다 — 발행이 2일째 늦어지고 있습니다."
 * en(같은 구조, strong 에 날짜가 든다):
 *  - 1일: "The Friday, October 30 issue" + " isn't out yet — you're reading the Thursday, October 29 issue (No. 135)."
 *  - 2일+: "No new issue since Wednesday, October 28 (No. 134)" + " — publication is 2 days behind."
 * 잘못된 입력·gap < 1 이면 null(안내 없음).
 */
export function issueDelayCopy(
  issueDate: string,
  gap: number,
  issueNo = 0,
  locale: Locale = "ko",
): IssueDelayCopy | null {
  const issue = kstDateParts(issueDate);
  if (!issue || !(gap >= 1)) return null;
  if (locale === "en") return issueDelayCopyEn(issueDate, issue, gap, issueNo);
  const long = (p: { m: number; d: number; w: number }) =>
    `${p.m}월 ${p.d}일 ${KO_WEEKDAYS[p.w]}요일`;
  const short = (p: { m: number; d: number; w: number }) => `${p.m}.${p.d}(${KO_WEEKDAYS[p.w]})`;
  const issueName = `${long(issue)} ${issueNo > 0 ? `제${issueNo}호` : "호"}`;

  if (gap >= 2) {
    return {
      label: "발행 지연",
      strong: issueName,
      rest: ` 이후 새 호가 나오지 않았습니다 — 발행이 ${gap}일째 늦어지고 있습니다.`,
      short: `${short(issue)} 호 이후 새 호 지연 · ${gap}일째`,
    };
  }
  // 1일: 오늘(= 호 날짜 + 1일) 호가 아직 안 나왔다.
  const today = kstParts(Date.parse(`${issueDate}T12:00:00+09:00`) + DAY)!;
  return {
    label: "발행 전",
    strong: `${long(today)} 호`,
    rest: `는 아직 발행 전입니다 — 지금은 ${issueName}를 보고 계십니다.`,
    short: `${short(today)} 호 발행 전 · ${short(issue)} 호를 보는 중`,
  };
}

/** issueDelayCopy 의 영어판(분해·판정은 같다). 짧은 문구는 요일 없이 'Oct 30' 으로 줄인다. */
function issueDelayCopyEn(
  issueDate: string,
  issue: { m: number; d: number; w: number },
  gap: number,
  issueNo: number,
): IssueDelayCopy {
  const no = issueNo > 0 ? ` (${issueNoLabel(issueNo, "en")})` : "";
  if (gap >= 2) {
    return {
      label: "Delayed",
      strong: `No new issue since ${enLongMonthDay(issue)}${no}`,
      rest: ` — publication is ${gap} days behind.`,
      short: `No issue since ${enMonthDay(issue)} · ${gap} days late`,
    };
  }
  const today = kstParts(Date.parse(`${issueDate}T12:00:00+09:00`) + DAY)!;
  return {
    label: "Not out yet",
    strong: `The ${enLongMonthDay(today)} issue`,
    rest: ` isn't out yet — you're reading the ${enLongMonthDay(issue)} issue${no}.`,
    short: `${enMonthDay(today)} issue not out yet · reading ${enMonthDay(issue)}`,
  };
}
