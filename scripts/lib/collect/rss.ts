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
  /** 1회 신규 후보 상한(화제 점수 → 최신 순). 기사가 많은 소스가 선별 풀을 독식하지 않게 한다. 미지정 시 무제한. */
  maxItems?: number;
}

/** content_raw 길이 상한 (LLM 입력 비용 가드와 별개로 저장 용량 제한). */
const MAX_CONTENT_CHARS = 2000;

/**
 * 수집 기간 창. 일부 피드(OpenAI·HF Blog 등)는 전체 아카이브를 노출하는데, RSS 는
 * trending_score 가 0 이라 오래된 항목이 MAX_ITEMS_PER_RUN 예산을 잠식한다.
 */
const LOOKBACK_MS = 7 * 24 * 3600 * 1000;

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

interface Feed {
  pubDate?: string;
  lastBuildDate?: string;
  items: Parser.Item[];
}

// 채널 pubDate/lastBuildDate: 항목 날짜가 없는 피드(GitHub Trending RSS 등)의 발행 시각 대체값.
const parser = new Parser<Omit<Feed, "items">>({
  customFields: { feed: ["pubDate", "lastBuildDate"] },
});

/** 파싱된 피드를 RawItem 배열로 정규화한다 (기간 창 밖·필수 필드 누락 항목 제외). */
export function feedToRawItems(feed: Feed, source: SourceConfig, now = Date.now()): RawItem[] {
  const items: RawItem[] = [];
  const feedDate = feed.pubDate ?? feed.lastBuildDate;

  for (const item of feed.items) {
    const url = item.link;
    const title = item.title;
    const dateStr = item.isoDate ?? item.pubDate ?? feedDate;
    if (!url || !title || !dateStr) continue; // 필수 필드 누락 항목 스킵

    const publishedAt = new Date(dateStr);
    if (Number.isNaN(publishedAt.getTime())) continue;
    if (now - publishedAt.getTime() > LOOKBACK_MS) continue; // 기간 창 밖

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

/** 요청 헤더·타임아웃은 rss-parser parseURL 기본값과 같게 둔다(피드 서버가 보는 요청 불변). */
const FEED_HEADERS = { "User-Agent": "rss-parser", Accept: "application/rss+xml" };
const FEED_TIMEOUT_MS = 60_000;

/** Content-Type 의 charset 으로 본문을 디코딩한다(미지정·미지원이면 UTF-8). */
function decodeBody(buf: ArrayBuffer, contentType: string | null): string {
  const charset = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

/**
 * RSS 피드 한 개를 수집해 RawItem 배열로 반환한다.
 *
 * 다운로드는 parser.parseURL 대신 fetch 로 한다. parseURL(node:http)은 4xx 응답 본문을
 * 읽지 않고 reject 해, Node 19+ 기본 keep-alive 소켓이 열린 채 남아 프로세스가 끝나지
 * 않는다(2026-10-07 수집 잡이 Substack 403 이후 70분 멈춰 타임아웃 → 결과 미커밋).
 * fetch(undici)는 유휴 소켓이 이벤트 루프를 붙잡지 않으며, 실패 응답도 본문을 정리한다.
 */
export async function fetchRss(source: SourceConfig): Promise<RawItem[]> {
  const res = await fetch(source.url, {
    headers: FEED_HEADERS,
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Status code ${res.status}`);
  }
  const xml = decodeBody(await res.arrayBuffer(), res.headers.get("content-type"));
  return feedToRawItems(await parser.parseString(xml), source);
}
