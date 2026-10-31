import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedClient } from "@/components/FeedClient";
import { FeedView } from "@/components/FeedView";
import {
  getActiveTags,
  getFeed,
  getLatestEditionRef,
  getIssueArticles,
  getSourcesWithCounts,
  getWeekRadarCandidates,
  toListCards,
} from "@/lib/db";
import { buildEdition } from "@/lib/edition";
import { INDEX_PAGE_SIZE, buildFeedIndex, feedIndexVersion } from "@/lib/feedIndex";
import { issueDelayDays } from "@/lib/labels";
import { editionMetadata } from "@/lib/site";
import { buildWeeklyRadar } from "@/lib/weeklyRadar";

/** 홈 공유 미리보기 = 이번 호 1면(리드 헤드라인 제목·썸네일). */
export function generateMetadata(): Metadata {
  // 호 목록에는 기사가 있는 호만 있으므로 최신 호는 항상 비어 있지 않다(호가 없으면 null).
  const ref = getLatestEditionRef();
  if (!ref) return {};
  return editionMetadata(buildEdition(getIssueArticles(ref.date)), ref, "/");
}

export default function Home() {
  // 빌드타임 1회 SSG: 이번 호 카드(1면·섹션 밴드)·전체 기사 색인 첫 페이지·소스·태그와 이번 호 정보를 클라이언트 셸에 넘긴다.
  // 페이지(정적 HTML·RSC 페이로드)에는 첫 화면이 그리는 만큼만 싣는다 — 누적 전체는 prebuild 가 만든
  // feed-index.json 으로 FeedClient 가 "더 보기"·필터·정렬 때 받는다(src/lib/feedIndex.ts). 필터/정렬은 브라우저에서 수행한다.
  const feed = buildFeedIndex(getFeed());
  const indexHead = feed.slice(0, INDEX_PAGE_SIZE);
  const indexTotal = feed.length;
  const sources = getSourcesWithCounts();
  const tags = getActiveTags(8);
  const ref = getLatestEditionRef();
  const editionInfo = { issueNo: ref?.issueNo ?? 0, publishedAt: ref?.publishedAt ?? null };
  const issueArticles = ref ? toListCards(getIssueArticles(ref.date)) : [];
  // 발행 지연 안내의 초기 상태 = 빌드 시점 판단. 빌드 자체가 낡았으면 정적 HTML 에 안내가 이미 들어간다.
  const initialDelayGap = ref ? issueDelayDays(ref.date, Date.now()) : 0;
  // 주간 레이더: 최신 호가 일요일일 때만(아니면 null). 호 고정 링크 지면과 같은 함수 — 그날 홈과 /edition/<일요일> 이 같다.
  const weekly = ref ? buildWeeklyRadar(getWeekRadarCandidates(ref.date), ref.date) : null;
  const props = { issueArticles, sources, tags, editionInfo, initialDelayGap, weekly };
  const index = { indexHead, indexTotal, indexVersion: feedIndexVersion(ref?.date, indexTotal) };

  /*
   * useSearchParams는 정적 export에서 Suspense 경계가 필수이고, 해당 하위 트리는
   * 클라이언트 전용으로 bailout된다. fallback에 기본 옵션 FeedView(서버 렌더)를 두어
   * 정적 HTML에 지면이 담기도록 한다(LCP·SEO). 기본 URL에선 fallback==클라 결과라 무깜빡임.
   */
  return (
    <Suspense
      fallback={<FeedView {...props} index={indexHead} indexTotal={indexTotal} options={{}} />}
    >
      <FeedClient {...props} {...index} />
    </Suspense>
  );
}
