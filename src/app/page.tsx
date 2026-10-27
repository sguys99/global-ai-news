import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedClient } from "@/components/FeedClient";
import { FeedView } from "@/components/FeedView";
import {
  getActiveTags,
  getEditionRefs,
  getFeed,
  getIssueArticles,
  getSourcesWithCounts,
  toListCards,
} from "@/lib/db";
import type { EditionRef } from "@/lib/db";
import { buildEdition } from "@/lib/edition";
import { editionMetadata } from "@/lib/site";
import type { ArticleCard } from "@/lib/types";

/**
 * 홈의 "이번 호": 기사가 있는 가장 최근 호. 공개 기사 0건으로 발행된 회차가 1면을 비우지 않도록
 * 최신 호부터 거슬러 올라가며 고른다. 다른 호의 기사는 섞지 않는다.
 */
function getHomeIssue(): { ref: EditionRef; articles: ArticleCard[] } | null {
  for (const ref of getEditionRefs().reverse()) {
    const articles = getIssueArticles(ref.date);
    if (articles.length > 0) return { ref, articles };
  }
  return null;
}

/** 홈 공유 미리보기 = 이번 호 1면(리드 헤드라인 제목·썸네일). */
export function generateMetadata(): Metadata {
  const issue = getHomeIssue();
  if (!issue) return {};
  return editionMetadata(buildEdition(issue.articles), issue.ref, "/");
}

export default function Home() {
  // 빌드타임 1회 SSG: 누적 카드(전체 기사 색인·필터용)·소스·태그와 이번 호 정보를 클라이언트 셸에 넘긴다.
  // 이번 호 카드는 중복 전송하지 않고 id 만 넘겨 FeedView 가 누적 목록에서 골라 쓴다.
  // 필터/정렬은 FeedClient가 URL 쿼리로 브라우저에서 수행한다(정적 export 제약).
  const articles = toListCards(getFeed());
  const sources = getSourcesWithCounts();
  const tags = getActiveTags(8);
  const issue = getHomeIssue();
  const editionInfo = {
    issueNo: issue?.ref.issueNo ?? 0,
    publishedAt: issue?.ref.publishedAt ?? null,
  };
  const issueIds = issue?.articles.map((a) => a.id) ?? [];
  const props = { articles, issueIds, sources, tags, editionInfo };

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
