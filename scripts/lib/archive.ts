/**
 * 빌드 후처리 — 보관 지면 쓰기(english-version-plan Phase 4-3). 단계 목록은 scripts/lib/postbuild.ts `POSTBUILD_STEPS`.
 *
 * 무엇을: 호 날짜가 DB 최신 호보다 90일 이상 앞인 기사·호(판정은 src/lib/archive.ts 하나 — Next 라우트의
 * generateStaticParams 도 같은 판정으로 이들을 빼고 만든다)를 같은 주소(`article/<id>/index.html`·`edition/<date>/index.html`)에
 * 가벼운 정적 HTML 로 쓴다. 렌더는 순수 함수 src/lib/archivePage.ts, 데이터는 전체 페이지와 같은 뷰 로더·db.ts 조회(읽기 전용).
 *
 * 영어판(Phase 5-2): 같은 일을 `en/article/<id>/`·`en/edition/<date>/` 에도 한다. 언어판마다 계획이 따로다 —
 * 영어판 계획은 같은 보관 계획을 영어판 범위(영어 본문이 있는 기사·그런 기사가 있는 호)로 줄인 것이고, 영어 라우트의
 * generateStaticParams 와 이 후처리가 같은 함수(src/views/data.ts `localeArchivePlan`)를 써서 어긋날 수 없다.
 * 확인도 두 언어를 함께 본다 — 영어판 전체 페이지 대상(영어 기사·호)에 전체 페이지가 없으면 실패한다.
 *
 * 크게 실패하는 경우(종료 코드 1 — 배포가 멈춘다):
 *  - 보관 대상에 전체 페이지가 있다(라우트와 후처리의 판정이 어긋났다 — 링크가 RSC 를 찾다 404 가 될 수 있다).
 *  - 전체 페이지 대상인데 전체 페이지가 없다, 또는 보관 지면을 쓴 뒤에도 빠진 보관 대상이 있다.
 *  - 같은 빌드의 공유 CSS·폰트·사이트 주소를 out/index.html 에서 못 읽었다(scripts/lib/archiveAssets.ts).
 * 멱등: 다시 돌리면 같은 내용을 다시 쓴다(바뀐 바이트 0). `index.txt` 는 만들지 않는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ArchivePlan } from "../../src/lib/archive";
import {
  ARCHIVE_GENERATOR_META,
  renderArchiveArticle,
  renderArchiveEdition,
  type ArchiveArticleInput,
  type ArchiveEditionInput,
  type BuildAssets,
} from "../../src/lib/archivePage";
import {
  getEnglishArticleIds,
  getIssueArticles,
  getIssueBriefs,
  getIssueDates,
  getSourceNameEnMap,
} from "../../src/lib/db";
import { buildEdition, selectIssueBrief } from "../../src/lib/edition";
import { DEFAULT_LOCALE, localePath, type Locale } from "../../src/lib/i18n";
import { BASE_PATH, SITE_URL } from "../../src/lib/site";
import {
  englishRelated,
  languageAlternates,
  loadArticle,
  localeArchivePlan,
  localeArticles,
  localeBrief,
  localeEditionRefs,
} from "../../src/views/data";
import { readBuildAssets } from "./archiveAssets";

/** 보관 지면을 쓰는 언어판(이 순서로 쓰고 확인한다). */
export const ARCHIVE_LOCALES: readonly Locale[] = ["ko", "en"];

/** 언어판별 보관 계획 — 없는 언어판은 쓰지도 확인하지도 않는다. */
export type ArchivePlans = Partial<Record<Locale, ArchivePlan>>;

/** 보관 지면 데이터 — 기본은 뷰 로더·db.ts(`dbArchiveSource`), 테스트는 가짜를 넘긴다. */
export interface ArchiveSource {
  plans: ArchivePlans;
  article(id: number, locale: Locale): ArchiveArticleInput | null;
  edition(date: string, locale: Locale): ArchiveEditionInput | null;
}

/** 계획이 있는 언어판(ARCHIVE_LOCALES 순서). */
const plannedLocales = (plans: ArchivePlans) =>
  ARCHIVE_LOCALES.filter((locale): locale is Locale => Boolean(plans[locale]));

/** out/ 기준 상대 경로(`article/12/index.html`, 영어 `en/article/12/index.html`). */
export const articlePagePath = (locale: Locale, id: number) =>
  path.posix.join(localePath(locale, `/article/${id}/`).slice(1), "index.html");
export const editionPagePath = (locale: Locale, date: string) =>
  path.posix.join(localePath(locale, `/edition/${date}/`).slice(1), "index.html");

