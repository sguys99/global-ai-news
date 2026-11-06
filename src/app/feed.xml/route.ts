import { buildRssFeed } from "@/lib/seo";
import { loadFeedItems } from "@/views/data";

/** RSS 피드 — 정적 export 가 빌드타임 1회 생성 → out/feed.xml. 창(최신 호 기준 3일)은 views/data.ts `loadFeedItems`. */
export const dynamic = "force-static";

export function GET() {
  const { items, builtAt } = loadFeedItems("ko");
  return new Response(buildRssFeed(items, builtAt), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
