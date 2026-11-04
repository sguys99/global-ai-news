"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { formatDateTime, formatRelativeKst } from "@/lib/labels";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;

/**
 * 상대 시각 표기("3시간 전"·"어제 21:40"·"10.24").
 * 정적 HTML은 하루 1회 빌드되므로 첫 렌더는 `base`(호 발행 시각)를 '지금'으로 삼아 결정적으로 그리고,
 * 마운트 후에는 실제 시각으로 다시 계산해 1분마다·탭 복귀 시 갱신한다.
 * 언어는 컨텍스트(useLocale)로 읽는다 — 서버 컴포넌트(Byline)가 그리므로 locale prop 을 두지 않는다
 * (prop 은 RSC 페이로드에 실려 한국어 페이지 페이로드가 바뀐다).
 */
export function RelativeTime({
  iso,
  base,
  className,
}: {
  iso: string;
  /** 정적 렌더 기준 시각(ISO) — 보통 호 발행 시각. */
  base: string;
  className?: string;
}) {
  const locale = useLocale();
  const [text, setText] = useState(() => formatRelativeKst(iso, base, locale));

  useEffect(() => {
    const update = () => setText(formatRelativeKst(iso, Date.now(), locale));
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    const id = window.setInterval(update, REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [iso, locale]);

  if (!text) return null;
  return (
    <time
      dateTime={iso}
      title={`${formatDateTime(iso, locale)} KST`}
      className={cn("tabular-nums", className)}
    >
      {text}
    </time>
  );
}
