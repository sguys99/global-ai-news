import type { Metadata, Viewport } from "next";
import { SiteShell, siteViewport } from "@/app/SiteShell";
import { SITE_DESCRIPTION_EN, SITE_TITLE_EN, SITE_URL, SITE_VERIFICATION } from "@/lib/site";

/*
 * 영어판 최상위 레이아웃(`<html lang="en">`, english-version-plan 아키텍처 결정 1안). (ko)/layout.tsx 의 형제다.
 * 영어 페이지는 Phase 5 에서 이 아래(`(en)/en/**`)에 생긴다 — 지금은 페이지가 없어 산출물에 아무것도 더하지 않는다.
 * SiteShell 이 locale="en" 이면 LocaleProvider 로 감싸 클라이언트 컴포넌트가 영어 문구를 고른다.
 */

export const metadata: Metadata = {
  // og:url·og:image 상대 경로의 절대화 기준 — 영어 페이지에도 반드시 필요하다(없으면 og:image 경고·오류).
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE_EN,
  description: SITE_DESCRIPTION_EN,
  verification: SITE_VERIFICATION,
};

export const viewport: Viewport = siteViewport;

export default function EnglishRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SiteShell locale="en">{children}</SiteShell>;
}
