"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { localePath, splitLocalePath } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";
import { cn } from "@/lib/utils";

/** 언어 접두어 없는 경로 — 링크는 localePath 로, 활성 판정은 접두어를 뗀 지금 경로와 맞춘다. */
const LINKS = [
  { href: "/", key: "today" },
  { href: "/search", key: "search" },
] as const;

/** 데스크톱 헤더 내비. 활성 항목은 코발트 밑줄(색이 아닌 밑줄로도 상태 전달). */
export function HeaderNav() {
  const locale = useLocale();
  const t = useMessages(commonMessages);
  const path = splitLocalePath(usePathname()).path;
  return (
    <nav aria-label={t.mainNavLabel} className="flex items-center gap-5">
      {LINKS.map(({ href, key }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={localePath(locale, href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-caption focus-visible:ring-ring py-1 font-semibold underline-offset-[18px] outline-none focus-visible:ring-2",
              active
                ? "text-foreground decoration-brand underline decoration-2"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.nav[key]}
          </Link>
        );
      })}
    </nav>
  );
}
