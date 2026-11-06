/**
 * 클라이언트 색인(검색·홈 전체 기사)의 월별 분할 — 파일 배치·행 인코딩·받기(영어판 Phase 4-2).
 * 결정 기록: docs/english-version/phase4/4-2-client-index.md.
 *
 * 누적 기사 전체를 한 JSON 으로 내보내면 2년 뒤 언어당 수 MB 를 첫 검색·첫 "더 보기"마다 받는다. 그래서 색인을
 * 기사의 **호 월**(created_at 의 KST 날짜 = 호 날짜의 'YYYY-MM')별 조각으로 나누고, 언어마다 목록(manifest)을 둔다.
 *
 *   public/<kind>/<locale>/manifest.json   목록: 월별 조각(건수·내용 해시)·매체 표·행 필드 이름(+ 홈은 색인 머리)
 *   public/<kind>/<locale>/<YYYY-MM>.json  조각: 그 달 기사 행 배열(기본 정렬 순)
 *
 * kind = "search-index"(검색) | "feed-index"(홈 전체 기사 색인). 영어판은 locale 만 "en" 인 같은 배치다.
 *
 * 행(row)은 키 이름을 되풀이하지 않는 배열이고, 매체 이름·형식은 매체 id 로 목록의 매체 표에서 찾는다(형식은 소스 속성).
 * 읽는 쪽은 `decodeRow` 한 곳에서 IndexCard 모양으로 되돌린다 — 컴포넌트·필터는 조각 형식을 모른다.
 *
 * 캐시: 목록 URL 에는 빌드 버전(`indexBuildVersion` — 최신 호 날짜·누적 건수)을, 조각 URL 에는 조각 내용 해시를 싣는다.
 * 지난 달 조각은 내용이 그대로면 URL 도 그대로라, 다음 날 빌드 뒤에도 브라우저 캐시(GitHub Pages 600초 + ETag 재검증)를 쓴다.
 */
import { compareDefaultOrder } from "@/lib/feedFilter";
import type { Locale } from "@/lib/i18n";
import { hasHangul, localeTags, toFormat, type Format, type Region } from "@/lib/labels";
import type { ArticleCard, IndexCard } from "@/lib/types";

/** 정적 export 서브경로(`/global-ai-news`)에서 수동 fetch는 basePath를 명시해야 한다(dev는 ""). */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** 색인 종류 = public/ 아래 디렉터리 이름. */
export type IndexKind = "search-index" | "feed-index";

/** 목록 형식 판. 행 모양·목록 키가 바뀌면 올린다(읽는 쪽은 다른 판을 실패로 본다). */
export const INDEX_SCHEMA = 1;

/** 목록 파일 이름. 조각은 `<YYYY-MM>.json`. */
export const MANIFEST_FILE = "manifest.json";

/**
 * 언어판이 읽는 색인의 언어 — 색인 파일을 고르는 단일 자리. 영어판은 영어 색인(`<kind>/en/` — 영어 제목·요약·
 * 영문 매체명·라틴 문자 태그, 영어 본문이 있는 기사만)을 읽는다(영어판 Phase 5-2).
 */
export const INDEX_LOCALE: Record<Locale, Locale> = { ko: "ko", en: "en" };

/** 홈 색인 행 필드(순서 = 배열 위치). title·summary 는 목록 언어의 제목·요약이다(ko 는 한국어, en 은 영어). */
export const FEED_ROW_FIELDS = [
  "id",
  "source",
  "title",
  "summary",
  "category",
  "tags",
  "trendingScore",
  "importance",
  "publishedAt",
  "relatedCount",
] as const;

/** 검색 색인 행 = 홈 색인 행 + 원제(검색 대상). */
export const SEARCH_ROW_FIELDS = [...FEED_ROW_FIELDS, "titleOriginal"] as const;

export const ROW_FIELDS: Record<IndexKind, readonly string[]> = {
  "feed-index": FEED_ROW_FIELDS,
  "search-index": SEARCH_ROW_FIELDS,
};

/** 조각 한 행 — 위치는 `FEED_ROW_FIELDS`·`SEARCH_ROW_FIELDS` 순서. 원제는 검색 색인에만 있다. */
export type IndexRow = [
  id: number,
  source: string,
  title: string,
  summary: string,
  category: string,
  tags: string[],
  trendingScore: number,
  importance: number,
  publishedAt: string,
  relatedCount: number,
  titleOriginal?: string,
];

/** 매체 표 한 칸(목록). 영문명·지역은 영어 목록에만 싣는다(지역 = KOREA 표시·Korea Desk). */
export interface ManifestSource {
  name: string;
  format: Format;
  nameEn?: string;
  region?: Region;
}

/** 월별 조각 한 칸. */
export interface ShardMonth {
  /** 호 월 'YYYY-MM'(KST). */
  month: string;
  /** 조각 기사 수. */
  count: number;
  /** 조각 내용 해시(캐시 키). */
  v: string;
}

