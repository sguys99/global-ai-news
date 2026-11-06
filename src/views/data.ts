import { readFileSync } from "node:fs";
import path from "node:path";
import { hasEnglish } from "@/lib/articleText";
import {
  type EditionRef,
  getActiveTags,
  getArchivePlan,
  getArticle,
  getEditionRefs,
  getEnglishArticleIds,
  getFeed,
  getFollowUpThread,
  getIssueArticles,
  getIssueBriefs,
  getIssueDates,
  getLatestEditionRef,
  getLatestPublishedAt,
  getSourceNameEnMap,
  getSourcesWithCounts,
  getWeekRadarCandidates,
  toListCards,
} from "@/lib/db";
import { isArchivedIssueDate, type ArchivePlan } from "@/lib/archive";
import {
  buildEdition,
  type Edition,
  ISSUE_BRIEF_LIMITS,
  selectIssueBrief,
  type IssueBriefLine,
} from "@/lib/edition";
import type { SourceOption } from "@/lib/feedFilter";
import { INDEX_PAGE_SIZE, buildFeedIndex } from "@/lib/feedIndex";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { indexBuildVersion } from "@/lib/indexShards";
import { hasHangul, issueDelayDays, localeTags } from "@/lib/labels";
import {
  isKoreaSubject,
  koreaSubjectNames,
  koreaSubjectPattern,
  selectKoreaDesk,
} from "@/lib/koreaDesk";
import { PROMPTS_DIR } from "@/lib/paths";
import { hasArticleThumbnail, ogArticleImagePath } from "@/lib/site";
import type { ArticleCard, FollowUpEntry, RelatedCoverage } from "@/lib/types";
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
 * 어떤 경로를 만들지(generateStaticParams)도 여기 언어판 경로 목록(`localeArticleIds`·`localeEditionDates`)이 정한다 —
 * 한국어 라우트와 Phase 5 영어 라우트가 같은 함수를 부른다.
 *
 * 영어판(Phase 5-2 데이터 틈)에서 지키는 것: 영어가 없는 기사·호는 싣지 않고(경로도 없다), 목록 카드는 영어 필드만
 * 남기며(db.ts `toListCard(…, "en")`), 태그는 라틴 문자만, 매체는 영문명·지역(KOREA·Korea Desk)을 싣는다.
 * 한국어판 출력은 바뀌지 않는다 — ko 분기는 예전 식 그대로다.
 */

/**
 * 언어판에 실을 기사만 남긴다 — 영어판 거르기의 단일 자리. ko 는 입력을 그대로(같은 배열) 돌려주고, en 은 영어 제목·
 * 요약이 모두 있는 기사만(`hasEnglish`, src/lib/articleText.ts). 목록용 카드(toListCards)는 언어에 따라 필드를 떼므로
 * 반드시 그 **전에** 거른다(이 파일의 로더가 그 순서를 지킨다).
 */
export function localeArticles<T extends ArticleCard>(locale: Locale, articles: T[]): T[] {
  return locale === DEFAULT_LOCALE ? articles : articles.filter(hasEnglish);
}

/** 영어판 기사가 1건 이상 실린 호 날짜(호 날짜 = created_at 의 KST 날짜, getIssueDates). */
function englishIssueDates(): Set<string> {
  const dates = getIssueDates();
  const out = new Set<string>();
  for (const id of getEnglishArticleIds()) {
    const d = dates.get(id);
    if (d) out.add(d);
  }
  return out;
}

/**
 * 언어판의 호 목록(오름차순). ko 는 전체 그대로, en 은 영어 기사가 1건 이상인 호만 — 지난 호 이동(이전·다음)이 빈 영어
 * 호를 가리키지 않게 한다. 호수(issueNo)는 언어와 상관없이 같은 호의 번호(한국어판 순번) 그대로다.
 */
export function localeEditionRefs(locale: Locale): EditionRef[] {
  const refs = getEditionRefs();
  if (locale === DEFAULT_LOCALE) return refs;
  const dates = englishIssueDates();
  return refs.filter((r) => dates.has(r.date));
}

