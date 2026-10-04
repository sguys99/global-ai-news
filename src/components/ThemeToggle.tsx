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

  // 서버는 테마를 모르므로 마운트 전에는 중립 라벨을 써야 aria-label 하이드레이션 불일치가 없다.
  const isDark = mounted && resolvedTheme === "dark";
  const label = !mounted ? "테마 전환" : isDark ? "라이트 모드로 전환" : "다크 모드로 전환";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* 마운트 전에는 아이콘을 숨겨 깜빡임을 막는다 */}
      {mounted && (isDark ? <Moon /> : <Sun />)}
    </Button>
  );
}
