/**
 * 기사 신호 프레젠테이션 컴포넌트 (DESIGN.md §4). 피드·검색·상세가 공유한다.
 * - CategoryKicker: 코발트 키커(한글 표시명)
 * - ImportanceMeter: 5칸 원형 도트 미터(4–5는 코발트)
 * - Byline: 소스 · 날짜 · 중요도 (+ 선택 화제 지수)
 * - TrendBar: 0–100 고정 스케일 수평 바
 * - TagChips: pill 태그 칩
 */
import { RelativeTime } from "@/components/RelativeTime";
import { categoryLabel, formatDate, shortSourceName } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ArticleCard } from "@/lib/types";

/** 카테고리 키커. category 가 비어 있으면 렌더하지 않는다. */
export function CategoryKicker({ category, className }: { category: string; className?: string }) {
  if (!category) return null;
  return (
    <span className={cn("text-meta text-brand font-bold tracking-[0.02em]", className)}>
      {categoryLabel(category)}
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
              ? "border-muted-foreground/70"
              : high
                ? "border-brand bg-brand"
                : "border-foreground bg-foreground",
          )}
        />
      ))}
    </span>
  );
}

function Dot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("size-0.5 shrink-0 rounded-full bg-current", className)} />
  );
}

/**
 * 소스 · 날짜 · 중요도 바이라인. showTrend 시 화제 지수를 덧붙인다.
 * compact: 좁은 칼럼용 — md 이상에서 소스를 첫 줄, 날짜·중요도를 둘째 줄로 고정해
 * 미터만 줄바꿈되는 것을 막는다(모바일은 1열이라 한 줄 유지).
 */
export function Byline({
  article,
  showTrend = false,
  fullSource = false,
  compact = false,
  showDate = true,
  timeBase,
  className,
}: {
  article: Pick<ArticleCard, "source" | "publishedAt" | "importance" | "trendingScore" | "related">;
  showTrend?: boolean;
  fullSource?: boolean;
  compact?: boolean;
  /** 날짜를 별도 칼럼에 이미 보여 주는 목록(StoryEntry)에서는 끈다. */
  showDate?: boolean;
  /**
   * 지정하면 날짜를 상대 시각(RelativeTime)으로 그린다 — 값은 정적 렌더 기준 시각(호 발행 ISO).
   * 홈 1면·섹션 전용. 상세·지난 호·검색은 생략해 절대 날짜를 유지한다(지난 호에서 "3시간 전"→"10.24"로 깜빡이지 않도록).
   */
  timeBase?: string;
  className?: string;
}) {
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
        <span className="text-foreground-soft max-w-full truncate font-semibold">
          {shortSourceName(article.source.name)}
          <OtherSources count={article.related?.length} />
        </span>
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
      <span className="text-foreground-soft font-semibold">
        {fullSource ? article.source.name : shortSourceName(article.source.name)}
        <OtherSources count={article.related?.length} />
      </span>
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
