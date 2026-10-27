"use client";

import { useEffect, useState } from "react";
import { formatIssueDelayNotice, issueDelayDays } from "@/lib/labels";

/**
 * 발행 지연 안내 줄(홈 전용). 페이지는 하루 1회 빌드돼 한참 뒤에도 서빙되므로 서버·첫 렌더는 아무것도 그리지 않고,
 * 마운트 후 브라우저의 현재 KST 시각과 비교해 정한다(조건: labels.issueDelayDays).
 * 얇은 괘선 사이 한 줄 — 새 호가 오면 사라지는 일시 안내라 강조색은 "최신 호" 라벨 하나만 쓴다.
 */
export function IssueDelayNotice({ issueDate }: { issueDate: string }) {
  const [gap, setGap] = useState(0);

  useEffect(() => {
    const update = () => setGap(issueDelayDays(issueDate, Date.now()));
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    // 탭을 열어 둔 채 08:00 을 넘기는 경우까지 반영한다.
    const id = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [issueDate]);

  if (gap < 1) return null;
  return (
    <p
      role="status"
      className="text-caption text-foreground-soft border-border mt-3 flex flex-wrap items-baseline gap-x-2 border-y py-2"
    >
      <span className="text-meta text-brand font-bold">최신 호</span>
      <span>{formatIssueDelayNotice(issueDate, gap)}</span>
    </p>
  );
}
