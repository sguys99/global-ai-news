/**
 * 주간 레이더(contents-upgrade-plan Phase 8) — 일요일 호의 특집 밴드 선정. 순수 함수(LLM 호출 없음, 집계만).
 *
 * "한 주" = 그 일요일로 끝나는 KST 월~일 7개 호. 호 = 그날 수집분(created_at 의 KST 날짜)이라
 * 후보는 그 7일 동안 **수집된** 공개 비뉴스(저장소·모델·논문)다(getWeekRadarCandidates).
 * 홈(최신 호가 일요일일 때)과 호 고정 링크 `/edition/<일요일>` 이 같은 함수로 같은 밴드를 만든다.
 *
 * 선정 규칙(설명 가능하고 빌드마다 같은 결과):
 * 1. 같은 대상은 한 번만 — 저장소 owner/repo · 모델 org/model · 논문 arXiv ID(HF Papers·Takara TLDR·arXiv 가
 *    같은 논문을 다른 URL 로 싣는다) · 그 밖에는 정규화 URL, 그리고 형식 안 원제(정규화)가 같으면 같은 대상으로 본다.
 *    남는 것은 아래 형식 안 순서의 1위(그 기사의 호 요일을 보인다).
 * 2. 형식 안 순서: 중요도 → 화제 지수 → 형식 반응 신호(저장소 당일 스타 증가·누적 스타 / 모델 좋아요·다운로드 /
 *    논문 추천·인용) → 최신 호 → 최신 게시 → id. 반응 신호는 형식마다 단위가 달라 형식 안에서만 비교한다.
 * 3. 형식 혼합 보장: 후보가 있는 형식은 각 상위 2건(후보가 1건이면 1건)을 먼저 확보한다 — 한 형식이 10칸을 다 가져가지 못한다.
 * 4. 남은 자리와 표시 순서는 형식별 대기열을 합치는 순서(중요도 → 화제 → 최신 호 → 최신 게시 → id)로 정한다.
 *    한 형식 안의 순위는 2의 순서를 그대로 지킨다. 번호(1~10)는 이 표시 순서의 실제 순위다.
 * 5. 빈약한 주는 밴드를 숨긴다: 4건 미만이면 "상위 10"이 성립하지 않고 매일 레이더(4칸)보다 얇다.
 *    실린 기사가 모두 한 호에서 왔으면 그날 레이더의 반복이라 역시 숨긴다(호 2개 이상).
 *
 * 중요도는 그날 선별에서 같은 형식 후보끼리 매긴 상대값(Phase 4)이라 요일 사이 비교가 완전하지는 않다 —
 * 그래서 동점이 잦고, 화제 지수·반응 신호가 실제 순서를 가른다.
 */
import { FORMAT_DISPLAY_LABELS, type Format } from "@/lib/labels";
import { parseArxivId, parseGithubRepo, parseHfModelId, radarMetaBlock } from "@/lib/radarMeta";
import type { RadarMetaBlock } from "@/lib/radarMeta";
import type { ArticleCard } from "@/lib/types";

/** 주간 레이더가 다루는 형식(비뉴스) — 혼합 보장·대기열 순서. */
export const WEEKLY_FORMATS = ["oss", "model", "paper"] as const satisfies readonly Format[];
export type WeeklyFormat = (typeof WEEKLY_FORMATS)[number];

export interface WeeklyLimits {
  /** 밴드에 싣는 최대 건수(상위 N). */
  items: number;
  /** 후보가 있는 형식마다 먼저 확보하는 건수. */
  perFormat: number;
  /** 이보다 적으면 밴드를 숨긴다. */
  minItems: number;
  /** 실린 기사가 걸친 호(요일)가 이보다 적으면 숨긴다 — 한 호 레이더의 반복 방지. */
  minDays: number;
}

export const WEEKLY_LIMITS: WeeklyLimits = { items: 10, perFormat: 2, minItems: 4, minDays: 2 };

/** DB 후보 한 건: 기사 + 그 기사가 실린 호 날짜(created_at 의 KST 날짜, 'YYYY-MM-DD'). */
export interface WeeklyCandidate {
  article: ArticleCard;
  issueDate: string;
}

/** 밴드 한 행 렌더 DTO — 홈에서는 클라이언트 컴포넌트 props 로 페이지에 실리므로 필요한 필드만 담는다. */
export interface WeeklyItem {
  id: number;
  /** 한국어 제목(가공 전이면 원제). */
  title: string;
  format: WeeklyFormat;
  category: string;
  source: { name: string };
  url: string;
  engagement?: ArticleCard["engagement"];
  /** 실린 호 날짜(KST 'YYYY-MM-DD'). */
  issueDate: string;
}

export interface WeeklyRadar {
  /** 주 시작(월요일)·끝(일요일 = 이 호) KST 날짜. */
  start: string;
  end: string;
  /** 표시 순서 = 순위(1부터). */
  items: WeeklyItem[];
  /** 같은 대상을 합친 뒤의 이 주 후보 수(밴드 각주 "N건 중"). */
  candidates: number;
  /** 실린 형식 구성(WEEKLY_FORMATS 순, 0건 생략). */
  formats: { format: WeeklyFormat; count: number }[];
}

