/**
 * 주간 SNS 키트(english-version-plan Phase 8-2) — 한 주의 무엇을 올릴지 고르는 순수 함수. DB 읽기·파일 쓰기는
 * scripts/social-weekly.ts, 글 초안은 ./text.ts, 카드 이미지는 ./cards.tsx.
 *
 * 주 = 그 일요일로 끝나는 KST 월~일 7개 호(주간 레이더와 같은 경계 — src/lib/weeklyRadar.ts `weekWindow`).
 * 일요일 호가 아직 없으면 `--partial` 로 월요일부터 DB 최신 호까지를 쓴다(제목에 "through Nov 7" 을 단다).
 *
 * 무엇을 고르나(전부 영어판 기사 = 영어 제목·요약이 있는 기사만, `hasEnglish`):
 *  - Korea Desk 하이라이트 ≤ 5: 그 주 한국 매체(region kr) 기사. 순서는 **한국 주제 먼저**(영어판 Korea Desk 와 같은 판정
 *    `isKoreaSubject` — 한국 매체가 옮긴 해외 기업 소식보다 한국 소식이 SNS 의 차별점이다) → 중요도 → 화제 → 최신 게시 → id.
 *    한 사건은 한 번만: 후속 보도 연결(follow_up_of 사건 타임라인)로 이어졌거나 영어 제목의 내용어가 많이 겹치면 같은 사건.
 *  - 이 주의 리드 ≤ 3: 날마다 1면 리드(buildEdition — 영어판 1면) 중 하이라이트와 같은 사건이 아닌 것, 같은 순서(한국 주제 제외).
 *  - 주간 레이더: buildWeeklyRadar 결과를 그대로(영어 제목·영문 매체명만 남긴다).
 */
import { hasEnglish } from "../../../src/lib/articleText";
import { englishSource, sourceDisplayName } from "../../../src/lib/labels";
import type { ArticleCard } from "../../../src/lib/types";
import { weekWindow, isWeeklyIssue, type WeeklyRadar } from "../../../src/lib/weeklyRadar";

/** Korea Desk 하이라이트 최대 건수(X 스레드 = 머리 1 + 기사 5 + 맺음 1). */
export const KOREA_HIGHLIGHT_LIMIT = 5;
/** 이 주의 리드 최대 건수. */
export const LEAD_LIMIT = 3;
/** 카드·글에 싣는 주간 레이더 최대 건수. */
export const RADAR_LIMIT = 6;

// ─── 주 ──────────────────────────────────────────────────────────────────────

export interface SocialWeek {
  /** 월요일·일요일(KST 'YYYY-MM-DD'). */
  start: string;
  end: string;
  /** 키트에 쓰는 호 날짜(오래된 순) — 전체 주면 기사가 있는 날만, 부분 주면 월요일 ~ 최신 호. */
  dates: string[];
  /** 일요일 호가 없어 최신 호까지만 쓴 주. */
  partial: boolean;
  /** 키트에 쓴 마지막 호 날짜. */
  through: string;
}

/** 가장 최근 일요일 호 날짜(호 날짜 목록 = getEditionRefs 의 date). 없으면 null. */
export function latestSundayIssue(issueDates: readonly string[]): string | null {
  return [...issueDates].filter(isWeeklyIssue).sort().at(-1) ?? null;
}

/**
 * `--week`(일요일) → 주. 일요일이 아니면 오류. 일요일 호가 없으면 `partial` 일 때만 월요일 ~ 그 주 최신 호를 쓰고,
 * 아니면 오류(무엇을 하면 되는지 문구에 담는다). 그 주 호가 하나도 없어도 오류.
 */
export function resolveWeek(
  sunday: string,
  issueDates: readonly string[],
  { partial = false }: { partial?: boolean } = {},
): SocialWeek {
  const win = weekWindow(sunday);
  if (!win) throw new Error(`--week 는 일요일(KST 'YYYY-MM-DD')이어야 합니다: ${sunday}`);
  const have = new Set(issueDates);
  const dates = win.dates.filter((d) => have.has(d));
  if (dates.length === 0) throw new Error(`${win.start} ~ ${win.end} 주에 발행된 호가 없습니다.`);
  const hasSunday = have.has(win.end);
  if (!hasSunday && !partial) {
    throw new Error(
      `${win.end}(일요일) 호가 아직 없습니다 — 최신 호 ${dates.at(-1)}까지로 만들려면 --partial 을 붙이세요.`,
    );
  }
  return { start: win.start, end: win.end, dates, partial: !hasSunday, through: dates.at(-1)! };
}

