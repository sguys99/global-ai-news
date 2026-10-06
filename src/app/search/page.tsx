import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchClient } from "@/components/SearchClient";
import { getActiveTags, getSourcesWithCounts } from "@/lib/db";
import { SITE_DESCRIPTION, SITE_NAME, shareMetadata } from "@/lib/site";

export const metadata: Metadata = shareMetadata({
  title: `기사 찾기 — ${SITE_NAME}`,
  description: SITE_DESCRIPTION,
  path: "/search/",
});

/**
 * 검색 페이지 = 정적 셸 + 클라이언트 검색(정적 export).
 * 빌드타임엔 소스·태그(필터 칩·추천 검색어)만 조회하고, 실제 검색은 SearchClient 가
 * search-index.json 을 fetch 해 FlexSearch 로 수행한다. useSearchParams 사용 →
 * 정적 export에서 <Suspense> 경계 필수.
 */
export default function SearchPage() {
  const sources = getSourcesWithCounts();
  const tags = getActiveTags(8);

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pt-6 pb-16 md:px-8 md:pt-10">
      <header className="flex flex-col gap-1">
        <span className="text-meta text-brand font-bold">검색</span>
        <h1 className="text-display-lg font-serif font-extrabold">기사 찾기</h1>
      </header>

      <Suspense fallback={null}>
        <SearchClient sources={sources} tags={tags} />
      </Suspense>
    </main>
  );
}
