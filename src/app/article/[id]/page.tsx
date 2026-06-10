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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6 pb-28 md:px-6 md:py-12">
      <Link
        href="/"
        className="text-caption text-muted-foreground hover:text-primary focus-visible:ring-ring bg-background/80 sticky top-13 z-10 -mx-4 px-4 py-3 backdrop-blur outline-none focus-visible:ring-1 md:static md:mx-0 md:w-fit md:bg-transparent md:p-0 md:backdrop-blur-none"
      >
        ← 피드로
      </Link>

      <header className="flex flex-col gap-3">
        <div className="text-caption text-muted-foreground flex items-center justify-between">
          <span className="font-semibold">{article.source.name}</span>
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

      {/* 데스크톱: 본문 흐름 끝의 인라인 CTA */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-primary text-primary-foreground rounded-pill text-body focus-visible:ring-ring hidden items-center justify-center px-6 py-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:inline-flex md:w-fit"
      >
        원문 보기 →
      </a>

      {/* 모바일: 하단 floating-sticky-bar (DESIGN floating-sticky-bar, 64px frosted).
       * `/article/*`에서는 하단 탭 바가 null(Phase 1)이라 충돌 없음. safe-area 패딩으로 notch 대응. */}
      <div
        className="border-border bg-background/80 fixed inset-x-0 bottom-0 z-40 flex items-center border-t px-4 backdrop-blur md:hidden"
        style={{ paddingTop: "0.75rem", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary text-primary-foreground rounded-pill text-body focus-visible:ring-ring flex w-full items-center justify-center px-6 py-2.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          원문 보기 →
        </a>
      </div>
    </main>
  );
}