// ─── 기사 ────────────────────────────────────────────────────────────────────

/** 키트 기사 한 건 — 영어 텍스트만 담는다(한국어 가공 텍스트·한글 매체명은 여기서 뗀다). */
export interface SocialStory {
  id: number;
  title: string;
  summary: string;
  /** 영문 매체 표시명(sourceDisplayName en). */
  source: string;
  korea: boolean;
  /** 한국 주제(영어 본문에 Korea·Seoul·한국 기관 영문명 — isKoreaSubject). */
  koreaSubject: boolean;
  category: string;
  format: ArticleCard["format"];
  importance: number;
  trendingScore: number;
  publishedAt: string;
  issueDate: string;
  /** 원문 주소(Reddit 본문의 "original" 링크). */
  url: string;
}

/** 영어판 기사 → 키트 기사. 영어가 없으면 null(키트에 싣지 않는다). */
export function toSocialStory(
  article: ArticleCard,
  issueDate: string,
  koreaSubject: (a: ArticleCard) => boolean,
): SocialStory | null {
  if (!hasEnglish(article)) return null;
  return {
    id: article.id,
    title: article.titleEn!.trim(),
    summary: article.summaryEn!.trim(),
    source: sourceDisplayName(englishSource(article.source), "en"),
    korea: article.source.region === "kr",
    koreaSubject: koreaSubject(article),
    category: article.category,
    format: article.format,
    importance: article.importance,
    trendingScore: article.trendingScore,
    publishedAt: article.publishedAt,
    issueDate,
    url: article.url,
  };
}

/** 편집 순: 중요도 → 화제 → 최신 게시 → id. */
export function byEditorial(a: SocialStory, b: SocialStory): number {
  return (
    b.importance - a.importance ||
    b.trendingScore - a.trendingScore ||
    b.publishedAt.localeCompare(a.publishedAt) ||
    a.id - b.id
  );
}

/** 한국 주제 먼저, 그다음 편집 순. */
export function byKoreaDesk(a: SocialStory, b: SocialStory): number {
  return Number(b.koreaSubject) - Number(a.koreaSubject) || byEditorial(a, b);
}

// ─── 같은 사건 ───────────────────────────────────────────────────────────────

/** 영어 제목 내용어에서 빼는 낱말 — 기능어와 이 사이트 기사 어디에나 나오는 말(같은 사건 증거가 아니다). */
const STOPWORDS = new Set(
  (
    "a an the and or but of to in on for with by from at as is are was were be been its it this that these those " +
    "into over under after before about amid via vs than more most new says said will would could can may " +
    "up out off per year years first last next week day today plans plan launches launch unveils unveil " +
    "announces announce adds add gets get makes make sets set ai korea korean korea's south seoul global " +
    "company companies firm firms"
  ).split(" "),
);

/** 영어 제목 → 내용어 집합(소문자, 3자 이상 또는 숫자, 소유격 's 뗌). */
export function titleTokens(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .split(/[^\p{L}\p{N}.$%-]+/u)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w && !STOPWORDS.has(w) && (w.length >= 3 || /\d/.test(w)));
  return new Set(words);
}

/**
 * 두 제목이 같은 사건인가 — 내용어가 3개 이상 겹치고 짧은 쪽의 절반 이상이 겹칠 때. 같은 회사의 다른 소식
 * ("Samsung … chip" / "Samsung … phone")은 회사 하나만 겹쳐 남는다.
 */
export function sameEventTitle(a: string, b: string): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const shorter = Math.min(ta.size, tb.size);
  return shared >= 3 && shorter > 0 && shared / shorter >= 0.5;
}

/**
 * 순서대로 담되 앞서 담은 기사와 같은 사건이면 건너뛴다. `eventOf` 는 기사 id → 사건 키(후속 보도 타임라인의 가장 이른 id,
 * 연결 없으면 자기 id). 제목 대조는 연결이 없는 같은 사건(다른 매체·다른 날)을 잡는다.
 */
