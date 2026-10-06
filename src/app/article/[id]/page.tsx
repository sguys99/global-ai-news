import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { CategoryKicker, ImportanceMeter, TagChips, TrendBar } from "@/components/ArticleMeta";
import { StoryEntry } from "@/components/Story";
import { getAllArticleIds, getArticle, getFeed, getLatestPublishedAt } from "@/lib/db";
import { categoryLabel, formatDate, shortSourceName } from "@/lib/labels";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  hasArticleThumbnail,
  ogArticleImagePath,
  shareMetadata,
} from "@/lib/site";

/** 정적 export: 전 기사 상세를 빌드타임에 전수 사전 생성한다. */
export function generateStaticParams() {
  return getAllArticleIds().map((id) => ({ id: String(id) }));
}

/** 목록 밖 id는 산출물에 없어 정적 404(generateStaticParams로만 생성). */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const article = getArticle(Number(id));
  if (!article) return {};
  const title = article.titleKo || article.titleOriginal;
  const description = article.summaryKo || SITE_DESCRIPTION;
  return {
    title: `${title} — ${SITE_NAME}`,
    description: article.summaryKo || undefined,
    ...shareMetadata({
      title,
      description,
      path: `/article/${article.id}/`,
      // 최근 기사만 전용 썸네일(og/article/[file]), 그 밖은 기본 썸네일.
      image: hasArticleThumbnail(article.publishedAt, getLatestPublishedAt())
        ? { path: ogArticleImagePath(article.id), alt: title }
        : undefined,
      article: {
        publishedTime: article.publishedAt,
        section: categoryLabel(article.category) || undefined,
        tags: article.tags,
      },
    }),
  };
}

