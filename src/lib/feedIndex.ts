/**
 * 홈 전체 기사 색인의 데이터 분할(정적 export) — 서버(page.tsx·export-feed-index)와 클라(FeedClient)가 공유한다.
 *
 * 누적 기사 전체를 홈 페이지에 실으면 index.html·RSC 페이로드가 기사 수에 비례해 커진다(1,146건에 1.27MB).
 * 그래서 정적 HTML 에는 첫 화면이 그리는 만큼(이번 호 지면 + 색인 첫 페이지)만 싣고, 누적 전체는 빌드 직전
 * `public/feed-index/<언어>/` 월별 조각으로 내보낸다(src/lib/indexShards.ts, 영어판 Phase 4-2).
 * - "더 보기": 목록(manifest)에 실린 색인 머리(`FEED_HEAD_SIZE`건 — 기본 정렬 둘째 페이지부터)만 받는다.
 * - 그 너머·필터·정렬: 모든 달 조각을 받아 기본 정렬 순으로 합친다(필터는 어차피 전체가 필요하다).
 */
import { filterAndSortFeed } from "@/lib/feedFilter";
import type { Locale } from "@/lib/i18n";
import { hasHangul, localeTags } from "@/lib/labels";
import type { ArticleCard, IndexCard } from "@/lib/types";

/**
 * 색인 처음 노출 건수 / "더 보기" 1회당 추가 건수(StoryIndex). 홈 정적 HTML 에 싣는 첫 페이지 크기이기도 하다.
 * 서버 page.tsx 도 읽으므로 "use client" 모듈(StoryIndex)이 아닌 여기에 둔다(클라 모듈 export 는 서버에서 참조 객체가 된다).
 */
export const INDEX_PAGE_SIZE = 30;

/**
 * 홈 색인 머리 = 정적 HTML 첫 페이지 다음 몇 페이지(목록 manifest.head). 홈 기본 정렬은 화제순이라 둘째 페이지부터
 * 모든 달의 기사가 섞인다 — 월별 조각으로는 "더 보기" 한 번에 모든 달을 받아야 해서, 앞 4페이지(120건)를 목록에 싣는다.
 */
export const FEED_HEAD_PAGES = 4;
export const FEED_HEAD_SIZE = INDEX_PAGE_SIZE * FEED_HEAD_PAGES;

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

/**
 * 색인 카드 + 언어판 필드 — 영어 색인 카드(`toIndexCard(…, "en")`)는 영어 제목·요약을 이 선택 필드에 싣는다
 * (조각을 되돌린 카드 indexShards `DecodedCard` 와 같은 모양). IndexCard 를 만족하므로 색인 컴포넌트·필터가 그대로 받는다.
 */
export type LocaleIndexCard = IndexCard &
  Partial<Pick<ArticleCard, "titleOriginal" | "titleEn" | "summaryEn">>;

/**
 * 카드 → 색인 카드. 원제 폴백(titleKo 가 비면 원제)을 미리 적용하고, 묶인 보도는 개수만 남긴다.
 * en(영어판 Phase 5-2)은 한국어 가공 텍스트를 비우고(titleKo·summaryKo = "") 영어 제목·요약, 매체 영문명·지역
 * (KOREA 표시·Korea Desk), 라틴 문자 태그만 싣는다. 영어 제목이 없을 때만 한글 없는 원제를 싣는다(headlineOf en 폴백).
 */
export function toIndexCard(
  article: ArticleCard | LocaleIndexCard,
  locale: Locale = "ko",
): LocaleIndexCard {
  const a: LocaleIndexCard & Partial<ArticleCard> = article;
  if (locale === "en") return toEnglishIndexCard(a);
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

/** 영어 색인 카드(toIndexCard en). 값이 없는 선택 필드는 키를 두지 않는다(RSC 가 `"$undefined"` 를 적지 않게). */
function toEnglishIndexCard(a: LocaleIndexCard & Partial<ArticleCard>): LocaleIndexCard {
  const source: IndexCard["source"] = { id: a.source.id, name: a.source.name };
  if (a.source.nameEn) source.nameEn = a.source.nameEn;
  if (a.source.region) source.region = a.source.region;
  const card: LocaleIndexCard = {
    id: a.id,
    source,
    titleKo: "",
    summaryKo: "",
    category: a.category,
    format: a.format,
    tags: localeTags(a.tags, "en"),
    trendingScore: a.trendingScore,
    importance: a.importance,
    publishedAt: a.publishedAt,
  };
  if (a.titleEn) card.titleEn = a.titleEn;
  else if (a.titleOriginal && !hasHangul(a.titleOriginal)) card.titleOriginal = a.titleOriginal;
  if (a.summaryEn) card.summaryEn = a.summaryEn;
  const related = relatedCountOf(a);
  if (related) card.relatedCount = related;
  return card;
}

/**
 * 목록 한 줄(StoryEntry) 카드 — 색인 카드에서 태그를 뺐다. StoryEntry 는 태그를 그리지 않는다.
 * 영어판은 영어 제목·요약·원제·영문 매체명을 더 싣는다(articleText 헬퍼가 en 일 때 읽는 필드).
 */
export type EntryCard = Omit<LocaleIndexCard, "tags">;

/**
 * 상세 "같은 분야 기사"(RelatedStories 클라이언트 섬)에 넘기는 카드(Phase 4-1 페이지 무게, 분석 순위 5).
 * 서버 렌더면 RSC 에 카드마다 렌더된 요소 트리(클래스·미터·바이라인, 약 1.2KB)가 실리는데, 섬에 props 로 넘기면
 * 그 언어로 화면에 쓰는 값만 실린다. 값이 없는 선택 필드는 키를 두지 않는다(RSC 가 `"$undefined"` 를 적지 않게).
 * ko 는 toIndexCard 와 같은 값(원제 폴백 포함)이라 서버 렌더와 HTML 이 같다. en 은 toIndexCard en 과 같은 값.
 */
export function toEntryCard(article: ArticleCard, locale: Locale = "ko"): EntryCard {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tags, ...card } = toIndexCard(article, locale);
  return card;
}

/**
 * 누적 카드 → 색인 카드 배열(기본 정렬 = 화제순, 클라 `filterAndSortFeed`와 같은 비교자).
 * 페이지의 첫 페이지(`.slice(0, INDEX_PAGE_SIZE)`)·색인 머리·월별 조각이 같은 함수로 만들어져,
 * 첫 페이지 + 머리는 언제나 누적 전체의 앞부분이다. `locale` 은 카드 언어(toIndexCard).
 */
export function buildFeedIndex(
  articles: readonly (ArticleCard | LocaleIndexCard)[],
  locale: Locale = "ko",
): LocaleIndexCard[] {
  return filterAndSortFeed(articles.map((a) => toIndexCard(a, locale)));
}

/**
 * 여러 카드 목록을 id 기준 합집합으로 합친다(먼저 나온 목록·항목이 이긴다, 순서 보존).
 * 홈은 `mergeIndex(첫 페이지, 색인 머리, 받은 전체, 이번 호)` 순으로 부른다 — 데이터가 일관되면 결과가 받은 전체와
 * 같은 순서이고(첫 페이지·머리 = 전체의 앞부분), 캐시된 낡은 조각이어도 페이지에 이미 있는 기사는 빠지지 않는다.
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
