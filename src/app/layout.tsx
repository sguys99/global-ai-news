import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily AI Brief",
  description:
    "글로벌·한국 AI/IT 뉴스를 매일 한국어 요약으로 제공하는 데일리 브리핑",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