/** 파일이 보관 지면인지(머리의 generator 표지). 없는 파일은 false. */
export function isArchivePage(file: string): boolean {
  if (!existsSync(file)) return false;
  return readFileSync(file, "utf8").slice(0, 1024).includes(ARCHIVE_GENERATOR_META);
}

export interface ArchiveWriteResult {
  articles: number;
  editions: number;
  /** 쓴 파일 수·바이트(다시 돌려도 같은 값 — 같은 내용을 덮어쓴다). */
  files: number;
  bytes: number;
  /** 내용이 바뀐 파일 수(두 번째 실행은 0). */
  changed: number;
}

/**
 * 보관 지면을 쓰고 계획과 산출물이 맞는지 확인한다(계획이 있는 언어판 모두). `assets` 를 주지 않으면 out/index.html 에서
 * 읽고, 사이트 주소·basePath 가 렌더러가 쓰는 값(site.ts — 환경변수)과 같은지 본다(다르면 CLI 가 환경변수를 채우지 않은 것 —
 * 링크가 깨진다).
 */
export function writeArchivePages(
  outDir: string,
  source: ArchiveSource,
  assets?: BuildAssets,
): ArchiveWriteResult {
  const build = assets ?? checkedAssets(outDir);
  const problems: string[] = [];
  const result: ArchiveWriteResult = { articles: 0, editions: 0, files: 0, bytes: 0, changed: 0 };

  const write = (rel: string, html: string) => {
    const abs = path.join(outDir, rel);
    // 전체 페이지는 덮어쓰지 않는다 — 라우트 generateStaticParams 와 보관 판정이 어긋났다는 뜻이라 아래 확인이 실패로 보고한다.
    if (existsSync(abs) && !isArchivePage(abs)) return false;
    const before = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, html);
    result.files += 1;
    result.bytes += Buffer.byteLength(html);
    if (before !== html) result.changed += 1;
    return true;
  };

  for (const locale of plannedLocales(source.plans)) {
    const plan = source.plans[locale]!;
    const tag = locale === DEFAULT_LOCALE ? "" : `${locale} `;
    for (const id of plan.archivedArticleIds) {
      const input = source.article(id, locale);
      if (!input) {
        problems.push(`${tag}article ${id}: 보관 대상인데 기사 데이터가 없다`);
        continue;
      }
      if (write(articlePagePath(locale, id), renderArchiveArticle(input, build, locale)))
        result.articles += 1;
    }
    for (const date of plan.archivedEditionDates) {
      const input = source.edition(date, locale);
      if (!input) {
        problems.push(`${tag}edition ${date}: 보관 대상인데 호 데이터가 없다`);
        continue;
      }
      if (write(editionPagePath(locale, date), renderArchiveEdition(input, build, locale)))
        result.editions += 1;
    }
  }

  problems.push(...verifyArchiveOutput(outDir, source.plans));
  if (problems.length > 0) {
    const shown = problems.slice(0, 20).join("\n  ");
    throw new Error(
      `보관 지면 확인 실패 ${problems.length}건:\n  ${shown}${problems.length > 20 ? "\n  …" : ""}`,
    );
  }
  return result;
}

/**
 * 산출물이 계획과 맞는지(계획이 있는 언어판 모두) — 보관 대상은 모두 보관 지면, 전체 페이지 대상은 모두 전체 페이지
 * (보관 표지 없음)이고, 보관 지면 디렉터리에 RSC(`index.txt`)가 없다. 문제 목록(비면 통과).
 */
export function verifyArchiveOutput(outDir: string, plans: ArchivePlans): string[] {
  const problems: string[] = [];
  const check = (rel: string, archived: boolean) => {
    const abs = path.join(outDir, rel);
    if (!existsSync(abs)) {
      problems.push(`${rel}: ${archived ? "보관 지면" : "전체 페이지"}가 없다`);
      return;
    }
    if (isArchivePage(abs) !== archived) {
      problems.push(
        `${rel}: ${archived ? "보관 대상인데 전체 페이지다(라우트 generateStaticParams 와 보관 판정이 어긋났다)" : "전체 페이지 대상인데 보관 지면이다"}`,
      );
    }
    if (archived && existsSync(path.join(path.dirname(abs), "index.txt"))) {
      problems.push(`${rel}: 보관 지면 옆에 RSC(index.txt)가 남아 있다`);
    }
  };
  for (const locale of plannedLocales(plans)) {
    const plan = plans[locale]!;
    for (const id of plan.archivedArticleIds) check(articlePagePath(locale, id), true);
    for (const id of plan.liveArticleIds) check(articlePagePath(locale, id), false);
    for (const date of plan.archivedEditionDates) check(editionPagePath(locale, date), true);
    for (const date of plan.liveEditionDates) check(editionPagePath(locale, date), false);
  }
  return problems;
}

