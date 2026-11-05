import Link from "next/link";
import { notFound } from "next/navigation";
import { FrontPage, SectionBands, WeeklyRadarBand } from "@/components/Edition";
import { EditionPager } from "@/components/EditionPager";
import { IssueBrief } from "@/components/IssueBrief";
import { Masthead } from "@/components/Masthead";
import { StoryIndex } from "@/components/StoryIndex";
import { toListCards } from "@/lib/db";
import { issueStats } from "@/lib/edition";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import { editionMessages } from "@/lib/messages/edition";
import { loadEdition, loadWeeklyRadar } from "@/views/data";

/**
 * 호 고정 링크 지면(`/edition/YYYY-MM-DD/`) 본문 — 언어판 공용 뷰(영어판 Phase 3-3).
 * 홈은 매일 새 호로 바뀌므로, 공유한 날의 지면을 그대로 다시 열 수 있게 그날 수집된 기사로 지면을 구성한다.
 * 라우트는 generateStaticParams·메타만 두고 `<EditionView locale=… date=… />` 를 그린다. 목록 밖 날짜면 404.
 */
export function EditionView({ locale, date }: { locale: Locale; date: string }) {
  const data = loadEdition(locale, date);
  if (!data) notFound();
  const { ref, prev, next, edition, brief } = data;
  const t = getMessages(editionMessages, locale);
  // 색인(StoryIndex)은 클라이언트 컴포넌트라 props 가 페이지에 실린다 → 목록용 카드로.
  const index = toListCards(edition.issue);
  // 주간 레이더: 일요일 호만(아니면 null) — 그날 홈과 같은 함수·같은 입력이라 같은 밴드가 실린다.
  const weekly = loadWeeklyRadar(locale, ref.date);

  return (
    <>
      <Masthead
        issueNo={ref.issueNo}
        publishedAt={ref.publishedAt}
        stats={issueStats(edition.issue)}
        categories={edition.sections.map((s) => s.category)}
        weekly={Boolean(weekly)}
        indexLabel={t.index}
        locale={locale}
      />
      <IssueBrief lines={brief} locale={locale} />
      {next && (
        <p className="text-caption text-muted-foreground mx-auto max-w-[1240px] px-4 pt-4 md:px-8">
          {t.pastIssue}{" "}
          <Link
            href={localePath(locale, "/")}
            className="text-brand py-3.5 font-semibold underline-offset-4 hover:underline md:py-0"
          >
            {t.toToday}
          </Link>
        </p>
      )}
      <main className="mx-auto flex max-w-[1240px] flex-col gap-14 px-4 pb-16 md:gap-16 md:px-8">
        <FrontPage edition={edition} locale={locale} />
        {weekly && <WeeklyRadarBand weekly={weekly} locale={locale} />}
        <SectionBands sections={edition.sections} locale={locale} />
        <section id="all" aria-label={t.index} className="scroll-mt-20">
          <div className="border-rule mb-5 flex items-baseline gap-3 border-t-2 pt-3">
            <h2 className="text-display-md font-serif font-extrabold">{t.index}</h2>
            <span className="ed-cnt">{t.count(edition.issue.length)}</span>
          </div>
          <StoryIndex articles={index} />
        </section>
        <EditionPager prev={prev} next={next} locale={locale} />
      </main>
    </>
  );
}
