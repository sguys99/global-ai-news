"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share } from "lucide-react";
import { useMessages } from "@/components/LocaleProvider";
import { shareMessages } from "@/lib/messages/share";
import { cn } from "@/lib/utils";

/**
 * 호 공유 버튼. 홈 주소는 매일 내용이 바뀌는 고정 URL이라 카카오톡이 지난 호 스크랩을 재사용하므로,
 * 날짜마다 새 주소인 호 고정 링크(`url`)를 퍼뜨린다(src/lib/site.ts 캐시 설명).
 * 터치 기기는 OS 공유 시트(→ 카카오톡 선택), 그 밖(데스크톱)은 링크 복사.
 * 버튼 문구는 LocaleProvider 컨텍스트 언어를 따르고, 공유 주소(`url`)·제목은 부르는 쪽이 언어판에 맞춰 넘긴다.
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
  const t = useMessages(shareMessages);
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
      window.prompt(t.copyPrompt, url);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={share}
        title={t.hint}
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
        {copied ? t.copied : t.share}
      </button>
      <span role="status" className="sr-only">
        {copied ? t.copiedStatus : ""}
      </span>
    </>
  );
}
