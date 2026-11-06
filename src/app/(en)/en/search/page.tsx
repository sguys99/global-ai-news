import type { Metadata } from "next";
import { ENGLISH_SEARCH_METADATA, withLanguageAlternates } from "@/lib/pageMetadata";
import { SearchView } from "@/views/SearchView";
import { languageAlternates } from "@/views/data";

/** 제목·설명·공유 메타·canonical(`/en/search/`) + 한국어판 짝(hreflang ko·en·x-default). */
export const metadata: Metadata = withLanguageAlternates(
  ENGLISH_SEARCH_METADATA,
  languageAlternates({ kind: "search" }),
);

/** 영어 검색 페이지 라우트(`/en/search/`) — 메타만 두고 본문은 src/views/SearchView.tsx(언어판 공용). */
export default function EnglishSearchPage() {
  return <SearchView locale="en" />;
}
