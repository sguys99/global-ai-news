import Link from "next/link";
import type { EditionRef } from "@/lib/db";
import { formatMonthDay } from "@/lib/labels";
import { editionPath } from "@/lib/site";

/**
 * 호 고정 링크 지면 하단 내비: 이전 호 · 다음 호(DESIGN.md 굵은 잉크 괘선 + 세리프 표기).
 * 양 끝 호에서는 해당 방향을 비워 둔다.
 */
export function EditionPager({ prev, next }: { prev: EditionRef | null; next: EditionRef | null }) {
  return (
    <nav aria-label="호 이동" className="border-rule grid grid-cols-2 gap-6 border-t-2 pt-4">
      {prev ? <PagerLink edition={prev} label="← 이전 호" /> : <span />}
      {next ? <PagerLink edition={next} label="다음 호 →" align="end" /> : <span />}
    </nav>
  );
}

function PagerLink({
  edition,
  label,
  align = "start",
}: {
  edition: EditionRef;
  label: string;
  align?: "start" | "end";
}) {
  return (
    <Link
      href={editionPath(edition.date)}
      className={
        "group focus-visible:ring-ring flex min-h-11 flex-col gap-1 outline-none focus-visible:ring-2 " +
        (align === "end" ? "items-end text-right" : "items-start")
      }
    >
      <span className="text-meta text-muted-foreground font-semibold">{label}</span>
      <span className="group-hover:text-brand font-serif text-xl font-extrabold tracking-[-0.03em]">
        제{edition.issueNo}호
      </span>
      <span className="text-caption text-foreground-soft tabular-nums">
        {formatMonthDay(edition.publishedAt)}
      </span>
    </Link>
  );
}
