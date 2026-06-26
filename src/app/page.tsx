import { Suspense } from "react";
import { FeedClient } from "@/components/FeedClient";
import { FeedView } from "@/components/FeedView";
import { getActiveTags, getFeed, getSourcesWithCounts } from "@/lib/db";

export default function Home() {
  // 빌드타임 1회 SSG: 전체 카드·소스·태그를 조회해 클라이언트 셸에 넘긴다.
  // 필터/정렬은 FeedClient가 URL 쿼리로 브라우저에서 수행한다(정적 export 제약).
  const articles = getFeed();
  const sources = getSourcesWithCounts();
  const tags = getActiveTags(8);

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-6 md:px-6 md:py-12">
      <h1 className="text-display-md font-semibold tracking-tight">
        매일 한 곳에서 보는 글로벌 AI 뉴스
      </h1>

      {/*
       * useSearchParams는 정적 export에서 Suspense 경계가 필수이고, 해당 하위 트리는
       * 클라이언트 전용으로 bailout된다. fallback에 기본 옵션 FeedView(서버 렌더)를 두어
       * 정적 HTML에 카드가 담기도록 한다(LCP·SEO). 기본 URL에선 fallback==클라 결과라 무깜빡임.
       */}
      <Suspense
        fallback={<FeedView articles={articles} sources={sources} tags={tags} options={{}} />}
      >
        <FeedClient articles={articles} sources={sources} tags={tags} />
      </Suspense>
    </main>
  );
}
