/**
 * 홈 편집 지면 (DESIGN.md §3). 서버·클라 공용 프레젠테이션(훅 없음).
 * - FrontPage:    1면 — [리드 + 서브 3 + 오늘의 브리핑 3](8) / [지금 화제 Top 5 + 이 호의 지면](4), 그 아래 전폭 레이더
 * - BriefList:    오늘의 브리핑 — 서브 그리드 아래 가는 괘선으로 구분한 3행 목록
 * - RadarBand:    오픈소스·논문 레이더 — 비뉴스 ≤4건, 칸 수에 맞춘 열(1건은 가로 한 줄). 비면 띠 전체를 숨긴다
 * - TrendingList: 화제 순위(번호 = 실제 순위). 비뉴스 행은 매체명 대신 형식 배지
 * - IssueContents: 이 호의 지면 — 분야별 건수·1면 게재 수 차례(lg 이상 사이드바)
 * - WeeklyRadarBand: 주간 레이더(일요일 특집) — 한 주 저장소·모델·논문 상위 ≤10 순위표. 1면(레이더) 아래·섹션 밴드 위
 * - SectionBands: 카테고리별 섹션 밴드(≤4건, 칸 수에 맞춘 열 — 대표 칸은 늘 1/3)
 *
 * 내보내는 밴드는 `locale`(기본 ko)을 받아 문구(messages/frontPage)·표시명·링크를 그 언어로 그리고 안쪽 칸에 넘긴다.
 * 홈은 클라이언트 FeedView 가 useLocale() 값을, 호 고정 링크는 서버 뷰가 prop 으로 넘긴다.
 */
import Link from "next/link";
import { ArticleLink } from "@/components/ArticleLink";
import { FormatBadge, TrendBar } from "@/components/ArticleMeta";
import {
  StoryBrief,
  StoryLead,
  StoryRadar,
  StorySecondary,
  StorySectionItem,
  StoryWeekly,
} from "@/components/Story";
import { headlineOf, sourceNameOf } from "@/lib/articleText";
import { frontArticles, type Edition, type EditionSection } from "@/lib/edition";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import { frontPageMessages } from "@/lib/messages/frontPage";
import { weekRangeLabel, weeklyFormatMix, type WeeklyRadar } from "@/lib/weeklyRadar";
import { CATEGORIES, FORMATS, categoryLabel, categorySlug } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ArticleCard, RadarCard, StoryCard } from "@/lib/types";

