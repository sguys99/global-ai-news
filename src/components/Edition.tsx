/**
 * 홈 편집 지면 (DESIGN.md §3). 서버·클라 공용 프레젠테이션(훅 없음).
 * - FrontPage:    1면 — [리드 + 서브 3 + 오늘의 브리핑 3](8) / 지금 화제 Top 5(4), 그 아래 전폭 레이더
 * - BriefList:    오늘의 브리핑 — 서브 그리드 아래 가는 괘선으로 구분한 3행 목록
 * - RadarBand:    오픈소스·논문 레이더 — 비뉴스 4건. 비면 띠 전체를 숨긴다
 * - TrendingList: 화제 순위(번호 = 실제 순위)
 * - SectionBands: 카테고리별 섹션 밴드
 */
import Link from "next/link";
import { TrendBar } from "@/components/ArticleMeta";
import {
  StoryBrief,
  StoryLead,
  StoryRadar,
  StorySecondary,
  StorySectionItem,
} from "@/components/Story";
import type { Edition, EditionSection } from "@/lib/edition";
import { categoryLabel, categorySlug, shortSourceName } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ArticleCard } from "@/lib/types";

export function FrontPage({ edition, timeBase }: { edition: Edition; timeBase?: string }) {
  const { lead, seconds, briefs, radar, trending } = edition;
  if (!lead) return null;

  return (
    <section id="front" aria-label="1면" className="flex scroll-mt-20 flex-col pt-6 md:pt-8">
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div className="min-w-0">
          <div className="animate-rise border-border border-b pb-7 [animation-delay:80ms]">
            <StoryLead article={lead} timeBase={timeBase} />
          </div>
          {seconds.length > 0 && (
            <div className="animate-rise grid grid-cols-1 [animation-delay:160ms] md:grid-cols-3">
              {seconds.map((a) => (
                <div
                  key={a.id}
                  className="border-border border-b py-5 md:border-b-0 md:border-l md:px-5 md:pt-6 md:pb-2 md:first:border-l-0 md:first:pl-0 md:last:pr-0"
                >
                  <StorySecondary article={a} timeBase={timeBase} />
                </div>
              ))}
            </div>
          )}
          {briefs.length > 0 && (
            <BriefList
              articles={briefs}
              timeBase={timeBase}
              // 모바일은 직전 항목(서브·리드)의 하단 헤어라인이 구분선 역할 — md 이상에서만 위 괘선을 긋는다.
              className={cn(
                "animate-rise pt-4 [animation-delay:200ms]",
                seconds.length > 0 && "md:border-border md:mt-6 md:border-t",
              )}
            />
          )}
        </div>

        {trending.length > 0 && (
          <TrendingList
            articles={trending}
            className="animate-rise mt-10 [animation-delay:240ms] lg:mt-0 lg:border-l lg:pl-8"
          />
        )}
      </div>

      {radar.length > 0 && (
        <RadarBand
          articles={radar}
          className="animate-rise mt-12 [animation-delay:320ms] md:mt-14"
        />
      )}
    </section>
  );
}

function BriefList({
  articles,
  timeBase,
  className,
}: {
  articles: ArticleCard[];
  timeBase?: string;
  className?: string;
}) {
  return (
    <section aria-labelledby="briefs-heading" className={className}>
      <h2 id="briefs-heading" className="text-meta text-foreground font-bold tracking-[0.02em]">
        오늘의 브리핑
      </h2>
      <ul className="divide-border divide-y">
        {articles.map((a) => (
          <li key={a.id}>
            <StoryBrief article={a} timeBase={timeBase} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 오픈소스·논문 레이더. lg 4열 / md 2열 / 모바일은 가로 스크롤 스냅(카드 한 장 반이 보이게).
 * 모바일 스크롤러는 -mx-4 로 화면 끝까지 닿고 px-4 로 거터를 되돌린다 — 넘침은 스크롤러 안에만 생겨
 * 페이지 가로 스크롤은 생기지 않는다.
 */
function RadarBand({ articles, className }: { articles: ArticleCard[]; className?: string }) {
  return (
    <section aria-labelledby="radar-heading" className={cn("min-w-0", className)}>
      <div className="border-rule mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t-2 pt-3">
        <h2
          id="radar-heading"
          className="text-display-md font-serif font-extrabold whitespace-nowrap"
        >
          오픈소스·논문 레이더
        </h2>
        <span className="text-meta text-muted-foreground">이번 호의 저장소·모델·논문</span>
      </div>
      <ul
        className={cn(
          "-mx-4 flex snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "md:mx-0 md:grid md:snap-none md:grid-cols-2 md:gap-y-7 md:overflow-visible md:px-0 lg:grid-cols-4",
        )}
      >
        {articles.map((a) => (
          <li
            key={a.id}
            className={cn(
              "border-border w-[62%] min-w-0 shrink-0 snap-start pr-4 md:w-auto md:pr-5",
              "max-md:[&:nth-child(n+2)]:border-l max-md:[&:nth-child(n+2)]:pl-4",
              "md:[&:nth-child(2n)]:border-l md:[&:nth-child(2n)]:pl-5",
              "lg:last:pr-0 lg:[&:nth-child(n+2)]:border-l lg:[&:nth-child(n+2)]:pl-5",
            )}
          >
            <StoryRadar article={a} />
          </li>
        ))}
      </ul>
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

function SectionBand({ section, timeBase }: { section: EditionSection; timeBase?: string }) {
  const slug = categorySlug(section.category);
  const headingId = `section-${slug}-heading`;
  return (
    <section id={`section-${slug}`} aria-labelledby={headingId} className="scroll-mt-20">
      {/* 긴 분야명("오픈소스·도구")이 좁은 화면에서 링크와 겹치지 않게 — 링크가 다음 줄로 내려간다. */}
      <div className="border-rule mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t-2 pt-3">
        <h2 id={headingId} className="text-display-md font-serif font-extrabold whitespace-nowrap">
          {categoryLabel(section.category)}
        </h2>
        <span className="text-meta text-muted-foreground tabular-nums">
          {section.count}건{section.onFront > 0 && ` · 1면 ${section.onFront}건`}
        </span>
        <Link
          href={`/?category=${encodeURIComponent(section.category)}`}
          className="text-meta text-brand focus-visible:ring-ring ml-auto font-semibold whitespace-nowrap outline-none hover:underline focus-visible:ring-2"
        >
          이 분야 전체 기사 →
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
            <StorySectionItem article={a} featured={i === 0} timeBase={timeBase} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SectionBands({
  sections,
  timeBase,
}: {
  sections: EditionSection[];
  timeBase?: string;
}) {
  return (
    <div className="flex flex-col gap-12 md:gap-14">
      {sections.map((s) => (
        <SectionBand key={s.category} section={s} timeBase={timeBase} />
      ))}
    </div>
  );
}