// --- 주 경계 -------------------------------------------------------------------

const DAY_MS = 24 * 3600 * 1000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD'(KST 달력 날짜) → 그 날짜의 UTC 자정 ms. 날짜 키는 이미 KST 날짜라 달력 연산만 하면 된다. */
function dateKeyMs(dateKey: string): number | null {
  const m = DATE_KEY.exec(dateKey);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // 2026-02-30 같은 값은 다른 날로 굴러가므로 되돌려 비교해 거른다.
  return new Date(ms).toISOString().slice(0, 10) === dateKey ? ms : null;
}

const msToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 날짜 키의 요일(0 = 일요일). 잘못된 키면 -1. */
export function weekdayOfKey(dateKey: string): number {
  const ms = dateKeyMs(dateKey);
  return ms === null ? -1 : new Date(ms).getUTCDay();
}

/** 주간 레이더를 싣는 호인가 — 일요일(KST) 호. */
export function isWeeklyIssue(dateKey: string): boolean {
  return weekdayOfKey(dateKey) === 0;
}

/** 일요일 날짜 키 → 그 주 월~일 7개 날짜 키(오래된 순). 일요일이 아니거나 잘못된 키면 null. */
export function weekWindow(
  sundayKey: string,
): { start: string; end: string; dates: string[] } | null {
  if (!isWeeklyIssue(sundayKey)) return null;
  const end = dateKeyMs(sundayKey)!;
  const dates = Array.from({ length: 7 }, (_, i) => msToKey(end - (6 - i) * DAY_MS));
  return { start: dates[0], end: sundayKey, dates };
}

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/** 실린 호 표기: "화요일 호". */
export function issueDayLabel(dateKey: string): string {
  const w = weekdayOfKey(dateKey);
  return w < 0 ? "" : `${WEEKDAY_NAMES[w]}요일 호`;
}

/** 밴드 머리의 기간: "10월 26일 – 11월 1일". */
export function weekRangeLabel(start: string, end: string): string {
  const md = (k: string) => {
    const m = DATE_KEY.exec(k);
    return m ? `${Number(m[2])}월 ${Number(m[3])}일` : "";
  };
  return `${md(start)} – ${md(end)}`;
}

// --- 같은 대상 ---------------------------------------------------------------

