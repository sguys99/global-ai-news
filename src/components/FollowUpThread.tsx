import { ArticleLink } from "@/components/ArticleLink";
import { headlineOf } from "@/lib/articleText";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  formatDate,
  formatShortDate,
  kstDateKey,
  kstDayDiff,
  sourceDisplayName,
} from "@/lib/labels";
import { followUpMessages } from "@/lib/messages/followUp";
import type { FollowUpEntry } from "@/lib/types";

/**
 * 상세 페이지 사건 타임라인(`getFollowUpThread`). 후속 보도 연결로 이어진 같은 사건의 기사를 호 날짜 순으로 한 줄씩 —
 * [호 날짜 | 관계 · 매체 · 이 기사와의 날짜 차 / 제목]. 보고 있는 기사는 제목 없이 "지금 보는 기사" 표지 한 줄만 둔다
 * (제목은 바로 위 h1 이다). 머리는 연결된 쪽에 따라 "이전 보도" / "후속 보도" / "사건 흐름".
 * 박스 없이 헤어라인으로만 가르고, 코발트는 hover 제목(story-link)에만 쓴다.
 * 제목·매체명은 articleText·labels 헬퍼로 고른다 — ko 는 예전 식 그대로(`titleKo || titleOriginal`·축약명).
 */
export function FollowUpThread({
  entries,
  locale = "ko",
}: {
  entries: FollowUpEntry[];
  /** 언어판(기본 ko). */
  locale?: Locale;
}) {
  const t = getMessages(followUpMessages, locale);
  const current = entries.find((e) => e.relation === "current");
  const earlier = entries.filter((e) => e.relation === "earlier").length;
  const later = entries.filter((e) => e.relation === "later").length;
  if (!current || earlier + later === 0) return null;

  const heading =
    earlier > 0 && later > 0
      ? t.heading.flow(entries.length)
      : earlier > 0
        ? earlier > 1
          ? t.heading.earlierCount(earlier)
          : t.heading.earlier
        : later > 1
          ? t.heading.laterCount(later)
          : t.heading.later;
  const currentDay = kstDateKey(current.issuedAt);
  // 영어판만 바꾸는 값(날짜 칼럼 폭·매체 진하게·라틴 제목 자간) — 한국어판 마크업은 그대로.
  const en = locale === "en";
  const row = en ? ROW_EN : ROW;

  return (
    <section aria-labelledby="thread-heading" className="ar-sect gap-1">
      <h2 id="thread-heading" className="ar-h mb-2">
        {heading}
      </h2>
      <ol className="flex flex-col">
        {entries.map((e) => (
          <li key={e.id} className="ar-li">
            {e.relation === "current" ? (
              <div aria-current="page" className={row}>
                <IssueDate iso={e.issuedAt} locale={locale} />
                <span className="text-label text-foreground self-center font-bold">
                  {t.current}
                </span>
              </div>
            ) : (
              <ArticleLink
                articleId={e.id}
                locale={locale}
                className={`story-link ${row} ${FOCUS}`}
              >
                <IssueDate iso={e.issuedAt} locale={locale} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-label text-muted-foreground flex min-w-0 gap-1.5 font-semibold">
                    <span className="shrink-0">
                      {e.relation === "earlier" ? t.relation.earlier : t.relation.later}
                    </span>
                    <span aria-hidden>·</span>
                    <span
                      className={en ? "text-foreground-soft min-w-0 truncate" : "min-w-0 truncate"}
                    >
                      {sourceDisplayName({ name: e.sourceName, nameEn: e.sourceNameEn }, locale)}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0 tabular-nums">
                      {dayGap(currentDay, e.issuedAt, locale)}
                    </span>
                  </span>
                  <span
                    className={`headline text-title font-serif font-bold ${en ? "tracking-[-0.01em]" : "tracking-[-0.02em]"}`}
                  >
                    {headlineOf(e, locale)}
                  </span>
                </span>
              </ArticleLink>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * 한 줄 = [호 날짜 칼럼 | 본문]. 색인(StoryEntry)과 같은 날짜 칼럼 폭. 터치 타깃 44px 이상.
 * 영어판은 날짜가 `Nov 12` 처럼 길어 칼럼을 3.75rem 으로 넓힌다(DESIGN.md 영어판 — 색인·타임라인 칼럼).
 */
const ROW = "grid min-h-11 grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-x-3 py-3";
const ROW_EN = "grid min-h-11 grid-cols-[3.75rem_minmax(0,1fr)] items-baseline gap-x-3 py-3";
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** 호 날짜 'MM.DD'(KST, en 'Nov 3'). 연도는 툴팁·datetime 으로. */
function IssueDate({ iso, locale }: { iso: string; locale: Locale }) {
  return (
    <time
      dateTime={iso}
      title={getMessages(followUpMessages, locale).issueTitle(formatDate(iso, locale))}
      className="st-date"
    >
      {formatShortDate(iso, locale)}
    </time>
  );
}

/**
 * 보고 있는 기사의 호 날짜와의 차: "같은 날" / "N일 전" / "N일 뒤"(KST 달력 기준).
 * en "Same day" / "N days earlier" / "N days later".
 */
export function dayGap(currentDay: string, iso: string, locale: Locale = "ko"): string {
  const { gap } = getMessages(followUpMessages, locale);
  const diff = kstDayDiff(currentDay, kstDateKey(iso));
  if (diff === 0) return gap.sameDay;
  return diff < 0 ? gap.before(-diff) : gap.after(diff);
}
