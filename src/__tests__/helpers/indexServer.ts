import { vi } from "vitest";
import { feedIndexFromArticles } from "../../../scripts/export-feed-index";
import { searchIndexFromArticles } from "../../../scripts/export-search-index";
import type { BuiltIndex } from "../../../scripts/lib/indexShards";
import type { ArticleCard } from "@/lib/types";

/**
 * 색인 조각 가짜 서버(테스트 전용) — export 스크립트와 같은 순수 함수로 목록·조각을 만들고, `fetch` 를
 * `/<kind>/<locale>/<file>?v=…` 경로로 받아 돌려준다. 받은 경로는 `requested` 에 남는다(쿼리 제외).
 */
export function indexServer(
  articles: readonly ArticleCard[],
  issueDateOf: (a: ArticleCard) => string,
) {
  const dates = new Map(articles.map((a) => [a.id, issueDateOf(a)]));
  const built: Record<string, BuiltIndex> = {
    "feed-index": feedIndexFromArticles(articles, dates),
    "search-index": searchIndexFromArticles(articles, dates),
  };
  const requested: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "http://test");
    requested.push(url.pathname);
    const [, kind, locale, file] = url.pathname.split("/");
    const b = built[kind];
    if (!b || b.manifest.locale !== locale) return new Response("not found", { status: 404 });
    if (file === "manifest.json") return new Response(JSON.stringify(b.manifest));
    const shard = b.shards.find((s) => `${s.month}.json` === file);
    return shard
      ? new Response(JSON.stringify(shard.rows))
      : new Response("not found", { status: 404 });
  });
  return { built, requested, fetchMock };
}
