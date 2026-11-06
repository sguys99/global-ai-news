import { HomeView } from "@/views/HomeView";

/**
 * 영어 홈(`/en/` — 영어판 최신 호 지면 + 전체 기사 색인) 라우트. 제목·설명은 영어 레이아웃 metadata
 * (`SITE_TITLE_EN`·`SITE_DESCRIPTION_EN`) 그대로 — 공유 메타·hreflang·canonical 은 Phase 6.
 * 본문은 한국어 홈과 같은 뷰(src/views/HomeView.tsx)에 locale="en" 만 넘긴다.
 */
export default function EnglishHome() {
  return <HomeView locale="en" />;
}
