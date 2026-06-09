/**
 * RSS 수집 어댑터. PRD §3.1.
 * rss-parser 로 피드를 파싱해 RawItem[] 으로 정규화한다.
 */
import Parser from "rss-parser";
import type { RawItem } from "../../../src/lib/types";

/** sources.json 의 소스 한 건 (Phase 1: rss 만 사용). */
export interface SourceConfig {
  id: string;
  name: string;
  kind: string;
  url: string;
  enabled: number;
}

/** content_raw 길이 상한 (LLM 입력 비용 가드와 별개로 저장 용량 제한). */
const MAX_CONTENT_CHARS = 2000;

/** HTML 태그 제거 + 공백 정리. RSS description 에는 마크업이 섞여 있다. */
export function stripHtml(input: string | undefined): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const parser = new Parser();

/** RSS 피드 한 개를 수집해 RawItem 배열로 반환한다. */
export async function fetchRss(source: SourceConfig): Promise<RawItem[]> {
  const feed = await parser.parseURL(source.url);
  const items: RawItem[] = [];

  for (const item of feed.items) {
    const url = item.link;
    const title = item.title;
    const dateStr = item.isoDate ?? item.pubDate;
    if (!url || !title || !dateStr) continue; // 필수 필드 누락 항목 스킵

    const publishedAt = new Date(dateStr);
    if (Number.isNaN(publishedAt.getTime())) continue;

    const contentRaw = stripHtml(item.contentSnippet ?? item.content).slice(0, MAX_CONTENT_CHARS);

    items.push({
      sourceId: source.id,
      url,
      title,
      contentRaw: contentRaw || undefined,
      publishedAt: publishedAt.toISOString(),
    });
  }

  return items;
}
