import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedClient } from "@/components/FeedClient";
import { FeedView } from "@/components/FeedView";
import {
  getActiveTags,
  getEditionInfo,
  getFeed,
  getSourcesWithCounts,
  toListCards,
} from "@/lib/db";
import { buildEdition } from "@/lib/edition";
import { editionMetadata } from "@/lib/site";

/** 홈 공유 미리보기 = 오늘의 1면(리드 헤드라인 제목·썸네일). */
export function generateMetadata(): Metadata {
  return editionMetadata(buildEdition(getFeed()), getEditionInfo(), "/");
}

export default function Home() {
  // 빌드타임 1회 SSG: 전체 카드·소스·태그·발행 정보를 조회해 클라이언트 셸에 넘긴다.
  // 필터/정렬은 FeedClient가 URL 쿼리로 브라우저에서 수행한다(정적 export 제약).
  const articles = toListCards(getFeed());
  const sources = getSourcesWithCounts();
  const tags = getActiveTags(8);
  const editionInfo = getEditionInfo();
  const props = { articles, sources, tags, editionInfo };

  /*
   * useSearchParams는 정적 export에서 Suspense 경계가 필수이고, 해당 하위 트리는
   * 클라이언트 전용으로 bailout된다. fallback에 기본 옵션 FeedView(서버 렌더)를 두어
   * 정적 HTML에 지면이 담기도록 한다(LCP·SEO). 기본 URL에선 fallback==클라 결과라 무깜빡임.
   */
  return (
    <Suspense fallback={<FeedView {...props} options={{}} />}>
      <FeedClient {...props} />
    </Suspense>
  );
}
