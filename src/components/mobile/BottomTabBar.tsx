"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 모바일 하단 탭 바 (mobile-plan Phase 1).
 * 2탭(피드/검색). frosted(`bg-background/80 backdrop-blur`) + hairline(`border-t`),
 * active는 색조 없이 `text-primary font-semibold` 대비로만 표현(globals.css ink 원칙).
 * safe-area-inset-bottom 패딩으로 notch 기기 대응, `md:hidden`으로 데스크톱 비노출.
 * 상세(`/article/*`)에서는 몰입을 위해 렌더하지 않는다(`null`).
 */
const TABS = [
  { href: "/", label: "피드", icon: Home },
  { href: "/search", label: "검색", icon: Search },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  // 상세 화면에서는 하단 탭 바를 숨긴다
  if (pathname.startsWith("/article")) return null;

  return (
    <nav
      aria-label="모바일 내비게이션"
      className="border-border bg-background/80 fixed inset-x-0 bottom-0 z-50 flex border-t backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
              active ? "text-primary font-semibold" : "text-muted-foreground font-normal",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
