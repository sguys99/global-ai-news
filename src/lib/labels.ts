/**
 * 표시용 라벨·날짜 포맷 단일 출처 (DESIGN.md §4).
 * 데이터 값(분야 키·소스명)은 불변이고, 화면 표기만 여기서 변환한다.
 * 날짜는 빌드(UTC)·브라우저(사용자 TZ) 간 하이드레이션 불일치를 막기 위해 KST로 고정한다.
 */

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

/** 카테고리 표시명. 구 값은 새 분야명으로, 미정의 값은 원문, 빈 값은 빈 문자열. */
export function categoryLabel(category: string): string {
  const key = normalizeCategory(category);
  return isCategory(key) ? CATEGORY_LABELS[key] : category;
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

const TZ = "Asia/Seoul";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

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

/** 'MM.DD' (카드·목록). */
export function formatShortDate(iso: string): string {
  const p = kstParts(iso);
  return p ? `${pad(p.m)}.${pad(p.d)}` : "";
}

/** 'YYYY.MM.DD' (바이라인·상세). */
export function formatDate(iso: string): string {
  const p = kstParts(iso);
  return p ? `${p.y}.${pad(p.m)}.${pad(p.d)}` : "";
}

/** 'YYYY-MM-DD' KST (호 고정 링크 `/edition/[date]` 경로 키). */
export function kstDateKey(iso: string | number | Date): string {
  const p = kstParts(iso);
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : "";
}

/** 'M월 D일(요)' (공유 미리보기 문구). */
export function formatMonthDay(iso: string): string {
  const p = kstParts(iso);
  return p ? `${p.m}월 ${p.d}일(${WEEKDAYS[p.w]})` : "";
}

/** 'YYYY년 M월 D일 (요)요일' (마스트헤드). */
export function formatLongDate(iso: string): string {
  const p = kstParts(iso);
  return p ? `${p.y}년 ${p.m}월 ${p.d}일 ${WEEKDAYS[p.w]}요일` : "";
}

/** 'YYYY.MM.DD HH:mm' KST (상대 시각의 툴팁·절대 일시). */
export function formatDateTime(iso: string): string {
  const p = kstParts(iso);
  return p ? `${p.y}.${pad(p.m)}.${pad(p.d)} ${pad(p.hh)}:${pad(p.mm)}` : "";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * `now` 기준 상대 시각 (KST 고정, 바이라인용).
 * 1분 미만(시계 오차로 미래인 경우 포함) '방금' → 'N분 전' → 24시간 미만 'N시간 전'
 * → KST 달력상 전날이면 '어제 HH:mm' → 같은 해 'M.D' / 다른 해 'YYYY.M.D'.
 * 정적 빌드에서 값이 고정되도록 `now`는 호출자가 넘긴다(호 발행 시각 등).
 */
export function formatRelativeKst(iso: string, now: string | number | Date): string {
  const t = new Date(iso).getTime();
  const n = new Date(now).getTime();
  if (Number.isNaN(t) || Number.isNaN(n)) return "";

  const diff = n - t;
  if (diff < MINUTE) return "방금";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;

  const p = kstParts(t)!;
  const q = kstParts(n)!;
  // '어제'는 UTC가 아니라 KST 달력 날짜 차이로 판정한다.
  const dayGap = (Date.UTC(q.y, q.m - 1, q.d) - Date.UTC(p.y, p.m - 1, p.d)) / DAY;
  if (dayGap === 1) return `어제 ${pad(p.hh)}:${pad(p.mm)}`;
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

/** 발행 지연 안내 문구(상태 라벨 + 전체 문장 + 좁은 화면용 짧은 문구). */
export interface IssueDelayCopy {
  /** 상태 라벨 — 1일 "발행 전", 2일 이상 "발행 지연". */
  label: "발행 전" | "발행 지연";
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
 * 잘못된 입력·gap < 1 이면 null(안내 없음).
 */
export function issueDelayCopy(issueDate: string, gap: number, issueNo = 0): IssueDelayCopy | null {
  const issue = kstDateParts(issueDate);
  if (!issue || !(gap >= 1)) return null;
  const long = (p: { m: number; d: number; w: number }) => `${p.m}월 ${p.d}일 ${WEEKDAYS[p.w]}요일`;
  const short = (p: { m: number; d: number; w: number }) => `${p.m}.${p.d}(${WEEKDAYS[p.w]})`;
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
