import type { Metadata } from "next";
import { englishEditionPageMetadata, withLanguageAlternates } from "@/lib/pageMetadata";
import { EditionView } from "@/views/EditionView";
import { languageAlternates, loadEdition, localeEditionDates } from "@/views/data";

/**
 * 영어 호 고정 링크(`/en/edition/YYYY-MM-DD/`). 한국어 라우트((ko)/edition/[date])와 같은 뷰에 locale="en" 을 넘긴다.
 * 경로 목록은 영어 기사가 있는 호만(`localeEditionDates("en")` — 보관 호 제외). 메타는 제목·설명만(Phase 6 전).
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
    englishEditionPageMetadata(data.ref, data.brief),
    languageAlternates({ kind: "edition", date: data.ref.date }),
  );
}

export default async function EnglishEditionPage({ params }: Props) {
  return <EditionView locale="en" date={(await params).date} />;
}
