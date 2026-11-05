import type { Metadata, Viewport } from "next";
import { SiteShell, siteViewport } from "@/app/SiteShell";
import { KO_LAYOUT_METADATA } from "@/lib/pageMetadata";

/*
 * 한국어판 최상위 레이아웃(`<html lang="ko">`). 영어판은 형제 레이아웃 (en)/en/layout.tsx, 앱 전체 404 는
 * src/app/global-not-found.tsx — 앱 루트 레이아웃은 없다(english-version-plan 아키텍처 결정, Phase 0-2 1안).
 * 셸(html·body·헤더·푸터·서체·globals.css)은 SiteShell 이 셋 모두에 같게 그린다.
 */

/** 내용은 `KO_LAYOUT_METADATA`(src/lib/pageMetadata.ts) — 빌드 후 보관 지면(src/lib/archivePage.ts)이 같은 값으로 `<head>` 를 만든다. */
export const metadata: Metadata = KO_LAYOUT_METADATA;

export const viewport: Viewport = siteViewport;

export default function KoreanRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SiteShell locale="ko">{children}</SiteShell>;
}