export function FrontPage({
  edition,
  timeBase,
  locale = "ko",
}: {
  edition: Edition<StoryCard>;
  timeBase?: string;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const { lead, seconds, briefs, radar, trending } = edition;
  if (!lead) return null;
  const t = getMessages(frontPageMessages, locale);

  return (
    <section id="front" aria-label={t.front} className="flex scroll-mt-20 flex-col pt-6 md:pt-8">
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div className="min-w-0">
          <div className="animate-rise border-border border-b pb-7 [animation-delay:80ms]">
            <StoryLead article={lead} timeBase={timeBase} locale={locale} />
          </div>
          {seconds.length > 0 && (
            <div className="animate-rise grid grid-cols-1 [animation-delay:160ms] md:grid-cols-3">
              {seconds.map((a) => (
                <div key={a.id} className="ed-sec">
                  <StorySecondary article={a} timeBase={timeBase} locale={locale} />
                </div>
              ))}
            </div>
          )}
          {briefs.length > 0 && (
            <BriefList
              articles={briefs}
              timeBase={timeBase}
              locale={locale}
              // 모바일은 직전 항목(서브·리드)의 하단 헤어라인이 구분선 역할 — md 이상에서만 위 괘선을 긋는다.
              className={cn(
                "animate-rise pt-4 [animation-delay:200ms]",
                seconds.length > 0 && "md:border-border md:mt-6 md:border-t md:pt-3.5",
              )}
            />
          )}
        </div>

        <div className="min-w-0">
          {trending.length > 0 && (
            <TrendingList
              articles={trending}
              locale={locale}
              className="animate-rise mt-10 [animation-delay:240ms] lg:mt-0 lg:border-l lg:pl-8"
            />
          )}
          <IssueContents
            edition={edition}
            locale={locale}
            className={cn(
              "animate-rise hidden [animation-delay:280ms] lg:block",
              trending.length > 0 && "mt-9",
            )}
          />
        </div>
      </div>

      {radar.length > 0 && (
        <RadarBand
          articles={radar}
          locale={locale}
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
  locale,
}: {
  articles: StoryCard[];
  timeBase?: string;
  className?: string;
  locale: Locale;
}) {
  return (
    <section aria-labelledby="briefs-heading" className={className}>
      <h2
        id="briefs-heading"
        className="text-meta text-foreground pb-1 font-bold tracking-[0.02em] md:pb-0.5"
      >
        {getMessages(frontPageMessages, locale).briefs}
      </h2>
      <ul className="divide-border divide-y">
        {articles.map((a) => (
          <li key={a.id}>
            <StoryBrief article={a} timeBase={timeBase} locale={locale} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 레이더 띠 칸 수별 열 구성(md 이상). 4건은 lg 4열/md 2열, 2·3건은 그 수만큼 같은 폭 열 — 빈 열을 남기지 않는다. */
const RADAR_COLS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
};

/** 칸 사이 세로 헤어라인(md 이상) — 줄의 첫 칸을 뺀 칸 왼쪽에 긋는다(globals.css `.ed-rd-2`~`4`). */
const RADAR_DIVIDERS: Record<number, string> = { 2: "ed-rd-2", 3: "ed-rd-3", 4: "ed-rd-4" };

/** 레이더 띠 보조 문구 — 실린 형식만 화면 표시명으로("이번 호의 저장소·논문", en "Repos and papers in this issue"). */
export function radarSubtitle(
  articles: Pick<ArticleCard, "format">[],
  locale: Locale = "ko",
): string {
  const formats = FORMATS.filter((f) => f !== "news" && articles.some((a) => a.format === f));
  return getMessages(frontPageMessages, locale).radar.subtitle(formats);
}

/**
 * 오픈소스·논문 레이더(최대 4건). 칸 수에 맞춰 짠다 — 빈 열을 남기지 않는다.
 * - 4건: lg 4열 / md 2열. 2·3건: md 이상 그 수만큼 같은 폭 열.
 * - 2건 이상 모바일: 가로 스크롤 스냅(카드 폭 64% — 다음 카드 절반이 보여 밀어 볼 수 있다는 신호).
 *   카드는 [본문 | 메타 레일] 2행 subgrid 라 한 줄의 카드들이 레일 헤어라인을 같은 높이에 둔다(시안 결정 ⑧).
 *   스크롤러는 -mx-4 로 화면 끝까지 닿고 px-4 로 거터를 되돌린다 — 넘침은 스크롤러 안에만 생겨 페이지 가로 스크롤은 없다.
 * - 1건: 카드 한 장을 띠 전폭 가로 한 줄로 펼친다(StoryRadar wide — 1면과 같은 8:4, 메타 레일이 '지금 화제' 칼럼 아래).
 *   모바일은 전폭 카드 한 장(스크롤러 없음).
 */
function RadarBand({
  articles,
  className,
  locale,
}: {
  articles: RadarCard[];
  className?: string;
  locale: Locale;
}) {
  const n = Math.min(articles.length, 4);
  const subtitle = radarSubtitle(articles, locale);
  return (
    <section aria-labelledby="radar-heading" className={cn("min-w-0", className)}>
      <div className="ed-bh">
        <h2 id="radar-heading" className="ed-bh-h">
          {getMessages(frontPageMessages, locale).radar.heading}
        </h2>
        {subtitle && <span className="text-meta text-muted-foreground">{subtitle}</span>}
      </div>
      {n === 1 ? (
        // relative: 카드 안 sr-only(absolute) 문구의 기준 상자.
        <ul className="relative">
          <li className="min-w-0">
            <StoryRadar article={articles[0]} wide locale={locale} />
          </li>
        </ul>
      ) : (
        <ul
          // ed-rd-ul — relative: 카드 안 sr-only(position:absolute) 문구의 기준 상자를 스크롤러로 묶는다. 없으면 초기 포함
          // 블록 기준으로 스크롤러 클립을 벗어나 화면 오른쪽에 놓여 페이지 폭을 늘린다(360px 에서 845px).
          // 모바일: 가로로 흐르는 2행 그리드(카드 폭 64%) — 카드마다 [본문 | 메타 레일] 2행을 subgrid 로 이어
          // 레일 헤어라인을 같은 높이에 맞춘다(수치 줄이 접힌 카드가 있어도). md 이상은 칸 수별 열(RADAR_COLS).
          className={cn("ed-rd-ul", RADAR_COLS[n])}
        >
          {articles.slice(0, 4).map((a) => (
            <li
              key={a.id}
              // ed-rd-li: 카드(StoryRadar)의 본문·레일 2행을 띠의 행 트랙에 잇는 subgrid — 레일 헤어라인 정렬용.
              className={cn("ed-rd-li", RADAR_DIVIDERS[n])}
            >
              <StoryRadar article={a} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TrendingList({
  articles,
  className,
  locale = "ko",
}: {
  articles: StoryCard[];
  className?: string;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const t = getMessages(frontPageMessages, locale).trending;
  return (
    <aside aria-labelledby="trending-heading" className={cn("border-border min-w-0", className)}>
      <div className="border-rule flex items-baseline justify-between border-b-2 pb-2.5">
        <h2
          id="trending-heading"
          className="font-serif text-2xl leading-[1.2] font-extrabold tracking-[-0.04em]"
        >
          {t.heading}
        </h2>
        <span className="text-label text-muted-foreground">{t.scale}</span>
      </div>
      <ol>
        {articles.map((a, i) => (
          <li key={a.id}>
            <ArticleLink articleId={a.id} locale={locale} className="story-link ed-tr">
              <span
                className={cn(
                  "st-rank row-span-2",
                  i < 3 ? "text-brand font-bold" : "text-muted-foreground font-medium",
                )}
              >
                {i + 1}
              </span>
              <span className="headline ed-tr-h">{headlineOf(a, locale)}</span>
              <span className="ed-tr-m">
                {/* 비뉴스(저장소·모델·논문)는 매체명(GitHub·Hugging Face) 대신 형식 배지 — 시안 결정 ⑥ */}
                {a.format === "news" ? (
                  <span className="shrink-0">{sourceNameOf(a, locale)}</span>
                ) : (
                  <FormatBadge format={a.format} locale={locale} />
                )}
                <TrendBar value={a.trendingScore} />
                <span className="ed-tr-s">{a.trendingScore}</span>
              </span>
            </ArticleLink>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** 이 호의 지면 한 행 — 분야별 호 기사 수와 1면 게재 수. */
export interface IssueContentsRow {
  category: string;
  count: number;
  onFront: number;
  /** 이동할 앵커: 섹션 밴드가 있으면 `#section-<slug>`, 전부 1면에 실려 밴드가 없으면 `#front`. */
  href: string;
}

/**
 * 이 호의 지면 차례(CATEGORIES 순). 섹션 밴드(edition.sections)는 1면에 다 오른 분야를 빼므로,
 * 건수는 호 전체(edition.issue)에서 직접 센다 — 기사가 0건인 분야만 생략한다.
 */
export function issueContents(edition: Edition<StoryCard>): IssueContentsRow[] {
  const frontIds = new Set(frontArticles(edition).map((a) => a.id));
  const banded = new Set(edition.sections.map((s) => s.category));
  return CATEGORIES.map((category) => {
    const inCategory = edition.issue.filter((a) => a.category === category);
    return {
      category,
      count: inCategory.length,
      onFront: inCategory.filter((a) => frontIds.has(a.id)).length,
      href: banded.has(category) ? `#section-${categorySlug(category)}` : "#front",
    };
  }).filter((r) => r.count > 0);
}

/**
 * 이 호의 지면 (시안 결정 ⑦) — 1면 오른쪽 칼럼, 지금 화제 아래. 신문 2면 "차례"처럼 분야명과 건수를 점선 리더로 잇고
 * 행을 누르면 해당 섹션 밴드로 이동한다. 1면 본문이 화제 5건보다 긴 데스크톱 빈자리를 채우는 용도라 lg 미만은 숨긴다
 * (모바일은 섹션 내비가 대신한다 — 표시 여부는 호출자의 className).
 */
function IssueContents({
  edition,
  className,
  locale,
}: {
  edition: Edition<StoryCard>;
  className?: string;
  locale: Locale;
}) {
  const rows = issueContents(edition);
  if (rows.length === 0) return null;
  const t = getMessages(frontPageMessages, locale).contents;
  return (
    <nav aria-labelledby="contents-heading" className={className}>
      <div className="border-rule flex items-baseline justify-between border-b-2 pb-2">
        <h2
          id="contents-heading"
          className="font-serif text-xl leading-[1.2] font-extrabold tracking-[-0.04em]"
        >
          {t.heading}
        </h2>
        <span className="text-label text-muted-foreground">{t.columns}</span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.category}>
            <a href={r.href} className="story-link ed-ic">
              <span className="headline font-semibold">{categoryLabel(r.category, locale)}</span>
              <span aria-hidden className="ed-ic-d" />
              <span className="font-semibold tabular-nums">{t.count(r.count)}</span>
              <span className="ed-ic-f">{r.onFront > 0 && t.onFront(r.onFront)}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 주간 레이더 md 이상 2열의 행 수(= ceil(건수/2)) — 세로 우선으로 흘러 왼쪽 열이 1~5위, 오른쪽이 6~10위. */
const WEEKLY_ROWS: Record<number, string> = {
  2: "md:grid-rows-[repeat(2,auto)]",
  3: "md:grid-rows-[repeat(3,auto)]",
  4: "md:grid-rows-[repeat(4,auto)]",
  5: "md:grid-rows-[repeat(5,auto)]",
};

/**
 * 주간 레이더(일요일 특집, DESIGN.md §5). 머리는 섹션 밴드 문법에 **이중 괘선**(2px + 1px)을 더해 정기 밴드와 구별하고,
 * 코발트 "일요일 특집" 라벨 · "주간 레이더" · 기간과 형식 구성을 한 줄에 둔다. 본문은 순위표(`<ol>`) —
 * md 이상 2열 세로 흐름(행 높이를 두 열이 나눠 써 헤어라인이 같은 높이에 선다, 열 사이 세로 헤어라인), 모바일 1열.
 * 맨 아래 각주가 선정 규칙을 밝힌다(순위표의 근거). 빈약한 주는 buildWeeklyRadar 가 null 이라 그리지 않는다.
 */
export function WeeklyRadarBand({
  weekly,
  locale = "ko",
}: {
  weekly: WeeklyRadar;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const n = Math.min(weekly.items.length, 10);
  const rows = Math.ceil(n / 2);
  const mix = weeklyFormatMix(weekly.formats, locale);
  const t = getMessages(frontPageMessages, locale).weekly;
  return (
    <section id="weekly" aria-labelledby="weekly-heading" className="min-w-0 scroll-mt-20">
      <div className="border-rule border-t-2 pt-[3px]">
        <div className="border-rule mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-3">
          <span className="text-meta text-brand font-bold whitespace-nowrap">{t.kicker}</span>
          <h2 id="weekly-heading" className="ed-bh-h">
            {t.heading}
          </h2>
          <span className="ed-cnt">
            {weekRangeLabel(weekly.start, weekly.end, locale)}
            {mix && ` · ${mix}`}
          </span>
        </div>
      </div>
      <ol className={cn("grid grid-cols-1 md:grid-flow-col md:grid-cols-2", WEEKLY_ROWS[rows])}>
        {weekly.items.slice(0, n).map((item, i) => (
          <li
            key={item.id}
            className={cn(
              "border-border min-w-0 border-b",
              i < rows ? "md:pr-8" : "md:border-l md:pl-8",
            )}
          >
            <StoryWeekly item={item} rank={i + 1} locale={locale} />
          </li>
        ))}
      </ol>
      <p className="text-label text-muted-foreground mt-3 max-w-[60em]">
        {t.footnote(weekly.candidates)}
      </p>
    </section>
  );
}

/**
 * 섹션 밴드 칸 수별 열 구성. 대표(첫 항목) 칸은 lg 에서 늘 띠 폭의 1/3 이다(4건 1.5fr/4.5fr · 3건 1/3 · 2건 1fr:2fr ·
 * 1건 가로 한 줄의 제목 칸) — 밴드를 내려 읽을 때 대표 제목의 폭과 둘째 칸의 시작 x 가 밴드마다 같다.
 * 나머지 항목이 남은 2/3 을 나눠 가져 빈 열이 생기지 않는다.
 */
const SECTION_GRID: Record<number, string> = {
  1: "",
  2: "md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
  3: "md:grid-cols-2 md:gap-y-6 lg:grid-cols-3",
  4: "md:grid-cols-2 md:gap-y-6 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]",
};

/** 칸별 여백·세로 헤어라인(md 이상) — [칸 수][순서]. 3건 md 는 대표가 두 칸을 차지하고 나머지 둘이 아랫줄. */
const SECTION_CELLS: Record<number, string[]> = {
  1: [""],
  2: ["md:pr-5", "md:border-l md:pl-5"],
  3: ["md:col-span-2 lg:col-span-1 lg:pr-5", "md:pr-5 lg:border-l lg:pl-5", "md:border-l md:pl-5"],
  4: [
    "md:pr-5",
    "md:border-l md:pl-5 md:pr-5",
    "md:pr-5 lg:border-l lg:pl-5",
    "md:border-l md:pl-5",
  ],
};

function SectionBand({
  section,
  timeBase,
  locale,
}: {
  section: EditionSection<StoryCard>;
  timeBase?: string;
  locale: Locale;
}) {
  const t = getMessages(frontPageMessages, locale).section;
  const slug = categorySlug(section.category);
  const headingId = `section-${slug}-heading`;
  const items = section.items.slice(0, 4);
  const n = items.length;
  return (
    <section id={`section-${slug}`} aria-labelledby={headingId} className="scroll-mt-20">
      {/* 긴 분야명("오픈소스·도구")이 좁은 화면에서 링크와 겹치지 않게 — 링크가 다음 줄로 내려간다. */}
      <div className="ed-bh">
        <h2 id={headingId} className="ed-bh-h">
          {categoryLabel(section.category, locale)}
        </h2>
        <span className="ed-cnt">
          {t.count(section.count)}
          {section.onFront > 0 && t.onFront(section.onFront)}
        </span>
        <Link
          href={localePath(locale, `/?category=${encodeURIComponent(section.category)}`)}
          className="ed-all"
        >
          {t.seeAll}
        </Link>
      </div>
      <div className={cn("grid grid-cols-1", SECTION_GRID[n])}>
        {items.map((a, i) => (
          <div key={a.id} className={cn("ed-cell", SECTION_CELLS[n]?.[i])}>
            <StorySectionItem
              article={a}
              featured={i === 0}
              wide={n === 1}
              timeBase={timeBase}
              locale={locale}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SectionBands({
  sections,
  timeBase,
  locale = "ko",
}: {
  sections: EditionSection<StoryCard>[];
  timeBase?: string;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  return (
    <div className="flex flex-col gap-12 md:gap-14">
      {sections.map((s) => (
        <SectionBand key={s.category} section={s} timeBase={timeBase} locale={locale} />
      ))}
    </div>
  );
}
