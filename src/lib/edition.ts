/**
 * 홈 편집 지면 구성(DESIGN.md §3, docs/contents-upgrade-plan.md Phase 5)의 단일 출처.
 * 순수 함수 — 서버(빌드)·클라 어디서든 동일 결과.
 *
 * 입력은 "그 호의 기사"(KST 하루에 수집된 공개 기사, getIssueArticles)다. 기간 필터·전체 기사 대체
 * 폴백은 없다 — 호 선택은 호출자 몫이고, 다른 호의 기사는 어떤 슬롯에도 섞이지 않는다.
 *
 * 1면 본문(약 11건) = 뉴스 축(리드 1 · 서브 3 · 오늘의 브리핑 3) + 비뉴스 축(레이더 4).
 * 중요도는 형식 안에서 매긴 상대값(Phase 4)이라, 슬롯은 형식(format)을 직접 보고 나눈다.
 *
 * - lead:     뉴스 편집 순 1위. 뉴스가 0건인 호에서만 전체 1위(비뉴스)로 대체 — 기사가 있는 호의 1면은 비지 않는다
 * - seconds:  다음 뉴스. 리드+서브 안에서 같은 분야 최대 2건, 가능하면 분야 3개 이상(selectSeconds)
 * - briefs:   남은 뉴스 편집 순. 리드·서브에 Physical AI 가 없으면 중요도 3 이상 Physical AI 뉴스 1건 우선
 * - radar:    비뉴스만. 오픈소스·모델·논문 각 1위를 먼저 담고 나머지는 편집 순(selectRadar)
 * - trending: 화제 지수 순 상위 N, 점수 > 0만. 위 슬롯과 중복 허용(순위 정보)
 * - sections: 분야별 편집 순 상위 N(1면 본문 기사 제외), 남은 기사가 없는 분야는 생략
 * - issue:    그 호 기사 전체(편집 순) — 호 고정 링크 지면의 "이 호의 기사" 목록
 *
 * 부족하면 슬롯이 줄어들 뿐 다른 축이나 다른 호로 채우지 않는다: 뉴스가 7건 미만이면 브리핑(→서브)이,
 * 비뉴스가 4건 미만이면 레이더가 준다(0건이면 빈 배열 → UI 가 레이더 띠를 숨긴다). 남는 기사는 섹션 밴드로 간다.
 */
import { CATEGORIES, FORMATS, type Format, shortSourceName } from "@/lib/labels";
import type { ArticleCard } from "@/lib/types";

export interface EditionSection {
  /** 분야 키(CATEGORIES 순서). */
  category: string;
  /** 이 호 안의 해당 분야 기사 수(1면 게재분 포함). */
  count: number;
  /** 그중 1면 본문(리드·서브·브리핑·레이더)에 실린 수 — 밴드 머리의 "· 1면 N건". */
  onFront: number;
  items: ArticleCard[];
}

export interface Edition {
  lead: ArticleCard | null;
  seconds: ArticleCard[];
  /** 오늘의 브리핑 — 서브 다음 뉴스(편집 순). */
  briefs: ArticleCard[];
  /** 오픈소스·논문 레이더 — 비뉴스(편집 순). 비면 띠를 숨긴다. */
  radar: ArticleCard[];
  trending: ArticleCard[];
  sections: EditionSection[];
  issue: ArticleCard[];
}

export interface EditionLimits {
  seconds: number;
  briefs: number;
  radar: number;
  trending: number;
  sectionItems: number;
}

export const EDITION_LIMITS: EditionLimits = {
  seconds: 3,
  briefs: 3,
  radar: 4,
  trending: 5,
  sectionItems: 4,
};

/** 리드+서브 안에서 한 분야가 차지할 수 있는 최대 건수. */
const MAX_PER_CATEGORY = 2;
/** 리드+서브가 덮으려는 최소 분야 수(뉴스 풀이 허락할 때). */
const MIN_CATEGORIES = 3;
/** 브리핑 Physical AI 우선 배정의 최소 중요도. */
const PHYSICAL_MIN_IMPORTANCE = 3;
/** 레이더가 1건씩 보장하는 형식(이 순서로 각 형식 1위를 담는다 — 슬롯이 3 미만일 때만 순서가 의미 있다). */
const RADAR_FORMATS: readonly Format[] = ["oss", "model", "paper"];

