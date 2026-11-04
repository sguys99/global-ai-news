import { Hahmlet } from "next/font/google";
import localFont from "next/font/local";

/*
 * 사이트 서체 인스턴스 — 최상위 레이아웃 (ko)·(en) 과 global-not-found 가 함께 쓴다(SiteShell).
 * next/font 는 모듈 최상위에서 한 번 불러야 하고, 같은 모듈을 여러 곳이 import 해도 인스턴스·@font-face 는 하나다.
 */

/** 한글·라틴 본문 폰트. Pretendard Variable 자가 호스팅, font-display: swap(globals.css --font-sans). */
export const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

/**
 * 헤드라인·제호 세리프(DESIGN.md §9). next/font/google 이 빌드타임에 내려받아 자체 호스팅하므로
 * 런타임 외부 요청이 없다. 한글 글리프는 unicode-range 조각으로 나뉘어 필요한 조각만 로드된다.
 * preload=false: 조각이 많은 CJK 폰트는 선로딩하지 않고 swap으로 표시한다.
 */
export const hahmlet = Hahmlet({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-hahmlet",
});

/** `<html className>` — 두 서체의 CSS 변수(--font-pretendard·--font-hahmlet)를 문서 전체에 건다. */
export const fontVariables = `${pretendard.variable} ${hahmlet.variable}`;
