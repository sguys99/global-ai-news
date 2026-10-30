import Link from "next/link";
import { FrontPage, SectionBands } from "@/components/Edition";
import { FilterBar } from "@/components/FilterBar";
import { Masthead } from "@/components/Masthead";
import { StoryIndex } from "@/components/StoryIndex";
import { FilterSheet } from "@/components/mobile/FilterSheet";
import type { EditionInfo, FeedOptions } from "@/lib/db";
import { buildEdition, issueStats } from "@/lib/edition";
import { filterAndSortFeed, hasActiveFilter } from "@/lib/feedFilter";
import { categoryLabel, kstDateKey, shortSourceName } from "@/lib/labels";
import type { ArticleCard } from "@/lib/types";

/**
 * 피드 프레젠테이션(서버·클라 공용, 훅 없음).
 *
 * 정적 export에서 두 곳에서 쓰인다:
 *  1) page.tsx의 Suspense fallback — 서버가 기본 옵션(필터 없음)으로 **정적 HTML에 지면을 렌더**
 *     (LCP·SEO·"피드 정적 생성" 보장). useSearchParams를 쓰지 않으므로 bailout되지 않는다.
 *  2) FeedClient(클라) 내부 — URL 쿼리로 파싱한 옵션을 받아 동일 마크업으로 재렌더.
 *
 * 두 가지 모드 (DESIGN.md §3):
 *  - 편집 지면: 필터 없음 → 마스트헤드 · 1면 · 섹션 밴드 · 전체 기사
 *  - 필터 결과: 분야·매체·태그 중 하나라도 있음 → 결과 헤더 · 결과 목록
 */
export function FeedView({
  articles,
  issueIds,
  sources,
  tags,
  options,
  editionInfo,
  initialDelayGap,
}: {
  /** 누적 기사 전체 — 전체 기사 색인·필터 결과용. */
  articles: ArticleCard[];
  /** 이번 호(그날 수집분) 기사 id — 1면·섹션 밴드는 이 기사로만 구성한다. */
  issueIds: number[];
  sources: { id: string; name: string }[];
  tags: string[];
  options: FeedOptions;
  editionInfo: EditionInfo;
  /** 빌드 시점(서버 page)이 계산한 발행 지연 일수. 정적 HTML 의 안내 줄 초기 상태. */
  initialDelayGap?: number;
}) {
  const visible = filterAndSortFeed(articles, options);
  const filtered = hasActiveFilter(options);

  if (articles.length === 0) {
    return (
      <main className="mx-auto max-w-[1240px] px-4 py-16 md:px-8">
        <p className="text-body text-muted-foreground">
          아직 수집된 기사가 없습니다. `npm run collect` 실행 후 다시 빌드하세요.
        </p>
      </main>
    );
  }

  if (filtered) {
    const sourceName = sources.find((s) => s.id === options.source)?.name;
    const parts = [
      options.category && categoryLabel(options.category),
      sourceName && shortSourceName(sourceName),
      options.tag && `#${options.tag}`,
    ].filter(Boolean);

    return (
      <main className="mx-auto max-w-[1240px] px-4 pt-6 pb-16 md:px-8 md:pt-10">
        <header className="border-rule flex flex-col gap-2 border-b-2 pb-4">
          <span className="text-meta text-brand font-bold">필터 결과</span>
          <h1 className="text-display-lg font-serif font-extrabold">{parts.join(" · ")}</h1>
          <div className="text-caption text-muted-foreground flex items-center gap-4">
            <span className="tabular-nums">{visible.length}건</span>
            <Link
              href="/"
              className="text-foreground focus-visible:ring-ring font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-2"
            >
              필터 모두 해제
            </Link>
          </div>
        </header>
        <AllStories
          visible={visible}
          sources={sources}
          tags={tags}
          options={options}
          heading={null}
        />
      </main>
    );
  }

  const issueIdSet = new Set(issueIds);
  const issueArticles = articles.filter((a) => issueIdSet.has(a.id));
  const edition = buildEdition(issueArticles);
  // 1면·섹션 바이라인 상대 시각의 정적 렌더 기준 = 호 발행 시각(마운트 후엔 실제 시각으로 갱신).
  const timeBase = editionInfo.publishedAt ?? undefined;
  // 발행 지연 안내: 초기값은 빌드 시점 계산(initialDelayGap), 마운트 후엔 브라우저 현재 시각으로 갱신(Masthead → IssueDelayNotice).
  const issueDate = editionInfo.publishedAt ? kstDateKey(editionInfo.publishedAt) : undefined;

  return (
    <>
      <Masthead
        issueNo={editionInfo.issueNo}
        publishedAt={editionInfo.publishedAt}
        stats={issueStats(issueArticles)}
        categories={edition.sections.map((s) => s.category)}
        delayNoticeIssueDate={issueDate}
        delayNoticeInitialGap={initialDelayGap}
      />
      <main className="mx-auto flex max-w-[1240px] flex-col gap-14 px-4 pb-16 md:gap-16 md:px-8">
        <FrontPage edition={edition} timeBase={timeBase} />
        <SectionBands sections={edition.sections} timeBase={timeBase} />
        <AllStories
          visible={visible}
          sources={sources}
          tags={tags}
          options={options}
          heading="전체 기사"
          cumulative={{ articles: visible.length, sources: sources.length }}
        />
      </main>
    </>
  );
}

/** 전체 기사 색인: 필터 바(데스크톱 인라인 / 모바일 시트) + 2열 엔트리 목록. */
function AllStories({
  visible,
  sources,
  tags,
  options,
  heading,
  cumulative,
}: {
  visible: ArticleCard[];
  sources: { id: string; name: string }[];
  tags: string[];
  options: FeedOptions;
  heading: string | null;
  /** 필터 없는 홈에서만 — 누적 기사·매체 수를 색인 머리에 둔다(마스트헤드는 호 기준 통계). */
  cumulative?: { articles: number; sources: number };
}) {
  return (
    <section id="all" aria-label={heading ?? "필터 결과 목록"} className="scroll-mt-20">
      {heading && (
        <div className="border-rule mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t-2 pt-3">
          <h2 className="text-display-md font-serif font-extrabold">{heading}</h2>
          <span className="text-meta text-muted-foreground tabular-nums">
            {cumulative
              ? `누적 ${cumulative.articles}건 · 매체 ${cumulative.sources}곳`
              : `${visible.length}건`}
          </span>
        </div>
      )}

      <div className="mt-5 mb-2 hidden md:block">
        <FilterBar current={options} sources={sources} tags={tags} anchor="#all" />
      </div>
      <div className="mt-4 mb-1 md:hidden">
        <FilterSheet current={options} sources={sources} tags={tags} anchor="#all" />
      </div>

      {visible.length === 0 ? (
        <p className="text-body text-muted-foreground py-10">
          조건에 맞는 기사가 없습니다. 필터를 해제해 보세요.
        </p>
      ) : (
        <StoryIndex
          key={`${options.category}|${options.source}|${options.tag}|${options.sort}`}
          articles={visible}
          hideCategory={Boolean(options.category)}
        />
      )}
    </section>
  );
}