/** 언어별 색인 목록(manifest.json). */
export interface IndexManifest {
  schema: typeof INDEX_SCHEMA;
  kind: IndexKind;
  locale: Locale;
  /** 행 필드 이름(읽는 쪽이 같은지 확인한다). */
  fields: string[];
  /** 누적 기사 수 = 조각 건수 합. */
  total: number;
  /** 매체 id → 이름·형식. */
  sources: Record<string, ManifestSource>;
  /** 월별 조각, 최신 달 먼저. 기사가 없는 달은 없다. */
  months: ShardMonth[];
  /**
   * 홈 색인만: 기본 정렬의 정적 HTML 첫 페이지 다음 몇 페이지(`FEED_HEAD_SIZE`건). 홈 기본 정렬은 화제순이라
   * 둘째 페이지부터 모든 달의 기사가 섞인다 — 월별 조각만으로는 "더 보기" 한 번에 모든 달을 받아야 하므로,
   * 앞 몇 페이지를 목록에 실어 "더 보기"는 목록 하나로 끝낸다(그 너머·필터·정렬은 모든 조각).
   */
  head?: IndexRow[];
}

/** 조각을 읽어 되돌린 카드 — 홈 색인은 IndexCard, 검색은 원제가 더 있다. 영어 목록은 제목·요약이 영어 필드에 들어간다. */
export type DecodedCard = IndexCard &
  Partial<Pick<ArticleCard, "titleOriginal" | "titleEn" | "summaryEn">>;

/** 검색 색인 카드(원제 포함). */
export type SearchCard = DecodedCard & { titleOriginal: string };

// ─── 월 ────────────────────────────────────────────────────────────────────

/** 호 날짜('YYYY-MM-DD', KST) → 호 월 'YYYY-MM'. */
export function issueMonthOf(issueDate: string): string {
  return issueDate.slice(0, 7);
}

/** 'YYYY-MM' 에서 달을 더하고 뺀다. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/**
 * 최근 N개월과 그 이전으로 나눈다. 기준은 목록의 최신 달(= 최신 호의 달 — 브라우저 시계가 아니다)이고,
 * 최근 = 최신 달 포함 N개 달력 월(기사가 없는 달도 센다). `since` 는 그 첫 달.
 */
export function splitRecentMonths(
  months: readonly ShardMonth[],
  n: number,
): { recent: ShardMonth[]; older: ShardMonth[]; since: string | null } {
  if (months.length === 0) return { recent: [], older: [], since: null };
  const newest = months.reduce((a, b) => (b.month > a ? b.month : a), months[0].month);
  const since = shiftMonth(newest, -(Math.max(1, n) - 1));
  return {
    recent: months.filter((m) => m.month >= since),
    older: months.filter((m) => m.month < since),
    since,
  };
}

// ─── 행 인코딩 ─────────────────────────────────────────────────────────────

/** 행으로 만들 카드 — 누적 카드(ArticleCard)·색인 카드(IndexCard) 모두. */
export type EncodableCard = Pick<
  ArticleCard,
  | "id"
  | "titleKo"
  | "summaryKo"
  | "category"
  | "tags"
  | "trendingScore"
  | "importance"
  | "publishedAt"
> &
  Partial<Pick<ArticleCard, "titleOriginal" | "titleEn" | "summaryEn" | "related">> & {
    source: { id: string };
    relatedCount?: number;
  };

/**
 * 카드 → 행. 제목·요약은 목록 언어의 것(ko: 한국어 — 제목이 비면 원제로 폴백, en: 영어).
 * 원제는 검색 색인(`withOriginal`)에만 싣는다. 묶인 보도는 개수만.
 * en 은 한글을 싣지 않는다: 태그는 라틴 문자만(영어판 기본값), 한국 매체의 한국어 원제는 빈 문자열(영어 검색 대상이 아니다).
 */
export function encodeRow(card: EncodableCard, locale: Locale, withOriginal: boolean): IndexRow {
  const en = locale === "en";
  const row: IndexRow = [
    card.id,
    card.source.id,
    en ? (card.titleEn ?? "") : card.titleKo || card.titleOriginal || "",
    en ? (card.summaryEn ?? "") : card.summaryKo,
    card.category,
    en ? localeTags(card.tags, "en") : card.tags,
    card.trendingScore,
    card.importance,
    card.publishedAt,
    card.related?.length ?? card.relatedCount ?? 0,
  ];
  if (withOriginal) {
    const original = card.titleOriginal ?? "";
    row.push(en && hasHangul(original) ? "" : original);
  }
  return row;
}

