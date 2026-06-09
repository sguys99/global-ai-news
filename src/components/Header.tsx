import Link from "next/link";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

/**
 * 전역 헤더. 테마 적응형 슬림 바 (DESIGN.md global-nav 변형).
 * 배경은 테마에 따라 흰/파치먼트 ↔ 검정으로 전환되고, 하단 hairline으로 구분한다.
 */
export function Header() {
  return (
    <header className="border-border bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-13 max-w-[1440px] items-center justify-between px-6">
        <Link
          href="/"
          className="text-primary text-caption font-semibold tracking-tight"
        >
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
