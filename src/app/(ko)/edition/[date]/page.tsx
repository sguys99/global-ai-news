import type { Metadata } from "next";
import { getEditionRefs } from "@/lib/db";
import { formatLongDate } from "@/lib/labels";
import { SITE_NAME, editionMetadata, editionPath } from "@/lib/site";
import { EditionView } from "@/views/EditionView";
import { loadEdition } from "@/views/data";

/**
 * 호 고정 링크(`/edition/YYYY-MM-DD/`). 홈은 매일 새 호로 바뀌므로, 공유한 날의 지면을
 * 그대로 다시 열 수 있게 KST 날짜마다 그날 수집된 기사로 지면을 구성해 사전 생성한다.
 * 이 라우트는 경로 목록·메타만 두고 본문은 src/views/EditionView.tsx(언어판 공용).
 */
export function generateStaticParams() {
  return getEditionRefs().map((ref) => ({ date: ref.date }));
}

/** 목록 밖 날짜는 산출물에 없어 정적 404. */
export const dynamicParams = false;

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = loadEdition("ko", (await params).date);
  if (!data) return {};
  const { ref, edition, brief } = data;
  return {
    title: `${formatLongDate(ref.publishedAt)} AI 뉴스 브리핑 제${ref.issueNo}호 — ${SITE_NAME}`,
    ...editionMetadata(edition, ref, editionPath(ref.date), brief),
  };
}

export default async function EditionPage({ params }: Props) {
  return <EditionView locale="ko" date={(await params).date} />;
}
