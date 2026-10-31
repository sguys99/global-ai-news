"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FeedView } from "@/components/FeedView";
import type { IndexLoadState } from "@/components/StoryIndex";
import type { EditionInfo } from "@/lib/db";
import { feedIndexUrl, loadFeedIndex, mergeIndex, toIndexCard } from "@/lib/feedIndex";
import { hasActiveFilter, parseFeedOptions, type SourceOption } from "@/lib/feedFilter";
import type { ArticleCard as ArticleCardType, IndexCard } from "@/lib/types";

/**
 * 피드 클라이언트 셸 (정적 export).
 *
 * URL 쿼리(`?category=&source=&tag=&sort=`)를 읽어 옵션을 파싱하고 FeedView로 지면/필터 결과를 렌더한다.
 * 정적 HTML 자체는 page.tsx의 Suspense fallback(=기본 옵션 FeedView)이 담당하므로, 이 컴포넌트는
 * 하이드레이션 이후 동작한다. FilterBar·FilterSheet·섹션 링크의 Link 네비게이션으로 쿼리가 바뀌면
 * useSearchParams가 갱신돼 재렌더된다.
 *
 * 전체 기사 색인: 처음엔 page.tsx 가 실은 첫 페이지(`indexHead`)만 있다. 필터·정렬이 걸리면 곧바로,
 * 기본 지면에선 "더 보기"로 첫 페이지를 넘길 때 누적 전체(feed-index.json)를 1회 받아 합친다(src/lib/feedIndex.ts).
 */
export function FeedClient({
  issueArticles,
  indexHead,
  indexTotal,
  indexVersion,
  sources,
  tags,
  editionInfo,
  initialDelayGap,
}: {
  issueArticles: ArticleCardType[];
  indexHead: IndexCard[];
  indexTotal: number;
  /** feed-index.json 캐시 키(feedIndexVersion). */
  indexVersion: string;
  sources: SourceOption[];
  tags: string[];
  editionInfo: EditionInfo;
  initialDelayGap?: number;
}) {
  const searchParams = useSearchParams();
  // 피드는 검색어를 쓰지 않으므로 q 는 버린다.
  const options = useMemo(
    () => ({ ...parseFeedOptions(searchParams), q: undefined }),
    [searchParams],
  );

  const [all, setAll] = useState<IndexCard[] | null>(null);
  const [loadState, setLoadState] = useState<IndexLoadState | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadIndex = useCallback(() => {
    setLoadState("loading");
    loadFeedIndex(feedIndexUrl(indexVersion)).then(
      (data) => {
        if (!alive.current) return;
        setAll(data);
        setLoadState(undefined);
      },
      () => {
        if (alive.current) setLoadState("error");
      },
    );
  }, [indexVersion]);

  // 필터·정렬은 누적 전체가 있어야 결과가 맞다 — 걸리는 즉시 받는다(한 번 받으면 다시 받지 않는다).
  const needsAll = hasActiveFilter(options) || Boolean(options.sort);
  useEffect(() => {
    if (needsAll && !all && loadState === undefined) loadIndex();
  }, [needsAll, all, loadState, loadIndex]);

  const index = useMemo(
    () => (all ? mergeIndex(indexHead, all, issueArticles.map(toIndexCard)) : indexHead),
    [all, indexHead, issueArticles],
  );

  return (
    <FeedView
      issueArticles={issueArticles}
      index={index}
      // 받은 뒤엔 합친 목록이 곧 전체다(데이터가 일관되면 빌드 시점 누적 건수와 같다).
      indexTotal={all ? index.length : indexTotal}
      indexLoadState={loadState}
      onLoadIndex={loadIndex}
      sources={sources}
      tags={tags}
      options={options}
      editionInfo={editionInfo}
      initialDelayGap={initialDelayGap}
    />
  );
}
