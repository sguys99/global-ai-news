"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutDashboard, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 모바일 하단 탭 바 (mobile-plan Phase 1·5).
 * 공개 영역은 2탭(피드/검색). 종이색 frosted(`bg-background/90 backdrop-blur`) + 잉크 괘선(`border-t`),
 * active는 잉크(`text-primary font-semibold`) + 상단 코발트 인디케이터(DESIGN.md v2 bottom-tab-bar).
 * safe-area-inset-bottom 패딩으로 notch 기기 대응, `md:hidden`으로 데스크톱 비노출.
 * 상세(`/article/*`)·로그인(`/admin/login`)에서는 몰입을 위해 렌더하지 않는다(`null`).
 * 관리자(`/admin/*`)는 자체 바 변형(피드/콘솔)을 노출 — 공개 바에 admin 탭을 두지 않아
 * 미인증 사용자의 리다이렉트 혼란을 막는다(mobile-plan 리스크 표).
 */
const PUBLIC_TABS = [
  { href: "/", label: "피드", icon: Home },
  { href: "/search", label: "검색", icon: Search },
] as const;

const ADMIN_TABS = [
  { href: "/", label: "피드", icon: Home },
  { href: "/admin", label: "콘솔", icon: LayoutDashboard },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  // 상세·로그인 화면에서는 하단 탭 바를 숨긴다
  if (pathname.startsWith("/article") || pathname === "/admin/login") return null;

  const tabs = pathname.startsWith("/admin") ? ADMIN_TABS : PUBLIC_TABS;

  return (
    <nav
      aria-label="모바일 내비게이션"
      className="border-rule bg-background/90 fixed inset-x-0 bottom-0 z-50 flex border-t backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring relative flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset",
              "before:absolute before:top-0 before:h-0.5 before:w-8 before:transition-colors",
              active
                ? "text-primary before:bg-brand font-semibold"
                : "text-muted-foreground font-normal before:bg-transparent",
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
