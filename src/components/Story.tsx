/**
 * 기사 스토리 변형 (DESIGN.md §5). 전체가 하나의 링크(`/article/[id]`)이며 hover 시 제목만 코발트.
 * LLM 가공 전(또는 실패)이면 한국어 제목이 없으므로 원문 제목으로 폴백한다.
 *
 * - StoryLead:      리드 1건 — 세리프 대형 제목 + 리드문(요약)
 * - StorySecondary: 서브 리드 — 세리프 중제목 + 요약 3줄
 * - StorySectionItem: 섹션 밴드 항목 — featured(첫 항목)는 세리프, 나머지는 산세리프
 * - StoryBrief:     오늘의 브리핑 한 행 — 키커 · 한 줄 세리프 제목 · 매체·시각·중요도
 * - StoryRadar:     레이더 카드(비뉴스) — 형식 배지·키커 · 세리프 제목 · 요약 2줄 · 메타 레일(날짜 생략)
 * - StoryWeekly:    주간 레이더 한 행(일요일 특집) — 순위 · 형식 배지·키커·실린 호 요일 · 세리프 제목 · 매체·메타
 * - StoryEntry:     전체 기사 색인 한 줄 — 날짜 · 키커·형식 배지 · 제목 · 바이라인
 *
 * 모두 `locale`(기본 ko)을 받아 제목·요약·매체(articleText)·키커·배지·바이라인·링크를 그 언어로 그린다.
 * 서버·클라이언트 공용(훅 없음) — 클라이언트 부모(StoryIndex)는 useLocale() 값을 넘긴다.
 */
import { ArticleLink } from "@/components/ArticleLink";
import { Byline, CategoryKicker, Dot, FormatBadge } from "@/components/ArticleMeta";
import { headlineOf, sourceNameOf, summaryOf } from "@/lib/articleText";
import type { Locale } from "@/lib/i18n";
import { formatShortDate } from "@/lib/labels";
import { radarMetaBlock, type RadarMetaItem } from "@/lib/radarMeta";
import { issueDayLabel, weeklyMetaBlock, type WeeklyItem } from "@/lib/weeklyRadar";
import { cn } from "@/lib/utils";
import type { EntryCard } from "@/lib/feedIndex";
import type { RadarCard, StoryCard } from "@/lib/types";

// 색인 카드(IndexCard)는 원제가 없다 — 만들 때 원제 폴백을 titleKo 에 이미 넣었다(src/lib/feedIndex.ts).
// 기사 링크는 ArticleLink(일반 `<a>`, prefetch 없음 — 기사 index.txt 는 빌드 후 지운다).
// 클래스는 globals.css 컴포넌트 층(`st-*`·`sg-*`) — 링크 묶음은 포커스 링을 품는다(따로 붙일 때는 `st-f`).
// 조건부·덮어쓰기 클래스는 유틸리티로 남긴다(컴포넌트 층을 늘 이긴다).

/** 스토리 변형 공통 prop. */
interface StoryProps {
  article: StoryCard;
  timeBase?: string;
  /** 언어판(기본 ko). */
  locale?: Locale;
}

export function StoryLead({ article, timeBase, locale = "ko" }: StoryProps) {
  const summary = summaryOf(article, locale);
  return (
    <ArticleLink articleId={article.id} locale={locale} className="story-link st-lead">
      <CategoryKicker category={article.category} locale={locale} />
      <h2 className="headline st-lead-h">{headlineOf(article, locale)}</h2>
      {summary && (
        // 모바일 17px → md 이상 19px(text-dek) — 시안 front-v3 `.lead p`. 좁은 화면에서 리드문이 첫 화면을 다 차지하지 않게.
        <p className="st-lead-p">{summary}</p>
      )}
      <Byline article={article} showTrend timeBase={timeBase} locale={locale} />
    </ArticleLink>
  );
}

export function StorySecondary({ article, timeBase, locale = "ko" }: StoryProps) {
  const summary = summaryOf(article, locale);
  return (
    <ArticleLink articleId={article.id} locale={locale} className="story-link st-sec">
      <CategoryKicker category={article.category} locale={locale} />
      <h3 className="headline st-sec-h">{headlineOf(article, locale)}</h3>
      {summary && <p className="st-sum3">{summary}</p>}
      <Byline
        article={article}
        compact
        timeBase={timeBase}
        className="mt-auto pt-1"
        locale={locale}
      />
    </ArticleLink>
  );
}