/** 중요도 → 트렌딩 → 최신 → id 순 비교자(편집 판단 정렬). id 로 입력 순서와 무관하게 리드를 고정한다. */
function byEditorial(a: ArticleCard, b: ArticleCard): number {
  return (
    b.importance - a.importance ||
    b.trendingScore - a.trendingScore ||
    b.publishedAt.localeCompare(a.publishedAt) ||
    a.id - b.id
  );
}

const distinctCategories = (xs: ArticleCard[]) => new Set(xs.map((a) => a.category)).size;

/**
 * 서브 선정. pool 은 리드를 뺀 뉴스(편집 순).
 * 1) 같은 분야 최대 2건(리드 포함)으로 편집 순 그리디.
 * 2) 리드+서브가 분야 3개 미만이면, 분야가 겹친 서브 중 가장 낮은 순위를 "덮이지 않은 분야의 최상위 뉴스"로 교체한다.
 *    교체할 겹친 서브나 새 분야 후보가 없으면(풀이 허락하지 않으면) 그대로 둔다.
 * 3) 상한 때문에 슬롯이 남으면 건너뛴 뉴스로 편집 순 보충 — 분야 상한보다 서브를 채우는 쪽을 택한다.
 *    (브리핑보다 서브가 먼저 찬다: 뉴스가 모자라면 브리핑이 먼저 준다.)
 */
function selectSeconds(lead: ArticleCard, pool: ArticleCard[], limit: number): ArticleCard[] {
  if (limit <= 0) return [];
  const perCategory = new Map<string, number>([[lead.category, 1]]);
  const picked: ArticleCard[] = [];
  for (const a of pool) {
    if (picked.length >= limit) break;
    const n = perCategory.get(a.category) ?? 0;
    if (n >= MAX_PER_CATEGORY) continue;
    picked.push(a);
    perCategory.set(a.category, n + 1);
  }

  const target = Math.min(MIN_CATEGORIES, distinctCategories([lead, ...pool]));
  while (distinctCategories([lead, ...picked]) < target) {
    const covered = new Set([lead, ...picked].map((a) => a.category));
    const incoming = pool.find((a) => !covered.has(a.category));
    if (!incoming) break;
    const front = [lead, ...picked];
    // 빼도 분야 수가 줄지 않는(같은 분야가 1면에 2건 이상인) 서브 중 가장 낮은 순위.
    let outIdx = picked.length - 1;
    while (outIdx >= 0 && front.filter((x) => x.category === picked[outIdx].category).length < 2) {
      outIdx -= 1;
    }
    if (outIdx < 0) {
      // 서브 자리가 남아 있으면(상한·풀 크기 탓) 그냥 더한다 — 아니면 교체할 수 없다.
      if (picked.length >= limit) break;
      picked.push(incoming);
    } else {
      picked[outIdx] = incoming;
    }
    picked.sort(byEditorial);
  }

  if (picked.length < limit) {
    const taken = new Set(picked.map((a) => a.id));
    for (const a of pool) {
      if (picked.length >= limit) break;
      if (!taken.has(a.id)) picked.push(a);
    }
    picked.sort(byEditorial);
  }
  return picked;
}

/**
 * 브리핑 선정. pool 은 리드·서브를 뺀 뉴스(편집 순). 리드·서브에 Physical AI 가 없으면
 * 중요도 3 이상인 최상위 Physical AI 뉴스 1건을 먼저 확보하고 나머지는 편집 순으로 채운다. 표시도 편집 순.
 */
function selectBriefs(pool: ArticleCard[], limit: number, physicalOnFront: boolean): ArticleCard[] {
  if (limit <= 0) return [];
  const reserved = physicalOnFront
    ? undefined
    : pool.find((a) => a.category === "physical" && a.importance >= PHYSICAL_MIN_IMPORTANCE);
  const picked = reserved ? [reserved] : [];
  for (const a of pool) {
    if (picked.length >= limit) break;
    if (a !== reserved) picked.push(a);
  }
  return picked.sort(byEditorial);
}

/**
 * 레이더 선정. pool 은 비뉴스(편집 순). 오픈소스·모델·논문 중 있는 형식은 각 1위를 먼저 담고(형식 혼합 보장),
 * 남은 자리는 비뉴스 편집 순으로 채운다.
 *
 * 표시 순서도 편집 순이다: 형식별 고정 열(REPO·MODEL·PAPER)로 두면 4번째 카드가 늘 같은 형식에 붙어
 * 위계가 흐려지고, 형식이 빠진 날 열 의미가 무너진다. 편집 순이면 "가장 볼만한 것부터"라는 다른 슬롯과
 * 같은 읽기 규칙을 따르고, id 까지 포함한 전순서라 빌드마다 순서가 고정된다. 형식은 카드 라벨이 알려 준다.
 */
