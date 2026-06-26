/**
 * 피드 필터/정렬의 클라이언트 측 단일 출처.
 *
 * 정적 export(GitHub Pages)에서는 서버가 쿼리별로 다른 HTML을 만들 수 없으므로,
 * 빌드타임에 전체 카드를 내려받아 브라우저에서 거른다. 이 함수는 서버 빌드 시점의
 * `src/lib/db.ts` `buildFilters`/`orderByFor` SQL 의미를 `ArticleCard[]` 대상으로
 * 1:1 이전한 것이다(동점 보조 키까지 동일). 서버/클라 동작 일치는 단위 테스트로 고정한다.
 */
import type { FeedOptions } from "@/lib/db";
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
 * 소스·태그 필터 적용 후 정렬한 새 배열을 반환한다(입력 불변).
 * - source: `source.id` 정확 일치
 * - tag:    `tags` 배열에 포함
 */
export function filterAndSortFeed(articles: ArticleCard[], opts: FeedOptions = {}): ArticleCard[] {
  const filtered = articles.filter((a) => {
    if (opts.source && a.source.id !== opts.source) return false;
    if (opts.tag && !a.tags.includes(opts.tag)) return false;
    return true;
  });
  return filtered.sort(comparatorFor(opts.sort));
}
