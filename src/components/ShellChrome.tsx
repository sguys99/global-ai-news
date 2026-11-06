"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Analytics } from "@/components/Analytics";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BottomTabBar } from "@/components/mobile/BottomTabBar";
import { MobileTopBar } from "@/components/mobile/MobileTopBar";
import { DEFAULT_LOCALE, HTML_LANG, type Locale } from "@/lib/i18n";

/**
 * 사이트 고정 크롬(테마·헤더·모바일 상단 바·푸터·하단 탭 바·방문 집계)을 **클라이언트 섬 하나**로 묶는다
 * (Phase 4-1 페이지 무게, 분석 순위 7). SiteShell 이 `<body>` 안에 이것 하나를 그리고 페이지 본문은 children 으로 넘긴다.
 *
 * 따로 두면 섬마다 RSC 에 모듈 참조 행(`I[…]`, 청크 목록 포함 약 270B)이 하나씩 붙고(테마·워드마크·내비·토글·방문 줄·
 * 탭 바·집계 7개), 서버 컴포넌트였던 헤더·모바일 바·푸터는 렌더된 요소 트리가 통째로 실린다 — 모든 페이지에 두 벌(인라인·.txt).
 * 하나로 묶으면 참조 행 하나와 props(언어·연도)만 남는다. 정적 HTML 은 같다(같은 컴포넌트를 SSR 한다).
 * 한국어는 언어 공급자 없이 그린다(컨텍스트 기본값 ko), 그 밖의 언어만 LocaleProvider 로 감싼다.
 *
 * 앱 전체 404(global-not-found — 정적 호스팅이 모든 언어 경로에 쓰는 한 장)는 `localeFromDocument` 로 그린다: 서버 HTML 은
 * 한국어 셸이고, `<head>` 스크립트가 `/en` 아래에서 `<html lang="en">` 으로 바꿔 두면 하이드레이션 직후 셸 문구·링크가 영어로
 * 바뀐다(useSyncExternalStore — 하이드레이션은 서버 값 ko 로 맞추고 곧바로 문서 값으로 다시 그린다, 불일치 오류 없음).
 * 언어 전환 링크(english-version-plan 5-3)는 셸 컴포넌트(Header·MobileTopBar·Footer)의 자리 주석에 들어간다 —
 * 지금 언어는 useLocale(), 같은 페이지의 다른 언어판은 i18n `switchLocalePath(usePathname(), target)`.
 */
export function ShellChrome({
  locale,
  year,
  localeFromDocument = false,
  children,
}: {
  locale: Locale;
  /** 푸터 저작권 연도 — 빌드(서버) 시각 값. 브라우저가 다시 계산하면 연말 빌드가 하이드레이션에서 어긋난다. */
  year: number;
  /** 404 전용 — 셸 언어를 문서 `<html lang>`(404 의 언어 판정 스크립트가 정한다)으로 고른다. 서버 HTML 은 `locale`. */
  localeFromDocument?: boolean;
  children: ReactNode;
}) {
  const documentLocale = useSyncExternalStore(subscribeNever, readDocumentLocale, () => locale);
  const shellLocale = localeFromDocument ? documentLocale : locale;
  const chrome = (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <Header />
      <MobileTopBar />
      <div className="flex-1">{children}</div>
      <Footer year={year} />
      <BottomTabBar />
    </ThemeProvider>
  );
  return (
    <>
      {/* 404 는 언어가 바뀌어도 트리 모양이 같도록(본문이 다시 마운트되지 않게) 늘 공급자로 감싼다. */}
      {shellLocale === DEFAULT_LOCALE && !localeFromDocument ? (
        chrome
      ) : (
        <LocaleProvider locale={shellLocale}>{chrome}</LocaleProvider>
      )}
      <Analytics />
    </>
  );
}

/** 문서 언어는 첫 칠하기 전에 정해지고 바뀌지 않는다 — 구독할 것이 없다. */
const subscribeNever = () => () => {};

/** `<html lang>` → 언어판(en 이 아니면 기본 ko). */
function readDocumentLocale(): Locale {
  return document.documentElement.lang === HTML_LANG.en ? "en" : DEFAULT_LOCALE;
}
