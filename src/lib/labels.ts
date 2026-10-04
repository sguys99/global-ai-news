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
};

export function shortSourceName(name: string): string {
  return SOURCE_SHORT_LABELS[name] ?? name;
}

const TZ = "Asia/Seoul";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** ISO → KST 기준 { y, m, d, w } 분해. 잘못된 입력이면 null. */
function kstParts(iso: string): { y: number; m: number; d: number; w: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const w = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), w };
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

/** 'YYYY년 M월 D일 (요)요일' (마스트헤드). */
export function formatLongDate(iso: string): string {
  const p = kstParts(iso);
  return p ? `${p.y}년 ${p.m}월 ${p.d}일 ${WEEKDAYS[p.w]}요일` : "";
}
