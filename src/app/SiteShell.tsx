import type { Viewport } from "next";
import type { ReactNode } from "react";
import { ShellChrome } from "@/components/ShellChrome";
import { HTML_LANG, type Locale } from "@/lib/i18n";
import { fontVariables } from "./fonts";
import "./globals.css";

/*
 * 사이트 문서 셸 — `<html>`·`<body>`와 그 안의 고정 크롬(헤더·모바일 바·푸터·테마·방문 집계).
 * 최상위 레이아웃이 언어마다 하나씩((ko)/layout.tsx·(en)/en/layout.tsx)이고 앱 전체 404(global-not-found.tsx)는
 * 레이아웃을 거치지 않으므로, 세 곳이 이 컴포넌트 하나를 그려 셸이 갈라지지 않게 한다(english-version-plan Phase 3-3).
 * globals.css 도 여기서 한 번 import 한다 — 세 진입점 모두 이 모듈을 거친다.
 */

/** 모바일 셸(mobile-plan Phase 1): notch/safe-area 대응 + 테마별 브라우저 크롬 색. 두 레이아웃·404 공용. */
export const siteViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1118" },
  ],
};

export function SiteShell({
  locale,
  head,
  localeFromDocument,
  children,
}: Readonly<{
  /**
   * 문서 언어 — `<html lang>`. 고정 크롬(ShellChrome, 클라이언트)은 이 값으로 LocaleProvider 를 정하고(ko 는 공급자 없음)
   * 헤더·모바일 바·푸터·탭 바가 컨텍스트로 읽는다.
   */
  locale: Locale;
  /** `<head>`에 직접 넣을 요소(global-not-found 의 언어 판정 스크립트). 없으면 `<head>`를 쓰지 않는다 — Next 가 채운다. */
  head?: ReactNode;
  /** 404 전용 — 셸 문구 언어를 문서 lang(head 스크립트가 `/en` 아래면 en 으로 바꾼다)으로 고른다(ShellChrome). */
  localeFromDocument?: boolean;
  children: ReactNode;
}>) {
  return (
    <html lang={HTML_LANG[locale]} className={fontVariables} suppressHydrationWarning>
      {head ? <head>{head}</head> : null}
      <body className="sh-body">
        {/* 고정 크롬은 클라이언트 섬 하나(ShellChrome) — RSC 에는 참조 한 줄과 언어·연도만 실린다(Phase 4-1). */}
        <ShellChrome
          locale={locale}
          year={new Date().getFullYear()}
          // 404 만 넘긴다 — 다른 페이지 RSC 에 빈 prop(`$undefined`)이 실리지 않게.
          {...(localeFromDocument ? { localeFromDocument } : {})}
        >
          {children}
        </ShellChrome>
      </body>
    </html>
  );
}
