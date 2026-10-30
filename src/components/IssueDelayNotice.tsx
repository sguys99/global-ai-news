"use client";

import { useEffect, useState } from "react";
import { issueDelayCopy, issueDelayDays } from "@/lib/labels";

/**
 * 발행 지연 안내 줄(홈 전용). 페이지는 하루 1회 빌드돼 한참 뒤에도 서빙되므로 두 단계로 판단한다.
 *  1) 첫 렌더 = 서버(빌드 시점)가 계산해 넘긴 initialGap — 빌드 자체가 낡았다면 정적 HTML 에 이미 안내가 있어
 *     마운트 후 마스트헤드가 밀리지 않는다(서버·첫 클라 렌더 동일 → 하이드레이션 불일치 없음).
 *  2) 마운트 후 브라우저의 현재 KST 시각으로 다시 계산(조건: labels.issueDelayDays). 클라 시각 ≥ 빌드 시각이라 값은 커지기만 한다.
 * 정상 발행이면 숨기고, 늦으면 폴리오 아래 헤어라인 사이 한 줄. 라벨이 상태를 바로 말한다 —
 * 1일 "발행 전", 2일 이상 "발행 지연"(강조색은 라벨 하나만). 좁은 화면은 짧은 문구로 라벨과 한 줄에 맞춘다.
 */
export function IssueDelayNotice({
  issueDate,
  issueNo = 0,
  initialGap = 0,
}: {
  issueDate: string;
  /** 보고 있는 호의 호수(문구에 "제N호"로 들어간다, 0 = 생략). */
  issueNo?: number;
  /** 빌드 시점에 계산한 issueDelayDays 값(0 = 안내 없음). */
  initialGap?: number;
}) {
  const [gap, setGap] = useState(initialGap);

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

  const copy = issueDelayCopy(issueDate, gap, issueNo);
  if (!copy) return null;
  return (
    <p
      role="status"
      className="text-caption text-foreground-soft border-border mt-3 flex items-baseline gap-2.5 border-y py-2"
    >
      <span className="text-meta text-brand flex-none font-bold tracking-[0.02em]">
        {copy.label}
      </span>
      <span className="md:hidden">{copy.short}</span>
      <span className="hidden md:inline">
        <b className="text-foreground font-semibold">{copy.strong}</b>
        {copy.rest}
      </span>
    </p>
  );
}
