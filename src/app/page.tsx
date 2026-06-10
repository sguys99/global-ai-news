import { ArticleCard } from "@/components/ArticleCard";
import { FilterBar } from "@/components/FilterBar";
import { getActiveTags, getFeed, getSourcesWithCounts, type FeedOptions } from "@/lib/db";

/** 배치 수집 주기에 맞춰 1시간마다 ISR 재검증. */
export const revalidate = 3600;

function parseOptions(sp: Record<string, string | string[] | undefined>): FeedOptions {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sort = one(sp.sort);
  return {
    source: one(sp.source) || undefined,
    tag: one(sp.tag) || undefined,
    sort: sort === "latest" || sort === "importance" ? sort : undefined,
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const options = parseOptions(await searchParams);
  const articles = getFeed(options);
  const sources = getSourcesWithCounts();
  const tags = getActiveTags(8);

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-6 md:px-6 md:py-12">
      <h1 className="text-display-md font-semibold tracking-tight">
        매일 한 곳에서 보는 글로벌 AI 뉴스
      </h1>

      <FilterBar current={options} sources={sources} tags={tags} />

      {articles.length === 0 ? (
        <p className="text-muted-foreground text-body">
          {options.source || options.tag
            ? "조건에 맞는 기사가 없습니다. 필터를 해제해 보세요."
            : "아직 수집된 기사가 없습니다. `npm run collect` 실행 후 새로고침하세요."}
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
