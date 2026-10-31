import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FrontPage, SectionBands, WeeklyRadarBand } from "@/components/Edition";
import { EditionPager } from "@/components/EditionPager";
import { Masthead } from "@/components/Masthead";
import { StoryIndex } from "@/components/StoryIndex";
import { getIssueArticles, getEditionRefs, getWeekRadarCandidates, toListCards } from "@/lib/db";
import { buildEdition, issueStats } from "@/lib/edition";
import { formatLongDate } from "@/lib/labels";
import { SITE_NAME, editionMetadata, editionPath } from "@/lib/site";
import { buildWeeklyRadar } from "@/lib/weeklyRadar";

/**
 * 호 고정 링크(`/edition/YYYY-MM-DD/`). 홈은 매일 새 호로 바뀌므로, 공유한 날의 지면을
 * 그대로 다시 열 수 있게 KST 날짜마다 그날 수집된 기사로 지면을 구성해 사전 생성한다.
 */
export function generateStaticParams() {
  return getEditionRefs().map((ref) => ({ date: ref.date }));
}

/** 목록 밖 날짜는 산출물에 없어 정적 404. */
export const dynamicParams = false;

type Props = { params: Promise<{ date: string }> };

function loadEdition(date: string) {
  const refs = getEditionRefs();
  const i = refs.findIndex((r) => r.date === date);
  if (i < 0) return null;
  const ref = refs[i];
  return {
    ref,
    prev: refs[i - 1] ?? null,
    next: refs[i + 1] ?? null,
    edition: buildEdition(getIssueArticles(ref.date)),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = loadEdition((await params).date);
  if (!data) return {};
  const { ref, edition } = data;
  return {
    title: `${formatLongDate(ref.publishedAt)} 제${ref.issueNo}호 — ${SITE_NAME}`,
    ...editionMetadata(edition, ref, editionPath(ref.date)),
  };
}

export default async function EditionPage({ params }: Props) {
  const data = loadEdition((await params).date);
  if (!data) notFound();
  const { ref, prev, next, edition } = data;
  // 색인(StoryIndex)은 클라이언트 컴포넌트라 props 가 페이지에 실린다 → 목록용 카드로.
  const index = toListCards(edition.issue);
  // 주간 레이더: 일요일 호만(아니면 null) — 그날 홈과 같은 함수·같은 입력이라 같은 밴드가 실린다.
  const weekly = buildWeeklyRadar(getWeekRadarCandidates(ref.date), ref.date);

  return (
    <>
      <Masthead
        issueNo={ref.issueNo}
        publishedAt={ref.publishedAt}
        stats={issueStats(edition.issue)}
        categories={edition.sections.map((s) => s.category)}
        weekly={Boolean(weekly)}
        indexLabel="이 호의 기사"
      />
      {next && (
        <p className="text-caption text-muted-foreground mx-auto max-w-[1240px] px-4 pt-4 md:px-8">
          지난 호 지면입니다.{" "}
          <Link
            href="/"
            className="text-brand py-3.5 font-semibold underline-offset-4 hover:underline md:py-0"
          >
            오늘의 지면 보기 →
          </Link>
        </p>
      )}
      <main className="mx-auto flex max-w-[1240px] flex-col gap-14 px-4 pb-16 md:gap-16 md:px-8">
        <FrontPage edition={edition} />
        {weekly && <WeeklyRadarBand weekly={weekly} />}
        <SectionBands sections={edition.sections} />
        <section id="all" aria-label="이 호의 기사" className="scroll-mt-20">
          <div className="border-rule mb-5 flex items-baseline gap-3 border-t-2 pt-3">
            <h2 className="text-display-md font-serif font-extrabold">이 호의 기사</h2>
            <span className="text-meta text-muted-foreground tabular-nums">
              {edition.issue.length}건
            </span>
          </div>
          <StoryIndex articles={index} />
        </section>
        <EditionPager prev={prev} next={next} />
      </main>
    </>
  );
}
