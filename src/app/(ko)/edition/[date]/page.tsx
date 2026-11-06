import type { Metadata } from "next";
import { getLatestEditionRef } from "@/lib/db";
import { editionPageMetadata, withLanguageAlternates } from "@/lib/pageMetadata";
import { EditionView } from "@/views/EditionView";
import { languageAlternates, loadEdition, localeEditionDates } from "@/views/data";

/**
 * 호 고정 링크(`/edition/YYYY-MM-DD/`). 홈은 매일 새 호로 바뀌므로, 공유한 날의 지면을
 * 그대로 다시 열 수 있게 KST 날짜마다 그날 수집된 기사로 지면을 구성해 사전 생성한다.
 * 이 라우트는 경로 목록·메타만 두고 본문은 src/views/EditionView.tsx(언어판 공용).
 */
export function generateStaticParams() {
  // 보관 호(최신 호보다 90일 이상 앞, src/lib/archive.ts)는 빌드 후처리가 가벼운 보관 지면으로 쓴다.
  // 경로 목록은 언어판 공용 `localeEditionDates`(src/views/data.ts) — 영어 라우트도 같은 함수를 부른다.
  return localeEditionDates("ko").map((date) => ({ date }));
}

/** 목록 밖 날짜는 산출물에 없어 정적 404. */
export const dynamicParams = false;

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = loadEdition("ko", (await params).date);
  if (!data) return {};
  const { ref, edition, brief } = data;
  return withLanguageAlternates(
    editionPageMetadata(ref, edition, getLatestEditionRef()?.date ?? null, brief),
    languageAlternates({ kind: "edition", date: ref.date }),
  );
}

export default async function EditionPage({ params }: Props) {
  return <EditionView locale="ko" date={(await params).date} />;
}
