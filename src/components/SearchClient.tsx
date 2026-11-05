"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { FilterSheet } from "@/components/mobile/FilterSheet";
import { SearchInput } from "@/components/SearchInput";
import { IndexLoadStatus, StoryIndex } from "@/components/StoryIndex";
import { filterAndSortFeed, parseFeedOptions, type SourceOption } from "@/lib/feedFilter";
import { getMessages, localePath, plural } from "@/lib/i18n";
import {
  INDEX_LOCALE,
  loadIndexManifest,
  loadIndexMonths,
  mergeByDefaultOrder,
  splitRecentMonths,
  type SearchCard,
  type ShardMonth,
} from "@/lib/indexShards";
import { searchMessages } from "@/lib/messages/search";
import {
  addToSearchDocument,
  buildSearchDocument,
  queryMatchingIds,
  type SearchDocument,
} from "@/lib/searchIndex";

/**
 * 검색이 처음 받는 달 수 — 최신 호의 달을 포함한 최근 N개 달력 월. 그 이전 달은 "지난 기사에서도 찾기"나
 * 받은 달에 결과가 없을 때 받는다(결정 기록 docs/english-version/phase4/4-2-client-index.md).
 */
export const SEARCH_RECENT_MONTHS = 3;

/** 지난 달 조각 받기 상태. */
type OlderState = "idle" | "loading" | "error";

/** 받은 검색 색인: 카드(기본 정렬 순)·FlexSearch 문서·아직 받지 않은 지난 달. */
interface LoadedIndex {
  entries: SearchCard[];
  index: SearchDocument;
  /** 받지 않은 지난 달(비면 전부 받음). */
  older: ShardMonth[];
  /** 받은 범위의 첫 달('YYYY-MM') — 범위 문구용. */
  since: string | null;
}

/**
 * 검색 클라이언트 셸 (정적 export).
 *
 * 서버 FTS5 검색을 대체한다. 마운트 시 검색 색인 목록(search-index/<언어>/manifest.json)과 최근
 * SEARCH_RECENT_MONTHS 개월 조각을 받아 FlexSearch 문서를 만들고, URL 쿼리(`?q=&category=&source=&tag=&sort=`)를 읽어
 * ① 질의어로 id 매칭 → ② filterAndSortFeed 로 분야/매체/태그 필터·정렬을 적용한다. 결과는 피드와 같은 StoryEntry 색인으로 렌더한다.
 * 지난 달 조각은 결과 끝 "지난 기사에서도 찾기"로 받고, 받은 달에 결과가 없으면 곧바로 받는다. 지난 달이 남아 있는 동안
 * 결과 머리 건수 옆에 범위("2026년 9월 이후 기사 중")를 밝힌다.
 * 검색어가 없으면 인기 태그를 추천 검색어로 보여 준다.
 * 언어는 LocaleProvider 컨텍스트로 읽는다(서버 SearchView 가 prop 으로 넘기지 않는다). 색인 언어는 `INDEX_LOCALE`.
 */
