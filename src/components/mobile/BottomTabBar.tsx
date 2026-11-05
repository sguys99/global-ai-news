"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { localePath, splitLocalePath } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";

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
// 공개 탭 아이콘은 가벼운 Icon(속성은 globals.css `.ic`), 로컬 전용 콘솔 탭은 lucide 그대로.
const HOME_ICON = <Icon name="house" className="size-5" />;
const PUBLIC_TABS = [
  { href: "/", key: "feed", icon: HOME_ICON },
  { href: "/search", key: "search", icon: <Icon name="search" className="size-5" /> },
] as const;

const ADMIN_TABS = [
  { href: "/", key: "feed", icon: HOME_ICON },
  { href: "/admin", key: "console", icon: <LayoutDashboard className="size-5" /> },
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
      className="sh-tabs"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map(({ href, key, icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={localePath(locale, href)}
            aria-current={active ? "page" : undefined}
            className={active ? "sh-tb sh-tb-on" : "sh-tb sh-tb-off"}
          >
            {icon}
            {t.nav[key]}
          </Link>
        );
      })}
    </nav>
  );
}
