/**
 * 홈 편집 지면 (DESIGN.md §3). 서버·클라 공용 프레젠테이션(훅 없음).
 * - FrontPage:    1면 — 리드(8) + 서브 3 / 지금 화제 Top 10(4)
 * - TrendingList: 화제 순위(번호 = 실제 순위)
 * - SectionBands: 카테고리별 섹션 밴드
 */
import Link from "next/link";
import { TrendBar } from "@/components/ArticleMeta";
import { StoryLead, StorySecondary, StorySectionItem } from "@/components/Story";
import type { Edition, EditionSection } from "@/lib/edition";
import { categoryLabel, categorySlug, shortSourceName } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ArticleCard } from "@/lib/types";

export function FrontPage({ edition }: { edition: Edition }) {
  const { lead, seconds, trending } = edition;
  if (!lead) return null;

  return (
    <section
      id="front"
      aria-label="1면"
      className="grid scroll-mt-20 grid-cols-1 gap-x-10 pt-6 md:pt-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]"
    >
      <div className="min-w-0">
        <div className="animate-rise border-border border-b pb-7 [animation-delay:80ms]">
          <StoryLead article={lead} />
        </div>
        {seconds.length > 0 && (
          <div className="animate-rise grid grid-cols-1 [animation-delay:160ms] md:grid-cols-3">
            {seconds.map((a) => (
              <div
                key={a.id}
                className="border-border border-b py-5 md:border-b-0 md:border-l md:px-5 md:pt-6 md:pb-2 md:first:border-l-0 md:first:pl-0 md:last:pr-0"
              >
                <StorySecondary article={a} />
              </div>
            ))}
          </div>
        )}
      </div>

      {trending.length > 0 && (
        <TrendingList
          articles={trending}
          className="animate-rise mt-10 [animation-delay:240ms] lg:mt-0 lg:border-l lg:pl-8"
        />
      )}
    </section>
  );
}

export function TrendingList({
  articles,
  className,
}: {
  articles: ArticleCard[];
  className?: string;
}) {
  return (
    <aside aria-labelledby="trending-heading" className={cn("border-border min-w-0", className)}>
      <div className="border-rule flex items-baseline justify-between border-b-2 pb-2.5">
        <h2 id="trending-heading" className="font-serif text-2xl font-extrabold tracking-[-0.04em]">
          지금 화제
        </h2>
        <span className="text-label text-muted-foreground">커뮤니티 반응 지수 0–100</span>
      </div>
      <ol>
        {articles.map((a, i) => (
          <li key={a.id}>
            <Link
              href={`/article/${a.id}`}
              className="story-link border-border focus-visible:ring-ring grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-b py-3.5 outline-none focus-visible:ring-2"
            >
              <span
                className={cn(
                  "row-span-2 font-serif text-[1.875rem] leading-none tracking-[-0.04em] tabular-nums",
                  i < 3 ? "text-brand font-bold" : "text-muted-foreground font-medium",
                )}
              >
                {i + 1}
              </span>
              <span className="headline text-[0.9375rem] leading-snug font-semibold">
                {a.titleKo || a.titleOriginal}
              </span>
              <span className="text-label text-muted-foreground flex items-center gap-2">
                <span className="shrink-0">{shortSourceName(a.source.name)}</span>
                <TrendBar value={a.trendingScore} />
                <span className="text-foreground-soft font-semibold tabular-nums">
                  {a.trendingScore}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function SectionBand({ section }: { section: EditionSection }) {
  const slug = categorySlug(section.category);
  const headingId = `section-${slug}-heading`;
  return (
    <section id={`section-${slug}`} aria-labelledby={headingId} className="scroll-mt-20">
      <div className="border-rule mb-5 flex items-baseline gap-3 border-t-2 pt-3">
        <h2 id={headingId} className="text-display-md font-serif font-extrabold">
          {categoryLabel(section.category)}
        </h2>
        <span className="text-meta text-muted-foreground tabular-nums">{section.count}건</span>
        <Link
          href={`/?category=${encodeURIComponent(section.category)}`}
          className="text-meta text-brand focus-visible:ring-ring ml-auto font-semibold outline-none hover:underline focus-visible:ring-2"
        >
          섹션 전체 보기 →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-y-6 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
        {section.items.map((a, i) => (
          <div
            key={a.id}
            className={cn(
              "border-border min-w-0 py-4 first:pt-0 max-md:border-t max-md:first:border-t-0 md:py-0 md:pr-5",
              "md:[&:nth-child(2n)]:border-l md:[&:nth-child(2n)]:pl-5",
              "lg:last:pr-0 lg:[&:nth-child(n+2)]:border-l lg:[&:nth-child(n+2)]:pl-5",
            )}
          >
            <StorySectionItem article={a} featured={i === 0} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SectionBands({ sections }: { sections: EditionSection[] }) {
  return (
    <div className="flex flex-col gap-12 md:gap-14">
      {sections.map((s) => (
        <SectionBand key={s.category} section={s} />
      ))}
    </div>
  );
}
