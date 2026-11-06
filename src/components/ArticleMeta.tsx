/**
 * 기사 신호 프레젠테이션 컴포넌트 (DESIGN.md §4). 피드·검색·상세가 공유한다.
 * - CategoryKicker: 코발트 키커(한글 표시명)
 * - FormatBadge: 형식 배지(REPO·MODEL·PAPER) — 잉크 1px 아웃라인, 코발트 없음. 뉴스는 렌더하지 않는다
 * - RegionBadge: 지역 배지(KOREA) — 형식 배지와 같은 문법(운영 콘솔). 해외 매체는 렌더하지 않는다
 * - RegionMark: 영어판 바이라인의 KOREA 글자 표시(테두리 없음 — DESIGN.md §9 영어판, 5-1 결정 B)
 * - ImportanceMeter: 5칸 원형 도트 미터(4–5는 코발트)
 * - Byline: (형식 배지) 소스 · 날짜 · 중요도 (+ 선택 화제 지수)
 * - TrendBar: 0–100 고정 스케일 수평 바
 * - TagChips: pill 태그 칩(영어판은 라틴 문자 태그만)
 * 언어판(영어판 Phase 3-3): 각 컴포넌트가 `locale`(기본 ko)을 받아 표시명·문구를 고른다. 이 파일은 서버·클라이언트
 * 어느 쪽에서도 그려지므로 컨텍스트가 아니라 prop 으로 받는다(클라이언트 부모는 useLocale() 값을 넘긴다).
 */
import { RelativeTime } from "@/components/RelativeTime";
import type { ReactNode } from "react";
import {
  FORMAT_BADGES,
  REGION_BADGES,
  categoryLabel,
  formatDate,
  formatLabel,
  localeTags,
  regionLabel,
  type Format,
  type Region,
} from "@/lib/labels";
import { sourceNameOf } from "@/lib/articleText";
import { relatedCountOf } from "@/lib/feedIndex";
import { getMessages, type Locale } from "@/lib/i18n";
import { metaMessages } from "@/lib/messages/meta";
import { cn } from "@/lib/utils";
import type { ArticleCard, IndexCard } from "@/lib/types";

