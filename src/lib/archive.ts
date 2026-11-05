/**
 * 보관 등급(english-version-plan Phase 4-3) — 어떤 기사·호가 "보관 지면"(가벼운 정적 HTML)으로 나가는지의 **단일 출처**.
 *
 * 규칙: 호 날짜(기사는 `created_at` 의 KST 날짜 = 그 기사가 실린 호의 날짜)가 **DB 최신 호 날짜보다 90일 이상 앞이면** 보관이다.
 * 기준이 벽시계가 아니라 DB 최신 호라(호 썸네일 `hasEditionThumbnail` 과 같은 방식) 같은 app.db 면 산출물이 같다.
 *
 * 경계(호 썸네일 창과 같은 셈): 나이 = 최신 호 날짜 − 호 날짜(KST 달력 날짜 차, 일). 나이 0~89(최신 호와 그 앞 89일,
 * KST 날짜 90개)는 전체 페이지, 나이 90 이상은 보관이다. 최신 호보다 뒤인 날짜(나이 < 0)·최신 호가 없는 DB 는 보관이 아니다.
 * 예: 최신 호 2026-11-05 → 2026-08-07(나이 90)부터 앞은 보관, 2026-08-08(나이 89)은 전체 페이지.
 *
 * 이 판정을 쓰는 곳 — 둘이 어긋나면 링크가 404 가 되므로 반드시 이 함수만 쓴다:
 *  - Next 라우트 `generateStaticParams`(`(ko)/article/[id]`·`(ko)/edition/[date]`) — 보관 대상은 전체 페이지를 만들지 않는다.
 *  - 빌드 후처리 scripts/lib/archive.ts — 보관 대상만 보관 지면을 쓰고, 둘 다 있거나 둘 다 없으면 실패한다.
 *  - 호 이동(EditionPager) — 보관 호로 가는 링크는 RSC(`index.txt`)가 없으므로 next/link 가 아니라 일반 `<a>`.
 * 순수 함수만 둔다(DB 조회 없음) — 클라이언트 번들에 들어가도 된다.
 */

/**
 * 보관 지면 표지 — `<head>` 앞쪽(charset 바로 뒤)의 이 태그 하나로 보관 지면을 알아본다: 빌드 후처리의 확인
 * (scripts/lib/archive.ts)과 산출물 크기 보고(scripts/lib/sizeReport.ts — 보관 지면을 전체 페이지와 따로 센다).
 */
export const ARCHIVE_GENERATOR_META = '<meta name="generator" content="daybook-archive">';

/**
 * 보관 지면 예산(B, 10진 KB — scripts/lib/sizeReport.ts 와 같은 단위). 기사는 쪽마다 지킨다(넘으면 다른 매체 링크를 줄인다 —
 * archivePage.ts renderArchiveArticle), 호는 출시 전 대량 수집 호 3개만 예외로 넘는다. 크기 보고가 같은 값으로 경고한다.
 */
export const ARCHIVE_ARTICLE_BUDGET_BYTES = 8_000;
export const ARCHIVE_EDITION_BUDGET_BYTES = 40_000;

/** 보관 창(일). 이보다 오래된 호·기사는 보관 지면이다. 바꾸면 기사·호·푸터 문구(messages/archive)가 함께 따라간다. */
export const ARCHIVE_WINDOW_DAYS = 90;

/** 'YYYY-MM-DD' → 달력 일 번호(UTC 자정 기준 — 날짜 키끼리의 차만 쓴다). 형식이 틀리면 NaN. */
const dayNumber = (key: string) => Date.parse(`${key}T00:00:00Z`) / (24 * 3600 * 1000);

/**
 * 호 날짜(KST 'YYYY-MM-DD')가 보관 대상인지. `latestEditionDate` 는 DB 최신 호 날짜(getLatestEditionRef()?.date).
 * 날짜 키가 비었거나 형식이 틀리면 보관이 아니다(전체 페이지가 안전한 기본값 — 빠진 페이지보다 무거운 페이지가 낫다).
 */
export function isArchivedIssueDate(
  date: string | null | undefined,
  latestEditionDate: string | null | undefined,
  windowDays: number = ARCHIVE_WINDOW_DAYS,
): boolean {
  if (!date || !latestEditionDate) return false;
  const age = dayNumber(latestEditionDate) - dayNumber(date);
  return Number.isFinite(age) && age >= windowDays;
}

/** 빌드 한 번의 보관 계획 — 무엇을 전체 페이지로, 무엇을 보관 지면으로 낼지(둘은 서로소, 합이 전체). */
export interface ArchivePlan {
  /** 기준 — DB 최신 호 날짜(없으면 null: 보관 없음). */
  latestEditionDate: string | null;
  /** 전체 페이지로 낼 기사 id(오름차순). */
  liveArticleIds: number[];
  /** 보관 지면으로 낼 기사 id(오름차순). */
  archivedArticleIds: number[];
  /** 전체 페이지로 낼 호 날짜(오름차순). */
  liveEditionDates: string[];
  /** 보관 지면으로 낼 호 날짜(오름차순). */
  archivedEditionDates: string[];
}

/**
 * 보관 계획. `articleIssueDates` 는 공개 기사 id → 호 날짜(db.ts `getIssueDates`), `articleIds` 는 공개 기사 전체
 * (`getAllArticleIds` — 호 날짜를 모르는 id 는 전체 페이지로 둔다), `editionDates` 는 호 목록(`getEditionRefs` 의 date).
 */
export function planArchive({
  latestEditionDate,
  articleIds,
  articleIssueDates,
  editionDates,
  windowDays = ARCHIVE_WINDOW_DAYS,
}: {
  latestEditionDate: string | null;
  articleIds: readonly number[];
  articleIssueDates: ReadonlyMap<number, string>;
  editionDates: readonly string[];
  windowDays?: number;
}): ArchivePlan {
  const archived = (date: string | undefined) =>
    isArchivedIssueDate(date, latestEditionDate, windowDays);
  const ids = [...new Set(articleIds)].sort((a, b) => a - b);
  const dates = [...new Set(editionDates)].sort();
  return {
    latestEditionDate,
    liveArticleIds: ids.filter((id) => !archived(articleIssueDates.get(id))),
    archivedArticleIds: ids.filter((id) => archived(articleIssueDates.get(id))),
    liveEditionDates: dates.filter((d) => !archived(d)),
    archivedEditionDates: dates.filter((d) => archived(d)),
  };
}
