"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 호 공유 버튼. 홈 주소는 매일 내용이 바뀌는 고정 URL이라 카카오톡이 지난 호 스크랩을 재사용하므로,
 * 날짜마다 새 주소인 호 고정 링크(`url`)를 퍼뜨린다(src/lib/site.ts 캐시 설명).
 * 터치 기기는 OS 공유 시트(→ 카카오톡 선택), 그 밖(데스크톱)은 링크 복사.
 */
export function ShareButton({
  url,
  title,
  className,
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function share() {
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        // 사용자가 시트를 닫은 경우는 끝. 그 밖의 실패(권한 등)는 복사로 넘어간다.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("이 링크를 복사해 공유하세요", url);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={share}
        title="이 호의 고정 링크 공유"
        className={cn(
          "text-foreground focus-visible:ring-ring inline-flex items-center gap-1 font-semibold outline-none hover:underline focus-visible:ring-2",
          // 폴리오 한 줄 높이는 유지하면서 터치 타깃은 44px(음수 마진으로 시각 높이 상쇄).
          "-mx-2 -my-3 min-h-11 px-2 underline-offset-4 md:my-0 md:min-h-0",
          className,
        )}
      >
        {copied ? (
          <Check aria-hidden className="size-3.5" />
        ) : (
          <Share aria-hidden className="size-3.5" />
        )}
        {copied ? "링크 복사됨" : "공유"}
      </button>
      <span role="status" className="sr-only">
        {copied ? "이 호의 링크를 복사했습니다" : ""}
      </span>
    </>
  );
}
