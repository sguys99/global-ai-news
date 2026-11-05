import { Suspense } from "react";
import { SearchClient } from "@/components/SearchClient";
import { getMessages, type Locale } from "@/lib/i18n";
import { searchMessages } from "@/lib/messages/search";
import { loadSearch } from "@/views/data";

/**
 * 검색 페이지 본문 = 정적 셸 + 클라이언트 검색(정적 export) — 언어판 공용 뷰(영어판 Phase 3-3).
 * 빌드타임엔 소스·태그(필터 칩·추천 검색어)만 조회하고(src/views/data.ts `loadSearch`), 실제 검색은 SearchClient 가
 * search-index/<언어>/ 월별 조각을 fetch 해 FlexSearch 로 수행한다. useSearchParams 사용 → 정적 export에서 <Suspense> 경계 필수.
 * SearchClient(클라이언트)는 언어를 LocaleProvider 컨텍스트로 읽는다.
 */
export function SearchView({ locale }: { locale: Locale }) {
  const { sources, tags, indexVersion } = loadSearch(locale);
  const t = getMessages(searchMessages, locale);

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pt-6 pb-16 md:px-8 md:pt-10">
      <header className="flex flex-col gap-1">
        <span className="text-meta text-brand font-bold">{t.kicker}</span>
        <h1 className="text-display-lg font-serif font-extrabold">{t.title}</h1>
      </header>

      <Suspense fallback={null}>
        <SearchClient sources={sources} tags={tags} indexVersion={indexVersion} />
      </Suspense>
    </main>
  );
}
