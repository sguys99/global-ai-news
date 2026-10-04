/**
 * 피드 필터/정렬의 클라이언트 측 단일 출처.
 *
 * 정적 export(GitHub Pages)에서는 서버가 쿼리별로 다른 HTML을 만들 수 없으므로,
 * 빌드타임에 전체 카드를 내려받아 브라우저에서 거른다. 이 함수는 서버 빌드 시점의
 * `src/lib/db.ts` `buildFilters`/`orderByFor` SQL 의미를 `ArticleCard[]` 대상으로
 * 1:1 이전한 것이다(동점 보조 키까지 동일). 서버/클라 동작 일치는 단위 테스트로 고정한다.
 */
import type { FeedOptions, SearchOptions } from "@/lib/db";
import type { ArticleCard } from "@/lib/types";

/** ISO8601 문자열 내림차순 비교(사전식 비교 = 시간 내림차순과 호환). */
function byPublishedDesc(a: ArticleCard, b: ArticleCard): number {
  return b.publishedAt.localeCompare(a.publishedAt);
}

/**
 * `orderByFor`(db.ts)와 동일한 정렬 비교자.
 * - latest:      published_at DESC
 * - importance:  importance DESC, trending_score DESC
 * - (기본)       trending_score DESC, published_at DESC
 */
function comparatorFor(sort: FeedOptions["sort"]): (a: ArticleCard, b: ArticleCard) => number {
  if (sort === "latest") {
    return byPublishedDesc;
  }
  if (sort === "importance") {
    return (a, b) => b.importance - a.importance || b.trendingScore - a.trendingScore;
  }
  return (a, b) => b.trendingScore - a.trendingScore || byPublishedDesc(a, b);
}

/**
 * 소스·태그·카테고리 필터 적용 후 정렬한 새 배열을 반환한다(입력 불변).
 * - source: `source.id` 정확 일치
 * - tag:    `tags` 배열에 포함
 * - category: `category` 정확 일치
 */
export function filterAndSortFeed(articles: ArticleCard[], opts: FeedOptions = {}): ArticleCard[] {
  const filtered = articles.filter((a) => {
    if (opts.source && a.source.id !== opts.source) return false;
    if (opts.tag && !a.tags.includes(opts.tag)) return false;
    if (opts.category && a.category !== opts.category) return false;
    return true;
  });
  return filtered.sort(comparatorFor(opts.sort));
}

/** URL 쿼리(`?q=&category=&source=&tag=&sort=`) → 옵션. 피드·검색 클라이언트 셸이 공유한다. */
export function parseFeedOptions(params: { get(name: string): string | null }): SearchOptions {
  const sort = params.get("sort");
  return {
    q: params.get("q") || undefined,
    category: params.get("category") || undefined,
    source: params.get("source") || undefined,
    tag: params.get("tag") || undefined,
    sort: sort === "latest" || sort === "importance" ? sort : undefined,
  };
}

/** 분야·매체·태그 중 하나라도 걸려 있으면 true (정렬·검색어는 제외). */
export function hasActiveFilter(opts: FeedOptions): boolean {
  return Boolean(opts.category || opts.source || opts.tag);
}
