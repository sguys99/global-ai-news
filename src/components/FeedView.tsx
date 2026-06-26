import { ArticleCard } from "@/components/ArticleCard";
import { FilterBar } from "@/components/FilterBar";
import { FilterSheet } from "@/components/mobile/FilterSheet";
import type { FeedOptions } from "@/lib/db";
import { filterAndSortFeed } from "@/lib/feedFilter";
import type { ArticleCard as ArticleCardType } from "@/lib/types";

/**
 * 피드 프레젠테이션(서버·클라 공용, 훅 없음).
 *
 * 정적 export에서 두 곳에서 쓰인다:
 *  1) page.tsx의 Suspense fallback — 서버가 기본 옵션(필터 없음)으로 **정적 HTML에 카드를 렌더**
 *     (LCP·SEO·"피드 정적 생성" 보장). useSearchParams를 쓰지 않으므로 bailout되지 않는다.
 *  2) FeedClient(클라) 내부 — URL 쿼리로 파싱한 옵션을 받아 동일 마크업으로 재렌더.
 * 순수 db 의존이 없어(filterAndSortFeed만 사용) 클라이언트 번들에 포함돼도 안전하다.
 */
export function FeedView({
  articles,
  sources,
  tags,
  options,
}: {
  articles: ArticleCardType[];
  sources: { id: string; name: string }[];
  tags: string[];
  options: FeedOptions;
}) {
  const visible = filterAndSortFeed(articles, options);

  return (
    <>
      {/* 데스크톱: 인라인 FilterBar / 모바일: 바텀시트 트리거 (mobile-plan Phase 4) */}
      <div className="hidden md:block">
        <FilterBar current={options} sources={sources} tags={tags} />
      </div>
      <FilterSheet current={options} sources={sources} tags={tags} />

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-body">
          {options.source || options.tag
            ? "조건에 맞는 기사가 없습니다. 필터를 해제해 보세요."
            : "아직 수집된 기사가 없습니다. `npm run collect` 실행 후 새로고침하세요."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </>
  );
}
