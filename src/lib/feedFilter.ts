/**
 * 피드 필터/정렬의 클라이언트 측 단일 출처.
 *
 * 정적 export(GitHub Pages)에서는 서버가 쿼리별로 다른 HTML을 만들 수 없으므로,
 * 빌드타임에 만든 전체 카드 JSON(홈 feed-index.json·검색 search-index.json)을 받아 브라우저에서 거른다.
 * 이 함수는 서버 빌드 시점의 `src/lib/db.ts` `buildFilters`/`orderByFor` SQL 의미를 카드 배열 대상으로
 * 1:1 이전한 것이다(동점 보조 키까지 동일). 서버/클라 동작 일치는 단위 테스트로 고정한다.
 */
import type { FeedOptions, SearchOptions } from "@/lib/db";
import { normalizeCategory, shortSourceName } from "@/lib/labels";
import type { IndexCard } from "@/lib/types";

/** ISO8601 문자열 내림차순 비교(사전식 비교 = 시간 내림차순과 호환). */
function byPublishedDesc(a: IndexCard, b: IndexCard): number {
  return b.publishedAt.localeCompare(a.publishedAt);
}

/**
 * `orderByFor`(db.ts)와 동일한 정렬 비교자.
 * - latest:      published_at DESC
 * - importance:  importance DESC, trending_score DESC
 * - (기본)       trending_score DESC, published_at DESC
 */
function comparatorFor(sort: FeedOptions["sort"]): (a: IndexCard, b: IndexCard) => number {
  if (sort === "latest") {
    return byPublishedDesc;
  }
  if (sort === "importance") {
    return (a, b) => b.importance - a.importance || b.trendingScore - a.trendingScore;
  }
  return (a, b) => b.trendingScore - a.trendingScore || byPublishedDesc(a, b);
}

/** 매체 필터 옵션 한 건 — `getSourcesWithCounts` 행(소스 id·원래 이름·게재 기사 수). */
export interface SourceOption {
  id: string;
  name: string;
  count?: number;
}

/**
 * 매체 칩 한 개 = 축약명(`shortSourceName`)이 같은 소스 묶음.
 *
 * 수집은 한 매체를 여러 피드로 받는다(Hacker News 두 피드, Google News 질의 3개, HuggingFace 논문·모델,
 * GitHub 토픽 검색 3개). 독자에게 "매체"는 바이라인에 찍히는 이름이므로 칩도 그 이름 단위로 하나만 둔다.
 * - id: URL `?source=`에 싣는 대표 id — 묶음에서 기사가 가장 많은 소스(동률이면 먼저 나온 소스).
 * - ids: 묶음의 모든 소스 id. 어느 id 로 들어온 링크든 같은 묶음으로 풀린다(옛 `?source=<id>` 호환).
 */
export interface SourceGroup {
  id: string;
  label: string;
  ids: string[];
  count: number;
}

/** 소스 목록을 축약명 단위로 묶는다. 묶음 기사 수 합계 내림차순(동률은 입력 순서 유지). */
export function groupSources(sources: readonly SourceOption[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  const repCount = new Map<string, number>(); // 묶음별 대표 id 의 기사 수
  for (const s of sources) {
    const label = shortSourceName(s.name);
    const count = s.count ?? 0;
    const g = groups.get(label);
    if (!g) {
      groups.set(label, { id: s.id, label, ids: [s.id], count });
      repCount.set(label, count);
      continue;
    }
    g.ids.push(s.id);
    g.count += count;
    if (count > repCount.get(label)!) {
      g.id = s.id;
      repCount.set(label, count);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** 소스 id 가 속한 매체 묶음. 목록에 없는 id 면 undefined. */
export function findSourceGroup(
  groups: readonly SourceGroup[],
  sourceId: string | undefined,
): SourceGroup | undefined {
  return sourceId ? groups.find((g) => g.ids.includes(sourceId)) : undefined;
}

/**
 * 소스·태그·카테고리 필터 적용 후 정렬한 새 배열을 반환한다(입력 불변). 카드 모양은 그대로 돌려준다
 * (ArticleCard·검색 인덱스 항목·색인 카드 IndexCard 모두 — 필터·정렬에 쓰는 필드는 IndexCard 에 다 있다).
 * - source: `sources`(매체 목록)를 주면 그 id 가 속한 **매체 묶음 전체**와 일치(`groupSources`).
 *           목록이 없거나 목록에 없는 id 면 `source.id` 정확 일치(db.ts `getFeed` 와 같은 의미).
 * - tag:    `tags` 배열에 포함
 * - category: `category` 정확 일치
 */
export function filterAndSortFeed<T extends IndexCard>(
  articles: readonly T[],
  opts: FeedOptions = {},
  sources: readonly SourceOption[] = [],
): T[] {
  const sourceIds = opts.source
    ? new Set(findSourceGroup(groupSources(sources), opts.source)?.ids ?? [opts.source])
    : null;
  const filtered = articles.filter((a) => {
    if (sourceIds && !sourceIds.has(a.source.id)) return false;
    if (opts.tag && !a.tags.includes(opts.tag)) return false;
    if (opts.category && a.category !== opts.category) return false;
    return true;
  });
  return filtered.sort(comparatorFor(opts.sort));
}

/**
 * URL 쿼리(`?q=&category=&source=&tag=&sort=`) → 옵션. 피드·검색 클라이언트 셸이 공유한다.
 * 분야 개편 전 공유 링크(`?category=Language%20Models` 등)는 새 키로 바꿔 받는다. 미정의 값은 그대로 둔다.
 */
export function parseFeedOptions(params: { get(name: string): string | null }): SearchOptions {
  const sort = params.get("sort");
  return {
    q: params.get("q") || undefined,
    category: normalizeCategory(params.get("category") ?? "") || undefined,
    source: params.get("source") || undefined,
    tag: params.get("tag") || undefined,
    sort: sort === "latest" || sort === "importance" ? sort : undefined,
  };
}

/** 분야·매체·태그 중 하나라도 걸려 있으면 true (정렬·검색어는 제외). */
export function hasActiveFilter(opts: FeedOptions): boolean {
  return Boolean(opts.category || opts.source || opts.tag);
}
