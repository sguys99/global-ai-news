"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { FeedView } from "@/components/FeedView";
import type { FeedOptions } from "@/lib/db";
import type { ArticleCard as ArticleCardType } from "@/lib/types";

/**
 * 피드 클라이언트 셸 (정적 export).
 *
 * URL 쿼리(`?source=&tag=&sort=`)를 읽어 옵션을 파싱하고 FeedView로 필터/정렬 결과를 렌더한다.
 * 정적 HTML 자체는 page.tsx의 Suspense fallback(=기본 옵션 FeedView)이 담당하므로, 이 컴포넌트는
 * 하이드레이션 이후 동작한다. FilterBar·FilterSheet의 Link 네비게이션으로 쿼리가 바뀌면
 * useSearchParams가 갱신돼 재필터링된다(공유 URL·칩 시각·UX는 standalone 시절과 동일).
 */
export function FeedClient({
  articles,
  sources,
  tags,
}: {
  articles: ArticleCardType[];
  sources: { id: string; name: string }[];
  tags: string[];
}) {
  const searchParams = useSearchParams();

  const options: FeedOptions = useMemo(() => {
    const sort = searchParams.get("sort");
    return {
      source: searchParams.get("source") || undefined,
      tag: searchParams.get("tag") || undefined,
      sort: sort === "latest" || sort === "importance" ? sort : undefined,
    };
  }, [searchParams]);

  return <FeedView articles={articles} sources={sources} tags={tags} options={options} />;
}
