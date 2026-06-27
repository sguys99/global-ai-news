import { Suspense } from "react";
import { SearchClient } from "@/components/SearchClient";
import { getActiveTags, getSourcesWithCounts } from "@/lib/db";

/**
 * 검색 페이지 = 정적 셸 + 클라이언트 검색(정적 export).
 * 빌드타임엔 소스·태그(필터 칩 옵션)만 조회하고, 실제 검색은 SearchClient 가
 * search-index.json 을 fetch 해 FlexSearch 로 수행한다. useSearchParams 사용 →
 * 정적 export에서 <Suspense> 경계 필수(Phase 1과 동일).
 */
export default function SearchPage() {
  const sources = getSourcesWithCounts();
  const tags = getActiveTags(8);

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-6 md:px-6 md:py-12">
      <h1 className="text-display-md font-semibold tracking-tight">기사 검색</h1>

      <Suspense fallback={null}>
        <SearchClient sources={sources} tags={tags} />
      </Suspense>
    </main>
  );
}
