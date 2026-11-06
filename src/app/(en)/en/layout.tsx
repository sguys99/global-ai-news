import type { Metadata, Viewport } from "next";
import { SiteShell, siteViewport } from "@/app/SiteShell";
import { EN_LAYOUT_METADATA } from "@/lib/pageMetadata";

/*
 * 영어판 최상위 레이아웃(`<html lang="en">`, english-version-plan 아키텍처 결정 1안). (ko)/layout.tsx 의 형제다.
 * 영어 페이지는 Phase 5 에서 이 아래(`(en)/en/**`)에 생긴다 — 지금은 페이지가 없어 산출물에 아무것도 더하지 않는다.
 * SiteShell 이 locale="en" 이면 LocaleProvider 로 감싸 클라이언트 컴포넌트가 영어 문구를 고른다.
 */

/** 내용은 `EN_LAYOUT_METADATA`(src/lib/pageMetadata.ts) — 영어 보관 지면(src/lib/archivePage.ts)이 같은 값으로 `<head>` 를 만든다. */
export const metadata: Metadata = EN_LAYOUT_METADATA;

export const viewport: Viewport = siteViewport;

export default function EnglishRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SiteShell locale="en">{children}</SiteShell>;
}
