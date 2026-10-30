/**
 * 기사 스토리 변형 (DESIGN.md §5). 전체가 하나의 링크(`/article/[id]`)이며 hover 시 제목만 코발트.
 * LLM 가공 전(또는 실패)이면 한국어 제목이 없으므로 원문 제목으로 폴백한다.
 *
 * - StoryLead:      리드 1건 — 세리프 대형 제목 + 리드문(요약)
 * - StorySecondary: 서브 리드 — 세리프 중제목 + 요약 3줄
 * - StorySectionItem: 섹션 밴드 항목 — featured(첫 항목)는 세리프, 나머지는 산세리프
 * - StoryBrief:     오늘의 브리핑 한 행 — 키커 · 한 줄 세리프 제목 · 매체·시각·중요도
 * - StoryRadar:     레이더 카드(비뉴스) — 형식 라벨 · 세리프 제목 · 요약 2줄 · 매체(날짜 생략)
 * - StoryEntry:     전체 기사 색인 한 줄 — 날짜 · 키커 · 제목 · 바이라인
 */
import Link from "next/link";
import { Byline, CategoryKicker } from "@/components/ArticleMeta";
import { FORMAT_BADGES, formatShortDate, shortSourceName } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ArticleCard } from "@/lib/types";

const titleOf = (a: ArticleCard) => a.titleKo || a.titleOriginal;
const hrefOf = (a: ArticleCard) => `/article/${a.id}`;
const focus =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background";

export function StoryLead({ article, timeBase }: { article: ArticleCard; timeBase?: string }) {
  return (
    <Link href={hrefOf(article)} className={cn("story-link flex flex-col gap-4", focus)}>
      <CategoryKicker category={article.category} />
      <h2 className="headline text-display-xl font-serif font-bold">{titleOf(article)}</h2>
      {article.summaryKo && (
        <p className="text-dek text-foreground-soft max-w-[40em]">{article.summaryKo}</p>
      )}
      <Byline article={article} showTrend timeBase={timeBase} />
    </Link>
  );
}

export function StorySecondary({ article, timeBase }: { article: ArticleCard; timeBase?: string }) {
  return (
    <Link href={hrefOf(article)} className={cn("story-link flex h-full flex-col gap-2.5", focus)}>
      <CategoryKicker category={article.category} />
      <h3 className="headline text-headline font-serif font-bold">{titleOf(article)}</h3>
      {article.summaryKo && (
        <p className="text-caption text-muted-foreground line-clamp-3">{article.summaryKo}</p>
      )}
      <Byline article={article} compact timeBase={timeBase} className="mt-auto pt-1" />
    </Link>
  );
}

export function StorySectionItem({
  article,
  featured = false,
  timeBase,
}: {
  article: ArticleCard;
  featured?: boolean;
  /** 홈 전용 — 바이라인을 상대 시각으로(Byline timeBase 참조). */
  timeBase?: string;
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
      <Byline article={article} compact={!featured} timeBase={timeBase} className="mt-auto pt-1" />
    </Link>
  );
}

/**
 * 오늘의 브리핑 한 행. md 이상은 [키커 | 한 줄 제목 | 바이라인] 3칸 — 제목이 길면 말줄임.
 * 모바일은 키커 → 제목(2줄) → 바이라인 순으로 쌓는다. 행 높이는 44px 터치 타깃 이상.
 */
export function StoryBrief({ article, timeBase }: { article: ArticleCard; timeBase?: string }) {
  return (
    <Link
      href={hrefOf(article)}
      className={cn(
        "story-link grid grid-cols-1 gap-y-1 py-3.5",
        "md:grid-cols-[7.5rem_minmax(0,1fr)_auto] md:items-baseline md:gap-x-4",
        focus,
      )}
    >
      <CategoryKicker category={article.category} />
      <h3 className="headline text-title line-clamp-2 font-serif font-bold tracking-[-0.03em] md:line-clamp-1">
        {titleOf(article)}
      </h3>
      <Byline
        article={article}
        timeBase={timeBase}
        className="md:flex-nowrap md:whitespace-nowrap"
      />
    </Link>
  );
}

/**
 * 레이더 카드(오픈소스·모델·논문). 형식 라벨은 잉크 1px 아웃라인 — 코발트는 쓰지 않는다(단일 강조색 원칙).
 * 날짜는 생략한다: 논문·저장소의 게시일은 수집일보다 며칠씩 앞서 1면에서 낡아 보인다(계획서 Phase 1 참고).
 */
export function StoryRadar({ article }: { article: ArticleCard }) {
  const badge = FORMAT_BADGES[article.format];
  return (
    <Link href={hrefOf(article)} className={cn("story-link flex h-full flex-col gap-2.5", focus)}>
      {badge && (
        <span className="border-foreground text-foreground text-label self-start border px-1.5 py-0.5 leading-none font-bold tracking-[0.12em]">
          {badge}
        </span>
      )}
      <h3 className="headline text-title line-clamp-3 font-serif font-bold tracking-[-0.03em] md:text-[1.0625rem] md:leading-[1.45]">
        {titleOf(article)}
      </h3>
      {article.summaryKo && (
        <p className="text-caption text-muted-foreground line-clamp-2">{article.summaryKo}</p>
      )}
      <span className="text-meta text-foreground-soft mt-auto truncate pt-1 font-semibold">
        {shortSourceName(article.source.name)}
      </span>
    </Link>
  );
}

export function StoryEntry({
  article,
  hideCategory = false,
}: {
  article: ArticleCard;
  /** 이미 분야가 정해진 목록(상세의 "같은 분야 기사")에서는 키커를 생략한다. */
  hideCategory?: boolean;
}) {
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
        {!hideCategory && <CategoryKicker category={article.category} className="text-label" />}
        <h3 className="headline text-title font-semibold tracking-[-0.02em]">{titleOf(article)}</h3>
        {article.summaryKo && (
          <p className="text-caption text-muted-foreground mt-0.5 line-clamp-2">
            {article.summaryKo}
          </p>
        )}
      </div>
      <Byline article={article} showTrend showDate={false} className="col-start-2 mt-1" />
    </Link>
  );
}