/** 행 → 카드(IndexCard 모양 + 검색은 원제). 매체 이름·형식은 목록의 매체 표에서. */
export function decodeRow(
  row: IndexRow,
  manifest: Pick<IndexManifest, "locale" | "sources">,
): DecodedCard {
  const [
    id,
    sourceId,
    title,
    summary,
    category,
    tags,
    trendingScore,
    importance,
    publishedAt,
    relatedCount,
    titleOriginal,
  ] = row;
  const src = manifest.sources[sourceId];
  const source: IndexCard["source"] = { id: sourceId, name: src?.name ?? sourceId };
  if (src?.nameEn) source.nameEn = src.nameEn;
  if (src?.region) source.region = src.region;
  const en = manifest.locale === "en";
  const card: DecodedCard = {
    id,
    source,
    titleKo: en ? "" : title,
    summaryKo: en ? "" : summary,
    category,
    format: toFormat(src?.format),
    tags,
    trendingScore,
    importance,
    publishedAt,
  };
  if (en) {
    card.titleEn = title;
    card.summaryEn = summary;
  }
  if (relatedCount) card.relatedCount = relatedCount;
  if (titleOriginal !== undefined) card.titleOriginal = titleOriginal;
  return card;
}

/**
 * 여러 조각의 카드를 기본 정렬(화제 → 게시 시각 → id) 순으로 합친다. 조각은 각자 기본 정렬 순이고 서로 겹치지 않으므로,
 * 결과는 빌드 시점 누적 전체 순서를 받은 달로 좁힌 것과 같다 — 이 순서 위에서 다른 정렬(안정 정렬)도 예전과 같은 결과를 낸다.
 */
export function mergeByDefaultOrder<T extends IndexCard>(lists: readonly (readonly T[])[]): T[] {
  return lists.flat().sort(compareDefaultOrder);
}

// ─── 주소 ──────────────────────────────────────────────────────────────────

/** 색인 빌드 버전(목록 캐시 키) — 최신 호 날짜와 누적 건수. 빌드마다 데이터가 바뀌므로(일일 수집) 목록 URL 에 싣는다. */
export function indexBuildVersion(latestIssueDate: string | undefined, total: number): string {
  return `${latestIssueDate ?? "none"}-${total}`;
}

/** 목록 URL(basePath 포함, 빌드 버전 쿼리). */
export function indexManifestUrl(kind: IndexKind, locale: Locale, version: string): string {
  return `${BASE_PATH}/${kind}/${locale}/${MANIFEST_FILE}?v=${encodeURIComponent(version)}`;
}

/** 조각 URL(basePath 포함, 내용 해시 쿼리). */
export function indexShardUrl(kind: IndexKind, locale: Locale, shard: ShardMonth): string {
  return `${BASE_PATH}/${kind}/${locale}/${shard.month}.json?v=${encodeURIComponent(shard.v)}`;
}

// ─── 받기 ──────────────────────────────────────────────────────────────────

const cache = new Map<string, Promise<unknown>>();

/**
 * JSON 받기 — 같은 URL 은 탭 수명 동안 한 번만 요청하고, 실패하면(HTTP·네트워크·`check` 가 던진 모양 오류)
 * 캐시에서 빼 다음 호출(다시 시도)이 새로 요청한다.
 */
function fetchJson(url: string, check: (data: unknown) => void): Promise<unknown> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`index ${res.status}: ${url}`);
      return res.json() as Promise<unknown>;
    })
    .then((data) => {
      check(data);
      return data;
    })
    .catch((err: unknown) => {
      cache.delete(url);
      throw err;
    });
  cache.set(url, p);
  return p;
}

/** 언어별 목록을 받는다. 형식 판·종류·행 필드가 이 코드와 다르면 실패로 본다(낡은 캐시와 새 코드가 섞인 경우). */
export async function loadIndexManifest(
  kind: IndexKind,
  locale: Locale,
  version: string,
): Promise<IndexManifest> {
  const data = await fetchJson(indexManifestUrl(kind, locale, version), (raw) => {
    const m = raw as Partial<IndexManifest> | null;
    const ok =
      m &&
      m.schema === INDEX_SCHEMA &&
      m.kind === kind &&
      Array.isArray(m.months) &&
      JSON.stringify(m.fields) === JSON.stringify(ROW_FIELDS[kind]);
    if (!ok) throw new Error(`index manifest: unexpected shape (${kind}/${locale})`);
  });
  return data as IndexManifest;
}

/** 목록의 색인 머리(홈) 카드. */
export function manifestHead(manifest: IndexManifest): DecodedCard[] {
  return (manifest.head ?? []).map((row) => decodeRow(row, manifest));
}

/** 조각 여러 개를 함께 받아 카드로 되돌리고 기본 정렬 순으로 합친다(하나라도 실패하면 실패). */
export async function loadIndexMonths(
  manifest: IndexManifest,
  months: readonly ShardMonth[],
): Promise<DecodedCard[]> {
  const lists = await Promise.all(
    months.map(async (shard) => {
      const rows = await fetchJson(indexShardUrl(manifest.kind, manifest.locale, shard), (raw) => {
        if (!Array.isArray(raw)) throw new Error(`index shard: not an array (${shard.month})`);
      });
      return (rows as IndexRow[]).map((row) => decodeRow(row, manifest));
    }),
  );
  return mergeByDefaultOrder(lists);
}

/** 테스트 전용: 모듈 캐시 초기화. */
export function resetIndexCache(): void {
  cache.clear();
}