export function StorySectionItem({
  article,
  featured = false,
  wide = false,
  timeBase,
  locale = "ko",
}: {
  article: StoryCard;
  featured?: boolean;
  /**
   * 밴드에 이 기사 하나뿐일 때(대표) — md 이상에서 [제목 | 요약·바이라인] 가로 한 줄로 펼친다.
   * lg 는 1fr:2fr 이라 제목 칸이 다른 밴드의 대표 칸(1/3)과 같은 폭, 요약은 둘째 칸과 같은 x 에서 시작한다.
   */
  wide?: boolean;
  /** 홈 전용 — 바이라인을 상대 시각으로(Byline timeBase 참조). */
  timeBase?: string;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const summary = summaryOf(article, locale);
  return (
    <ArticleLink
      articleId={article.id}
      locale={locale}
      className={cn(
        "story-link st-item",
        // gap-x 30px: 1fr:2fr 둘째 칸 시작 = W/3 + 20px — 2·3·4건 밴드의 둘째 칸 본문(pl-5)과 같은 x.
        wide &&
          "md:grid md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-x-7.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
      )}
    >
      <h3 className={cn("headline", featured ? "st-item-hf" : "st-ttl", wide && "md:row-span-2")}>
        {headlineOf(article, locale)}
      </h3>
      {summary && (
        <p
          className={cn(
            // 넓은 칸(2건 밴드의 둘째·1건 밴드)에서도 읽기 폭은 한 줄 40자 남짓으로(st-item-p max-w-[42em]).
            "st-item-p",
            !featured && "max-md:hidden",
            wide && "md:pt-1",
          )}
        >
          {summary}
        </p>
      )}
      <Byline
        article={article}
        compact={!featured}
        showFormat
        timeBase={timeBase}
        className={wide ? "pt-1" : "mt-auto pt-1"}
        locale={locale}
      />
    </ArticleLink>
  );
}

/**
 * Korea Desk 칸(영어판, DESIGN.md §9) — 키커 · 세리프 제목(19–20px) · 요약 3줄(좁은 칸이라 자동 하이픈) · 바이라인.
 * 데스크 안이라 바이라인의 KOREA 표시는 생략한다(밴드 머리 "From Seoul · Korea Desk"가 이미 말한다).
 */
export function StoryDesk({ article, timeBase, locale = "ko" }: StoryProps) {
  const summary = summaryOf(article, locale);
  return (
    <ArticleLink articleId={article.id} locale={locale} className="story-link st-desk">
      <CategoryKicker category={article.category} locale={locale} />
      <h3 className="headline st-desk-h">{headlineOf(article, locale)}</h3>
      {summary && <p className="st-sum3">{summary}</p>}
      <Byline
        article={article}
        hideRegion
        timeBase={timeBase}
        className="mt-auto pt-0.5"
        locale={locale}
      />
    </ArticleLink>
  );
}

/**
 * 오늘의 브리핑 한 행 (시안 결정 ④·⑤).
 * - md 이상: [키커 7.5rem | 한 줄 세리프 제목(말줄임) | 매체 · 시각 · 중요도] 3칸, 행 약 50px.
 * - 모바일: 제목(15px, 2줄) → 메타 한 줄. 키커는 바이라인 맨 앞으로 들어가고, 넘치면 키커가 아니라 매체 칸("외 N곳"부터)이
 *   말줄임으로 줄어든다 — 키커·시각·중요도 도트는 온전히 남는다.
 *   행 약 83px(44px 터치 타깃 이상).
 */
export function StoryBrief({ article, timeBase, locale = "ko" }: StoryProps) {
  return (
    <ArticleLink articleId={article.id} locale={locale} className="story-link st-brief">
      <CategoryKicker category={article.category} className="max-md:hidden" locale={locale} />
      <h3 className="headline st-brief-h">{headlineOf(article, locale)}</h3>
      <Byline
        article={article}
        timeBase={timeBase}
        truncateSource
        prefix={
          article.category ? (
            <span className="contents md:hidden">
              <CategoryKicker category={article.category} className="shrink-0" locale={locale} />
              <Dot />
            </span>
          ) : undefined
        }
        className="min-w-0 flex-nowrap gap-x-2 overflow-hidden whitespace-nowrap"
        locale={locale}
      />
    </ArticleLink>
  );
}

/**
 * 레이더 카드(오픈소스·모델·논문, 시안 결정 ⑧). 머리 = 형식 배지 + 분야 키커, 세리프 제목 3줄, 요약 2줄,
 * 헤어라인을 깐 메타 레일 — 띠의 subgrid 2행(본문 | 레일)에 얹혀 네 카드가 같은 높이에서 메타를 맞춘다(데이터 표처럼).
 * 날짜는 생략한다: 논문·저장소의 게시일은 수집일보다 며칠씩 앞서 1면에서 낡아 보인다(계획서 Phase 1 참고).
 */
export function StoryRadar({
  article,
  wide = false,
  locale = "ko",
}: {
  article: RadarCard;
  wide?: boolean;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const summary = summaryOf(article, locale);
  return (
    <ArticleLink
      articleId={article.id}
      locale={locale}
      className={cn(
        "story-link",
        wide
          ? // 띠에 한 건뿐일 때 — md 이상 1면과 같은 8:4 분할로 펼친다: [머리·제목 | 요약](8) / 메타 레일(4).
            // 레일 세로 헤어라인이 바로 위 '지금 화제' 칼럼의 헤어라인과 같은 x 에 선다(gap-x-10 · pl-8 동일).
            "st-f flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] md:gap-x-10"
          : // 본문 | 메타 레일 2행을 띠(RadarBand)의 행 트랙에 subgrid 로 묶는다(st-radar) — 한 카드의 수치 줄이 두 줄로
            // 접혀도 같은 줄 카드들의 레일 헤어라인이 같은 높이에서 시작한다(mt-auto 바닥 정렬은 어긋났다).
            "st-radar",
      )}
    >
      <div
        className={cn(
          "st-radar-b",
          // 가로 한 줄: 머리(배지·키커)는 첫 줄, 제목과 요약은 둘째 줄에서 같은 높이로 시작한다.
          wide && "md:grid md:grid-cols-2 md:content-start md:gap-x-8",
        )}
      >
        <span className={cn("st-hd", wide && "md:col-start-1")}>
          <FormatBadge format={article.format} locale={locale} />
          <CategoryKicker
            category={article.category}
            className="min-w-0 truncate"
            locale={locale}
          />
        </span>
        <h3
          className={cn(
            "headline st-radar-h",
            // self-start: 줄 높이에 맞춰 늘어나면 line-clamp 상자가 커져 잘린 다음 줄이 비친다.
            wide && "md:col-start-1 md:row-start-2 md:self-start lg:text-[1.1875rem]",
          )}
        >
          {headlineOf(article, locale)}
        </h3>
        {summary && (
          <p
            className={cn(
              "st-sum2",
              wide && "md:col-start-2 md:row-start-2 md:line-clamp-3 md:self-start md:pt-0.5",
            )}
          >
            {summary}
          </p>
        )}
      </div>
      <RadarMetaRail article={article} wide={wide} locale={locale} />
    </ArticleLink>
  );
}

/**
 * 레이더 메타 레일 — 식별자 한 줄(owner/repo · org/model · arXiv ID) + 수치 줄(radarMetaBlock).
 * 빠진 값은 그 조각만 빠지고(시안 결정 ⑩), 헤어라인은 늘 남는다 — 카드는 위 가로선, 가로 한 줄(wide)은 왼쪽 세로선.
 */
function RadarMetaRail({
  article,
  wide = false,
  locale,
}: {
  article: RadarCard;
  wide?: boolean;
  locale: Locale;
}) {
  const { id, stats } = radarMetaBlock(article, sourceNameOf(article, locale), locale);
  return (
    <span className={cn("st-rail", wide && "md:border-t-0 md:border-l md:pt-0 md:pl-8")}>
      {id && (
        <span className="st-rail-id">
          <RadarMetaText item={id} />
        </span>
      )}
      {stats.length > 0 && (
        <span className="st-stats">
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

/**
 * 주간 레이더 한 행(일요일 특집, DESIGN.md §5). 지금 화제와 같은 순위 문법 — 세리프 순위 숫자(1~3위 코발트) 옆에
 * [형식 배지 · 분야 키커 … 실린 호 요일] → 세리프 제목 2줄 → 매체 · 식별자 · 수치(레이더 메타와 같은 표기, "오늘"은 "당일").
 * 요약은 싣지 않는다 — 열 줄 순위표의 밀도를 지키고, 요약은 그날 레이더 카드와 상세가 맡는다.
 */
export function StoryWeekly({
  item,
  rank,
  locale = "ko",
}: {
  item: WeeklyItem;
  rank: number;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const source = sourceNameOf(item, locale);
  const { id, stats } = weeklyMetaBlock(item, source, locale);
  // 식별자가 없어 매체명이 식별자 자리에 왔으면(radarMetaBlock 강등) 매체를 두 번 쓰지 않는다.
  const showSource = id?.key !== "source";
  return (
    <ArticleLink articleId={item.id} locale={locale} className="story-link st-wk">
      <span
        className={cn(
          "st-rank row-span-3 pt-px",
          rank <= 3 ? "text-brand font-bold" : "text-muted-foreground font-medium",
        )}
      >
        {rank}
      </span>
      <span className="st-hd">
        <FormatBadge format={item.format} locale={locale} />
        <CategoryKicker category={item.category} className="min-w-0 truncate" locale={locale} />
        <span className="st-wk-day">{issueDayLabel(item.issueDate, locale)}</span>
      </span>
      <h3 className="headline st-wk-h">
        {/* item.title 은 한국어 제목(없으면 원제)이라 ko 는 그대로, en 은 titleEn 만 쓴다(한국어 폴백 금지). */}
        {headlineOf({ titleKo: item.title, titleEn: item.titleEn }, locale)}
      </h3>
      {/* relative: 안쪽 sr-only(absolute) 문구의 기준 상자(레이더 메타 레일과 같은 이유). */}
      <span className="st-wk-meta">
        {showSource && <span className="shrink-0">{source}</span>}
        {id && (
          <span className="st-rail-id max-w-full min-w-0">
            <RadarMetaText item={id} />
          </span>
        )}
        {stats.map((m) => (
          <span key={m.key} className="whitespace-nowrap">
            <RadarMetaText item={m} />
          </span>
        ))}
      </span>
    </ArticleLink>
  );
}

/** 메타 한 칸: 화면 표기는 aria-hidden(기호·축약 수치), 스크린리더에는 label("스타 7,406개")을 읽힌다. */
function RadarMetaText({ item }: { item: RadarMetaItem }) {
  return (
    <>
      <span aria-hidden className="st-mt">
        {item.icon && <MetaIcon icon={item.icon} />}
        {item.prefix}
        {item.numeric ? <b className="sg-em">{item.value}</b> : item.value}
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
    <svg viewBox="0 0 12 12" aria-hidden data-icon={icon} className="st-ic">
      <path d={d} />
    </svg>
  );
}

export function StoryEntry({
  article,
  hideCategory = false,
  locale = "ko",
}: {
  /** 색인 카드 — ArticleCard·검색 인덱스 항목·목록 카드(EntryCard, 태그 없음)도 그대로 받는다. */
  article: EntryCard;
  /** 이미 분야가 정해진 목록(상세의 "같은 분야 기사")에서는 키커를 생략한다. */
  hideCategory?: boolean;
  /** 언어판(기본 ko) — 클라이언트 부모(StoryIndex)는 useLocale() 값을 넘긴다. */
  locale?: Locale;
}) {
  const summary = summaryOf(article, locale);
  return (
    <ArticleLink
      articleId={article.id}
      locale={locale}
      // st-entry grid-rows-[1fr_auto]: 2열 색인에서 옆 항목에 맞춰 늘어난 높이를 본문 행이 받는다 — 바이라인이 바닥에 붙어
      // 좌우 항목의 바이라인이 같은 높이에 선다(auto 행 두 개면 여분이 반씩 나뉘어 어긋났다).
      className="story-link st-entry"
    >
      <span className="st-date pt-0.5">{formatShortDate(article.publishedAt, locale)}</span>
      <div className="st-body">
        {((!hideCategory && article.category) || article.format !== "news") && (
          <span className="st-hd">
            {!hideCategory && (
              <CategoryKicker category={article.category} className="text-label" locale={locale} />
            )}
            <FormatBadge format={article.format} locale={locale} />
          </span>
        )}
        <h3 className="headline st-ttl">{headlineOf(article, locale)}</h3>
        {summary && <p className="st-sum2 mt-0.5">{summary}</p>}
      </div>
      <Byline
        article={article}
        showTrend
        showDate={false}
        className="col-start-2 mt-1"
        locale={locale}
      />
    </ArticleLink>
  );
}
