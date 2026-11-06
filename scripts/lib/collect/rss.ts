/**
 * RSS 수집 어댑터. PRD §3.1.
 * rss-parser 로 피드를 파싱해 RawItem[] 으로 정규화한다.
 */
import Parser from "rss-parser";
import type { Category, Format, Region } from "../../../src/lib/labels";
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
  /** 형식(news|oss|model|paper). 미지정 시 news — sources.format 으로 동기화된다(lib/syncSources.ts). */
  format?: Format;
  /** 지역 — "kr" = 한국 매체, 미지정 = 해외. sources.region 으로 동기화된다(영어판 Korea Desk·KOREA 표시). */
  region?: Region;
  /** 영문 매체명(name 에 한글이 있는 소스만). sources.name_en 으로 동기화 — 미지정 시 영어판은 name 을 쓴다. */
  nameEn?: string;
  /** 키워드 사전 필터 목록 이름(configs/keyword-filters.json). 지정하면 키워드가 없는 항목을 수집 직후 버린다(collect.ts). */
  keywordFilter?: string;
  /**
   * 주력 분야 힌트(CATEGORIES 키, 현재 "physical" 만 사용). 선별 풀이 이 분야 후보를 따로 확보할 때 쓴다(Phase 3-5).
   * 설정 전용 — sources 테이블에 동기화하지 않는다. 기사 분야는 여전히 LLM 가공이 정한다.
   */
  topic?: Category;
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

/**
 * 미래 발행 시각 허용 폭. 피드 시계 오차·예약 발행을 감안해 1시간까지는 그대로 두고, 그보다 미래면
 * 시간대 해석이 틀린 것(예: KST 를 UTC 로 읽어 +9시간)으로 보고 수집 시각으로 깎는다.
 */
export const FUTURE_TOLERANCE_MS = 3600 * 1000;

/** 지역별 시간대 표기 없는 날짜의 기준 오프셋. 미지정(해외)은 UTC. */
const REGION_OFFSET: Record<Region, string> = { kr: "+09:00" };

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** "2026-11-06 09:00:00"·"2026-11-06T09:00"·"2026-11-06" — 시간대 표기 없는 ISO 류(ndsoft CMS: AI타임스·로봇신문). */
const NAIVE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?$/;
/** "Fri, 6 Nov 2026 09:33:03" — 끝에 시간대가 빠진 RFC 822 류. */
const NAIVE_RFC822 =
  /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * 피드 날짜 문자열 → Date. 시간대가 적힌 값은 그대로 해석하고, 시간대가 없는 값은 소스 지역의
 * 시간대(kr = Asia/Seoul +09:00, 미지정 = UTC)로 읽는다. rss-parser 의 isoDate 는 `new Date(문자열)`
 * 이라 시간대 없는 값을 실행 환경의 로컬 시간으로 읽는다 — CI(UTC)에서 한국 매체의 KST 시각이
 * 9시간 미래로 저장됐다(2026-10 ~ 11). 해석할 수 없으면 null.
 */
export function parseFeedDate(raw: string, region?: Region): Date | null {
  const s = raw.trim();
  const offset = (region && REGION_OFFSET[region]) ?? "Z";
  let iso: string | null = null;
  const m = NAIVE_ISO.exec(s);
  if (m) {
    const [, y, mo, d, h = "00", mi = "00", sec = "00", frac = ""] = m;
    iso = `${y}-${mo}-${d}T${h}:${mi}:${sec}${frac}${offset}`;
  } else {
    const r = NAIVE_RFC822.exec(s);
    const mon = r && MONTHS[r[2].toLowerCase()];
    if (r && mon) {
      const [, d, , y, h, mi, sec = "00"] = r;
      iso = `${y}-${mon}-${d.padStart(2, "0")}T${h}:${mi}:${sec}${offset}`;
    }
  }
  const date = new Date(iso ?? s);
  return Number.isNaN(date.getTime()) ? null : date;
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
    // 원문 문자열(pubDate·dc:date)을 먼저 본다 — isoDate 는 rss-parser 가 실행 환경 시간대로 만든 값이다.
    const dateStr = item.pubDate ?? (item as { date?: string }).date ?? item.isoDate ?? feedDate;
    if (!url || !title || !dateStr) continue; // 필수 필드 누락 항목 스킵

    let publishedAt = parseFeedDate(dateStr, source.region);
    if (!publishedAt) continue;
    if (now - publishedAt.getTime() > LOOKBACK_MS) continue; // 기간 창 밖
    // 수집 시각보다 한참 미래 = 시간대 해석 오류 — 화면에 "방금"·최신 정렬 1위로 뜨지 않게 수집 시각으로 깎는다.
    if (publishedAt.getTime() - now > FUTURE_TOLERANCE_MS) publishedAt = new Date(now);

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
