"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** 헤더 높이(px) — 제호가 이 선 위로 완전히 지나가면 워드마크를 보인다. */
const HEADER_OFFSET = 56;

/**
 * 헤더 워드마크. 홈 마스트헤드(`#masthead`)의 대형 제호가 화면에 보이는 동안에는 숨겨
 * 제호가 두 번 보이지 않게 하고, 스크롤로 지나가면 페이드인한다(신문 사이트의 축약 로고 패턴).
 * 마스트헤드가 없는 화면(상세·검색·필터 결과)에서는 항상 보인다.
 * SSR 초기값: 마스트헤드가 있는 홈·호 고정 링크는 숨김(최상단 = 제호 노출), 그 외 표시
 * → 하이드레이션 깜빡임 없음.
 */
export function HeaderWordmark({ className }: { className?: string }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(pathname !== "/" && !pathname.startsWith("/edition/"));

  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const masthead = document.getElementById("masthead");
        const nameplate = masthead?.querySelector("h1");
        setVisible(!nameplate || nameplate.getBoundingClientRect().bottom < HEADER_OFFSET);
      });
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // 같은 경로에서 쿼리만 바뀌어 마스트헤드가 생기거나 사라지는 경우(홈 ↔ 필터 결과)를 감지
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      observer.disconnect();
    };
  }, [pathname]);

  return (
    <Link
      href="/"
      aria-label="Daily AI Brief 홈"
      tabIndex={visible ? undefined : -1}
      aria-hidden={visible ? undefined : true}
      className={cn(
        "focus-visible:ring-ring font-serif text-xl font-extrabold tracking-[-0.045em] whitespace-nowrap outline-none focus-visible:ring-2",
        "transition-[opacity,transform] duration-200 ease-out",
        visible ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        className,
      )}
    >
      Daily <span className="text-brand">AI</span> Brief
    </Link>
  );
}
