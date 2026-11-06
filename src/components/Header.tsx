import { HeaderNav } from "@/components/HeaderNav";
import { HeaderWordmark } from "@/components/HeaderWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * 데스크톱 전역 헤더 (DESIGN.md v2 site-header). 종이색 프로스티드 슬림 바 + 하단 hairline.
 * 좌: 워드마크(홈에선 제호를 지나면 등장), 우: 주 메뉴 · 테마 토글.
 * 모바일(<md)에서는 `MobileTopBar`가 대신 노출되므로 `hidden md:block`으로 데스크톱 전용.
 */
export function Header() {
  return (
    <header className="sh-hdr">
      <div className="sh-hdr-in">
        <HeaderWordmark />
        <div className="ml-auto flex items-center gap-6">
          <HeaderNav />
          {/* 언어 전환 자리(5-3): 내비 뒤 헤어라인으로 나눈 흐린 글자 — 영어 페이지 `한국어`(lang=ko), 한국어 페이지 `EN`. */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
