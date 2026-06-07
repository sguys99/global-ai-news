/**
 * URL 정규화 + dedup 키 산출. PRD §3.2.
 * dedup_key = sha256(normalizeUrl(url)) 로 동일 기사 중복 저장을 막는다.
 */
import { createHash } from "node:crypto";

/**
 * URL 정규화: 소문자화, 트래킹 쿼리(utm_*, ref) 제거, 트레일링 슬래시 제거.
 * 파싱 불가한 문자열은 소문자/trim 한 원본을 그대로 사용한다.
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";

    for (const key of [...u.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || lower === "ref") {
        u.searchParams.delete(key);
      }
    }
    // 쿼리 순서 무관 동일 키를 위해 정렬
    u.searchParams.sort();

    // 트레일링 슬래시 제거 (루트 "/" 제외)
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }

    const query = u.searchParams.toString();
    return `${u.protocol}//${u.host}${u.pathname}${query ? `?${query}` : ""}`.toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/** 정규화된 URL 의 sha256 16진 해시. */
export function dedupKey(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}
