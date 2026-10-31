/**
 * 홈 편집 지면 (DESIGN.md §3). 서버·클라 공용 프레젠테이션(훅 없음).
 * - FrontPage:    1면 — [리드 + 서브 3 + 오늘의 브리핑 3](8) / [지금 화제 Top 5 + 이 호의 지면](4), 그 아래 전폭 레이더
 * - BriefList:    오늘의 브리핑 — 서브 그리드 아래 가는 괘선으로 구분한 3행 목록
 * - RadarBand:    오픈소스·논문 레이더 — 비뉴스 ≤4건, 칸 수에 맞춘 열(1건은 가로 한 줄). 비면 띠 전체를 숨긴다
 * - TrendingList: 화제 순위(번호 = 실제 순위). 비뉴스 행은 매체명 대신 형식 배지
 * - IssueContents: 이 호의 지면 — 분야별 건수·1면 게재 수 차례(lg 이상 사이드바)
 * - SectionBands: 카테고리별 섹션 밴드(≤4건, 칸 수에 맞춘 열 — 대표 칸은 늘 1/3)
 */
import Link from "next/link";
import { FormatBadge, TrendBar } from "@/components/ArticleMeta";
import {
  StoryBrief,
  StoryLead,
  StoryRadar,
  StorySecondary,
  StorySectionItem,
} from "@/components/Story";
import { frontArticles, type Edition, type EditionSection } from "@/lib/edition";
import {
  CATEGORIES,
  FORMATS,
  FORMAT_DISPLAY_LABELS,
  categoryLabel,
  categorySlug,
  shortSourceName,
} from "@/lib/labels";
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
                seconds.length > 0 && "md:border-border md:mt-6 md:border-t md:pt-3.5",
              )}
            />
          )}
        </div>

        <div className="min-w-0">
          {trending.length > 0 && (
            <TrendingList
              articles={trending}
              className="animate-rise mt-10 [animation-delay:240ms] lg:mt-0 lg:border-l lg:pl-8"
            />
          )}
          <IssueContents
            edition={edition}
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
      <h2
        id="briefs-heading"
        className="text-meta text-foreground pb-1 font-bold tracking-[0.02em] md:pb-0.5"
      >
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

/** 레이더 띠 칸 수별 열 구성(md 이상). 4건은 lg 4열/md 2열, 2·3건은 그 수만큼 같은 폭 열 — 빈 열을 남기지 않는다. */
const RADAR_COLS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
};

/** 칸 사이 세로 헤어라인(md 이상) — 줄의 첫 칸을 뺀 칸 왼쪽에 긋는다. */
const RADAR_DIVIDERS: Record<number, string> = {
  2: "md:[&:nth-child(2)]:border-l md:[&:nth-child(2)]:pl-5 md:last:pr-0",
  3: "md:[&:nth-child(n+2)]:border-l md:[&:nth-child(n+2)]:pl-5 md:last:pr-0",
  4: "md:[&:nth-child(2n)]:border-l md:[&:nth-child(2n)]:pl-5 lg:last:pr-0 lg:[&:nth-child(n+2)]:border-l lg:[&:nth-child(n+2)]:pl-5",
};

