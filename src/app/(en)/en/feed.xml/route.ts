import { buildRssFeed } from "@/lib/seo";
import { loadFeedItems } from "@/views/data";

/**
 * 영어판 RSS(english-version-plan 6-2) — 정적 export 가 빌드타임 1회 생성 → out/en/feed.xml.
 * 한국어 피드(src/app/feed.xml)와 같은 창에서 영어판에 실린 기사만 — 영어 제목·요약·분야, `/en/article/<id>/` 링크.
 * 라우트 핸들러는 레이아웃을 거치지 않아 (en)/en 레이아웃과 겹치지 않는다. 한글 검사(en:hangul-check)가 out/en/**.xml 을 본다.
 */
export const dynamic = "force-static";

export function GET() {
  const { items, builtAt } = loadFeedItems("en");
  return new Response(buildRssFeed(items, builtAt, "en"), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
