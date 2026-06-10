import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryBadge, TagChips } from "@/components/ArticleMeta";
import { getArticle } from "@/lib/db";

/** ISO8601 → 'YYYY.MM.DD' 표기. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getArticle(Number(id));
  if (!article) notFound();

  const title = article.titleKo || article.titleOriginal;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 md:px-6 md:py-12">
      <Link
        href="/"
        className="text-caption text-muted-foreground hover:text-primary bg-background/80 sticky top-13 z-10 -mx-4 px-4 py-3 backdrop-blur md:static md:mx-0 md:w-fit md:bg-transparent md:p-0 md:backdrop-blur-none"
      >
        ← 피드로
      </Link>

      <header className="flex flex-col gap-3">
        <div className="text-caption text-muted-foreground flex items-center justify-between">
          <span className="font-medium">{article.source.name}</span>
          <span>{formatDate(article.publishedAt)}</span>
        </div>
        <CategoryBadge category={article.category} />
        <h1 className="text-display-md font-semibold tracking-tight">{title}</h1>
        <TagChips tags={article.tags} />
      </header>

      {article.summaryKo && (
        <section className="flex flex-col gap-2">
          <h2 className="text-caption text-muted-foreground font-semibold">한국어 요약</h2>
          <p className="text-body leading-relaxed">{article.summaryKo}</p>
        </section>
      )}

      {article.contentRaw && (
        <section className="flex flex-col gap-2">
          <h2 className="text-caption text-muted-foreground font-semibold">📰 원문 (English)</h2>
          <p className="text-body leading-relaxed">{article.contentRaw}</p>
        </section>
      )}

      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-primary text-primary-foreground rounded-pill text-body flex w-full items-center justify-center px-6 py-3 font-medium md:inline-flex md:w-fit"
      >
        원문 보기 →
      </a>
    </main>
  );
}
