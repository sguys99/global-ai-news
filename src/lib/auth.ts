/**
 * 관리자 인증 (Phase 5). 의존성 0 — Web Crypto(crypto.subtle)만 사용한다.
 *
 * ⚠️ 이 모듈은 Edge 런타임의 middleware.ts 와 Node 런타임의 라우트 핸들러 양쪽에서
 *    import 된다. 따라서 node:crypto / node:fs / better-sqlite3 등 Node 전용 모듈을
 *    절대 import 하지 않는다. (TextEncoder / crypto.subtle / btoa / atob 만 사용)
 *
 * 세션 토큰 = base64url(payloadJSON) + "." + base64url(HMAC-SHA256).
 * HMAC 키는 ADMIN_PASSWORD 에서 파생한다(별도 비밀 불필요).
 */

export const ADMIN_COOKIE = "admin_session";

/** 세션 유효기간(7일, ms). */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  /** 만료 시각(epoch ms). */
  exp: number;
}

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function adminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.");
  return pw;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(data: string, secret: string): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(sig);
}

/** 입력 비밀번호가 ADMIN_PASSWORD 와 일치하는지(상수시간 비교). */
export function verifyPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  return constantTimeEqual(encoder.encode(input), encoder.encode(expected));
}

/** 길이/내용 모두 상수시간 비교(타이밍 공격 완화). */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** 새 세션 토큰을 발급한다(exp = now + 7일). */
export async function signSession(): Promise<string> {
  const payload: SessionPayload = { exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await sign(payloadB64, adminPassword());
  return `${payloadB64}.${bytesToBase64Url(sig)}`;
}

/** 토큰의 서명·만료를 검증한다. 유효하면 true. */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let expectedSig: Uint8Array;
  try {
    expectedSig = await sign(payloadB64, adminPassword());
  } catch {
    return false;
  }
  if (!constantTimeEqual(base64UrlToBytes(sigB64), expectedSig)) return false;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payloadB64)),
    ) as SessionPayload;
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

/** Set-Cookie 에 쓸 쿠키 maxAge(초). */
export const SESSION_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000);
