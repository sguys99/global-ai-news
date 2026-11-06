import type { Metadata } from "next";
import { getLatestEditionRef } from "@/lib/db";
import { withLanguageAlternates } from "@/lib/pageMetadata";
import { editionMetadata } from "@/lib/site";
import { HomeView } from "@/views/HomeView";
import { languageAlternates, loadEdition, localeLatestEditionRef } from "@/views/data";

/**
 * 영어 홈 공유 미리보기 = 영어판 최신 호 1면(리드 영어 헤드라인·영어 썸네일, 설명 = 리드 줄을 뺀 영어 세 줄 요약 또는 서브).
 * 한국어 홈((ko)/page.tsx)과 같은 editionMetadata 에 locale="en" — 편집·세 줄 요약은 영어 호 고정 링크와 같은 로더.
 * `<title>`·meta description 은 영어 레이아웃 값 그대로(한국어 홈과 같다). canonical `/en/`, hreflang ko·en·x-default.
 */
export function generateMetadata(): Metadata {
  const ref = localeLatestEditionRef("en");
  const data = ref ? loadEdition("en", ref.date) : null;
  // 썸네일 창의 기준은 한국어와 같은 DB 최신 호 — 영어 최신 호가 하루 늦어도 같은 PNG 판정(og/en/edition)을 쓴다.
  const share = data
    ? editionMetadata(
        data.edition,
        data.ref,
        "/",
        getLatestEditionRef()?.date ?? null,
        data.brief,
        "en",
      )
    : {};
  return withLanguageAlternates(share, languageAlternates({ kind: "home" }));
}

/**
 * 영어 홈(`/en/` — 영어판 최신 호 지면 + 전체 기사 색인) 라우트. 본문은 한국어 홈과 같은 뷰(src/views/HomeView.tsx)에
 * locale="en" 만 넘긴다.
 */
export default function EnglishHome() {
  return <HomeView locale="en" />;
}