const RELATED_LIMIT = 4;

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getArticle(Number(id));
  if (!article) notFound();

  const title = article.titleKo || article.titleOriginal;
  const showOriginalTitle = Boolean(article.titleKo) && article.titleKo !== article.titleOriginal;
  const related = article.category
    ? getFeed({ category: article.category, sort: "importance" })
        .filter((a) => a.id !== article.id)
        .slice(0, RELATED_LIMIT)
    : [];

  return (
    <main className="mx-auto flex max-w-[720px] flex-col px-4 pt-2 pb-32 md:px-6 md:pt-10 md:pb-20">
      <Link
        href="/"
        className="text-caption text-muted-foreground hover:text-foreground focus-visible:ring-ring bg-background/90 border-border sticky top-13 z-10 -mx-4 inline-flex items-center gap-1.5 border-b px-4 py-3 font-medium backdrop-blur-md outline-none focus-visible:ring-2 md:static md:mx-0 md:w-fit md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
      >
        <ArrowLeft className="size-4" />
        오늘의 지면
      </Link>

      <article className="flex flex-col">
        <header className="flex flex-col gap-4 pt-6 md:pt-8">
          <CategoryKicker category={article.category} />
          <h1 className="text-display-lg animate-rise font-serif font-extrabold">{title}</h1>
          {showOriginalTitle && (
            <p lang="en" className="text-caption text-muted-foreground">
              {article.titleOriginal}
            </p>
          )}
        </header>

        <dl className="border-t-rule border-b-border mt-7 grid grid-cols-2 border-t-2 border-b md:grid-cols-4">
          <Signal label="매체">{article.source.name}</Signal>
          <Signal label="게시">
            <time dateTime={article.publishedAt} className="tabular-nums">
              {formatDate(article.publishedAt)}
            </time>
          </Signal>
          <Signal label="중요도">
            {article.importance > 0 ? (
              <span className="flex items-center gap-2">
                <ImportanceMeter value={article.importance} />
                <span className="tabular-nums">{article.importance}/5</span>
              </span>
            ) : (
              "—"
            )}
          </Signal>
          <Signal label="화제 지수">
            {article.trendingScore > 0 ? (
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{article.trendingScore}</span>
                <TrendBar value={article.trendingScore} />
              </span>
            ) : (
              "—"
            )}
          </Signal>
        </dl>

        {article.summaryKo && (
          <section aria-labelledby="summary-heading" className="mt-9 flex flex-col gap-3">
            <h2 id="summary-heading" className="text-label text-brand font-bold tracking-[0.04em]">
              한국어 요약
            </h2>
            <p className="text-dek md:text-[1.25rem] md:leading-[1.75]">{article.summaryKo}</p>
          </section>
        )}

        {article.related && article.related.length > 0 && (
          <section
            aria-labelledby="coverage-heading"
            className="border-border mt-9 flex flex-col gap-1 border-t pt-7"
          >
            <h2
              id="coverage-heading"
              className="text-label text-muted-foreground mb-2 font-bold tracking-[0.04em]"
            >
              같은 소식, 다른 매체 · {article.related.length}곳
            </h2>
            <ul className="flex flex-col">
              {article.related.map((r) => (
                <li key={r.url} className="border-border border-b last:border-b-0">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="story-link focus-visible:ring-ring flex min-h-11 items-baseline gap-3 py-2.5 outline-none focus-visible:ring-2"
                  >
                    <span className="text-meta text-foreground-soft w-24 shrink-0 truncate font-semibold">
                      {shortSourceName(r.source)}
                    </span>
                    <span className="headline text-caption min-w-0 flex-1">{r.title}</span>
                    <ArrowUpRight className="text-muted-foreground size-3.5 shrink-0 self-center" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {article.contentRaw && (
          <section
            aria-labelledby="original-heading"
            className="border-border mt-9 flex flex-col gap-3 border-t pt-7"
          >
            <h2
              id="original-heading"
              className="text-label text-muted-foreground font-bold tracking-[0.04em]"
            >
              원문 발췌 · English
            </h2>
            <p lang="en" className="text-body text-foreground-soft">
              {article.contentRaw}
            </p>
          </section>
        )}

        {article.tags.length > 0 && (
          <div className="mt-8">
            <TagChips tags={article.tags} />
          </div>
        )}

        {/* 데스크톱: 본문 흐름 끝의 인라인 CTA */}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary text-primary-foreground rounded-pill text-caption focus-visible:ring-ring mt-10 hidden w-fit items-center gap-2 px-6 py-3.5 font-semibold transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 md:inline-flex"
        >
          원문 기사 읽기
          <ArrowUpRight className="size-4" />
        </a>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-16">
          <div className="border-rule flex items-baseline gap-3 border-t-2 pt-3">
            <h2
              id="related-heading"
              className="font-serif text-2xl font-extrabold tracking-[-0.04em]"
            >
              {categoryLabel(article.category)}의 다른 기사
            </h2>
            <Link
              href={`/?category=${encodeURIComponent(article.category)}`}
              className="text-meta text-brand ml-auto font-semibold hover:underline"
            >
              전체 보기 →
            </Link>
          </div>
          <div className="flex flex-col">
            {related.map((a) => (
              <StoryEntry key={a.id} article={a} hideCategory />
            ))}
          </div>
        </section>
      )}

      {/* 모바일: 하단 floating CTA 바. `/article/*`에서는 하단 탭 바가 null이라 충돌 없음. */}
      <div
        className="border-rule bg-background/90 fixed inset-x-0 bottom-0 z-40 flex items-center border-t px-4 backdrop-blur-md md:hidden"
        style={{
          paddingTop: "0.75rem",
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary text-primary-foreground rounded-pill text-caption focus-visible:ring-ring flex min-h-12 w-full items-center justify-center gap-2 px-6 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          원문 기사 읽기
          <ArrowUpRight className="size-4" />
        </a>
      </div>
    </main>
  );
}

function Signal({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border flex min-w-0 flex-col gap-1 py-3.5 pr-3 max-md:even:border-l max-md:even:pl-4 max-md:nth-[n+3]:border-t md:border-l md:pl-4 md:first:border-l-0 md:first:pl-0">
      <dt className="text-label text-muted-foreground font-semibold">{label}</dt>
      <dd className="text-caption truncate font-semibold">{children}</dd>
    </div>
  );
}