/** 카테고리 키커. category 가 비어 있으면 렌더하지 않는다. */
export function CategoryKicker({
  category,
  className,
  locale = "ko",
}: {
  category: string;
  className?: string;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  if (!category) return null;
  return <span className={cn("sg-kick", className)}>{categoryLabel(category, locale)}</span>;
}

/** 잉크 1px 아웃라인 배지 공용 클래스(형식·지역, globals.css `.sg-badge`) — 코발트 금지. */
const OUTLINE_BADGE = "sg-badge";

/**
 * 형식 배지 REPO·MODEL·PAPER (시안 결정 ⑪). 10.5px 굵은 대문자, 잉크 1px 테두리, 각진 면 — 코발트는 쓰지 않는다
 * (단일 강조색 원칙: 코발트는 옆의 분야 키커 몫). 뉴스는 배지가 없다.
 * 대문자는 aria-hidden(읽기 어색하고 뜻도 좁다), 스크린리더에는 화면 표시명(formatLabel — 저장소·모델·논문 /
 * Repo·Model·Paper)을 sr-only 로 읽힌다.
 * relative 는 sr-only(absolute)의 기준 상자 — 가로 스크롤러 안에서 클립을 벗어나 페이지 폭을 늘리지 않게.
 */
export function FormatBadge({
  format,
  className,
  locale = "ko",
}: {
  format: Format;
  className?: string;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const badge = FORMAT_BADGES[format];
  if (!badge) return null;
  return (
    <span className={cn(OUTLINE_BADGE, className)}>
      <span aria-hidden>{badge}</span>
      <span className="sr-only">{formatLabel(format, locale)}</span>
    </span>
  );
}

/**
 * 지역 배지 KOREA — 한국 매체(sources.region = kr). 형식 배지와 같은 문법(잉크 아웃라인·대문자, 스크린리더엔 "한국 매체").
 * 지금은 운영 콘솔 소스 목록만 쓴다(영어판 Phase 5 의 KOREA 표시가 같은 컴포넌트를 쓸 수 있게 여기 둔다).
 */
export function RegionBadge({
  region,
  className,
  locale = "ko",
}: {
  region?: Region;
  className?: string;
  /** 언어판(기본 ko) — 스크린리더 표시명. */
  locale?: Locale;
}) {
  if (!region) return null;
  return (
    <span className={cn(OUTLINE_BADGE, className)}>
      <span aria-hidden>{REGION_BADGES[region]}</span>
      <span className="sr-only">{regionLabel(region, locale)}</span>
    </span>
  );
}

/**
 * 영어판 바이라인의 한국 매체 표시 `KOREA ·` (DESIGN.md §9 "영어판" — 5-1 결정 B 글자만). 배지 글꼴(10.5px 700 대문자,
 * 자간 0.09em)을 테두리 없이 잉크로, 매체명 바로 앞에 점으로 나눠 둔다(`KOREA · AI Times`). 상자는 형식 배지 몫이고
 * 코발트는 쓰지 않는다. 대문자는 aria-hidden, 스크린리더는 "Korean outlet". relative 는 sr-only(absolute)의 기준 상자.
 * 한국어판은 그리지 않는다(지역 표시는 영어 독자용 신호다).
 */
export function RegionMark({ region, locale = "ko" }: { region?: Region; locale?: Locale }) {
  if (!region || locale !== "en") return null;
  return (
    <>
      <span className="sg-region">
        <span aria-hidden>{REGION_BADGES[region]}</span>
        <span className="sr-only">{regionLabel(region, locale)}</span>
      </span>
      <Dot />
    </>
  );
}

/**
 * 중요도 1–5 도트 미터. 0(미가공)이면 렌더하지 않는다. 색만이 아니라 칸 수·라벨로도 전달.
 * 칸은 클래스 없는 `<i>` 5개 — 채움·색은 globals.css `.sg-imp[data-v]` 가 칸 순서(nth-child)로 정한다
 * (앞 N칸 채움, 4–5는 코발트). 미터가 호 한 장에 50개 가까이 실려 칸마다 클래스를 달면 페이지가 수십 KB 무거워진다.
 */
export function ImportanceMeter({
  value,
  locale = "ko",
}: {
  value: number;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  if (value <= 0) return null;
  return (
    <span
      role="img"
      aria-label={getMessages(metaMessages, locale).importance(value)}
      className="sg-imp"
      // 채운 칸 수(예전 `i <= value` 와 같다) — 4 이상이면 코발트.
      data-v={Math.min(5, Math.floor(value))}
    >
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** 바이라인 구분 점(2px). */
export function Dot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("sg-dot", className)} />;
}

/**
 * 소스 · 날짜 · 중요도 바이라인. showTrend 시 화제 지수를 덧붙인다.
 * compact: 좁은 칼럼용 — md 이상에서 소스를 첫 줄, 날짜·중요도를 둘째 줄로 고정해
 * 미터만 줄바꿈되는 것을 막는다(모바일은 1열이라 한 줄 유지).
 * showFormat: 소스 앞에 형식 배지(비뉴스만 — 섹션 밴드, 시안 결정 ⑬).
 */
export function Byline({
  article,
  showTrend = false,
  fullSource = false,
  compact = false,
  showFormat = false,
  showDate = true,
  truncateSource = false,
  hideRegion = false,
  timeBase,
  prefix,
  className,
  locale = "ko",
}: {
  /** 카드(ArticleCard) 또는 색인 카드(IndexCard — 묶인 보도는 개수 relatedCount 만 있다). */
  article: Pick<ArticleCard, "source" | "publishedAt" | "importance" | "trendingScore" | "format"> &
    Partial<Pick<ArticleCard, "related"> & Pick<IndexCard, "relatedCount">>;
  showTrend?: boolean;
  fullSource?: boolean;
  compact?: boolean;
  showFormat?: boolean;
  /** 소스 앞에 그대로 붙일 조각(구분 점 포함은 호출자 몫) — 모바일 브리핑의 키커 병합용. */
  prefix?: ReactNode;
  /** 날짜를 별도 칼럼에 이미 보여 주는 목록(StoryEntry)에서는 끈다. */
  showDate?: boolean;
  /**
   * 한 줄 고정(flex-nowrap) 메타 줄에서 넘치면 매체 칸만 말줄임으로 줄인다 — "외 N곳"이 먼저 빠지고
   * 앞의 키커(prefix)와 뒤의 시각·중요도는 온전히 남는다(모바일 브리핑, 시안 결정 ⑤).
   */
  truncateSource?: boolean;
  /** 영어판 KOREA 표시를 끈다 — Korea Desk 안(밴드 머리가 이미 말한다). */
  hideRegion?: boolean;
  /**
   * 지정하면 날짜를 상대 시각(RelativeTime)으로 그린다 — 값은 정적 렌더 기준 시각(호 발행 ISO).
   * 홈 1면·섹션 전용. 상세·지난 호·검색은 생략해 절대 날짜를 유지한다(지난 호에서 "3시간 전"→"10.24"로 깜빡이지 않도록).
   */
  timeBase?: string;
  className?: string;
  /** 언어판(기본 ko) — 매체 표시명·날짜·배지·미터 문구. 상대 시각(RelativeTime)은 컨텍스트로 언어를 읽는다. */
  locale?: Locale;
}) {
  const t = getMessages(metaMessages, locale);
  // 영어판 한국 매체: 매체명 앞 `KOREA ·` (한국어판·데스크 안은 없음).
  const region = locale === "en" && !hideRegion ? article.source.region : undefined;
  const source = (
    <span
      className={cn(
        "sg-em",
        compact && "sg-src-c",
        truncateSource && "sg-tr",
        (showFormat || region) && "sg-src-f",
      )}
    >
      {showFormat && <FormatBadge format={article.format} locale={locale} />}
      <RegionMark region={region} locale={locale} />
      {/* KOREA 표시가 앞에 서면(영어판) 바깥 칸이 flex 라 매체명 칸이 직접 말줄임한다. */}
      <span className={cn((compact || (truncateSource && region)) && "sg-tr")}>
        {sourceNameOf(article, locale, { full: fullSource })}
        <OtherSources count={relatedCountOf(article)} locale={locale} />
      </span>
    </span>
  );
  const when = timeBase ? (
    <RelativeTime iso={article.publishedAt} base={timeBase} />
  ) : (
    <span className="tabular-nums">{formatDate(article.publishedAt, locale)}</span>
  );
  if (compact) {
    return (
      <div className={cn("sg-by sg-byc", className)}>
        {prefix}
        {source}
        <Dot className="md:hidden" />
        <span className="flex items-center gap-2.5">
          {when}
          {article.importance > 0 && <ImportanceMeter value={article.importance} locale={locale} />}
        </span>
      </div>
    );
  }
  return (
    <div className={cn("sg-by", className)}>
      {prefix}
      {source}
      {showDate && (
        <>
          <Dot />
          {when}
        </>
      )}
      {article.importance > 0 && (
        <>
          <Dot />
          <ImportanceMeter value={article.importance} locale={locale} />
        </>
      )}
      {showTrend && article.trendingScore > 0 && (
        <>
          <Dot />
          <span className="tabular-nums">{t.trending(article.trendingScore)}</span>
        </>
      )}
    </div>
  );
}

/** 같은 사건을 다룬 다른 매체 수 — "외 N곳"(en "+N more"). 대표 기사 하나로 묶인 보도의 폭을 보여 준다. */
function OtherSources({ count, locale }: { count?: number; locale: Locale }) {
  if (!count) return null;
  return <span className="sg-oth">{getMessages(metaMessages, locale).otherSources(count)}</span>;
}

/** 화제 지수 0–100 바. 길이 = 값/100 (고정 스케일). */
export function TrendBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span aria-hidden className="sg-trend">
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

/**
 * 태그 칩 목록. 비어 있으면 렌더하지 않는다.
 * max 를 주면 그 개수만 노출하고 나머지는 "+N" 으로 요약한다(미지정 시 전량 표시).
 * 영어판은 라틴 문자 태그만 보인다 — 한글 태그는 숨긴다(english-version-plan 기본값, 태그 정규화는 Phase 9).
 * 다 걸러져 비면 렌더하지 않는다. ko 는 그대로 전량.
 */
export function TagChips({
  tags: allTags,
  max,
  locale = "ko",
}: {
  tags: string[];
  max?: number;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const tags = visibleTags(allTags, locale);
  if (tags.length === 0) return null;
  const shown = typeof max === "number" ? tags.slice(0, max) : tags;
  const overflow = tags.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((tag) => (
        <span key={tag} className="sg-tag">
          #{tag}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-muted-foreground text-meta inline-flex items-center px-1.5 py-0.5">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/** 언어판에 보일 태그 — en 은 한글이 섞인 태그를 뺀다, ko 는 그대로. 칩을 감싸는 쪽이 빈 칸을 가릴 때 쓴다. */
export function visibleTags(tags: string[], locale: Locale = "ko"): string[] {
  return localeTags(tags, locale);
}
