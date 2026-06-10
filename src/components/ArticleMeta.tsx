/**
 * 카테고리 배지 / 태그 칩. 카드·상세에서 공유하는 프레젠테이션 컴포넌트.
 * DESIGN: rounded.pill, hairline 보더, 단일 강조색 = 무채색 잉크, 그림자 금지.
 */

/** 카테고리 배지. category 가 비어 있으면 렌더하지 않는다. */
export function CategoryBadge({ category }: { category: string }) {
  if (!category) return null;
  return (
    <span className="border-primary text-primary rounded-pill text-caption inline-flex w-fit items-center border px-2.5 py-0.5 font-semibold">
      {category}
    </span>
  );
}

/**
 * 태그 칩 목록. 비어 있으면 렌더하지 않는다.
 * max 를 주면 그 개수만 노출하고 나머지는 "+N" 칩으로 요약한다(미지정 시 전량 표시).
 */
export function TagChips({ tags, max }: { tags: string[]; max?: number }) {
  if (tags.length === 0) return null;
  const shown = typeof max === "number" ? tags.slice(0, max) : tags;
  const overflow = tags.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((tag) => (
        <span
          key={tag}
          className="border-border text-muted-foreground rounded-pill text-caption inline-flex items-center border px-2 py-0.5"
        >
          {tag}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-muted-foreground rounded-pill text-caption inline-flex items-center border border-transparent px-2 py-0.5">
          +{overflow}
        </span>
      )}
    </div>
  );
}
