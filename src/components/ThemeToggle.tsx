"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * 라이트 ↔ 다크 토글. 현재 표시(resolvedTheme) 기준으로 반대 테마로 전환한다.
 * mounted 가드로 SSR/CSR 불일치(hydration mismatch)를 피한다.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* 마운트 전에는 아이콘을 숨겨 깜빡임을 막는다 */}
      {mounted && (isDark ? <Moon /> : <Sun />)}
    </Button>
  );
}
