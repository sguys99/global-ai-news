import type { Metadata } from "next";
import { getIssueArticles, getIssueBriefs, getLatestEditionRef } from "@/lib/db";
import { buildEdition, selectIssueBrief } from "@/lib/edition";
import { editionMetadata } from "@/lib/site";
import { HomeView } from "@/views/HomeView";

/** 홈 공유 미리보기 = 이번 호 1면(리드 헤드라인 제목·썸네일, 설명 = 세 줄 요약). */
export function generateMetadata(): Metadata {
  // 호 목록에는 기사가 있는 호만 있으므로 최신 호는 항상 비어 있지 않다(호가 없으면 null).
  const ref = getLatestEditionRef();
  if (!ref) return {};
  const edition = buildEdition(getIssueArticles(ref.date));
  // 홈은 최신 호 자신이라 썸네일 기간의 기준 날짜도 ref.date.
  return editionMetadata(
    edition,
    ref,
    "/",
    ref.date,
    selectIssueBrief(edition, getIssueBriefs(ref.date)),
  );
}

/** 한국어 홈(최신 호 지면 + 전체 기사 색인) 라우트 — 메타만 두고 본문은 src/views/HomeView.tsx(언어판 공용). */
export default function Home() {
  return <HomeView locale="ko" />;
}
