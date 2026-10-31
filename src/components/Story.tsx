/**
 * 기사 스토리 변형 (DESIGN.md §5). 전체가 하나의 링크(`/article/[id]`)이며 hover 시 제목만 코발트.
 * LLM 가공 전(또는 실패)이면 한국어 제목이 없으므로 원문 제목으로 폴백한다.
 *
 * - StoryLead:      리드 1건 — 세리프 대형 제목 + 리드문(요약)
 * - StorySecondary: 서브 리드 — 세리프 중제목 + 요약 3줄
 * - StorySectionItem: 섹션 밴드 항목 — featured(첫 항목)는 세리프, 나머지는 산세리프
 * - StoryBrief:     오늘의 브리핑 한 행 — 키커 · 한 줄 세리프 제목 · 매체·시각·중요도
 * - StoryRadar:     레이더 카드(비뉴스) — 형식 배지·키커 · 세리프 제목 · 요약 2줄 · 메타 레일(날짜 생략)
 * - StoryEntry:     전체 기사 색인 한 줄 — 날짜 · 키커·형식 배지 · 제목 · 바이라인
 */
import Link from "next/link";
import { Byline, CategoryKicker, Dot, FormatBadge } from "@/components/ArticleMeta";
import { formatShortDate, shortSourceName } from "@/lib/labels";
import { radarMetaBlock, type RadarMetaItem } from "@/lib/radarMeta";
import { cn } from "@/lib/utils";
import type { ArticleCard, IndexCard } from "@/lib/types";

// 색인 카드(IndexCard)는 원제가 없다 — 만들 때 원제 폴백을 titleKo 에 이미 넣었다(src/lib/feedIndex.ts).
const titleOf = (a: Pick<ArticleCard, "titleKo"> & Partial<Pick<ArticleCard, "titleOriginal">>) =>
  a.titleKo || a.titleOriginal;
const hrefOf = (a: Pick<ArticleCard, "id">) => `/article/${a.id}`;
const focus =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background";

