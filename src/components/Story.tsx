/**
 * 기사 스토리 변형 (DESIGN.md §5). 전체가 하나의 링크(`/article/[id]`)이며 hover 시 제목만 코발트.
 * LLM 가공 전(또는 실패)이면 한국어 제목이 없으므로 원문 제목으로 폴백한다.
 *
 * - StoryLead:      리드 1건 — 세리프 대형 제목 + 리드문(요약)
 * - StorySecondary: 서브 리드 — 세리프 중제목 + 요약 3줄
 * - StorySectionItem: 섹션 밴드 항목 — featured(첫 항목)는 세리프, 나머지는 산세리프
 * - StoryEntry:     전체 기사 색인 한 줄 — 날짜 · 키커 · 제목 · 바이라인
 */
import Link from "next/link";
import { Byline, CategoryKicker } from "@/components/ArticleMeta";
import { formatShortDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ArticleCard } from "@/lib/types";

const titleOf = (a: ArticleCard) => a.titleKo || a.titleOriginal;
const hrefOf = (a: ArticleCard) => `/article/${a.id}`;
const focus =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background";

export function StoryLead({ article }: { article: ArticleCard }) {
  return (
    <Link href={hrefOf(article)} className={cn("story-link flex flex-col gap-4", focus)}>
      <CategoryKicker category={article.category} />
      <h2 className="headline text-display-xl font-serif font-bold">{titleOf(article)}</h2>
      {article.summaryKo && (
        <p className="text-dek text-foreground-soft max-w-[40em]">{article.summaryKo}</p>
      )}
      <Byline article={article} showTrend />
    </Link>
  );
}

export function StorySecondary({ article }: { article: ArticleCard }) {
  return (
    <Link href={hrefOf(article)} className={cn("story-link flex h-full flex-col gap-2.5", focus)}>
      <CategoryKicker category={article.category} />
      <h3 className="headline text-headline font-serif font-bold">{titleOf(article)}</h3>
      {article.summaryKo && (
        <p className="text-caption text-muted-foreground line-clamp-3">{article.summaryKo}</p>
      )}
      <Byline article={article} compact className="mt-auto pt-1" />
    </Link>
  );
}

export function StorySectionItem({
  article,
  featured = false,
}: {
  article: ArticleCard;
  featured?: boolean;
}) {
  return (
    <Link href={hrefOf(article)} className={cn("story-link flex h-full flex-col gap-2", focus)}>
      <h3
        className={cn(
          "headline",
          featured
            ? "text-headline font-serif font-bold md:text-[1.5rem] md:leading-[1.3]"
            : "text-title font-semibold tracking-[-0.02em]",
        )}
      >
        {titleOf(article)}
      </h3>
      {article.summaryKo && (
        <p
          className={cn(
            "text-caption text-muted-foreground line-clamp-3",
            !featured && "max-md:hidden",
          )}
        >
          {article.summaryKo}
        </p>
      )}
      <Byline article={article} compact={!featured} className="mt-auto pt-1" />
    </Link>
  );
}

export function StoryEntry({ article }: { article: ArticleCard }) {
  return (
    <Link
      href={hrefOf(article)}
      className={cn(
        "story-link border-border grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b py-4",
        focus,
      )}
    >
      <span className="text-muted-foreground pt-0.5 font-serif text-[0.9375rem] font-semibold tabular-nums">
        {formatShortDate(article.publishedAt)}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <CategoryKicker category={article.category} className="text-label" />
        <h3 className="headline text-title font-semibold tracking-[-0.02em]">{titleOf(article)}</h3>
        {article.summaryKo && (
          <p className="text-caption text-muted-foreground mt-0.5 line-clamp-2">
            {article.summaryKo}
          </p>
        )}
      </div>
      <Byline article={article} showTrend className="col-start-2 mt-1" />
    </Link>
  );
}
