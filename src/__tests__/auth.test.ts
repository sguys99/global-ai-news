// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSession, verifyPassword, verifySession } from "@/lib/auth";

const PW = "s3cret-pass";

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PW;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ADMIN_PASSWORD;
});

describe("verifyPassword", () => {
  it("일치하면 true, 불일치하면 false", () => {
    expect(verifyPassword(PW)).toBe(true);
    expect(verifyPassword("wrong")).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });
});

describe("signSession / verifySession", () => {
  it("발급한 토큰은 검증을 통과한다(라운드트립)", async () => {
    const token = await signSession();
    expect(await verifySession(token)).toBe(true);
  });

  it("undefined/빈 토큰은 거부", async () => {
    expect(await verifySession(undefined)).toBe(false);
    expect(await verifySession("")).toBe(false);
    expect(await verifySession("no-dot")).toBe(false);
  });

  it("서명이 변조되면 거부", async () => {
    const token = await signSession();
    const [payload] = token.split(".");
    const tampered = `${payload}.AAAA`;
    expect(await verifySession(tampered)).toBe(false);
  });

  it("payload(만료시각)가 변조되면 서명 불일치로 거부", async () => {
    const token = await signSession();
    const [, sig] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ exp: Date.now() + 999999 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySession(`${forgedPayload}.${sig}`)).toBe(false);
  });

  it("다른 비밀번호로 서명된 토큰은 거부", async () => {
    const token = await signSession();
    process.env.ADMIN_PASSWORD = "different-pass";
    expect(await verifySession(token)).toBe(false);
  });

  it("만료된 토큰은 거부", async () => {
    const token = await signSession();
    // 8일 후로 시간 이동(TTL 7일 초과)
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await verifySession(token)).toBe(false);
  });
});