export function pickDistinct(
  ordered: readonly SocialStory[],
  limit: number,
  eventOf: (id: number) => number = (id) => id,
  exclude: readonly SocialStory[] = [],
): SocialStory[] {
  const picked: SocialStory[] = [];
  const events = new Set(exclude.map((s) => eventOf(s.id)));
  const titles = exclude.map((s) => s.title);
  for (const s of ordered) {
    if (picked.length >= limit) break;
    const ev = eventOf(s.id);
    if (events.has(ev) || titles.some((t) => sameEventTitle(t, s.title))) continue;
    picked.push(s);
    events.add(ev);
    titles.push(s.title);
  }
  return picked;
}

/** Korea Desk 하이라이트: 한국 매체 기사만, 한국 주제 먼저 → 편집 순, 사건당 1건, ≤ limit. */
export function selectKoreaHighlights(
  stories: readonly SocialStory[],
  eventOf?: (id: number) => number,
  limit = KOREA_HIGHLIGHT_LIMIT,
): SocialStory[] {
  return pickDistinct(stories.filter((s) => s.korea).sort(byKoreaDesk), limit, eventOf);
}

/** 이 주의 리드: 날마다 1면 리드 중 하이라이트와 다른 사건, 편집 순, ≤ limit. */
export function selectWeekLeads(
  dailyLeads: readonly SocialStory[],
  highlights: readonly SocialStory[],
  eventOf?: (id: number) => number,
  limit = LEAD_LIMIT,
): SocialStory[] {
  const highlightIds = new Set(highlights.map((s) => s.id));
  return pickDistinct(
    dailyLeads.filter((s) => !highlightIds.has(s.id)).sort(byEditorial),
    limit,
    eventOf,
    highlights,
  );
}

/** 후속 보도 타임라인(기사 id 목록들) → 사건 키 함수: 같은 타임라인의 기사는 가장 작은 id 를 키로 갖는다. */
export function eventKeyFromThreads(
  threads: readonly (readonly number[])[],
): (id: number) => number {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const ids of threads) {
    for (const id of ids) if (!parent.has(id)) parent.set(id, id);
    for (let i = 1; i < ids.length; i += 1) {
      const a = find(ids[0]);
      const b = find(ids[i]);
      if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
    }
  }
  return (id) => (parent.has(id) ? find(id) : id);
}

// ─── 주간 레이더 ─────────────────────────────────────────────────────────────

/** 키트 레이더 한 행 — 영어 제목이 있는 항목만(영어판 레이더와 같은 범위). */
export interface SocialRadarItem {
  rank: number;
  id: number;
  title: string;
  format: "oss" | "model" | "paper";
  category: string;
  source: string;
  /** owner/repo · org/model · arXiv ID — 없으면 생략. */
  ident?: string;
  /** 수치 칸들(["★ 12.4k", "That day +1,190", "Python"]) — 없으면 생략. */
  stats?: string[];
  issueDate: string;
}

/**
 * buildWeeklyRadar 결과(영어판 범위로 거른 후보) → 키트 행 ≤ limit. 순위는 밴드 순위 그대로(1부터).
 * `meta` 는 레이더 메타(식별자·수치 — weeklyMetaBlock)를 문자열로 바꾼 것(CLI 가 넘긴다, 테스트는 생략 가능).
 */
export function toSocialRadar(
  radar: WeeklyRadar | null,
  meta: (item: WeeklyRadar["items"][number]) => { ident?: string; stats?: string[] } = () => ({}),
  limit = RADAR_LIMIT,
): SocialRadarItem[] {
  if (!radar) return [];
  return radar.items
    .map((item, i) => ({ item, rank: i + 1 }))
    .filter(({ item }) => Boolean(item.titleEn?.trim()))
    .slice(0, limit)
    .map(({ item, rank }) => {
      const m = meta(item);
      const row: SocialRadarItem = {
        rank,
        id: item.id,
        title: item.titleEn!.trim(),
        format: item.format,
        category: item.category,
        source: sourceDisplayName(englishSource(item.source), "en"),
        issueDate: item.issueDate,
      };
      if (m.ident) row.ident = m.ident;
      if (m.stats?.length) row.stats = m.stats;
      return row;
    });
}
