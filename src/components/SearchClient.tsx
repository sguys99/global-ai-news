"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { FilterSheet } from "@/components/mobile/FilterSheet";
import { SearchInput } from "@/components/SearchInput";
import { StoryIndex } from "@/components/StoryIndex";
import { filterAndSortFeed, parseFeedOptions } from "@/lib/feedFilter";
import { buildSearchDocument, queryMatchingIds, type SearchDocument } from "@/lib/searchIndex";
import type { SearchIndexEntry } from "@/lib/types";

/** 정적 export 서브경로(`/global-ai-news`)에서 수동 fetch는 basePath를 명시해야 한다(dev는 ""). */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const INDEX_URL = `${BASE_PATH}/search-index.json`;

/**
 * 검색 클라이언트 셸 (정적 export).
 *
 * 서버 FTS5 검색을 대체한다. 마운트 시 search-index.json 을 fetch 해 FlexSearch 인덱스를 빌드하고,
 * URL 쿼리(`?q=&category=&source=&tag=&sort=`)를 읽어 ① 질의어로 id 매칭 → ② filterAndSortFeed 로
 * 분야/매체/태그 필터·정렬을 적용한다. 결과는 피드와 같은 StoryEntry 색인으로 렌더한다.
 * 검색어가 없으면 인기 태그를 추천 검색어로 보여 준다.
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

  const options = useMemo(() => parseFeedOptions(searchParams), [searchParams]);

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
      <div className="md:hidden">
        <FilterSheet current={options} sources={sources} tags={tags} basePath="/search" />
      </div>

      {!hasQuery ? (
        <section aria-labelledby="suggest-heading" className="flex flex-col gap-3 pt-4">
          <h2 id="suggest-heading" className="text-label text-muted-foreground font-bold">
            많이 다뤄진 주제
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <Link
                key={t}
                href={`/search?q=${encodeURIComponent(t)}`}
                className="rounded-pill border-border hover:border-foreground focus-visible:ring-ring text-caption border px-4 py-2 font-semibold transition-colors outline-none focus-visible:ring-2"
              >
                {t}
              </Link>
            ))}
          </div>
        </section>
      ) : loading ? (
        <p className="text-muted-foreground text-body py-6">검색 인덱스를 불러오는 중…</p>
      ) : results.length === 0 ? (
        <p className="text-muted-foreground text-body py-6">
          “{options.q}”에 대한 검색 결과가 없습니다. 다른 키워드나 필터를 시도해 보세요.
        </p>
      ) : (
        <section aria-label="검색 결과">
          <p className="border-rule text-caption text-muted-foreground border-b-2 pb-2">
            “<span className="text-foreground font-semibold">{options.q}</span>” 검색 결과{" "}
            <span className="text-foreground font-semibold tabular-nums">{results.length}</span>건
          </p>
          <StoryIndex key={JSON.stringify(options)} articles={results} />
        </section>
      )}
    </>
  );
}
