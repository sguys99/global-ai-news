"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { FilterBar } from "@/components/FilterBar";
import { useLocale } from "@/components/LocaleProvider";
import type { SearchOptions } from "@/lib/db";
import type { SourceOption } from "@/lib/feedFilter";
import { getMessages } from "@/lib/i18n";
import { filterMessages } from "@/lib/messages/filter";

/**
 * 모바일 필터 바텀시트 (mobile-plan Phase 4).
 * 인라인 FilterBar는 모바일에서 칩이 3줄로 적층되므로, 데스크톱은 인라인을 유지하고
 * 모바일은 "필터" 트리거(≥44px, `md:hidden`)로 바텀시트를 열어 **기존 FilterBar를 그대로 재사용**한다.
 * 시트는 종이 배경 + 잉크 괘선(`border-t-2 border-rule`) + safe-area 패딩으로
 * 하단 탭 바(z-50) 위(z-60)에 뜬다(DESIGN.md v2 filter-sheet).
 *
 * 칩 선택은 FilterBar의 Link 네비게이션으로 즉시 반영되며(다중 선택 가능),
 * "결과 보기"로 시트를 닫아 결과를 확인한다.
 * 언어는 LocaleProvider 컨텍스트로 읽고(서버 FeedView 가 prop 으로 넘기지 않는다), 안의 FilterBar 에 넘긴다.
 */
export function FilterSheet({
  current,
  sources,
  tags,
  basePath = "/",
  anchor = "",
}: {
  current: SearchOptions;
  sources: readonly SourceOption[];
  tags: string[];
  basePath?: string;
  anchor?: string;
}) {
  const locale = useLocale();
  const t = getMessages(filterMessages, locale).sheet;
  const [open, setOpen] = useState(false);

  // 정렬은 항상 기본값(화제순)이 있으므로 제외하고, 적용된 분야·매체·태그 수만 배지로 표기한다.
  const activeCount = [current.category, current.source, current.tag].filter(Boolean).length;

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
        className="rounded-pill border-foreground text-foreground text-caption focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 border px-4 py-2 font-semibold transition-colors outline-none focus-visible:ring-2"
      >
        <SlidersHorizontal className="size-4" />
        {t.title}
        {activeCount > 0 && (
          <span className="bg-brand text-brand-foreground text-label inline-flex size-5 items-center justify-center rounded-full font-semibold">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          {/* 배경 오버레이: 탭하면 닫힘 */}
          <button
            type="button"
            aria-label={t.dismiss}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45"
          />

          {/* 바텀시트 */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.title}
            className="border-rule bg-background absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-xl border-t-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="bg-background border-border sticky top-0 flex items-center justify-between border-b px-4 pt-3 pb-2">
              <h2 className="font-serif text-xl font-extrabold tracking-[-0.04em]">{t.title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.close}
                className="text-muted-foreground hover:text-foreground -mr-2 inline-flex size-11 items-center justify-center transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="px-4 pt-3">
              <FilterBar
                current={current}
                sources={sources}
                tags={tags}
                basePath={basePath}
                anchor={anchor}
                locale={locale}
              />
            </div>

            <div className="px-4 pt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="bg-foreground text-background rounded-pill text-caption inline-flex min-h-12 w-full items-center justify-center px-4 py-2 font-semibold transition-opacity hover:opacity-90"
              >
                {t.showResults}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