function selectRadar(pool: ArticleCard[], limit: number): ArticleCard[] {
  if (limit <= 0) return [];
  const heads = RADAR_FORMATS.map((f) => pool.find((a) => a.format === f)).filter(
    (a): a is ArticleCard => a !== undefined,
  );
  // 슬롯이 형식 수보다 적으면 형식 1위끼리도 편집 순으로 자른다.
  const picked = heads.sort(byEditorial).slice(0, limit);
  for (const a of pool) {
    if (picked.length >= limit) break;
    if (!picked.includes(a)) picked.push(a);
  }
  return picked.sort(byEditorial);
}

export function buildEdition(
  issueArticles: ArticleCard[],
  limits: EditionLimits = EDITION_LIMITS,
): Edition {
  const editorial = [...issueArticles].sort(byEditorial);
  const news = editorial.filter((a) => a.format === "news");
  const nonNews = editorial.filter((a) => a.format !== "news");

  // 리드: 뉴스 1위. 뉴스가 없는 호는 전체 1위(비뉴스)로 — 레이더는 나머지 비뉴스에서 고른다.
  const lead = news[0] ?? editorial[0] ?? null;
  const newsPool = news.filter((a) => a !== lead);
  const seconds = lead ? selectSeconds(lead, newsPool, limits.seconds) : [];
  const physicalOnFront = [lead, ...seconds].some((a) => a?.category === "physical");
  const briefs = selectBriefs(
    newsPool.filter((a) => !seconds.includes(a)),
    limits.briefs,
    physicalOnFront,
  );
  const radar = selectRadar(
    nonNews.filter((a) => a !== lead),
    limits.radar,
  );

  const frontIds = new Set(frontArticles({ lead, seconds, briefs, radar }).map((a) => a.id));

  const trending = issueArticles
    .filter((a) => a.trendingScore > 0)
    .sort(
      (a, b) =>
        b.trendingScore - a.trendingScore ||
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.id - b.id,
    )
    .slice(0, limits.trending);

  const sections = CATEGORIES.map((category) => {
    const inCategory = editorial.filter((a) => a.category === category);
    const rest = inCategory.filter((a) => !frontIds.has(a.id));
    return {
      category,
      // "섹션 전체 보기"는 누적 분야 피드로 이어지지만, 개수는 이 호 기준.
      count: inCategory.length,
      onFront: inCategory.length - rest.length,
      items: rest.slice(0, limits.sectionItems),
    };
  }).filter((s) => s.items.length > 0); // 밴드 = 내비 항목. 전부 1면에 오른 분야는 밴드·내비 모두 생략.

  return { lead, seconds, briefs, radar, trending, sections, issue: editorial };
}

/** 1면 본문 기사(리드 → 서브 → 브리핑 → 레이더 순). 지금 화제는 순위 정보라 포함하지 않는다. */
export function frontArticles(
  edition: Pick<Edition, "lead" | "seconds" | "briefs" | "radar">,
): ArticleCard[] {
  const { lead, seconds, briefs, radar } = edition;
  return [...(lead ? [lead] : []), ...seconds, ...briefs, ...radar];
}

/** 마스트헤드 '귀'의 호 기준 통계 — 누적이 아니라 그 호 기사만 센다. */
export interface IssueStats {
  /** 이번 호 기사 수. */
  count: number;
  /** 이번 호에 실린 서로 다른 매체 수 — 축약명 단위(매체 필터 칩과 같은 단위, 같은 매체의 여러 피드는 1곳). */
  sources: number;
  /** 형식 구성(FORMATS 순서: 뉴스 → 오픈소스 → 모델 → 논문). 0건인 형식은 생략한다. */
  formats: { format: Format; count: number }[];
}

export function issueStats(issueArticles: Pick<ArticleCard, "format" | "source">[]): IssueStats {
  const byFormat = new Map<Format, number>();
  for (const a of issueArticles) byFormat.set(a.format, (byFormat.get(a.format) ?? 0) + 1);
  return {
    count: issueArticles.length,
    sources: new Set(issueArticles.map((a) => shortSourceName(a.source.name))).size,
    formats: FORMATS.filter((f) => byFormat.has(f)).map((f) => ({
      format: f,
      count: byFormat.get(f)!,
    })),
  };
}
