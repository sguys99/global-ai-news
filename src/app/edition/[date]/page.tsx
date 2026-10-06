import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FrontPage, SectionBands } from "@/components/Edition";
import { EditionPager } from "@/components/EditionPager";
import { Masthead } from "@/components/Masthead";
import { StoryIndex } from "@/components/StoryIndex";
import { getArticlesUntil, getEditionRefs } from "@/lib/db";
import { buildEdition } from "@/lib/edition";
import { formatLongDate } from "@/lib/labels";
import { SITE_NAME, editionMetadata } from "@/lib/site";

/**
 * 호 고정 링크(`/edition/YYYY-MM-DD/`). 홈은 매일 새 호로 바뀌므로, 공유한 날의 지면을
 * 그대로 다시 열 수 있게 KST 날짜마다 그날 마감 시점 기사로 지면을 재구성해 사전 생성한다.
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
    edition: buildEdition(getArticlesUntil(ref.cutoff)),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = loadEdition((await params).date);
  if (!data) return {};
  const { ref, edition } = data;
  return {
    title: `${formatLongDate(ref.publishedAt)} 제${ref.issueNo}호 — ${SITE_NAME}`,
    ...editionMetadata(edition, ref),
  };
}

export default async function EditionPage({ params }: Props) {
  const data = loadEdition((await params).date);
  if (!data) notFound();
  const { ref, prev, next, edition } = data;
  // 색인(StoryIndex)은 클라이언트 컴포넌트라 props 가 페이지 페이로드에 실린다
  // → 상세 전용 원문 발췌는 빼서 호 페이지가 날마다 쌓이는 용량을 줄인다.
  const index = edition.issue.map((a) => ({ ...a, contentRaw: undefined }));

  return (
    <>
      <Masthead
        issueNo={ref.issueNo}
        publishedAt={ref.publishedAt}
        total={edition.issue.length}
        sourceCount={new Set(edition.issue.map((a) => a.source.id)).size}
        categories={edition.sections.map((s) => s.category)}
        indexLabel="이 호의 기사"
      />
      {next && (
        <p className="text-caption text-muted-foreground mx-auto max-w-[1240px] px-4 pt-4 md:px-8">
          지난 호 지면입니다.{" "}
          <Link href="/" className="text-brand font-semibold underline-offset-4 hover:underline">
            오늘의 지면 보기 →
          </Link>
        </p>
      )}
      <main className="mx-auto flex max-w-[1240px] flex-col gap-14 px-4 pb-16 md:gap-16 md:px-8">
        <FrontPage edition={edition} />
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
