import {
  getActiveTags,
  getArticle,
  getEditionRefs,
  getFeed,
  getFollowUpThread,
  getIssueArticles,
  getIssueBriefs,
  getLatestEditionRef,
  getLatestPublishedAt,
  getSourcesWithCounts,
  getWeekRadarCandidates,
  toListCards,
} from "@/lib/db";
import { buildEdition, selectIssueBrief } from "@/lib/edition";
import { INDEX_PAGE_SIZE, buildFeedIndex, feedIndexVersion } from "@/lib/feedIndex";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { issueDelayDays } from "@/lib/labels";
import { hasArticleThumbnail, ogArticleImagePath } from "@/lib/site";
import type { ArticleCard } from "@/lib/types";
import { buildWeeklyRadar } from "@/lib/weeklyRadar";

/*
 * 뷰 데이터 로더(영어판 Phase 3-3) — 언어판 페이지가 무엇을 싣는지 정하는 단일 자리.
 *
 * 뷰(src/views/*View.tsx)가 이 로더를 직접 부르고, 라우트의 generateMetadata 도 같은 로더를 부른다.
 * 그래서 Phase 5 영어 라우트(`src/app/(en)/en/**`)는 `<XView locale="en" …/>` 한 줄 + 메타만 두면 되고,
 * 영어판 거르기(영어 본문이 있는 기사만 — english-version-plan 5-2)는 아래 `localeArticles` 한 곳에만 들어간다.
 * 모든 기사 목록(호 지면·전체 색인·주간 레이더 후보·관련 기사·상세 본문)이 그것을 거치므로 1면·섹션·색인·세 줄 요약
 * (selectIssueBrief 는 지면에 실린 기사 줄만 고른다)·마스트헤드 통계가 함께 따라간다.
 *
 * DB 조회는 빌드타임 동기(better-sqlite3)라 로더도 뷰도 동기다 — 뷰를 일반 함수 컴포넌트로 테스트할 수 있다.
 * generateStaticParams(어떤 경로를 만들지)는 라우트에 그대로 둔다. Phase 5 영어 라우트는 영어가 있는 호·기사만
 * 내야 하므로 그때 이 파일에 언어판 경로 목록을 더한다(아래 호 목록 `localeEditionRefs` 와 같은 기준).
 */

/**
 * 언어판에 실을 기사만 남긴다 — 영어판 거르기의 단일 자리.
 * 지금은 한국어판뿐이라 입력을 그대로 돌려준다. Phase 5 에서 en 은 `articles.filter(hasEnglish)`(src/lib/articleText.ts)가
 * 된다 — 목록용 카드(toListCards)는 영어 필드를 떼므로 반드시 그 **전에** 거른다(이 파일의 로더가 그 순서를 지킨다).
 * 거르기가 생기기 전에 en 으로 부르면 한국어 가공 텍스트가 영어 페이지에 새므로 빌드를 멈춘다.
 */
export function localeArticles<T extends ArticleCard>(locale: Locale, articles: T[]): T[] {
  assertLocaleReady(locale);
  return articles;
}

/** 아직 데이터 범위가 정해지지 않은 언어판이면 멈춘다(Phase 5 에서 en 거르기와 함께 푼다). */
function assertLocaleReady(locale: Locale): void {
  if (locale !== DEFAULT_LOCALE) {
    throw new Error(
      `언어판 데이터 범위가 아직 없다(locale=${locale}) — 영어판은 Phase 5 에서 src/views/data.ts 에 hasEnglish 거르기를 넣고 연다`,
    );
  }
}

/**
 * 언어판의 호 목록(오름차순). 지금은 전체 그대로 — Phase 5 영어판은 영어 기사가 있는 호만 남겨
 * 지난 호 이동(이전·다음)이 빈 호를 가리키지 않게 한다.
 */
function localeEditionRefs(locale: Locale) {
  assertLocaleReady(locale);
  return getEditionRefs();
}

// ─── 홈 ───────────────────────────────────────────────────────────────────────

/**
 * 홈(최신 호 지면 + 전체 기사 색인). 빌드타임 1회 SSG: 이번 호 카드(1면·섹션 밴드)·전체 기사 색인 첫 페이지·
 * 소스·태그와 이번 호 정보를 클라이언트 셸에 넘긴다. 페이지(정적 HTML·RSC 페이로드)에는 첫 화면이 그리는 만큼만
 * 싣는다 — 누적 전체는 prebuild 가 만든 feed-index.json 으로 FeedClient 가 "더 보기"·필터·정렬 때 받는다
 * (src/lib/feedIndex.ts — 영어판 색인 파일은 Phase 5). 필터/정렬은 브라우저에서 수행한다.
 */
