"use client";

import { useState } from "react";
import { StoryEntry } from "@/components/Story";
import type { ArticleCard } from "@/lib/types";

/** 처음 노출 건수 / "더 보기" 1회당 추가 건수. */
export const INDEX_PAGE_SIZE = 30;

/**
 * 전체 기사 색인 — 2열 StoryEntry 목록을 INDEX_PAGE_SIZE 건씩 점진 노출한다.
 * 320건을 한 번에 그리면 모바일 지면이 수만 px로 길어지므로, 첫 화면은 가볍게 두고
 * 나머지는 클라이언트에서 펼친다(데이터는 이미 정적 페이로드에 포함 — 추가 요청 없음).
 * 필터·정렬이 바뀌면 부모가 `key`를 바꿔 노출 건수를 초기화한다.
 */
export function StoryIndex({ articles }: { articles: ArticleCard[] }) {
  const [shown, setShown] = useState(INDEX_PAGE_SIZE);
  const remaining = articles.length - shown;

  return (
    <>
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
        {articles.slice(0, shown).map((article) => (
          <StoryEntry key={article.id} article={article} />
        ))}
      </div>
      {remaining > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + INDEX_PAGE_SIZE)}
            className="rounded-pill border-foreground text-caption hover:bg-foreground hover:text-background focus-visible:ring-ring inline-flex min-h-12 items-center gap-2 border px-6 font-semibold transition-colors outline-none focus-visible:ring-2"
          >
            기사 더 보기
            <span className="font-normal tabular-nums opacity-60">남은 {remaining}건</span>
          </button>
        </div>
      )}
    </>
  );
}
