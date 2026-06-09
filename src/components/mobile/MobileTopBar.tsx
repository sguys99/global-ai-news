import Link from "next/link";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

/**
 * 모바일 전용 상단 바 (mobile-plan Phase 1).
 * 데스크톱 Header(`hidden md:flex`)의 모바일 짝으로 `flex md:hidden`만 렌더된다.
 * 마크업은 SSR↔CSR 동일 → 하이드레이션 미스매치 없음. 로고 + 검색 + 테마토글.
 */
export function MobileTopBar() {
  return (
    <header className="border-border bg-background/80 sticky top-0 z-50 flex border-b backdrop-blur md:hidden">
      <div className="flex h-13 w-full items-center justify-between px-4">
        <Link href="/" className="text-primary text-[18px] font-semibold tracking-tight">
          Daily AI Brief
        </Link>
        <nav className="flex items-center gap-1">
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
