/**
 * 카테고리 배지 / 태그 칩. 카드·상세에서 공유하는 프레젠테이션 컴포넌트.
 * DESIGN: rounded.pill, hairline 보더, 단일 강조색 Action Blue, 그림자 금지.
 */

/** 카테고리 배지. category 가 비어 있으면 렌더하지 않는다. */
export function CategoryBadge({ category }: { category: string }) {
  if (!category) return null;
  return (
    <span className="border-primary text-primary rounded-pill text-caption inline-flex w-fit items-center border px-2.5 py-0.5 font-medium">
      {category}
    </span>
  );
}

/** 태그 칩 목록. 비어 있으면 렌더하지 않는다. */
export function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="border-border text-muted-foreground rounded-pill text-caption inline-flex items-center border px-2 py-0.5"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
