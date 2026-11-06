/**
 * 언어 전환(english-version-plan 5-3) — 링크 대상과 영어 안내 줄 표시의 순수 규칙. 클라이언트 셸(LocaleSwitch·EnglishNotice)과
 * 테스트가 쓴다(DB 없음 — 셸 번들에 실린다).
 *
 * 규칙: "같은 페이지의 다른 언어판, 없으면 그 언어의 홈". 다른 언어판이 있는지는 **서버가** 페이지 `<head>` 의
 * `<link rel="alternate" hreflang="ko|en">`(라우트 metadata `alternates.languages` — src/views/data.ts `languageAlternates`)로
 * 알린다. 그래서 정적 HTML 의 전환 링크는 늘 상대 언어 홈(언제나 있는 주소 — 크롤러가 죽은 링크를 보지 않는다)이고,
 * 마운트 뒤 그 `<link>` 가 있으면 그 주소로 바꾼다. 셸은 페이지마다 다른 값을 props 로 받지 않는다(RSC 무게 — Phase 4-1).
 */
import { HTML_LANG, localePath, splitLocalePath, type Locale } from "@/lib/i18n";
import { BASE_PATH } from "@/lib/site";

/** 두 언어판 중 다른 쪽. */
export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "ko" : "en";
}

/** 언어판 홈 주소(basePath 포함, 일반 `<a>` 용) — ko `/global-ai-news/`, en `/global-ai-news/en/`(dev 는 `/`·`/en/`). */
export function localeHomeHref(target: Locale): string {
  return `${BASE_PATH}${localePath(target, "/")}`;
}

/** 페이지 `<head>` 에서 대상 언어판을 찾는 선택자(Next 는 `hrefLang` 을 `hreflang` 속성으로 그린다). */
export function alternateSelector(target: Locale): string {
  return `link[rel="alternate"][hreflang="${HTML_LANG[target]}"]`;
}

/**
 * 전환 링크 주소. `alternate` = 페이지 `<head>` 의 대상 언어 `<link rel="alternate">` href(없으면 null → 대상 언어 홈).
 * Next 는 metadataBase(SITE_URL — 배포 주소, basePath 포함)로 절대 URL 을 만든다 — 경로(+ basePath)만 쓰고 호스트는 버린다
 * (dev 서버 포트·미리보기 호스트에서도 지금 사이트 안에서 이동). 검색 페이지끼리는 지금 쿼리(`?q=…`)를 이어 준다.
 */
export function localeSwitchHref(
  target: Locale,
  alternate: string | null | undefined,
  search = "",
): string {
  if (!alternate) return localeHomeHref(target);
  let pathname: string;
  try {
    pathname = new URL(alternate, "http://localhost").pathname;
  } catch {
    return localeHomeHref(target);
  }
  const bare =
    BASE_PATH && pathname.startsWith(`${BASE_PATH}/`) ? pathname.slice(BASE_PATH.length) : pathname;
  const isSearch = /^\/search\/?$/.test(splitLocalePath(bare).path);
  return isSearch && search.startsWith("?") && search.length > 1
    ? `${pathname}${search}`
    : pathname;
}

/** 지금 문서 기준 전환 주소(브라우저 전용). */
export function currentLocaleSwitchHref(target: Locale): string {
  const link = document.querySelector<HTMLLinkElement>(alternateSelector(target));
  return localeSwitchHref(target, link?.getAttribute("href"), window.location.search);
}

// ─── 영어 안내 줄(한국어 페이지) ──────────────────────────────────────────────

/** 안내 줄을 닫은 기록(localStorage 키 — 값 "1"). */
export const ENGLISH_NOTICE_DISMISS_KEY = "en-notice-dismissed";

/**
 * 한국어 페이지에 `Read AI Daybook in English →` 를 띄울지: 브라우저 선호 언어 중 `ko`(ko·ko-KR…)가 하나도 없고, 닫은 적이
 * 없을 때. 선호 언어를 모르면(빈 목록) 띄우지 않는다 — 한국어 독자에게 잘못 보이는 쪽보다 안 보이는 쪽이 낫다.
 */
export function shouldShowEnglishNotice(
  languages: readonly string[] | null | undefined,
  dismissed: boolean,
): boolean {
  if (dismissed) return false;
  const list = (languages ?? []).filter(Boolean);
  if (list.length === 0) return false;
  return !list.some((lang) => /^ko(?:-|_|$)/i.test(lang.trim()));
}

/** 브라우저 선호 언어(`navigator.languages`, 없으면 `navigator.language`). */
export function browserLanguages(): string[] {
  const nav = window.navigator;
  if (nav.languages && nav.languages.length > 0) return [...nav.languages];
  return nav.language ? [nav.language] : [];
}

/** 닫은 기록 읽기 — 저장소를 못 쓰면(사생활 모드·차단) 닫은 적 없음. */
export function readNoticeDismissed(): boolean {
  try {
    return window.localStorage.getItem(ENGLISH_NOTICE_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** 닫은 기록 쓰기 — 실패해도 이번 화면에서는 닫힌다. */
export function writeNoticeDismissed(): void {
  try {
    window.localStorage.setItem(ENGLISH_NOTICE_DISMISS_KEY, "1");
  } catch {
    /* 저장소 없음 — 다음 방문에 다시 보인다 */
  }
}