export function StoryLead({ article, timeBase }: { article: ArticleCard; timeBase?: string }) {
  return (
    <Link href={hrefOf(article)} className={cn("story-link flex flex-col gap-4", focus)}>
      <CategoryKicker category={article.category} />
      <h2 className="headline text-display-xl font-serif font-bold">{titleOf(article)}</h2>
      {article.summaryKo && (
        // 모바일 17px → md 이상 19px(text-dek) — 시안 front-v3 `.lead p`. 좁은 화면에서 리드문이 첫 화면을 다 차지하지 않게.
        <p className="text-foreground-soft md:text-dek max-w-[40em] text-[1.0625rem] leading-[1.7]">
          {article.summaryKo}
        </p>
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
  wide = false,
  timeBase,
}: {
  article: ArticleCard;
  featured?: boolean;
  /**
   * 밴드에 이 기사 하나뿐일 때(대표) — md 이상에서 [제목 | 요약·바이라인] 가로 한 줄로 펼친다.
   * lg 는 1fr:2fr 이라 제목 칸이 다른 밴드의 대표 칸(1/3)과 같은 폭, 요약은 둘째 칸과 같은 x 에서 시작한다.
   */
  wide?: boolean;
  /** 홈 전용 — 바이라인을 상대 시각으로(Byline timeBase 참조). */
  timeBase?: string;
}) {
  return (
    <Link
      href={hrefOf(article)}
      className={cn(
        "story-link flex h-full flex-col gap-2",
        // gap-x 30px: 1fr:2fr 둘째 칸 시작 = W/3 + 20px — 2·3·4건 밴드의 둘째 칸 본문(pl-5)과 같은 x.
        wide &&
          "md:grid md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-x-7.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
        focus,
      )}
    >
      <h3
        className={cn(
          "headline",
          featured
            ? "text-headline font-serif font-bold md:text-[1.5rem] md:leading-[1.3]"
            : "text-title font-semibold tracking-[-0.02em]",
          wide && "md:row-span-2",
        )}
      >
        {titleOf(article)}
      </h3>
      {article.summaryKo && (
        <p
          className={cn(
            "text-caption text-muted-foreground line-clamp-3",
            !featured && "max-md:hidden",
            // 넓은 칸(2건 밴드의 둘째·1건 밴드)에서도 읽기 폭은 한 줄 40자 남짓으로.
            "max-w-[42em]",
            wide && "md:pt-1",
          )}
        >
          {article.summaryKo}
        </p>
      )}
      <Byline
        article={article}
        compact={!featured}
        showFormat
        timeBase={timeBase}
        className={wide ? "pt-1" : "mt-auto pt-1"}
      />
    </Link>
  );
}

/**
 * 오늘의 브리핑 한 행 (시안 결정 ④·⑤).
 * - md 이상: [키커 7.5rem | 한 줄 세리프 제목(말줄임) | 매체 · 시각 · 중요도] 3칸, 행 약 50px.
 * - 모바일: 제목(15px, 2줄) → 메타 한 줄. 키커는 바이라인 맨 앞으로 들어가고, 넘치면 키커가 아니라 매체 칸("외 N곳"부터)이
 *   말줄임으로 줄어든다 — 키커·시각·중요도 도트는 온전히 남는다.
 *   행 약 83px(44px 터치 타깃 이상).
 */
export function StoryBrief({ article, timeBase }: { article: ArticleCard; timeBase?: string }) {
  return (
    <Link
      href={hrefOf(article)}
      className={cn(
        "story-link grid min-h-11 grid-cols-1 gap-y-[3px] py-2.5",
        "md:grid-cols-[7.5rem_minmax(0,1fr)_auto] md:items-baseline md:gap-x-4 md:py-[13px]",
        focus,
      )}
    >
      <CategoryKicker category={article.category} className="max-md:hidden" />
      <h3 className="headline md:text-title line-clamp-2 font-serif text-[0.9375rem] leading-[1.4] font-bold tracking-[-0.03em] md:line-clamp-1 md:leading-[1.5]">
        {titleOf(article)}
      </h3>
      <Byline
        article={article}
        timeBase={timeBase}
        truncateSource
        prefix={
          article.category ? (
            <span className="contents md:hidden">
              <CategoryKicker category={article.category} className="shrink-0" />
              <Dot />
            </span>
          ) : undefined
        }
        className="min-w-0 flex-nowrap gap-x-2 overflow-hidden whitespace-nowrap"
      />
    </Link>
  );
}

/**
 * 레이더 카드(오픈소스·모델·논문, 시안 결정 ⑧). 머리 = 형식 배지 + 분야 키커, 세리프 제목 3줄, 요약 2줄,
 * 헤어라인을 깐 메타 레일 — 띠의 subgrid 2행(본문 | 레일)에 얹혀 네 카드가 같은 높이에서 메타를 맞춘다(데이터 표처럼).
 * 날짜는 생략한다: 논문·저장소의 게시일은 수집일보다 며칠씩 앞서 1면에서 낡아 보인다(계획서 Phase 1 참고).
 */
export function StoryRadar({ article, wide = false }: { article: ArticleCard; wide?: boolean }) {
  return (
    <Link
      href={hrefOf(article)}
      className={cn(
        "story-link",
        wide
          ? // 띠에 한 건뿐일 때 — md 이상 1면과 같은 8:4 분할로 펼친다: [머리·제목 | 요약](8) / 메타 레일(4).
            // 레일 세로 헤어라인이 바로 위 '지금 화제' 칼럼의 헤어라인과 같은 x 에 선다(gap-x-10 · pl-8 동일).
            "flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] md:gap-x-10"
          : // 본문 | 메타 레일 2행을 띠(RadarBand)의 행 트랙에 subgrid 로 묶는다 — 한 카드의 수치 줄이 두 줄로
            // 접혀도 같은 줄 카드들의 레일 헤어라인이 같은 높이에서 시작한다(mt-auto 바닥 정렬은 어긋났다).
            "row-span-2 grid grid-rows-subgrid gap-y-2.5",
        focus,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2.5",
          // 가로 한 줄: 머리(배지·키커)는 첫 줄, 제목과 요약은 둘째 줄에서 같은 높이로 시작한다.
          wide && "md:grid md:grid-cols-2 md:content-start md:gap-x-8",
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-2", wide && "md:col-start-1")}>
          <FormatBadge format={article.format} />
          <CategoryKicker category={article.category} className="min-w-0 truncate" />
        </span>
        <h3
          className={cn(
            "headline text-title line-clamp-3 font-serif leading-[1.45] font-bold tracking-[-0.03em] md:text-[1.0625rem]",
            // self-start: 줄 높이에 맞춰 늘어나면 line-clamp 상자가 커져 잘린 다음 줄이 비친다.
            wide && "md:col-start-1 md:row-start-2 md:self-start lg:text-[1.1875rem]",
          )}
        >
          {titleOf(article)}
        </h3>
        {article.summaryKo && (
          <p
            className={cn(
              "text-caption text-muted-foreground line-clamp-2",
              wide && "md:col-start-2 md:row-start-2 md:line-clamp-3 md:self-start md:pt-0.5",
            )}
          >
            {article.summaryKo}
          </p>
        )}
      </div>
      <RadarMetaRail article={article} wide={wide} />
    </Link>
  );
}

/**
 * 레이더 메타 레일 — 식별자 한 줄(owner/repo · org/model · arXiv ID) + 수치 줄(radarMetaBlock).
 * 빠진 값은 그 조각만 빠지고(시안 결정 ⑩), 헤어라인은 늘 남는다 — 카드는 위 가로선, 가로 한 줄(wide)은 왼쪽 세로선.
 */
function RadarMetaRail({ article, wide = false }: { article: ArticleCard; wide?: boolean }) {
  const { id, stats } = radarMetaBlock(article, shortSourceName(article.source.name));
  return (
    <span
      className={cn(
        "border-border text-meta text-muted-foreground relative flex min-w-0 flex-col gap-[3px] border-t pt-2.5 tabular-nums",
        wide && "md:border-t-0 md:border-l md:pt-0 md:pl-8",
      )}
    >
      {id && (
        <span className="text-foreground-soft truncate font-semibold tracking-[-0.005em]">
          <RadarMetaText item={id} />
        </span>
      )}
      {stats.length > 0 && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {stats.map((m) => (
            <span key={m.key} className="whitespace-nowrap">
              <RadarMetaText item={m} />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** 메타 한 칸: 화면 표기는 aria-hidden(기호·축약 수치), 스크린리더에는 label("스타 7,406개")을 읽힌다. */
function RadarMetaText({ item }: { item: RadarMetaItem }) {
  return (
    <>
      <span aria-hidden className="inline-flex items-center gap-1">
        {item.icon && <MetaIcon icon={item.icon} />}
        {item.prefix}
        {item.numeric ? (
          <b className="text-foreground-soft font-semibold">{item.value}</b>
        ) : (
          item.value
        )}
      </span>
      <span className="sr-only">{item.label}</span>
    </>
  );
}

/**
 * ★ ♥ ↓ ▲ 를 11px 인라인 SVG(currentColor)로 — 글자로 두면 iOS·안드로이드가 ♥ 를 빨간 이모지로 바꾼다(시안 결정 ⑨).
 */
const META_ICON_PATHS: Record<string, string> = {
  "★": "M6 .8l1.6 3.4 3.7.4-2.8 2.5.8 3.7L6 9 2.7 10.8l.8-3.7L.7 4.6l3.7-.4z",
  "♥": "M6 10.8 1.4 6.3A2.7 2.7 0 0 1 6 2.6a2.7 2.7 0 0 1 4.6 3.7z",
  "↓": "M5.2 1h1.6v5.6l2-2 1.1 1.1L6 9.6 2.1 5.7l1.1-1.1 2 2zM1.5 10.2h9V11.5h-9z",
  "▲": "M6 1.5 11 10H1z",
};

function MetaIcon({ icon }: { icon: string }) {
  const d = META_ICON_PATHS[icon];
  if (!d) return <span>{icon}</span>;
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      data-icon={icon}
      className="size-[11px] shrink-0 translate-y-[0.5px] fill-current"
    >
      <path d={d} />
    </svg>
  );
}

export function StoryEntry({
  article,
  hideCategory = false,
}: {
  /** 색인 카드 — ArticleCard·검색 인덱스 항목도 그대로 받는다. */
  article: IndexCard;
  /** 이미 분야가 정해진 목록(상세의 "같은 분야 기사")에서는 키커를 생략한다. */
  hideCategory?: boolean;
}) {
  return (
    <Link
      href={hrefOf(article)}
      className={cn(
        // grid-rows-[1fr_auto]: 2열 색인에서 옆 항목에 맞춰 늘어난 높이를 본문 행이 받는다 — 바이라인이 바닥에 붙어
        // 좌우 항목의 바이라인이 같은 높이에 선다(auto 행 두 개면 여분이 반씩 나뉘어 어긋났다).
        "story-link border-border grid grid-cols-[3.25rem_minmax(0,1fr)] grid-rows-[1fr_auto] gap-x-3 gap-y-1 border-b py-4",
        focus,
      )}
    >
      <span className="text-muted-foreground pt-0.5 font-serif text-[0.9375rem] font-semibold tabular-nums">
        {formatShortDate(article.publishedAt)}
      </span>
      <div className="flex min-w-0 flex-col gap-[3px]">
        {((!hideCategory && article.category) || article.format !== "news") && (
          <span className="flex min-w-0 items-center gap-2">
            {!hideCategory && <CategoryKicker category={article.category} className="text-label" />}
            <FormatBadge format={article.format} />
          </span>
        )}
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
