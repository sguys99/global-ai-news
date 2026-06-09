import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BottomTabBar } from "@/components/mobile/BottomTabBar";
import { MobileTopBar } from "@/components/mobile/MobileTopBar";
import "./globals.css";

/** 한글·라틴 본문 폰트. Pretendard Variable 자가 호스팅, font-display: swap(globals.css --font-sans). */
const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

export const metadata: Metadata = {
  title: "Daily AI Brief",
  description: "글로벌·한국 AI/IT 뉴스를 매일 한국어 요약으로 제공하는 데일리 브리핑",
};

/** 모바일 셸(mobile-plan Phase 1): notch/safe-area 대응 + 테마별 브라우저 크롬 색. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <body className="bg-background text-foreground flex min-h-screen flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] antialiased md:pb-0">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <Header />
          <MobileTopBar />
          <div className="flex-1">{children}</div>
          <Footer />
          <BottomTabBar />
        </ThemeProvider>
      </body>
    </html>
  );
}