/** out/index.html 의 공용 조각 + 사이트 주소·basePath 가 렌더러 값과 같은지 확인. */
function checkedAssets(outDir: string): BuildAssets {
  const assets = readBuildAssets(outDir);
  if (assets.basePath !== BASE_PATH || assets.siteUrl !== SITE_URL) {
    throw new Error(
      `보관 지면 렌더러의 주소(${SITE_URL}, basePath "${BASE_PATH}")가 빌드(${assets.siteUrl}, basePath "${assets.basePath}")와 다르다 — ` +
        "scripts/postbuild.ts 가 NEXT_PUBLIC_SITE_URL·NEXT_PUBLIC_BASE_PATH 를 채운 뒤 불러와야 한다",
    );
  }
  return assets;
}

/**
 * 기본 데이터 출처 — 전체 페이지와 같은 뷰 로더(src/views/data.ts: 언어판 기사 범위·호 목록·세 줄 요약·영어 묶인 보도)와
 * db.ts 조회(읽기 전용 커넥션, data/app.db). 한국어판 결과는 Phase 4-3 그대로다(ko 로더는 입력을 그대로 돌려준다).
 */
export function dbArchiveSource(): ArchiveSource {
  const issueDates = getIssueDates();
  const englishIds = new Set(getEnglishArticleIds());
  let nameEn: Map<string, string> | null = null;

  /** 언어판 호 목록·호별 기사 수(호의 "이 호의 다른 기사 N건") — 언어판마다 한 번만 만든다. */
  const cache = new Map<
    Locale,
    { refs: ReturnType<typeof localeEditionRefs>; count: Map<string, number> }
  >();
  const issuesOf = (locale: Locale) => {
    let hit = cache.get(locale);
    if (!hit) {
      const count = new Map<string, number>();
      for (const [id, d] of issueDates)
        if (locale === DEFAULT_LOCALE || englishIds.has(id)) count.set(d, (count.get(d) ?? 0) + 1);
      hit = { refs: localeEditionRefs(locale), count };
      cache.set(locale, hit);
    }
    return hit;
  };

  const plans: ArchivePlans = Object.fromEntries(
    ARCHIVE_LOCALES.map((l) => [l, localeArchivePlan(l)]),
  );
  // 공유 썸네일 판정 기준(한국어 호 metadata) — 두 언어판 계획이 같은 DB 최신 호를 쓴다.
  const latestEditionDate = plans[DEFAULT_LOCALE]?.latestEditionDate ?? null;

  return {
    plans,
    article(id, locale) {
      const found = loadArticle(locale, id);
      const issueDate = issueDates.get(id);
      if (!found || !issueDate) return null;
      // 영어판: 묶인 보도의 매체를 영문명으로, 한국어 제목을 표지로(전체 영어 상세와 같은 englishRelated).
      const article =
        locale === DEFAULT_LOCALE || !found.related?.length
          ? found
          : { ...found, related: englishRelated(found.related, (nameEn ??= getSourceNameEnMap())) };
      const { refs, count } = issuesOf(locale);
      const ref = refs.find((r) => r.date === issueDate) ?? null;
      return {
        article,
        issueDate,
        issue: ref ? { ref, count: count.get(issueDate) ?? 0 } : null,
        languages: languageAlternates({ kind: "article", id }),
      };
    },
    edition(date, locale) {
      const { refs } = issuesOf(locale);
      const i = refs.findIndex((r) => r.date === date);
      if (i < 0) return null;
      const ref = refs[i];
      const edition = buildEdition(localeArticles(locale, getIssueArticles(date)));
      return {
        ref,
        edition,
        brief: localeBrief(locale, selectIssueBrief(edition, getIssueBriefs(date)), edition.issue),
        prev: refs[i - 1] ?? null,
        next: refs[i + 1] ?? null,
        latestEditionDate,
        languages: languageAlternates({ kind: "edition", date }),
      };
    },
  };
}

/** 후처리 단계(POSTBUILD_STEPS) — DB 로 보관 지면을 쓰고 확인한다. 결과의 bytes 는 지운 양이 아니라 쓴 양(addedBytes). */
export function archiveStep(outDir: string) {
  const r = writeArchivePages(outDir, dbArchiveSource());
  return {
    files: r.files,
    bytes: 0,
    addedBytes: r.bytes,
    detail: `기사 ${r.articles}·호 ${r.editions}, 바뀜 ${r.changed}`,
  };
}
