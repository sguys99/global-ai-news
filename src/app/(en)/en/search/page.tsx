import type { Metadata } from "next";
import { ENGLISH_SEARCH_METADATA } from "@/lib/pageMetadata";
import { SearchView } from "@/views/SearchView";

/** 제목·설명만 — 공유 메타·canonical·hreflang 은 Phase 6. */
export const metadata: Metadata = ENGLISH_SEARCH_METADATA;

/** 영어 검색 페이지 라우트(`/en/search/`) — 메타만 두고 본문은 src/views/SearchView.tsx(언어판 공용). */
export default function EnglishSearchPage() {
  return <SearchView locale="en" />;
}
