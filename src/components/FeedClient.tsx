"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { FeedView } from "@/components/FeedView";
import type { EditionInfo } from "@/lib/db";
import { parseFeedOptions } from "@/lib/feedFilter";
import type { ArticleCard as ArticleCardType } from "@/lib/types";

/**
 * 피드 클라이언트 셸 (정적 export).
 *
 * URL 쿼리(`?category=&source=&tag=&sort=`)를 읽어 옵션을 파싱하고 FeedView로 지면/필터 결과를 렌더한다.
 * 정적 HTML 자체는 page.tsx의 Suspense fallback(=기본 옵션 FeedView)이 담당하므로, 이 컴포넌트는
 * 하이드레이션 이후 동작한다. FilterBar·FilterSheet·섹션 링크의 Link 네비게이션으로 쿼리가 바뀌면
 * useSearchParams가 갱신돼 재렌더된다.
 */
export function FeedClient({
  articles,
  sources,
  tags,
  editionInfo,
}: {
  articles: ArticleCardType[];
  sources: { id: string; name: string }[];
  tags: string[];
  editionInfo: EditionInfo;
}) {
  const searchParams = useSearchParams();
  // 피드는 검색어를 쓰지 않으므로 q 는 버린다.
  const options = useMemo(
    () => ({ ...parseFeedOptions(searchParams), q: undefined }),
    [searchParams],
  );

  return (
    <FeedView
      articles={articles}
      sources={sources}
      tags={tags}
      options={options}
      editionInfo={editionInfo}
    />
  );
}
