import { ADMIN_COOKIE, SESSION_MAX_AGE, signSession, verifyPassword } from "@/lib/auth";

/**
 * POST /api/admin/login — 비밀번호 검증 후 서명 세션 쿠키 발급.
 * body: { password: string }
 */
export async function POST(req: Request) {
  let password = "";
  try {
    const body = (await req.json()) as { password?: string };
    password = body.password ?? "";
  } catch {
    // 잘못된 JSON → 빈 비밀번호로 간주(아래에서 401)
  }

  if (!verifyPassword(password)) {
    return Response.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const token = await signSession();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const res = Response.json({ ok: true });
  res.headers.set(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`,
  );
  return res;
}
