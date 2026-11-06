import type { Metadata } from "next";
import { withLanguageAlternates } from "@/lib/pageMetadata";
import { SITE_DESCRIPTION, SITE_NAME, shareMetadata } from "@/lib/site";
import { SearchView } from "@/views/SearchView";
import { languageAlternates } from "@/views/data";

export const metadata: Metadata = withLanguageAlternates(
  {
    title: `AI 뉴스 기사 찾기 — ${SITE_NAME}`,
    ...shareMetadata({
      title: `기사 찾기 — ${SITE_NAME}`,
      description: SITE_DESCRIPTION,
      path: "/search/",
    }),
  },
  languageAlternates({ kind: "search" }),
);

/** 한국어 검색 페이지 라우트 — 메타만 두고 본문은 src/views/SearchView.tsx(언어판 공용). */
export default function SearchPage() {
  return <SearchView locale="ko" />;
}