/** URL 정규화(비교용): 스킴·www·끝 슬래시·쿼리·해시를 떼고 소문자로. 파싱 실패면 다듬은 원문. */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return `${host}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** 원제 비교 키: 글자·숫자만 남긴 소문자. 너무 짧으면(일반명 충돌 위험) 키로 쓰지 않는다. */
const TITLE_KEY_MIN = 12;
function titleKey(title: string): string | undefined {
  const k = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return k.length >= TITLE_KEY_MIN ? k : undefined;
}

/** 같은 대상 판정 키들 — 하나라도 겹치면 같은 대상. 형식이 다르면 겹치지 않게 형식을 앞에 붙인다. */
export function identityKeys(a: Pick<ArticleCard, "format" | "url" | "titleOriginal">): string[] {
  const ident =
    a.format === "oss"
      ? parseGithubRepo(a.url)
      : a.format === "model"
        ? parseHfModelId(a.url)
        : a.format === "paper"
          ? parseArxivId(a.url)
          : undefined;
  const keys = [
    ident ? `${a.format}:id:${ident.toLowerCase()}` : `${a.format}:url:${normalizeUrl(a.url)}`,
  ];
  const t = titleKey(a.titleOriginal);
  if (t) keys.push(`${a.format}:title:${t}`);
  return keys;
}

// --- 순서 ----------------------------------------------------------------------

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** 형식 반응 신호(형식 안 비교 전용) — [1차, 2차]. */
function reactionSignal(a: ArticleCard): [number, number] {
  const e = a.engagement ?? {};
  switch (a.format) {
    case "oss":
      return [num(e.stars_today), num(e.stars)];
    case "model":
      return [num(e.likes), num(e.downloads)];
    case "paper":
      return [num(e.ups), num(e.citations)];
    default:
      return [0, 0];
  }
}

/** 형식끼리 합칠 때의 순서: 중요도 → 화제 → 최신 호 → 최신 게시 → id. */
function byWeekly(x: WeeklyCandidate, y: WeeklyCandidate): number {
  const a = x.article;
  const b = y.article;
  return (
    b.importance - a.importance ||
    b.trendingScore - a.trendingScore ||
    y.issueDate.localeCompare(x.issueDate) ||
    b.publishedAt.localeCompare(a.publishedAt) ||
    a.id - b.id
  );
}

/** 형식 안 순서: 중요도 → 화제 → 반응 신호 → (byWeekly 의 나머지). */
function byWithinFormat(x: WeeklyCandidate, y: WeeklyCandidate): number {
  const a = x.article;
  const b = y.article;
  const [a1, a2] = reactionSignal(a);
  const [b1, b2] = reactionSignal(b);
  return (
    b.importance - a.importance ||
    b.trendingScore - a.trendingScore ||
    b1 - a1 ||
    b2 - a2 ||
    byWeekly(x, y)
  );
}

/**
 * 형식별 대기열(각자 형식 안 순서)을 합친다 — 매번 대기열 머리 중 byWeekly 1위를 꺼낸다.
 * 한 형식 안의 상대 순서는 바뀌지 않는다.
 */
function mergeQueues(queues: WeeklyCandidate[][], limit = Infinity): WeeklyCandidate[] {
  const heads = queues.map(() => 0);
  const out: WeeklyCandidate[] = [];
  while (out.length < limit) {
    let best = -1;
    queues.forEach((q, i) => {
      if (heads[i] >= q.length) return;
      if (best < 0 || byWeekly(q[heads[i]], queues[best][heads[best]]) < 0) best = i;
    });
    if (best < 0) break;
    out.push(queues[best][heads[best]]);
    heads[best] += 1;
  }
  return out;
}

const isWeeklyFormat = (f: Format): f is WeeklyFormat =>
  (WEEKLY_FORMATS as readonly Format[]).includes(f);

function toItem({ article: a, issueDate }: WeeklyCandidate): WeeklyItem {
  const item: WeeklyItem = {
    id: a.id,
    title: a.titleKo || a.titleOriginal,
    format: a.format as WeeklyFormat,
    category: a.category,
    source: { name: a.source.name },
    url: a.url,
    issueDate,
  };
  if (a.engagement) item.engagement = a.engagement;
  return item;
}

/**
 * 일요일 호의 주간 레이더. 일요일이 아니거나 빈약한 주(5번 규칙)면 null — UI 는 밴드를 그리지 않는다.
 * 후보는 주 밖·뉴스·미가공 기사가 섞여 들어와도 여기서 거른다.
 */
export function buildWeeklyRadar(
  candidates: WeeklyCandidate[],
  sundayKey: string,
  limits: WeeklyLimits = WEEKLY_LIMITS,
): WeeklyRadar | null {
  const week = weekWindow(sundayKey);
  if (!week) return null;
  const inWeek = new Set(week.dates);

  const eligible = candidates
    .filter((c) => inWeek.has(c.issueDate) && isWeeklyFormat(c.article.format))
    .sort(byWithinFormat);

  // 1. 같은 대상 합치기 — 형식 안 순서의 앞선 기사가 남는다.
  const seen = new Set<string>();
  const unique: WeeklyCandidate[] = [];
  for (const c of eligible) {
    const keys = identityKeys(c.article);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    unique.push(c);
  }

  const queues = WEEKLY_FORMATS.map((f) => unique.filter((c) => c.article.format === f)).filter(
    (q) => q.length > 0,
  );
  // 3. 형식 혼합 보장 — 형식 수 × perFormat 이 한도를 넘으면 형식마다 같은 몫으로 줄인다.
  const quota = Math.min(limits.perFormat, Math.floor(limits.items / Math.max(queues.length, 1)));
  const reserved = queues.map((q) => q.slice(0, quota));
  const rest = mergeQueues(
    queues.map((q) => q.slice(quota)),
    limits.items - reserved.reduce((n, r) => n + r.length, 0),
  );
  const restIds = new Set(rest.map((c) => c.article.id));
  // 4. 표시 순서 = 형식별 확보분 + 채운 분을 다시 형식 안 순서로 합친다(각 형식의 선택분은 대기열의 앞부분).
  const picked = mergeQueues(
    queues.map((q, i) => [
      ...reserved[i],
      ...q.slice(quota).filter((c) => restIds.has(c.article.id)),
    ]),
  );

  // 5. 빈약한 주.
  if (picked.length < limits.minItems) return null;
  if (new Set(picked.map((c) => c.issueDate)).size < limits.minDays) return null;

  const items = picked.map(toItem);
  return {
    start: week.start,
    end: week.end,
    items,
    candidates: unique.length,
    formats: WEEKLY_FORMATS.map((format) => ({
      format,
      count: items.filter((i) => i.format === format).length,
    })).filter((f) => f.count > 0),
  };
}

/** 머리 보조 문구의 형식 구성: "저장소 3 · 모델 2 · 논문 5"(화면 표시명). */
export function weeklyFormatMix(formats: WeeklyRadar["formats"]): string {
  return formats.map((f) => `${FORMAT_DISPLAY_LABELS[f.format]} ${f.count}`).join(" · ");
}

/**
 * 주간 행의 메타 블록 — 레이더 카드와 같은 radarMetaBlock 에서 "오늘 +N"(그날 트렌딩 스타 증가분)만
 * "당일 +N"으로 바꾼다. 일요일 지면에서 화요일 호 저장소의 증가분을 "오늘"이라 쓰면 틀린 말이다.
 */
export function weeklyMetaBlock(item: WeeklyItem, sourceName: string): RadarMetaBlock {
  const block = radarMetaBlock(item, sourceName);
  return {
    ...block,
    stats: block.stats.map((m) =>
      m.key === "starsToday"
        ? {
            ...m,
            prefix: "당일",
            text: m.text.replace(/^오늘/, "당일"),
            label: m.label.replace(/^오늘/, "그 호 당일"),
          }
        : m,
    ),
  };
}
