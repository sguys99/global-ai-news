"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * next-themes 래퍼. `.dark` 클래스를 <html>에 토글한다.
 * 색상 토큰(:root / .dark)은 globals.css에 이미 DESIGN.md 기준으로 정의됨.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
