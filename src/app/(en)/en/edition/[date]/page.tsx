import type { Metadata } from "next";
import { getLatestEditionRef } from "@/lib/db";
import { englishEditionPageMetadata, withLanguageAlternates } from "@/lib/pageMetadata";
import { EditionView } from "@/views/EditionView";
import { languageAlternates, loadEdition, localeEditionDates } from "@/views/data";

/**
 * 영어 호 고정 링크(`/en/edition/YYYY-MM-DD/`). 한국어 라우트((ko)/edition/[date])와 같은 뷰에 locale="en" 을 넘긴다.
 * 경로 목록은 영어 기사가 있는 호만(`localeEditionDates("en")` — 보관 호 제외). 공유 썸네일 창은 한국어와 같은 DB 최신 호 기준.
 */
export function generateStaticParams() {
  return localeEditionDates("en").map((date) => ({ date }));
}

/** 목록 밖 날짜는 산출물에 없어 정적 404. */
export const dynamicParams = false;

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = loadEdition("en", (await params).date);
  if (!data) return {};
  return withLanguageAlternates(
    englishEditionPageMetadata(
      data.ref,
      data.edition,
      getLatestEditionRef()?.date ?? null,
      data.brief,
    ),
    languageAlternates({ kind: "edition", date: data.ref.date }),
  );
}

export default async function EnglishEditionPage({ params }: Props) {
  return <EditionView locale="en" date={(await params).date} />;
}
