import { buildSitemapIndex, planSitemaps } from "@/lib/seo";
import { loadSitemapInput } from "@/views/data";

/**
 * 사이트맵 인덱스 — 정적 export 가 빌드타임 1회 생성 → out/sitemap.xml. Search Console·서치어드바이저에 제출한 주소 그대로
 * `<sitemapindex>` 를 내고, URL 은 조각 파일(src/app/sitemaps/[file] — 두 언어판 홈·검색 `pages.xml`, 언어 × 연도
 * `ko-2026.xml`·`en-2026.xml`)에 싣는다. 나누는 규칙은 src/lib/seo.ts `planSitemaps`.
 * Next 메타데이터 라우트(sitemap.ts·generateSitemaps)는 인덱스 파일을 내지 않아 라우트 핸들러로 둔다.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildSitemapIndex(planSitemaps(loadSitemapInput())), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