/** 언어판의 최신 호(홈 지면) — ko 는 DB 최신 호, en 은 영어 기사가 있는 가장 최근 호. 없으면 null. */
export function localeLatestEditionRef(locale: Locale): EditionRef | null {
  return locale === DEFAULT_LOCALE
    ? getLatestEditionRef()
    : (localeEditionRefs(locale).at(-1) ?? null);
}

// ─── 경로 목록(generateStaticParams) ──────────────────────────────────────────

/**
 * 언어판 보관 계획 — 라우트 경로 목록(아래 두 함수)과 빌드 후처리의 보관 지면(scripts/lib/archive.ts)이 **같은 이 함수**를
 * 써서 어긋나지 않는다. ko = `getArchivePlan()` 그대로. en = 같은 계획(같은 DB 최신 호 기준)을 영어판 범위로 줄인 것 —
 * 영어 본문이 있는 기사(`hasEnglish`)와 그런 기사가 1건 이상 실린 호만(`localeEditionRefs` 와 같은 기준).
 */
export function localeArchivePlan(locale: Locale): ArchivePlan {
  const plan = getArchivePlan();
  if (locale === DEFAULT_LOCALE) return plan;
  const ids = new Set(getEnglishArticleIds());
  const dates = englishIssueDates();
  return {
    latestEditionDate: plan.latestEditionDate,
    liveArticleIds: plan.liveArticleIds.filter((id) => ids.has(id)),
    archivedArticleIds: plan.archivedArticleIds.filter((id) => ids.has(id)),
    liveEditionDates: plan.liveEditionDates.filter((d) => dates.has(d)),
    archivedEditionDates: plan.archivedEditionDates.filter((d) => dates.has(d)),
  };
}

/**
 * 언어판 기사 상세로 사전 생성할 id(오름차순). 보관 대상(src/lib/archive.ts — 빌드 후처리가 보관 지면으로 쓴다)은 뺀다.
 * ko = `getArchivePlan().liveArticleIds` 그대로, en = 그중 영어판에 실을 기사(`hasEnglish`)만. 보관 영어 기사는
 * 빌드 후처리가 `/en/article/<id>/` 에 영어 보관 지면으로 쓴다(같은 `localeArchivePlan`).
 */
export function localeArticleIds(locale: Locale): number[] {
  return localeArchivePlan(locale).liveArticleIds;
}

/**
 * 언어판 호 고정 링크로 사전 생성할 날짜(오름차순). 보관 호는 뺀다. ko = `liveEditionDates` 그대로,
 * en = 그중 영어 기사가 있는 호(`localeEditionRefs` 와 같은 기준).
 */
export function localeEditionDates(locale: Locale): string[] {
  return localeArchivePlan(locale).liveEditionDates;
}

// ─── 필터 칩(매체·태그) ───────────────────────────────────────────────────────

/** 홈·검색 필터 칩에 싣는 태그 수. */
const FILTER_TAG_LIMIT = 8;

/**
 * 언어판 필터 칩의 매체·태그. ko 는 DB 집계 그대로(getSourcesWithCounts·getActiveTags — 한국어 RSC 무변화).
 * en 은 영어판 기사(`articles`, 이미 거른 목록)로 센다: 매체는 영어 기사 수 + 영문명·지역, 태그는 라틴 문자 태그만
 * 사용 빈도 순(동률은 이름 순).
 */
function localeFilterOptions(
  locale: Locale,
  articles: readonly ArticleCard[],
): { sources: SourceOption[]; tags: string[] } {
  if (locale === DEFAULT_LOCALE) {
    return { sources: getSourcesWithCounts(), tags: getActiveTags(FILTER_TAG_LIMIT) };
  }
  return { sources: sourceOptionsOf(articles), tags: activeTagsOf(articles, locale) };
}

