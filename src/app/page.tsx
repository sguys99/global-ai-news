import Link from "next/link";
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
  const tags = getActiveTags();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-primary text-caption font-semibold tracking-tight">
            Daily AI Brief
          </span>
          <Link href="/search" className="text-primary text-caption font-medium hover:underline">
            검색
          </Link>
        </div>
        <h1 className="text-display-md font-semibold tracking-tight">
          매일 한 곳에서 보는 글로벌·한국 AI/IT 뉴스
        </h1>
      </header>

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
