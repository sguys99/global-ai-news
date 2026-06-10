"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { FilterBar } from "@/components/FilterBar";
import type { SearchOptions } from "@/lib/db";

/**
 * 모바일 필터 바텀시트 (mobile-plan Phase 4).
 * 인라인 FilterBar는 모바일에서 칩이 3줄로 적층되므로, 데스크톱은 인라인을 유지하고
 * 모바일은 "필터" 트리거(≥44px, `md:hidden`)로 바텀시트를 열어 **기존 FilterBar를 그대로 재사용**한다.
 * 시트는 frosted(`bg-background/95 backdrop-blur`) + hairline(`border-t`) + safe-area 패딩으로
 * 하단 탭 바(z-50) 위(z-60)에 떠서, 색조 없이 ink 대비로만 active를 표현(globals.css 원칙).
 *
 * 칩 선택은 FilterBar의 Link 네비게이션으로 즉시 반영되며(다중 선택 가능),
 * "결과 보기"로 시트를 닫아 결과를 확인한다.
 */
export function FilterSheet({
  current,
  sources,
  tags,
  basePath = "/",
}: {
  current: SearchOptions;
  sources: { id: string; name: string }[];
  tags: string[];
  basePath?: string;
}) {
  const [open, setOpen] = useState(false);

  // 정렬은 항상 기본값(최신순)이 있으므로 제외하고, 적용된 소스·태그 수만 배지로 표기한다.
  const activeCount = [current.source, current.tag].filter(Boolean).length;

  // 시트가 열린 동안 배경 스크롤을 잠그고 ESC로 닫는다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="rounded-pill border-border text-foreground hover:border-foreground inline-flex min-h-11 items-center gap-2 border px-4 py-2 text-[13px] transition-colors"
      >
        <SlidersHorizontal className="size-4" />
        필터
        {activeCount > 0 && (
          <span className="bg-foreground text-background inline-flex size-5 items-center justify-center rounded-full text-[11px] font-medium">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          {/* 배경 오버레이: 탭하면 닫힘 */}
          <button
            type="button"
            aria-label="필터 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />

          {/* 바텀시트 */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="필터"
            className="border-border bg-background/95 absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t backdrop-blur"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="bg-background/95 sticky top-0 flex items-center justify-between px-4 pt-4 pb-3 backdrop-blur">
              <h2 className="text-body font-semibold">필터</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="text-muted-foreground hover:text-foreground -mr-2 inline-flex size-11 items-center justify-center transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="px-4">
              <FilterBar current={current} sources={sources} tags={tags} basePath={basePath} />
            </div>

            <div className="px-4 pt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="bg-foreground text-background inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-2 text-[14px] font-medium transition-opacity hover:opacity-90"
              >
                결과 보기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
