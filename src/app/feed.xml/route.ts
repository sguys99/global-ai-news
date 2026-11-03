import { getArticlesCollectedSince, getLatestEditionRef } from "@/lib/db";
import { buildRssFeed } from "@/lib/seo";

/** RSS 피드 — 정적 export 가 빌드타임 1회 생성 → out/feed.xml. */
export const dynamic = "force-static";

/** 최신 호 발행 시각 기준 최근 며칠 수집분(빌드 시각이 아니라 호 기준 — 같은 DB면 같은 피드). */
const FEED_WINDOW_DAYS = 3;
const DAY_MS = 24 * 3600 * 1000;

export function GET() {
  const latest = getLatestEditionRef();
  const items = latest
    ? getArticlesCollectedSince(
        new Date(Date.parse(latest.publishedAt) - FEED_WINDOW_DAYS * DAY_MS).toISOString(),
      )
    : [];
  return new Response(buildRssFeed(items, latest?.publishedAt ?? null), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