export function SearchClient({
  sources,
  tags,
  indexVersion = "",
}: {
  sources: SourceOption[];
  tags: string[];
  /** 검색 색인 목록 캐시 키(indexBuildVersion, 빌드마다 바뀐다). */
  indexVersion?: string;
}) {
  const locale = useLocale();
  const t = getMessages(searchMessages, locale);
  const searchParams = useSearchParams();
  const [loaded, setLoaded] = useState<LoadedIndex | null>(null);
  const [initError, setInitError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [olderState, setOlderState] = useState<OlderState>("idle");
  const manifestRef = useRef<Awaited<ReturnType<typeof loadIndexManifest>> | null>(null);

  // 마운트 시(·다시 시도): 목록 → 최근 N개월 조각 → FlexSearch 문서.
  useEffect(() => {
    let alive = true;
    setInitError(false);
    loadIndexManifest("search-index", INDEX_LOCALE[locale], indexVersion)
      .then(async (manifest) => {
        const { recent, older, since } = splitRecentMonths(manifest.months, SEARCH_RECENT_MONTHS);
        const entries = (await loadIndexMonths(manifest, recent)) as SearchCard[];
        if (!alive) return;
        manifestRef.current = manifest;
        setLoaded({
          entries,
          index: buildSearchDocument(entries, manifest.locale),
          older,
          since,
        });
      })
      .catch(() => {
        if (alive) setInitError(true);
      });
    return () => {
      alive = false;
    };
  }, [locale, indexVersion, attempt]);

  // 지난 달 조각을 받아 같은 문서에 더하고, 카드는 기본 정렬 순으로 합친다.
  const loadOlder = useCallback(() => {
    const manifest = manifestRef.current;
    if (!manifest || !loaded || loaded.older.length === 0) return;
    setOlderState("loading");
    loadIndexMonths(manifest, loaded.older).then(
      (more) => {
        addToSearchDocument(loaded.index, more as SearchCard[]);
        setLoaded({
          ...loaded,
          entries: mergeByDefaultOrder([loaded.entries, more as SearchCard[]]),
          older: [],
        });
        setOlderState("idle");
      },
      () => setOlderState("error"),
    );
  }, [loaded]);

  const options = useMemo(() => parseFeedOptions(searchParams), [searchParams]);

  const hasQuery = Boolean(options.q);
  const loading = loaded === null;
  const partial = Boolean(loaded && loaded.older.length > 0);

  // 질의 매칭 → 매체(축약명 묶음)/태그 필터·정렬(피드와 동일 의미).
  const results = useMemo(() => {
    if (!hasQuery || !loaded) return [];
    const matchedIds = new Set(queryMatchingIds(loaded.index, options.q ?? ""));
    const matched = loaded.entries.filter((e) => matchedIds.has(e.id));
    return filterAndSortFeed(matched, options, sources);
  }, [hasQuery, loaded, options, sources]);

  // 받은 달에 결과가 없으면 지난 달을 곧바로 받는다(실패하면 멈추고 다시 시도를 둔다).
  const autoOlder = hasQuery && partial && results.length === 0;
  useEffect(() => {
    if (autoOlder && olderState === "idle") loadOlder();
  }, [autoOlder, olderState, loadOlder]);

  const olderCount = loaded?.older.reduce((n, m) => n + m.count, 0) ?? 0;

  return (
    <>
      <SearchInput />

      {/* 데스크톱: 인라인 FilterBar / 모바일: 바텀시트 트리거 */}
      <div className="hidden md:block">
        <FilterBar
          current={options}
          sources={sources}
          tags={tags}
          basePath="/search"
          locale={locale}
        />
      </div>
      <div className="md:hidden">
        <FilterSheet current={options} sources={sources} tags={tags} basePath="/search" />
      </div>

      {!hasQuery ? (
        <section aria-labelledby="suggest-heading" className="flex flex-col gap-3 pt-4">
          <h2 id="suggest-heading" className="text-label text-muted-foreground font-bold">
            {t.suggested}
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag}
                href={localePath(locale, `/search?q=${encodeURIComponent(tag)}`)}
                className="rounded-pill border-border hover:border-foreground focus-visible:ring-ring text-caption border px-4 py-2 font-semibold transition-colors outline-none focus-visible:ring-2"
              >
                {tag}
              </Link>
            ))}
          </div>
        </section>
      ) : initError ? (
        <div className="py-6">
          <IndexLoadStatus state="error" onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      ) : loading ? (
        <p className="text-muted-foreground text-body py-6">{t.loading}</p>
      ) : results.length === 0 && partial ? (
        olderState === "error" ? (
          <div className="py-6">
            <IndexLoadStatus state="error" onRetry={loadOlder} />
          </div>
        ) : (
          <p role="status" className="text-muted-foreground text-body py-6">
            {t.searchingOlder}
          </p>
        )
      ) : results.length === 0 ? (
        <p className="text-muted-foreground text-body py-6">{t.noResults(options.q ?? "")}</p>
      ) : (
        <section aria-label={t.resultsLabel}>
          <p className="border-rule text-caption text-muted-foreground border-b-2 pb-2">
            {t.results.open}
            <span className="text-foreground font-semibold">{options.q}</span>
            {t.results.close}{" "}
            <span className="text-foreground font-semibold tabular-nums">{results.length}</span>
            {plural(results.length, t.results.unit.one, t.results.unit.other)}
            {partial && loaded?.since && <span>{t.scope(loaded.since)}</span>}
          </p>
          <StoryIndex
            key={JSON.stringify(options)}
            articles={results}
            hideCategory={Boolean(options.category)}
          />
          {partial && loaded?.since && (
            <OlderMonths
              since={loaded.since}
              count={olderCount}
              state={olderState}
              onLoad={loadOlder}
            />
          )}
        </section>
      )}
    </>
  );
}

/**
 * 결과 끝 "지난 기사에서도 찾기" — 받지 않은 지난 달 조각을 받아 결과에 합친다. 1px 잉크 괘선 아래 한 줄(상자·채움 없음),
 * 행 전체가 버튼(44px)이고 hover 는 낱말만 코발트. 받는 중·실패는 같은 자리에 색인 상태 줄.
 */
function OlderMonths({
  since,
  count,
  state,
  onLoad,
}: {
  since: string;
  count: number;
  state: OlderState;
  onLoad: () => void;
}) {
  const t = useMessages(searchMessages);
  return (
    <div className="border-rule mt-8 border-t">
      {state === "idle" ? (
        <button
          type="button"
          onClick={onLoad}
          className="group text-caption focus-visible:ring-ring flex min-h-11 w-full flex-wrap items-baseline gap-x-2 py-3 text-left outline-none focus-visible:ring-2"
        >
          <span className="text-foreground group-hover:text-brand font-semibold transition-colors">
            {t.older.action}
          </span>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground tabular-nums">{t.older.detail(count, since)}</span>
        </button>
      ) : (
        <div className="flex min-h-11 items-center py-3">
          <IndexLoadStatus state={state} onRetry={onLoad} />
        </div>
      )}
    </div>
  );
}
