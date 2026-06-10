import { Suspense } from "react";
import { ArticleCard } from "@/components/ArticleCard";
import { FilterBar } from "@/components/FilterBar";
import { FilterSheet } from "@/components/mobile/FilterSheet";
import { SearchInput } from "@/components/SearchInput";
import { getActiveTags, getSourcesWithCounts, searchArticles, type SearchOptions } from "@/lib/db";

/** 검색은 쿼리(q)에 의존하므로 동적 렌더링. */
export const dynamic = "force-dynamic";

function parseOptions(sp: Record<string, string | string[] | undefined>): SearchOptions {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sort = one(sp.sort);
  return {
    q: one(sp.q) || undefined,
    source: one(sp.source) || undefined,
    tag: one(sp.tag) || undefined,
    sort: sort === "latest" || sort === "importance" ? sort : undefined,
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const options = parseOptions(await searchParams);
  const hasQuery = Boolean(options.q);
  const articles = hasQuery ? searchArticles(options) : [];
  const sources = getSourcesWithCounts();
  const tags = getActiveTags(8);

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-6 md:px-6 md:py-12">
      <h1 className="text-display-md font-semibold tracking-tight">기사 검색</h1>

      <Suspense fallback={null}>
        <SearchInput />
      </Suspense>

      {/* 데스크톱: 인라인 FilterBar / 모바일: 바텀시트 트리거 (mobile-plan Phase 4) */}
      <div className="hidden md:block">
        <FilterBar current={options} sources={sources} tags={tags} basePath="/search" />
      </div>
      <FilterSheet current={options} sources={sources} tags={tags} basePath="/search" />

      {!hasQuery ? (
        <p className="text-muted-foreground text-body">
          키워드를 입력하면 제목·요약·원문·태그에서 기사를 검색합니다.
        </p>
      ) : articles.length === 0 ? (
        <p className="text-muted-foreground text-body">
          “{options.q}”에 대한 검색 결과가 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </main>
  );
}