/** 기사 목록 → 매체 칩 옵션(기사 수 내림차순, 동률은 id 순). 영문명·지역은 있을 때만. */
export function sourceOptionsOf(articles: readonly ArticleCard[]): SourceOption[] {
  const byId = new Map<string, SourceOption>();
  for (const a of articles) {
    const s = byId.get(a.source.id);
    if (s) {
      s.count = (s.count ?? 0) + 1;
      continue;
    }
    const opt: SourceOption = { id: a.source.id, name: a.source.name, count: 1 };
    if (a.source.nameEn) opt.nameEn = a.source.nameEn;
    if (a.source.region) opt.region = a.source.region;
    byId.set(a.source.id, opt);
  }
  return [...byId.values()].sort(
    (x, y) => (y.count ?? 0) - (x.count ?? 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
}

/** 기사 목록 → 사용 빈도 상위 태그(언어판에 보이는 태그만 — en 은 라틴 문자). 동률은 이름 순. */
export function activeTagsOf(
  articles: readonly ArticleCard[],
  locale: Locale,
  limit = FILTER_TAG_LIMIT,
): string[] {
  const counts = new Map<string, number>();
  for (const a of articles) {
    for (const tag of localeTags(a.tags, locale)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, limit)
    .map(([tag]) => tag);
}

// ─── 세 줄 요약 ───────────────────────────────────────────────────────────────

/**
 * 언어판 세 줄 요약 줄. ko 는 고른 줄 그대로. en 은 같은 줄 id 기사의 영어 제목(`titleEn`)으로 바꾸고(추가 호출 없음 —
 * english-version-plan 아키텍처 결정), 영어 제목이 없는 줄은 뺀다. 남은 줄이 최소(2줄)보다 적으면 띠를 숨긴다(빈 배열).
 */
export function localeBrief(
  locale: Locale,
  lines: IssueBriefLine[],
  articles: readonly { id: number; titleEn?: string }[],
): IssueBriefLine[] {
  if (locale === DEFAULT_LOCALE) return lines;
  const titles = new Map(articles.map((a) => [a.id, a.titleEn ?? ""]));
  const out = lines
    .map((line) => ({ id: line.id, text: titles.get(line.id) ?? "" }))
    .filter((line) => line.text.trim());
  return out.length >= ISSUE_BRIEF_LIMITS.min ? out : [];
}

// ─── 홈 ───────────────────────────────────────────────────────────────────────

/**
 * 홈(최신 호 지면 + 전체 기사 색인). 빌드타임 1회 SSG: 이번 호 카드(1면·섹션 밴드)·전체 기사 색인 첫 페이지·
 * 소스·태그와 이번 호 정보를 클라이언트 셸에 넘긴다. 페이지(정적 HTML·RSC 페이로드)에는 첫 화면이 그리는 만큼만
 * 싣는다 — 누적 전체는 prebuild 가 만든 feed-index/<언어>/ 월별 조각으로 FeedClient 가 "더 보기"·필터·정렬 때 받는다
 * (src/lib/feedIndex.ts·indexShards.ts). 필터/정렬은 브라우저에서 수행한다.
 */
export function loadHome(locale: Locale) {
  const all = localeArticles(locale, getFeed());
  const feed = buildFeedIndex(all, locale);
  const indexHead = feed.slice(0, INDEX_PAGE_SIZE);
  const indexTotal = feed.length;
  const { sources, tags } = localeFilterOptions(locale, all);
  const ref = localeLatestEditionRef(locale);
  const editionInfo = { issueNo: ref?.issueNo ?? 0, publishedAt: ref?.publishedAt ?? null };
  const issueArticles = ref
    ? toListCards(localeArticles(locale, getIssueArticles(ref.date)), locale)
    : [];
  const edition = buildEdition(issueArticles);
  // 세 줄 요약(마스트헤드 아래 띠): 줄 id·문장만 넘긴다. 없으면 빈 배열 → 띠를 숨긴다.
  const brief = ref
    ? localeBrief(locale, selectIssueBrief(edition, getIssueBriefs(ref.date)), issueArticles)
    : [];
  // Korea Desk(영어판만): 선정 id 만 넘기고 섬(FeedView)이 applyKoreaDesk 로 밴드를 짠다. 한국어판은 키 자체가 없다(RSC 무변화).
  const desk = localeKoreaDesk(locale, edition);
  // 발행 지연 안내의 초기 상태 = 빌드 시점 판단. 빌드 자체가 낡았으면 정적 HTML 에 안내가 이미 들어간다.
  const initialDelayGap = ref ? issueDelayDays(ref.date, Date.now()) : 0;
  // 주간 레이더: 최신 호가 일요일일 때만(아니면 null). 호 고정 링크 지면과 같은 함수 — 그날 홈과 /edition/<일요일> 이 같다.
  const weekly = ref ? loadWeeklyRadar(locale, ref.date) : null;
  return {
    /** FeedView(서버 fallback)·FeedClient 공용 props. */
    feed: {
      issueArticles,
      sources,
      tags,
      editionInfo,
      initialDelayGap,
      weekly,
      brief,
      ...(desk ? { desk } : {}),
    },
    /** 전체 기사 색인 첫 페이지 + 누적 건수 + 색인 목록(feed-index/<언어>/manifest.json) 캐시 키. */
    index: { indexHead, indexTotal, indexVersion: indexBuildVersion(ref?.date, indexTotal) },
  };
}

// ─── 호 고정 링크 ─────────────────────────────────────────────────────────────

/** 호 이동(EditionPager)이 가리키는 호 — 보관 호(`archived`)면 RSC 가 없어 일반 `<a>` 로 잇는다. */
export type PagerEdition = EditionRef & { archived?: boolean };

/** 호 고정 링크 지면 — 그 호와 앞뒤 호, 1면 편집, 세 줄 요약. 목록 밖 날짜면 null(정적 404). 라우트 메타도 쓴다. */
export function loadEdition(locale: Locale, date: string) {
  const refs = localeEditionRefs(locale);
  const i = refs.findIndex((r) => r.date === date);
  if (i < 0) return null;
  const ref = refs[i];
  const edition = buildEdition(localeArticles(locale, getIssueArticles(ref.date)));
  // 앞뒤 호가 보관 지면(src/lib/archive.ts)이면 호 이동이 next/link 대신 일반 `<a>` 를 쓴다 — 보관 호에는 RSC 가 없다.
  const latest = getLatestEditionRef()?.date ?? null;
  const pagerRef = (r: EditionRef | undefined): PagerEdition | null =>
    r ? { ...r, archived: isArchivedIssueDate(r.date, latest) } : null;
  return {
    ref,
    prev: pagerRef(refs[i - 1]),
    next: pagerRef(refs[i + 1]),
    edition,
    brief: localeBrief(locale, selectIssueBrief(edition, getIssueBriefs(ref.date)), edition.issue),
    /** Korea Desk 선정 id(영어판만, 없으면 undefined) — 홈과 같은 함수(`localeKoreaDesk`). */
    desk: localeKoreaDesk(locale, edition),
  };
}

// ─── Korea Desk ───────────────────────────────────────────────────────────────

let koreaPattern: RegExp | null = null;

/** 한국 주제 대조식 — 용어집(configs/prompts/glossary.en.md)의 한국 기관·기업 영문명 + Korea·Seoul·KRW. 빌드당 1회 읽는다. */
function koreaSubjectRe(): RegExp {
  if (!koreaPattern) {
    let names: string[] = [];
    try {
      names = koreaSubjectNames(readFileSync(path.join(PROMPTS_DIR, "glossary.en.md"), "utf8"));
    } catch {
      // 용어집이 없으면 기본 낱말(Korea·Korean·Seoul·KRW)만으로 고른다.
    }
    koreaPattern = koreaSubjectPattern(names);
  }
  return koreaPattern;
}

/**
 * 언어판 Korea Desk 선정 id(src/lib/koreaDesk.ts `selectKoreaDesk`). ko 는 늘 undefined(데스크 없음), en 은 그 호 한국 매체
 * 기사가 1면 밖에 없으면 undefined. 한국 주제 판정은 여기(서버)서 해 섬에는 id 만 간다 — 용어집을 클라이언트에 싣지 않는다.
 */
export function localeKoreaDesk(
  locale: Locale,
  edition: Pick<Edition, "lead" | "seconds" | "briefs" | "radar" | "issue">,
): number[] | undefined {
  if (locale === DEFAULT_LOCALE) return undefined;
  const re = koreaSubjectRe();
  const ids = selectKoreaDesk(edition, (a) => isKoreaSubject(a, re));
  return ids.length > 0 ? ids : undefined;
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
  const thread = localeThread(locale, getFollowUpThread(article.id));
  return {
    article: locale === DEFAULT_LOCALE ? article : englishArticleDetail(article),
    thumbnail: articleThumbnail(article),
    related,
    thread,
  };
}

/**
 * 언어판 사건 타임라인. ko 는 영어판 필드(titleEn·sourceNameEn)를 떼고 예전 모양 그대로. en 은 영어판에 실린
 * 기사(`titleEn` 이 있는 줄 — db.ts 가 hasEnglish 로 붙인다)와 보고 있는 기사만 남긴다(영어 페이지가 없는 기사로
 * 링크하지 않게). 앞뒤 관계(relation)는 그대로다 — 남은 줄이 보고 있는 기사뿐이면 컴포넌트가 섹션을 그리지 않는다.
 */
export function localeThread(locale: Locale, thread: FollowUpEntry[]): FollowUpEntry[] {
  if (locale === DEFAULT_LOCALE) {
    return thread.map((e) => {
      const ko = { ...e };
      delete ko.titleEn;
      delete ko.sourceNameEn;
      return ko;
    });
  }
  return thread.filter((e) => e.relation === "current" || Boolean(e.titleEn));
}

/**
 * 영어 상세 본문용 기사 — 묶인 보도(related_json)의 매체를 영문명으로 바꾸고(저장값은 매체 표시명 문자열이라 이름으로
 * 찾는다, db.ts `getSourceNameEnMap`), 한글이 든 제목은 비운다. 매체도 제목도 라틴 문자로 낼 수 없는 보도는 뺀다.
 * 원제·원문 발췌의 한글 처리는 뷰(ArticleView)가 한다 — 원제는 `lang="ko"` 병기, 한글 발췌는 숨김.
 */
function englishArticleDetail(article: ArticleCard): ArticleCard {
  if (!article.related?.length) return article;
  const names = getSourceNameEnMap();
  return { ...article, related: englishRelated(article.related, names) };
}

/**
 * 묶인 보도 → 영어판 표시용(매체 영문명, 한글 제목은 빈 문자열 + `koreanTitle` 표지, 둘 다 비면 뺀다).
 * 표지가 있는 보도는 뷰가 제목 대신 "Korean-language report"와 `etnews.com · in Korean` 을 그린다(시안 en-article 주석 3 B안).
 */
export function englishRelated(
  related: readonly RelatedCoverage[],
  nameEn: ReadonlyMap<string, string>,
): RelatedCoverage[] {
  return related
    .map((r): RelatedCoverage => {
      const name = nameEn.get(r.source) ?? r.source;
      const source = hasHangul(name) ? "" : name;
      return hasHangul(r.title)
        ? { source, url: r.url, title: "", koreanTitle: true }
        : { source, url: r.url, title: r.title };
    })
    .filter((r) => r.source || r.title);
}

// ─── 검색 ─────────────────────────────────────────────────────────────────────

/**
 * 검색 페이지 정적 셸 데이터 — 소스·태그(필터 칩·추천 검색어)와 검색 색인 목록 캐시 키만. 실제 검색은 SearchClient 가
 * search-index/<언어>/ 월별 조각으로 한다(언어 고르기는 src/lib/indexShards.ts `INDEX_LOCALE`).
 * 영어판은 영어 기사로 센 매체·라틴 문자 태그(`localeFilterOptions`)와 영어 기사 수로 만든 캐시 키를 싣는다.
 */
export function loadSearch(locale: Locale) {
  const all = localeArticles(locale, getFeed());
  const { sources, tags } = localeFilterOptions(locale, all);
  return {
    sources,
    tags,
    indexVersion: indexBuildVersion(localeLatestEditionRef(locale)?.date, all.length),
  };
}
