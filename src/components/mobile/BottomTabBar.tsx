"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutDashboard, Search } from "lucide-react";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { localePath, splitLocalePath } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";
import { cn } from "@/lib/utils";

/**
 * 모바일 하단 탭 바 (mobile-plan Phase 1·5).
 * 공개 영역은 2탭(피드/검색). 종이색 frosted(`bg-background/90 backdrop-blur`) + 잉크 괘선(`border-t`),
 * active는 잉크(`text-primary font-semibold`) + 상단 코발트 인디케이터(DESIGN.md v2 bottom-tab-bar).
 * safe-area-inset-bottom 패딩으로 notch 기기 대응, `md:hidden`으로 데스크톱 비노출.
 * 상세(`/article/*`)·로그인(`/admin/login`)에서는 몰입을 위해 렌더하지 않는다(`null`).
 * 관리자(`/admin/*`)는 자체 바 변형(피드/콘솔)을 노출 — 공개 바에 admin 탭을 두지 않아
 * 미인증 사용자의 리다이렉트 혼란을 막는다(mobile-plan 리스크 표).
 * 경로는 언어 접두어 없이 두고 링크만 localePath 로 언어판에 맞춘다 — 판정(숨김·활성)은 접두어를 뗀 지금 경로로 한다.
 * 관리자는 로컬 한국어 전용이라 영어 접두어가 붙을 일이 없다.
 */
const PUBLIC_TABS = [
  { href: "/", key: "feed", icon: Home },
  { href: "/search", key: "search", icon: Search },
] as const;

const ADMIN_TABS = [
  { href: "/", key: "feed", icon: Home },
  { href: "/admin", key: "console", icon: LayoutDashboard },
] as const;

export function BottomTabBar() {
  const locale = useLocale();
  const t = useMessages(commonMessages);
  const path = splitLocalePath(usePathname()).path;

  // 상세·로그인 화면에서는 하단 탭 바를 숨긴다
  if (path.startsWith("/article") || path === "/admin/login") return null;

  const tabs = path.startsWith("/admin") ? ADMIN_TABS : PUBLIC_TABS;

  return (
    <nav
      aria-label={t.mobileNavLabel}
      className="border-rule bg-background/90 fixed inset-x-0 bottom-0 z-50 flex border-t backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map(({ href, key, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={localePath(locale, href)}
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
            {t.nav[key]}
          </Link>
        );
      })}
    </nav>
  );
}
