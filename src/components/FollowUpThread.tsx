import Link from "next/link";
import { formatDate, formatShortDate, kstDateKey, kstDayDiff, shortSourceName } from "@/lib/labels";
import type { FollowUpEntry } from "@/lib/types";

/**
 * 상세 페이지 사건 타임라인(`getFollowUpThread`). 후속 보도 연결로 이어진 같은 사건의 기사를 호 날짜 순으로 한 줄씩 —
 * [호 날짜 | 관계 · 매체 · 이 기사와의 날짜 차 / 제목]. 보고 있는 기사는 제목 없이 "지금 보는 기사" 표지 한 줄만 둔다
 * (제목은 바로 위 h1 이다). 머리는 연결된 쪽에 따라 "이전 보도" / "후속 보도" / "사건 흐름".
 * 박스 없이 헤어라인으로만 가르고, 코발트는 hover 제목(story-link)에만 쓴다.
 */
export function FollowUpThread({ entries }: { entries: FollowUpEntry[] }) {
  const current = entries.find((e) => e.relation === "current");
  const earlier = entries.filter((e) => e.relation === "earlier").length;
  const later = entries.filter((e) => e.relation === "later").length;
  if (!current || earlier + later === 0) return null;

  const heading =
    earlier > 0 && later > 0
      ? `사건 흐름 · ${entries.length}건`
      : earlier > 0
        ? earlier > 1
          ? `이전 보도 · ${earlier}건`
          : "이전 보도"
        : later > 1
          ? `후속 보도 · ${later}건`
          : "후속 보도";
  const currentDay = kstDateKey(current.issuedAt);

  return (
    <section
      aria-labelledby="thread-heading"
      className="border-border mt-9 flex flex-col gap-1 border-t pt-7"
    >
      <h2
        id="thread-heading"
        className="text-label text-muted-foreground mb-2 font-bold tracking-[0.04em]"
      >
        {heading}
      </h2>
      <ol className="flex flex-col">
        {entries.map((e) => (
          <li key={e.id} className="border-border border-b last:border-b-0">
            {e.relation === "current" ? (
              <div aria-current="page" className={ROW}>
                <IssueDate iso={e.issuedAt} />
                <span className="text-label text-foreground self-center font-bold">
                  지금 보는 기사
                </span>
              </div>
            ) : (
              <Link href={`/article/${e.id}`} className={`story-link ${ROW} ${FOCUS}`}>
                <IssueDate iso={e.issuedAt} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-label text-muted-foreground flex min-w-0 gap-1.5 font-semibold">
                    <span className="shrink-0">
                      {e.relation === "earlier" ? "이전 보도" : "후속 보도"}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="min-w-0 truncate">{shortSourceName(e.sourceName)}</span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0 tabular-nums">{dayGap(currentDay, e.issuedAt)}</span>
                  </span>
                  <span className="headline text-title font-serif font-bold tracking-[-0.02em]">
                    {e.titleKo || e.titleOriginal}
                  </span>
                </span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 한 줄 = [호 날짜 칼럼 | 본문]. 색인(StoryEntry)과 같은 날짜 칼럼 폭. 터치 타깃 44px 이상. */
const ROW = "grid min-h-11 grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-x-3 py-3";
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** 호 날짜 'MM.DD'(KST). 연도는 툴팁·datetime 으로. */
function IssueDate({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      title={`${formatDate(iso)} 호`}
      className="text-muted-foreground font-serif text-[0.9375rem] font-semibold tabular-nums"
    >
      {formatShortDate(iso)}
    </time>
  );
}

/** 보고 있는 기사의 호 날짜와의 차: "같은 날" / "N일 전" / "N일 뒤"(KST 달력 기준). */
export function dayGap(currentDay: string, iso: string): string {
  const diff = kstDayDiff(currentDay, kstDateKey(iso));
  if (diff === 0) return "같은 날";
  return diff < 0 ? `${-diff}일 전` : `${diff}일 뒤`;
}
