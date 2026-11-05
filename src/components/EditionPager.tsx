import Link from "next/link";
import type { EditionRef } from "@/lib/db";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import { formatMonthDay, issueNoLabel } from "@/lib/labels";
import { pagerMessages } from "@/lib/messages/pager";
import { BASE_PATH, editionPath } from "@/lib/site";

/** 호 이동이 가리키는 호. `archived` 면 보관 지면(빌드 후 정적 HTML, RSC 없음 — src/lib/archive.ts). */
type PagerTarget = EditionRef & { archived?: boolean };

/**
 * 호 고정 링크 지면 하단 내비: 이전 호 · 다음 호(DESIGN.md 굵은 잉크 괘선 + 세리프 표기).
 * 양 끝 호에서는 해당 방향을 비워 둔다. 링크·호수·날짜는 언어판(`locale`)을 따른다.
 */
export function EditionPager({
  prev,
  next,
  locale = "ko",
}: {
  prev: PagerTarget | null;
  next: PagerTarget | null;
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
  edition: PagerTarget;
  label: string;
  align?: "start" | "end";
  locale: Locale;
}) {
  const href = localePath(locale, editionPath(edition.date));
  const className =
    "group focus-visible:ring-ring flex min-h-11 flex-col gap-1 outline-none focus-visible:ring-2 " +
    (align === "end" ? "items-end text-right" : "items-start");
  const body = (
    <>
      <span className="text-meta text-muted-foreground font-semibold">{label}</span>
      <span className="group-hover:text-brand font-serif text-xl font-extrabold tracking-[-0.03em]">
        {issueNoLabel(edition.issueNo, locale)}
      </span>
      <span className="text-caption text-foreground-soft tabular-nums">
        {formatMonthDay(edition.publishedAt, locale)}
      </span>
    </>
  );
  // 보관 호: next/link 는 그 호의 RSC(index.txt)를 미리 받고 클라이언트 전환에 쓰는데 보관 지면에는 그 파일이 없다(404).
  // 일반 `<a>`(basePath 포함 — ArticleLink 와 같은 방식, 속성 순서 class → href 도 같다)로 전체 로드한다.
  if (edition.archived) {
    return (
      <a className={className} href={`${BASE_PATH}${href}`}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
