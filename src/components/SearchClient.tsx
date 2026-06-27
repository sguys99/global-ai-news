"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArticleCard } from "@/components/ArticleCard";
import { FilterBar } from "@/components/FilterBar";
import { FilterSheet } from "@/components/mobile/FilterSheet";
import { SearchInput } from "@/components/SearchInput";
import type { SearchOptions } from "@/lib/db";
import { filterAndSortFeed } from "@/lib/feedFilter";
import { buildSearchDocument, queryMatchingIds, type SearchDocument } from "@/lib/searchIndex";
import type { SearchIndexEntry } from "@/lib/types";

/** 정적 export 서브경로(`/global-ai-news`)에서 수동 fetch는 basePath를 명시해야 한다(dev는 ""). */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const INDEX_URL = `${BASE_PATH}/search-index.json`;

/**
 * 검색 클라이언트 셸 (정적 export).
 *
 * 서버 FTS5 검색을 대체한다. 마운트 시 search-index.json 을 fetch 해 FlexSearch 인덱스를 빌드하고,
 * URL 쿼리(`?q=&source=&tag=&sort=`)를 읽어 ① 질의어로 id 매칭 → ② Phase 1의 filterAndSortFeed 로
 * 소스/태그 필터·정렬을 적용한다. SearchInput·FilterBar·FilterSheet·ArticleCard·결과 없음 상태는
 * standalone 시절과 동일 마크업/UX(공유 URL·디바운스·칩 시각)를 유지한다.
 */
export function SearchClient({
  sources,
  tags,
}: {
  sources: { id: string; name: string }[];
  tags: string[];
}) {
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<SearchIndexEntry[] | null>(null);
  const [index, setIndex] = useState<SearchDocument | null>(null);

  // 마운트 시 1회: 인덱스 JSON fetch → FlexSearch 문서 빌드.
  useEffect(() => {
    let alive = true;
    fetch(INDEX_URL)
      .then((res) => res.json() as Promise<SearchIndexEntry[]>)
      .then((data) => {
        if (!alive) return;
        setEntries(data);
        setIndex(buildSearchDocument(data));
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const options: SearchOptions = useMemo(() => {
    const sort = searchParams.get("sort");
    return {
      q: searchParams.get("q") || undefined,
      source: searchParams.get("source") || undefined,
      tag: searchParams.get("tag") || undefined,
      sort: sort === "latest" || sort === "importance" ? sort : undefined,
    };
  }, [searchParams]);

  const hasQuery = Boolean(options.q);
  const loading = entries === null;

  // 질의 매칭 → 소스/태그 필터·정렬(피드와 동일 의미).
  const results = useMemo(() => {
    if (!hasQuery || !index || !entries) return [];
    const matchedIds = new Set(queryMatchingIds(index, options.q ?? ""));
    const matched = entries.filter((e) => matchedIds.has(e.id));
    return filterAndSortFeed(matched, options);
  }, [hasQuery, index, entries, options]);

  return (
    <>
      <SearchInput />

      {/* 데스크톱: 인라인 FilterBar / 모바일: 바텀시트 트리거 */}
      <div className="hidden md:block">
        <FilterBar current={options} sources={sources} tags={tags} basePath="/search" />
      </div>
      <FilterSheet current={options} sources={sources} tags={tags} basePath="/search" />

      {!hasQuery ? (
        <p className="text-muted-foreground text-body">
          키워드를 입력하면 제목·요약·태그에서 기사를 검색합니다.
        </p>
      ) : loading ? (
        <p className="text-muted-foreground text-body">검색 인덱스를 불러오는 중…</p>
      ) : results.length === 0 ? (
        <p className="text-muted-foreground text-body">
          “{options.q}”에 대한 검색 결과가 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </>
  );
}
