import type { Metadata } from "next";
import { withLanguageAlternates } from "@/lib/pageMetadata";
import { HomeView } from "@/views/HomeView";
import { languageAlternates } from "@/views/data";

/** 한국어 홈과의 언어판 짝(hreflang) — 언어 전환 링크가 읽는다. 공유 메타·canonical 은 Phase 6. */
export const metadata: Metadata = withLanguageAlternates({}, languageAlternates({ kind: "home" }));

/**
 * 영어 홈(`/en/` — 영어판 최신 호 지면 + 전체 기사 색인) 라우트. 제목·설명은 영어 레이아웃 metadata
 * (`SITE_TITLE_EN`·`SITE_DESCRIPTION_EN`) 그대로 — 공유 메타·canonical·x-default 는 Phase 6(ko·en hreflang 짝은 5-3).
 * 본문은 한국어 홈과 같은 뷰(src/views/HomeView.tsx)에 locale="en" 만 넘긴다.
 */
export default function EnglishHome() {
  return <HomeView locale="en" />;
}
