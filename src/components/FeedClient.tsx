"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FeedView } from "@/components/FeedView";
import { useLocale } from "@/components/LocaleProvider";
import type { IndexLoadState } from "@/components/StoryIndex";
import type { EditionInfo } from "@/lib/db";
import type { IssueBriefLine } from "@/lib/edition";
import { mergeIndex, toIndexCard } from "@/lib/feedIndex";
import { hasActiveFilter, parseFeedOptions, type SourceOption } from "@/lib/feedFilter";
import {
  INDEX_LOCALE,
  loadIndexManifest,
  loadIndexMonths,
  manifestHead,
  type IndexManifest,
} from "@/lib/indexShards";
import type { ArticleCard as ArticleCardType, IndexCard } from "@/lib/types";
import type { WeeklyRadar } from "@/lib/weeklyRadar";

/**
 * 피드 클라이언트 셸 (정적 export).
 *
 * URL 쿼리(`?category=&source=&tag=&sort=`)를 읽어 옵션을 파싱하고 FeedView로 지면/필터 결과를 렌더한다.
 * 정적 HTML 자체는 page.tsx의 Suspense fallback(=기본 옵션 FeedView)이 담당하므로, 이 컴포넌트는
 * 하이드레이션 이후 동작한다. FilterBar·FilterSheet·섹션 링크의 Link 네비게이션으로 쿼리가 바뀌면
 * useSearchParams가 갱신돼 재렌더된다.
 *
 * 전체 기사 색인: 처음엔 page.tsx 가 실은 첫 페이지(`indexHead`)만 있다. 기본 지면에서 "더 보기"로 첫 페이지를 넘기면
 * 색인 목록(feed-index/<언어>/manifest.json — 다음 4페이지 머리 포함)만 받고, 머리를 넘기거나 필터·정렬이 걸리면 모든 달
 * 조각을 받아 기본 정렬 순으로 합친다(src/lib/feedIndex.ts·indexShards.ts). 한 번 받은 것은 다시 받지 않는다.
 *
 * 언어는 prop 이 아니라 LocaleProvider 컨텍스트로 읽어(props 는 RSC 페이로드에 실린다) FeedView 에 넘긴다.
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
  weekly,
  brief,
}: {
  issueArticles: ArticleCardType[];
  indexHead: IndexCard[];
  indexTotal: number;
  /** 색인 목록 캐시 키(indexBuildVersion). */
  indexVersion: string;
  sources: SourceOption[];
  tags: string[];
  editionInfo: EditionInfo;
  initialDelayGap?: number;
  weekly?: WeeklyRadar | null;
  brief?: IssueBriefLine[];
}) {
  const locale = useLocale();
  const searchParams = useSearchParams();
  // 피드는 검색어를 쓰지 않으므로 q 는 버린다.
  const options = useMemo(
    () => ({ ...parseFeedOptions(searchParams), q: undefined }),
    [searchParams],
  );

  const [manifest, setManifest] = useState<IndexManifest | null>(null);
  const [all, setAll] = useState<IndexCard[] | null>(null);
  const [loadState, setLoadState] = useState<IndexLoadState | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * 한 단계 더 받는다: 목록이 없으면 목록(색인 머리), 있으면 모든 달 조각. `full` 이면 목록에 이어 곧바로 조각까지.
   * "더 보기"·다시 시도·필터가 모두 이 함수를 부른다(받는 중이면 StoryIndex 가 버튼 대신 상태 줄을 둔다).
   */
  const loadIndex = useCallback(
    (full = false) => {
      setLoadState("loading");
      loadIndexManifest("feed-index", INDEX_LOCALE[locale], indexVersion)
        .then(async (m) => {
          const fetchMonths = full || manifest !== null;
          const months = fetchMonths ? await loadIndexMonths(m, m.months) : null;
          if (!alive.current) return;
          setManifest(m);
          if (months) setAll(months);
          setLoadState(undefined);
        })
        .catch(() => {
          if (alive.current) setLoadState("error");
        });
    },
    [locale, indexVersion, manifest],
  );

  // 필터·정렬은 누적 전체가 있어야 결과가 맞다 — 걸리는 즉시 받는다(한 번 받으면 다시 받지 않는다).
  const needsAll = hasActiveFilter(options) || Boolean(options.sort);
  useEffect(() => {
    if (needsAll && !all && loadState === undefined) loadIndex(true);
  }, [needsAll, all, loadState, loadIndex]);

  const head = useMemo(() => (manifest ? manifestHead(manifest) : []), [manifest]);
  const index = useMemo(
    () =>
      all
        ? mergeIndex(indexHead, head, all, issueArticles.map(toIndexCard))
        : mergeIndex(indexHead, head),
    [all, head, indexHead, issueArticles],
  );

  return (
    <FeedView
      issueArticles={issueArticles}
      index={index}
      // 받은 뒤엔 합친 목록이 곧 전체다(데이터가 일관되면 빌드 시점 누적 건수와 같다).
      indexTotal={all ? index.length : indexTotal}
      indexLoadState={loadState}
      onLoadIndex={() => loadIndex(needsAll)}
      sources={sources}
      tags={tags}
      options={options}
      editionInfo={editionInfo}
      initialDelayGap={initialDelayGap}
      weekly={weekly}
      brief={brief}
      locale={locale}
    />
  );
}