/** 레이더 띠 보조 문구 — 실린 형식만 화면 표시명으로("이번 호의 저장소·논문"). */
export function radarSubtitle(articles: Pick<ArticleCard, "format">[]): string {
  const formats = FORMATS.filter((f) => f !== "news" && articles.some((a) => a.format === f));
  return formats.length > 0
    ? `이번 호의 ${formats.map((f) => FORMAT_DISPLAY_LABELS[f]).join("·")}`
    : "";
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
function RadarBand({ articles, className }: { articles: ArticleCard[]; className?: string }) {
  const n = Math.min(articles.length, 4);
  const subtitle = radarSubtitle(articles);
  return (
    <section aria-labelledby="radar-heading" className={cn("min-w-0", className)}>
      <div className="border-rule mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t-2 pt-3">
        <h2
          id="radar-heading"
          className="text-display-md font-serif font-extrabold whitespace-nowrap"
        >
          오픈소스·논문 레이더
        </h2>
        {subtitle && <span className="text-meta text-muted-foreground">{subtitle}</span>}
      </div>
      {n === 1 ? (
        // relative: 카드 안 sr-only(absolute) 문구의 기준 상자.
        <ul className="relative">
          <li className="min-w-0">
            <StoryRadar article={articles[0]} wide />
          </li>
        </ul>
      ) : (
        <ul
          className={cn(
            // relative: 카드 안 sr-only(position:absolute) 문구의 기준 상자를 스크롤러로 묶는다. 없으면 초기 포함 블록 기준으로
            // 스크롤러 클립을 벗어나 화면 오른쪽에 놓여 페이지 폭을 늘린다(360px 에서 845px).
            // 모바일: 가로로 흐르는 2행 그리드(카드 폭 64%) — 카드마다 [본문 | 메타 레일] 2행을 subgrid 로 이어
            // 레일 헤어라인을 같은 높이에 맞춘다(수치 줄이 접힌 카드가 있어도). md 이상은 칸 수별 열(RADAR_COLS).
            "relative -mx-4 grid snap-x snap-mandatory scroll-px-4 auto-cols-[64%] grid-flow-col grid-rows-[auto_auto] gap-y-2.5 overflow-x-auto overscroll-x-contain px-4",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "md:mx-0 md:snap-none md:auto-cols-auto md:grid-flow-row md:grid-rows-none md:gap-y-7 md:overflow-visible md:px-0",
            RADAR_COLS[n],
          )}
        >
          {articles.slice(0, 4).map((a) => (
            <li
              key={a.id}
              className={cn(
                "border-border min-w-0 snap-start pr-4 md:pr-5",
                // 카드(StoryRadar)의 본문·레일 2행을 띠의 행 트랙에 잇는 subgrid — 레일 헤어라인 정렬용.
                "row-span-2 grid grid-rows-subgrid gap-y-2.5",
                "max-md:[&:nth-child(n+2)]:border-l max-md:[&:nth-child(n+2)]:pl-4",
                RADAR_DIVIDERS[n],
              )}
            >
              <StoryRadar article={a} />
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
}: {
  articles: ArticleCard[];
  className?: string;
}) {
  return (
    <aside aria-labelledby="trending-heading" className={cn("border-border min-w-0", className)}>
      <div className="border-rule flex items-baseline justify-between border-b-2 pb-2.5">
        <h2
          id="trending-heading"
          className="font-serif text-2xl leading-[1.2] font-extrabold tracking-[-0.04em]"
        >
          지금 화제
        </h2>
        <span className="text-label text-muted-foreground">커뮤니티 반응 지수 0–100</span>
      </div>
      <ol>
        {articles.map((a, i) => (
          <li key={a.id}>
            <Link
              href={`/article/${a.id}`}
              className="story-link border-border focus-visible:ring-ring grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 border-b py-3.5 outline-none focus-visible:ring-2"
            >
              <span
                className={cn(
                  "row-span-2 font-serif text-[1.875rem] leading-none tracking-[-0.04em] tabular-nums",
                  i < 3 ? "text-brand font-bold" : "text-muted-foreground font-medium",
                )}
              >
                {i + 1}
              </span>
              <span className="headline line-clamp-2 text-[0.9375rem] leading-[1.45] font-semibold">
                {a.titleKo || a.titleOriginal}
              </span>
              <span className="text-label text-muted-foreground flex items-center gap-2">
                {/* 비뉴스(저장소·모델·논문)는 매체명(GitHub·Hugging Face) 대신 형식 배지 — 시안 결정 ⑥ */}
                {a.format === "news" ? (
                  <span className="shrink-0">{shortSourceName(a.source.name)}</span>
                ) : (
                  <FormatBadge format={a.format} />
                )}
                <TrendBar value={a.trendingScore} />
                <span className="text-foreground-soft min-w-[2ch] text-right font-semibold tabular-nums">
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
export function issueContents(edition: Edition): IssueContentsRow[] {
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
function IssueContents({ edition, className }: { edition: Edition; className?: string }) {
  const rows = issueContents(edition);
  if (rows.length === 0) return null;
  return (
    <nav aria-labelledby="contents-heading" className={className}>
      <div className="border-rule flex items-baseline justify-between border-b-2 pb-2">
        <h2
          id="contents-heading"
          className="font-serif text-xl leading-[1.2] font-extrabold tracking-[-0.04em]"
        >
          이 호의 지면
        </h2>
        <span className="text-label text-muted-foreground">건수 · 1면</span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.category}>
            <a
              href={r.href}
              className="story-link border-border text-caption focus-visible:ring-ring flex items-baseline gap-2 border-b py-[9px] leading-[1.4] outline-none focus-visible:ring-2"
            >
              <span className="headline font-semibold">{categoryLabel(r.category)}</span>
              <span
                aria-hidden
                className="border-input flex-1 translate-y-[3px] self-center border-b border-dotted"
              />
              <span className="font-semibold tabular-nums">{r.count}건</span>
              <span className="text-label text-muted-foreground w-[4.2em] text-right tabular-nums">
                {r.onFront > 0 && `1면 ${r.onFront}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
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

function SectionBand({ section, timeBase }: { section: EditionSection; timeBase?: string }) {
  const slug = categorySlug(section.category);
  const headingId = `section-${slug}-heading`;
  const items = section.items.slice(0, 4);
  const n = items.length;
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
          className="text-meta text-brand focus-visible:ring-ring -my-3 ml-auto inline-flex min-h-11 items-center font-semibold whitespace-nowrap outline-none hover:underline focus-visible:ring-2 md:my-0 md:min-h-0"
        >
          이 분야 전체 기사 →
        </Link>
      </div>
      <div className={cn("grid grid-cols-1", SECTION_GRID[n])}>
        {items.map((a, i) => (
          <div
            key={a.id}
            className={cn(
              "border-border min-w-0 py-4 first:pt-0 max-md:border-t max-md:first:border-t-0 md:py-0",
              SECTION_CELLS[n]?.[i],
            )}
          >
            <StorySectionItem article={a} featured={i === 0} wide={n === 1} timeBase={timeBase} />
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
