import type { Metadata, Viewport } from "next";
import { SiteShell, siteViewport } from "@/app/SiteShell";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  SITE_VERIFICATION,
  shareMetadata,
} from "@/lib/site";

/*
 * 한국어판 최상위 레이아웃(`<html lang="ko">`). 영어판은 형제 레이아웃 (en)/en/layout.tsx, 앱 전체 404 는
 * src/app/global-not-found.tsx — 앱 루트 레이아웃은 없다(english-version-plan 아키텍처 결정, Phase 0-2 1안).
 * 셸(html·body·헤더·푸터·서체·globals.css)은 SiteShell 이 셋 모두에 같게 그린다.
 */

export const metadata: Metadata = {
  // og:url·og:image 상대 경로의 절대화 기준(basePath 포함).
  metadataBase: new URL(SITE_URL),
  // 홈은 페이지 title 이 없어 이 값을 쓴다(검색 결과 제목). 상세·호·검색은 페이지가 "… — AI Daybook" 으로 덮는다.
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // 공유 메타를 따로 정의하지 않은 페이지의 기본값. og:url·canonical 은 페이지마다 달라 두지 않는다.
  ...shareMetadata({ title: SITE_NAME, description: SITE_DESCRIPTION }),
  verification: SITE_VERIFICATION,
};

export const viewport: Viewport = siteViewport;

export default function KoreanRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SiteShell locale="ko">{children}</SiteShell>;
}
