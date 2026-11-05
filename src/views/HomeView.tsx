import { Suspense } from "react";
import { FeedClient, FeedFallback } from "@/components/FeedClient";
import { JsonLd } from "@/components/JsonLd";
import type { Locale } from "@/lib/i18n";
import { websiteJsonLd } from "@/lib/seo";
import { loadHome } from "@/views/data";

/**
 * 홈 본문(최신 호 지면 + 전체 기사 색인) — 언어판 공용 뷰(영어판 Phase 3-3).
 * 라우트((ko)/page.tsx, Phase 5 의 (en)/en/page.tsx)는 메타만 두고 `<HomeView locale=… />` 를 그린다.
 * 무엇을 싣는지는 로더(src/views/data.ts `loadHome`)가 정한다.
 */
export function HomeView({ locale }: { locale: Locale }) {
  const { feed, index } = loadHome(locale);

  /*
   * useSearchParams는 정적 export에서 Suspense 경계가 필수이고, 해당 하위 트리는
   * 클라이언트 전용으로 bailout된다. fallback에 기본 옵션 FeedView(FeedFallback)를 두어
   * 정적 HTML에 지면이 담기도록 한다(LCP·SEO). 기본 URL에선 fallback==클라 결과라 무깜빡임.
   * fallback 도 클라이언트 컴포넌트라 RSC 에는 렌더 트리 대신 props 가 실리고, FeedClient 와 같은 배열을 넘기므로 한 벌만 실린다.
   * 둘 다 locale 을 넘기지 않는다 — 레이아웃의 LocaleProvider 컨텍스트로 읽는다(props 는 RSC 에 실린다).
   */
  return (
    <>
      {/* 구조화 데이터는 아직 한국어 하나 — 언어별 값은 Phase 6. */}
      <JsonLd data={websiteJsonLd()} />
      <Suspense
        fallback={
          <FeedFallback {...feed} indexHead={index.indexHead} indexTotal={index.indexTotal} />
        }
      >
        <FeedClient {...feed} {...index} />
      </Suspense>
    </>
  );
}
