"use client";

import type { ReactNode } from "react";
import { Analytics } from "@/components/Analytics";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BottomTabBar } from "@/components/mobile/BottomTabBar";
import { MobileTopBar } from "@/components/mobile/MobileTopBar";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * 사이트 고정 크롬(테마·헤더·모바일 상단 바·푸터·하단 탭 바·방문 집계)을 **클라이언트 섬 하나**로 묶는다
 * (Phase 4-1 페이지 무게, 분석 순위 7). SiteShell 이 `<body>` 안에 이것 하나를 그리고 페이지 본문은 children 으로 넘긴다.
 *
 * 따로 두면 섬마다 RSC 에 모듈 참조 행(`I[…]`, 청크 목록 포함 약 270B)이 하나씩 붙고(테마·워드마크·내비·토글·방문 줄·
 * 탭 바·집계 7개), 서버 컴포넌트였던 헤더·모바일 바·푸터는 렌더된 요소 트리가 통째로 실린다 — 모든 페이지에 두 벌(인라인·.txt).
 * 하나로 묶으면 참조 행 하나와 props(언어·연도)만 남는다. 정적 HTML 은 같다(같은 컴포넌트를 SSR 한다).
 * 한국어는 언어 공급자 없이 그린다(컨텍스트 기본값 ko), 그 밖의 언어만 LocaleProvider 로 감싼다.
 */
export function ShellChrome({
  locale,
  year,
  children,
}: {
  locale: Locale;
  /** 푸터 저작권 연도 — 빌드(서버) 시각 값. 브라우저가 다시 계산하면 연말 빌드가 하이드레이션에서 어긋난다. */
  year: number;
  children: ReactNode;
}) {
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
      {locale === DEFAULT_LOCALE ? (
        chrome
      ) : (
        <LocaleProvider locale={locale}>{chrome}</LocaleProvider>
      )}
      <Analytics />
    </>
  );
}
