/**
 * 홈 전체 기사 색인의 데이터 분할(정적 export) — 서버(page.tsx·export-feed-index)와 클라(FeedClient)가 공유한다.
 *
 * 누적 기사 전체를 홈 페이지에 실으면 index.html·RSC 페이로드가 기사 수에 비례해 커진다(1,146건에 1.27MB).
 * 그래서 정적 HTML 에는 첫 화면이 그리는 만큼(이번 호 지면 + 색인 첫 페이지)만 싣고, 누적 전체는
 * 빌드 직전 `public/feed-index.json`(IndexCard 배열, 기본 정렬 순) 하나로 내보내 "더 보기"·필터·정렬 때 1회 받는다.
 * 조각(페이지·월별)으로 나누지 않는 이유: 필터는 어차피 전체가 필요하고, 30건 조각 39개는 gzip 합계가 27% 커진다.
 */
import { filterAndSortFeed } from "@/lib/feedFilter";
import type { ArticleCard, IndexCard } from "@/lib/types";

/**
 * 색인 처음 노출 건수 / "더 보기" 1회당 추가 건수(StoryIndex). 홈 정적 HTML 에 싣는 첫 페이지 크기이기도 하다.
 * 서버 page.tsx 도 읽으므로 "use client" 모듈(StoryIndex)이 아닌 여기에 둔다(클라 모듈 export 는 서버에서 참조 객체가 된다).
 */
export const INDEX_PAGE_SIZE = 30;

/** public/ 아래 파일명. 경로 상수(src/lib/paths.ts FEED_INDEX_PATH)와 같은 이름이다. */
export const FEED_INDEX_FILE = "feed-index.json";

/** 정적 export 서브경로(`/global-ai-news`)에서 수동 fetch는 basePath를 명시해야 한다(dev는 ""). */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * 같은 사건을 다룬 다른 매체 수 — 카드는 묶인 보도 목록(related)을, 색인 카드는 개수(relatedCount)를 갖는다.
 * 바이라인 "외 N곳"이 둘을 같은 값으로 읽게 한다.
 */
export function relatedCountOf(article: {
  related?: readonly unknown[];
  relatedCount?: number;
}): number {
  return article.related?.length ?? article.relatedCount ?? 0;
}

/** 카드 → 색인 카드. 원제 폴백(titleKo 가 비면 원제)을 미리 적용하고, 묶인 보도는 개수만 남긴다. */
export function toIndexCard(article: ArticleCard | IndexCard): IndexCard {
  const a: IndexCard & Partial<ArticleCard> = article;
  const card: IndexCard = {
    id: a.id,
    source: { id: a.source.id, name: a.source.name },
    titleKo: a.titleKo || a.titleOriginal || "",
    summaryKo: a.summaryKo,
    category: a.category,
    format: a.format,
    tags: a.tags,
    trendingScore: a.trendingScore,
    importance: a.importance,
    publishedAt: a.publishedAt,
  };
  const related = relatedCountOf(a);
  if (related) card.relatedCount = related;
  return card;
}

/**
 * 누적 카드 → 색인 카드 배열(기본 정렬 = 화제순, 클라 `filterAndSortFeed`와 같은 비교자).
 * 페이지의 첫 페이지(`.slice(0, INDEX_PAGE_SIZE)`)와 feed-index.json 이 같은 함수로 만들어져,
 * 첫 페이지는 언제나 JSON 의 앞부분이다.
 */
export function buildFeedIndex(articles: readonly (ArticleCard | IndexCard)[]): IndexCard[] {
  return filterAndSortFeed(articles.map(toIndexCard));
}

/**
 * 색인 fetch 캐시 키. 빌드마다 데이터가 바뀌므로(일일 수집) 최신 호 날짜와 누적 건수를 URL 에 실어,
 * 브라우저·CDN 이 어제 JSON 을 오늘 HTML 과 섞어 쓰지 않게 한다.
 */
export function feedIndexVersion(latestIssueDate: string | undefined, total: number): string {
  return `${latestIssueDate ?? "none"}-${total}`;
}

/** 색인 JSON URL(basePath 포함, 캐시 키 쿼리). */
export function feedIndexUrl(version: string): string {
  return `${BASE_PATH}/${FEED_INDEX_FILE}?v=${encodeURIComponent(version)}`;
}

/**
 * 여러 카드 목록을 id 기준 합집합으로 합친다(먼저 나온 목록·항목이 이긴다, 순서 보존).
 * 홈은 `mergeIndex(첫 페이지, 받은 전체, 이번 호)` 순으로 부른다 — 데이터가 일관되면 결과가 받은 전체와
 * 같은 순서이고(첫 페이지 = 전체의 앞부분), 캐시된 낡은 JSON 이어도 페이지에 이미 있는 기사는 빠지지 않는다.
 */
export function mergeIndex(...lists: readonly (readonly IndexCard[])[]): IndexCard[] {
  const seen = new Set<number>();
  const out: IndexCard[] = [];
  for (const list of lists) {
    for (const card of list) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      out.push(card);
    }
  }
  return out;
}

let pending: Promise<IndexCard[]> | null = null;
let pendingUrl: string | null = null;

/**
 * 색인 JSON 을 받는다. 같은 URL 은 탭 수명 동안 한 번만 요청하고(필터를 바꿔도 재요청 없음),
 * 실패하면 캐시를 비워 다음 호출(다시 시도)이 새로 요청한다.
 */
export function loadFeedIndex(url: string): Promise<IndexCard[]> {
  if (pending && pendingUrl === url) return pending;
  pendingUrl = url;
  pending = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`feed index ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .then((data) => {
      if (!Array.isArray(data)) throw new Error("feed index: not an array");
      return data as IndexCard[];
    })
    .catch((err: unknown) => {
      pending = null;
      pendingUrl = null;
      throw err;
    });
  return pending;
}

/** 테스트 전용: 모듈 캐시 초기화. */
export function resetFeedIndexCache(): void {
  pending = null;
  pendingUrl = null;
}
