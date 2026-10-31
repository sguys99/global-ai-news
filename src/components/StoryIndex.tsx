"use client";

import { useState } from "react";
import { StoryEntry } from "@/components/Story";
import { INDEX_PAGE_SIZE } from "@/lib/feedIndex";
import type { IndexCard } from "@/lib/types";

/** 색인 데이터를 더 받는 중이거나 받지 못한 상태(부모가 fetch 를 맡는다). */
export type IndexLoadState = "loading" | "error";

const pill =
  "rounded-pill border-foreground text-caption hover:bg-foreground hover:text-background focus-visible:ring-ring inline-flex min-h-12 items-center gap-2 border px-6 font-semibold transition-colors outline-none focus-visible:ring-2";

/**
 * 전체 기사 색인 — 2열 StoryEntry 목록을 INDEX_PAGE_SIZE 건씩 점진 노출한다.
 * 수백 건을 한 번에 그리면 모바일 지면이 수만 px로 길어지므로, 첫 화면은 가볍게 두고 나머지는 클라이언트에서 펼친다.
 * 필터·정렬이 바뀌면 부모가 `key`를 바꿔 노출 건수를 초기화한다.
 *
 * 홈은 정적 HTML 에 색인 첫 페이지만 싣는다(`articles` = 앞부분, `total` = 누적 건수). 받은 것보다 더 펼치려 하면
 * `onLoadMore`로 부모에게 나머지(feed-index.json)를 청하고, 그동안 버튼 자리에 "불러오는 중" 한 줄을 둔다.
 * 실패하면 이미 보인 기사는 그대로 두고 같은 자리에 다시 시도 버튼을 둔다.
 */
export function StoryIndex({
  articles,
  hideCategory = false,
  total,
  onLoadMore,
  loadState,
}: {
  articles: IndexCard[];
  /** 분야 필터가 걸린 목록에서는 항목마다 같은 키커를 반복하지 않는다. */
  hideCategory?: boolean;
  /** 전체 건수 — `articles`가 앞부분뿐일 때(나머지는 아직 받지 않음). 기본은 `articles.length`. */
  total?: number;
  /** 받은 것보다 더 펼치려 할 때(또는 다시 시도) 부른다. */
  onLoadMore?: () => void;
  loadState?: IndexLoadState;
}) {
  const [shown, setShown] = useState(INDEX_PAGE_SIZE);
  const available = articles.length;
  const all = Math.max(total ?? available, available);
  const remaining = all - Math.min(shown, available);
  // 펼친 만큼 아직 받지 못했다 — 버튼 대신 상태 줄.
  const waiting = shown > available && available < all;

  const more = () => {
    const next = shown + INDEX_PAGE_SIZE;
    setShown(next);
    if (next > available && available < all) onLoadMore?.();
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
        {articles.slice(0, shown).map((article) => (
          <StoryEntry key={article.id} article={article} hideCategory={hideCategory} />
        ))}
      </div>
      {waiting ? (
        <div className="mt-8 flex min-h-12 items-center justify-center">
          <IndexLoadStatus state={loadState ?? "loading"} onRetry={onLoadMore} />
        </div>
      ) : (
        remaining > 0 && (
          <div className="mt-8 flex justify-center">
            <button type="button" onClick={more} className={pill}>
              기사 더 보기
              <span className="font-normal tabular-nums opacity-60">남은 {remaining}건</span>
            </button>
          </div>
        )
      )}
    </>
  );
}

/**
 * 색인 데이터 상태 줄 — 받는 중이면 흐린 한 줄(스피너·상자 없이), 실패면 안내 + 다시 시도(pill).
 * 홈 색인의 "더 보기"와, 전체 데이터가 필요한 필터·정렬 결과 자리에서 함께 쓴다.
 */
export function IndexLoadStatus({
  state,
  onRetry,
}: {
  state: IndexLoadState;
  onRetry?: () => void;
}) {
  if (state === "error") {
    return (
      <div
        role="alert"
        className="text-caption text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
      >
        <span>기사 목록을 불러오지 못했습니다.</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className={pill}>
            다시 시도
          </button>
        )}
      </div>
    );
  }
  return (
    <p role="status" className="text-caption text-muted-foreground">
      기사 목록을 불러오는 중…
    </p>
  );
}
