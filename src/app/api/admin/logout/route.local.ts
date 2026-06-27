import { ADMIN_COOKIE } from "@/lib/auth";

/** POST /api/admin/logout — 세션 쿠키 만료. */
export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.set("Set-Cookie", `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
