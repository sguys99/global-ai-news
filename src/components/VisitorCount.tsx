"use client";

import { useEffect, useState } from "react";
import { GOATCOUNTER_URL, VISITOR_COUNT_MIN } from "@/lib/site";

/** GoatCounter `/counter/TOTAL.json` 응답(`{"count": "1,234"}` — 천 단위 쉼표 문자열) → 숫자. 형식이 다르면 null. */
export function parseVisitorCount(json: unknown): number | null {
  if (typeof json !== "object" || json === null) return null;
  const raw = (json as { count?: unknown }).count;
  if (typeof raw !== "string") return null;
  const n = Number(raw.replace(/[^\d]/g, ""));
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

/**
 * 푸터 누적 방문 줄. 정적 HTML 엔 없고 마운트 후 GoatCounter 에서 받아 그린다(응답은 최대 4시간 캐시).
 * 푸터 맨 끝 줄이라 늦게 나타나도 위 내용이 밀리지 않는다. 실패·하한(VISITOR_COUNT_MIN) 미만이면 숨긴다.
 * GoatCounter 는 세션(8시간) 단위로 세므로 "독자 수"가 아니라 방문 횟수로 표기한다.
 */
export function VisitorCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${GOATCOUNTER_URL}/counter/TOTAL.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (alive) setCount(parseVisitorCount(json));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (count === null || count < VISITOR_COUNT_MIN) return null;
  return (
    <p className="text-label text-muted-foreground tabular-nums">
      누적 방문 {count.toLocaleString("ko-KR")}회
    </p>
  );
}