export function loadHome(locale: Locale) {
  const feed = buildFeedIndex(localeArticles(locale, getFeed()));
  const indexHead = feed.slice(0, INDEX_PAGE_SIZE);
  const indexTotal = feed.length;
  const sources = getSourcesWithCounts();
  const tags = getActiveTags(8);
  const ref = getLatestEditionRef();
  const editionInfo = { issueNo: ref?.issueNo ?? 0, publishedAt: ref?.publishedAt ?? null };
  const issueArticles = ref ? toListCards(localeArticles(locale, getIssueArticles(ref.date))) : [];
  // 세 줄 요약(마스트헤드 아래 띠): 줄 id·문장만 넘긴다. 없으면 빈 배열 → 띠를 숨긴다.
  const brief = ref ? selectIssueBrief(buildEdition(issueArticles), getIssueBriefs(ref.date)) : [];
  // 발행 지연 안내의 초기 상태 = 빌드 시점 판단. 빌드 자체가 낡았으면 정적 HTML 에 안내가 이미 들어간다.
  const initialDelayGap = ref ? issueDelayDays(ref.date, Date.now()) : 0;
  // 주간 레이더: 최신 호가 일요일일 때만(아니면 null). 호 고정 링크 지면과 같은 함수 — 그날 홈과 /edition/<일요일> 이 같다.
  const weekly = ref ? loadWeeklyRadar(locale, ref.date) : null;
  return {
    /** FeedView(서버 fallback)·FeedClient 공용 props. */
    feed: { issueArticles, sources, tags, editionInfo, initialDelayGap, weekly, brief },
    /** 전체 기사 색인 첫 페이지 + 누적 건수 + feed-index.json 캐시 키. */
    index: { indexHead, indexTotal, indexVersion: feedIndexVersion(ref?.date, indexTotal) },
  };
}

// ─── 호 고정 링크 ─────────────────────────────────────────────────────────────

/** 호 고정 링크 지면 — 그 호와 앞뒤 호, 1면 편집, 세 줄 요약. 목록 밖 날짜면 null(정적 404). 라우트 메타도 쓴다. */
export function loadEdition(locale: Locale, date: string) {
  const refs = localeEditionRefs(locale);
  const i = refs.findIndex((r) => r.date === date);
  if (i < 0) return null;
  const ref = refs[i];
  const edition = buildEdition(localeArticles(locale, getIssueArticles(ref.date)));
  return {
    ref,
    prev: refs[i - 1] ?? null,
    next: refs[i + 1] ?? null,
    edition,
    brief: selectIssueBrief(edition, getIssueBriefs(ref.date)),
  };
}

/** 주간 레이더: 일요일 호만(아니면 null) — 홈과 호 고정 링크가 같은 함수·같은 입력이라 같은 밴드가 실린다. */
export function loadWeeklyRadar(locale: Locale, date: string) {
  const candidates = getWeekRadarCandidates(date);
  // 후보는 { article, issueDate } — 기사 기준으로 언어판 범위를 거른다.
  const kept = new Set(
    localeArticles(
      locale,
      candidates.map((c) => c.article),
    ),
  );
  return buildWeeklyRadar(
    candidates.filter((c) => kept.has(c.article)),
    date,
  );
}

// ─── 기사 상세 ────────────────────────────────────────────────────────────────

/** 상세에 실을 기사(언어판 범위 밖이면 null — 정적 404). 라우트 메타와 뷰가 같이 쓴다. */
export function loadArticle(locale: Locale, id: number): ArticleCard | null {
  const article = getArticle(id);
  return article ? (localeArticles(locale, [article])[0] ?? null) : null;
}

/** 공유·구조화 데이터 이미지: 최근 기사만 전용 썸네일(og/article/[file]), 그 밖은 undefined(기본 썸네일). */
export function articleThumbnail(article: ArticleCard): string | undefined {
  return hasArticleThumbnail(article.publishedAt, getLatestPublishedAt())
    ? ogArticleImagePath(article.id)
    : undefined;
}

const RELATED_LIMIT = 4;

/** 상세 본문 전체: 기사 + 같은 분야 다른 기사(중요도 순 ≤4) + 사건 타임라인. 기사가 없으면 null. */
export function loadArticlePage(locale: Locale, id: number) {
  const article = loadArticle(locale, id);
  if (!article) return null;
  const related = article.category
    ? localeArticles(locale, getFeed({ category: article.category, sort: "importance" }))
        .filter((a) => a.id !== article.id)
        .slice(0, RELATED_LIMIT)
    : [];
  // 같은 사건의 앞선·뒤이은 보도(후속 보도 연결). 연결이 없으면 빈 배열이라 섹션이 그려지지 않는다.
  // Phase 5: FollowUpEntry 에는 영어 제목이 없다 — 영어판은 여기서 영어 제목을 붙이고 영어 없는 보도를 뺀다.
  const thread = getFollowUpThread(article.id);
  return { article, thumbnail: articleThumbnail(article), related, thread };
}

// ─── 검색 ─────────────────────────────────────────────────────────────────────

/**
 * 검색 페이지 정적 셸 데이터 — 소스·태그(필터 칩·추천 검색어)만. 실제 검색은 SearchClient 가 search-index.json 으로 한다.
 * Phase 5 영어판은 영어 색인 파일(search-index.en.json)과 한글 태그 숨김을 여기서 정한다.
 */
export function loadSearch(locale: Locale) {
  assertLocaleReady(locale);
  return { sources: getSourcesWithCounts(), tags: getActiveTags(8) };
}
