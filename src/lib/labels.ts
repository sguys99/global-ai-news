/**
 * 표시용 라벨·날짜 포맷 단일 출처 (DESIGN.md §4).
 * 데이터 값(카테고리 enum·소스명)은 불변이고, 화면 표기만 여기서 변환한다.
 * 날짜는 빌드(UTC)·브라우저(사용자 TZ) 간 하이드레이션 불일치를 막기 위해 KST로 고정한다.
 */

/** 카테고리 데이터 값 → 한글 표시명. 표기 순서 = 섹션 순서. */
export const CATEGORY_LABELS: Record<string, string> = {
  "Language Models": "언어 모델",
  Agents: "에이전트",
  "Dev Tools": "개발 도구",
  MLOps: "MLOps",
  "연구·논문": "연구·논문",
  "산업·정책": "산업·정책",
};

/** 카테고리 → 섹션 앵커 슬러그(`#section-<slug>`). */
const CATEGORY_SLUGS: Record<string, string> = {
  "Language Models": "llm",
  Agents: "agents",
  "Dev Tools": "devtools",
  MLOps: "mlops",
  "연구·논문": "research",
  "산업·정책": "industry",
};

export function categorySlug(category: string): string {
  return CATEGORY_SLUGS[category] ?? "etc";
}

/** 카테고리 표시명. 미정의 값은 원문, 빈 값은 빈 문자열. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** 칩·메타에서 쓰는 소스명 축약 맵 (상세 등 공간이 넉넉한 곳은 원래 이름 유지). */
const SOURCE_SHORT_LABELS: Record<string, string> = {
  "TechCrunch AI": "TechCrunch",
  "GitHub (topic:llm)": "GitHub",
  "HuggingFace Daily Papers": "HuggingFace",
  "MIT Technology Review": "MIT Tech Review",
  "NVIDIA Technical Blog (Robotics)": "NVIDIA Dev",
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

/** 발행 지연 안내 문구. gap 은 issueDelayDays 결과(≥1). */
export function formatIssueDelayNotice(issueDate: string, gap: number): string {
  const day = formatMonthDay(`${issueDate}T12:00:00+09:00`);
  return gap >= 2
    ? `${day} 발행 이후 새 호가 아직 나오지 않았습니다`
    : `${day} 발행 — 오늘 호는 아직 발행 전입니다`;
}

/** 좁은 화면용 짧은 안내 문구("10.25(일) 발행 · 새 호 준비 중") — 라벨과 한 줄에 들어가게 한다. */
export function formatIssueDelayShort(issueDate: string, gap: number): string {
  const p = kstParts(`${issueDate}T12:00:00+09:00`);
  if (!p) return "";
  return `${p.m}.${p.d}(${WEEKDAYS[p.w]}) 발행 · ${gap >= 2 ? "새 호 지연 중" : "새 호 준비 중"}`;
}
