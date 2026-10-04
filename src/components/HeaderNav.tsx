"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "오늘의 지면" },
  { href: "/search", label: "검색" },
] as const;

/** 데스크톱 헤더 내비. 활성 항목은 코발트 밑줄(색이 아닌 밑줄로도 상태 전달). */
export function HeaderNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="주 메뉴" className="flex items-center gap-5">
      {LINKS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-caption focus-visible:ring-ring py-1 font-semibold underline-offset-[18px] outline-none focus-visible:ring-2",
              active
                ? "text-foreground decoration-brand underline decoration-2"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
