import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySession } from "@/lib/auth";

/**
 * /admin/* 과 admin API 를 보호한다(Phase 5). Edge 런타임.
 * - 로그인 페이지/로그인 API 는 예외로 통과.
 * - 미인증 페이지 요청 → /admin/login 리다이렉트.
 * - 미인증 API 요청 → 401 JSON.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 로그인 자체는 보호 대상에서 제외(무한 리다이렉트 방지).
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (await verifySession(token)) return NextResponse.next();

  // 미인증.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const loginUrl = new URL("/admin/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
