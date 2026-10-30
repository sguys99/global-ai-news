import Link from "next/link";
import { Search } from "lucide-react";
import { HeaderWordmark } from "@/components/HeaderWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

/**
 * 모바일 전용 상단 바. 데스크톱 Header(`hidden md:block`)의 모바일 짝으로 `md:hidden`만 렌더된다.
 * 워드마크(홈에선 제호를 지나면 등장) + 검색 + 테마 토글.
 */
export function MobileTopBar() {
  return (
    <header className="border-border bg-background/85 sticky top-0 z-50 border-b backdrop-blur-md md:hidden">
      <div className="flex h-13 w-full items-center justify-between px-4">
        {/* py-2: 워드마크 링크 터치 타깃 44px(바 높이 52px 안). inline-flex 는 "Daily " 의 공백을 지우므로 쓰지 않는다. */}
        <HeaderWordmark className="py-2 text-lg" />
        <nav className="-mr-2 flex items-center">
          <Button variant="ghost" size="icon" asChild aria-label="검색">
            <Link href="/search">
              <Search />
            </Link>
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
