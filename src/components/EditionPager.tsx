import Link from "next/link";
import type { EditionRef } from "@/lib/db";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import { formatMonthDay, issueNoLabel } from "@/lib/labels";
import { pagerMessages } from "@/lib/messages/pager";
import { editionPath } from "@/lib/site";

/**
 * 호 고정 링크 지면 하단 내비: 이전 호 · 다음 호(DESIGN.md 굵은 잉크 괘선 + 세리프 표기).
 * 양 끝 호에서는 해당 방향을 비워 둔다. 링크·호수·날짜는 언어판(`locale`)을 따른다.
 */
export function EditionPager({
  prev,
  next,
  locale = "ko",
}: {
  prev: EditionRef | null;
  next: EditionRef | null;
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const t = getMessages(pagerMessages, locale);
  return (
    <nav aria-label={t.navLabel} className="border-rule grid grid-cols-2 gap-6 border-t-2 pt-4">
      {prev ? <PagerLink edition={prev} label={t.prev} locale={locale} /> : <span />}
      {next ? <PagerLink edition={next} label={t.next} align="end" locale={locale} /> : <span />}
    </nav>
  );
}

function PagerLink({
  edition,
  label,
  align = "start",
  locale,
}: {
  edition: EditionRef;
  label: string;
  align?: "start" | "end";
  locale: Locale;
}) {
  return (
    <Link
      href={localePath(locale, editionPath(edition.date))}
      className={
        "group focus-visible:ring-ring flex min-h-11 flex-col gap-1 outline-none focus-visible:ring-2 " +
        (align === "end" ? "items-end text-right" : "items-start")
      }
    >
      <span className="text-meta text-muted-foreground font-semibold">{label}</span>
      <span className="group-hover:text-brand font-serif text-xl font-extrabold tracking-[-0.03em]">
        {issueNoLabel(edition.issueNo, locale)}
      </span>
      <span className="text-caption text-foreground-soft tabular-nums">
        {formatMonthDay(edition.publishedAt, locale)}
      </span>
    </Link>
  );
}
