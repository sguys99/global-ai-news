/**
 * 기사 신호 프레젠테이션 컴포넌트 (DESIGN.md §4). 피드·검색·상세가 공유한다.
 * - CategoryKicker: 코발트 키커(한글 표시명)
 * - FormatBadge: 형식 배지(REPO·MODEL·PAPER) — 잉크 1px 아웃라인, 코발트 없음. 뉴스는 렌더하지 않는다
 * - ImportanceMeter: 5칸 원형 도트 미터(4–5는 코발트)
 * - Byline: (형식 배지) 소스 · 날짜 · 중요도 (+ 선택 화제 지수)
 * - TrendBar: 0–100 고정 스케일 수평 바
 * - TagChips: pill 태그 칩
 */
import { RelativeTime } from "@/components/RelativeTime";
import type { ReactNode } from "react";
import {
  FORMAT_BADGES,
  FORMAT_DISPLAY_LABELS,
  categoryLabel,
  formatDate,
  shortSourceName,
  type Format,
} from "@/lib/labels";
import { relatedCountOf } from "@/lib/feedIndex";
import { cn } from "@/lib/utils";
import type { ArticleCard, IndexCard } from "@/lib/types";

/** 카테고리 키커. category 가 비어 있으면 렌더하지 않는다. */
export function CategoryKicker({ category, className }: { category: string; className?: string }) {
  if (!category) return null;
  return (
    <span
      className={cn(
        "text-meta text-brand font-bold tracking-[0.02em] whitespace-nowrap",
        className,
      )}
    >
      {categoryLabel(category)}
    </span>
  );
}

/**
 * 형식 배지 REPO·MODEL·PAPER (시안 결정 ⑪). 10.5px 굵은 대문자, 잉크 1px 테두리, 각진 면 — 코발트는 쓰지 않는다
 * (단일 강조색 원칙: 코발트는 옆의 분야 키커 몫). 뉴스는 배지가 없다.
 * 대문자는 aria-hidden(읽기 어색하고 뜻도 좁다), 스크린리더에는 화면 표시명(FORMAT_DISPLAY_LABELS — 저장소·모델·논문)을
 * sr-only 로 읽힌다.
 * relative 는 sr-only(absolute)의 기준 상자 — 가로 스크롤러 안에서 클립을 벗어나 페이지 폭을 늘리지 않게.
 */
export function FormatBadge({ format, className }: { format: Format; className?: string }) {
  const badge = FORMAT_BADGES[format];
  if (!badge) return null;
  return (
    <span
      className={cn(
        "border-foreground text-foreground text-badge relative inline-flex h-[17px] shrink-0 items-center border px-[5px] pt-px font-sans font-bold tracking-[0.09em] whitespace-nowrap",
        className,
      )}
    >
      <span aria-hidden>{badge}</span>
      <span className="sr-only">{FORMAT_DISPLAY_LABELS[format]}</span>
    </span>
  );
}

/** 중요도 1–5 도트 미터. 0(미가공)이면 렌더하지 않는다. 색만이 아니라 칸 수·라벨로도 전달. */
export function ImportanceMeter({ value }: { value: number }) {
  if (value <= 0) return null;
  const high = value >= 4;
  return (
    <span
      role="img"
      aria-label={`중요도 ${value}/5`}
      className="inline-flex items-center gap-[3px]"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <i
          key={i}
          className={cn(
            "size-1.5 rounded-full border",
            i > value
              ? // 빈 칸 테두리 /80 — 종이(#f4f4f1) 위 3.4:1(비텍스트 AA 3:1). 시안의 70%는 2.8:1이라 올렸다.
                "border-muted-foreground/80"
              : high
                ? "border-brand bg-brand"
                : "border-foreground bg-foreground",
          )}
        />
      ))}
    </span>
  );
}

/** 바이라인 구분 점(2px). */
export function Dot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("size-0.5 shrink-0 rounded-full bg-current", className)} />
  );
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
  timeBase,
  prefix,
  className,
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
  /**
   * 지정하면 날짜를 상대 시각(RelativeTime)으로 그린다 — 값은 정적 렌더 기준 시각(호 발행 ISO).
   * 홈 1면·섹션 전용. 상세·지난 호·검색은 생략해 절대 날짜를 유지한다(지난 호에서 "3시간 전"→"10.24"로 깜빡이지 않도록).
   */
  timeBase?: string;
  className?: string;
}) {
  const source = (
    <span
      className={cn(
        "text-foreground-soft font-semibold",
        compact && "max-w-full truncate",
        truncateSource && "min-w-0 truncate",
        showFormat && "inline-flex items-center gap-[7px]",
      )}
    >
      {showFormat && <FormatBadge format={article.format} />}
      <span className={cn(compact && "min-w-0 truncate")}>
        {fullSource ? article.source.name : shortSourceName(article.source.name)}
        <OtherSources count={relatedCountOf(article)} />
      </span>
    </span>
  );
  const when = timeBase ? (
    <RelativeTime iso={article.publishedAt} base={timeBase} />
  ) : (
    <span className="tabular-nums">{formatDate(article.publishedAt)}</span>
  );
  if (compact) {
    return (
      <div
        className={cn(
          "text-meta text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1 md:flex-col md:items-start",
          className,
        )}
      >
        {prefix}
        {source}
        <Dot className="md:hidden" />
        <span className="flex items-center gap-2.5">
          {when}
          {article.importance > 0 && <ImportanceMeter value={article.importance} />}
        </span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "text-meta text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1",
        className,
      )}
    >
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
          <ImportanceMeter value={article.importance} />
        </>
      )}
      {showTrend && article.trendingScore > 0 && (
        <>
          <Dot />
          <span className="tabular-nums">화제 {article.trendingScore}</span>
        </>
      )}
    </div>
  );
}

/** 같은 사건을 다룬 다른 매체 수 — "외 N곳". 대표 기사 하나로 묶인 보도의 폭을 보여 준다. */
function OtherSources({ count }: { count?: number }) {
  if (!count) return null;
  return <span className="text-muted-foreground font-normal"> 외 {count}곳</span>;
}

/** 화제 지수 0–100 바. 길이 = 값/100 (고정 스케일). */
export function TrendBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span aria-hidden className="bg-border relative block h-0.5 flex-1 overflow-hidden">
      <span className="bg-brand absolute inset-y-0 left-0" style={{ width: `${pct}%` }} />
    </span>
  );
}

/**
 * 태그 칩 목록. 비어 있으면 렌더하지 않는다.
 * max 를 주면 그 개수만 노출하고 나머지는 "+N" 으로 요약한다(미지정 시 전량 표시).
 */
export function TagChips({ tags, max }: { tags: string[]; max?: number }) {
  if (tags.length === 0) return null;
  const shown = typeof max === "number" ? tags.slice(0, max) : tags;
  const overflow = tags.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((tag) => (
        <span
          key={tag}
          className="border-border text-foreground-soft rounded-pill text-meta inline-flex items-center border px-2.5 py-0.5"
        >
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
