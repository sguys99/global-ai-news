import Link from "next/link";
import { ISSUE_BRIEF_LIMITS, type IssueBriefLine } from "@/lib/edition";
import { cn } from "@/lib/utils";

/** 줄 수 → 머리 문구. 2줄만 남은 호에 "세 줄"이라 쓰면 틀린 말이 된다. */
const COUNT_WORDS = ["", "한", "두", "세"] as const;

export function issueBriefHeading(count: number): string {
  return `${COUNT_WORDS[count] ?? "세"} 줄 요약`;
}

/**
 * 세 줄 요약 띠 (DESIGN.md §5 `issue-brief`) — 마스트헤드 바로 아래 전폭, 1면 위.
 * 선별 LLM 이 쓴 이번 호 핵심 한 줄씩을 1면 위계 순(selectIssueBrief)으로 번호를 달아 세리프로 싣는다.
 * 번호는 장식이 아니라 줄의 순서(1면 순)이고 "세 줄"의 셈이다 — `<ol>` 이 그 의미를 읽힌다.
 * 위아래 1px 잉크 괘선 사이에 두고 박스·배경은 없다. 줄 전체가 그 기사 링크이며 hover 는 글자만 코발트.
 * md 이상: [머리 9.5rem | 줄 목록] 두 칸. 모바일: 머리 한 줄 → 줄 목록(줄 사이 헤어라인, 44px 터치 타깃).
 * 줄이 ISSUE_BRIEF_LIMITS.min 미만이면 아무것도 그리지 않는다 — 요약이 없는 호(이 기능 전의 지난 호 전부)는
 * 마스트헤드 아래가 예전과 같다.
 */
export function IssueBrief({
  lines,
  className,
}: {
  lines: readonly IssueBriefLine[];
  className?: string;
}) {
  if (lines.length < ISSUE_BRIEF_LIMITS.min) return null;

  return (
    <section
      aria-labelledby="issue-brief-heading"
      data-testid="issue-brief"
      className={cn("mx-auto max-w-[1240px] px-4 md:px-8", className)}
    >
      <div className="border-rule animate-rise border-y pt-3.5 pb-2 [animation-delay:40ms] md:grid md:grid-cols-[9.5rem_minmax(0,1fr)] md:gap-x-8 md:py-5 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="flex items-baseline gap-x-2 md:flex-col md:gap-y-1 md:pt-[3px]">
          <h2
            id="issue-brief-heading"
            className="font-serif text-[1.0625rem] leading-none font-extrabold tracking-[-0.03em]"
          >
            {issueBriefHeading(lines.length)}
          </h2>
          <span aria-hidden className="text-label text-muted-foreground md:hidden">
            ·
          </span>
          <span className="text-label text-muted-foreground">이번 호 핵심</span>
        </div>

        <ol className="divide-border mt-1.5 divide-y md:mt-0 md:flex md:flex-col md:gap-y-2 md:divide-y-0">
          {lines.map((line, i) => (
            <li key={line.id}>
              <Link
                href={`/article/${line.id}`}
                className="story-link focus-visible:ring-ring focus-visible:ring-offset-background grid min-h-11 grid-cols-[1.375rem_minmax(0,1fr)] items-baseline gap-x-2.5 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-offset-4 md:min-h-0 md:grid-cols-[1.75rem_minmax(0,1fr)] md:py-0"
              >
                <span
                  aria-hidden
                  className="text-muted-foreground font-serif text-[0.9375rem] leading-none font-bold tabular-nums md:text-base"
                >
                  {i + 1}
                </span>
                <span className="headline font-serif text-[1.0625rem] leading-[1.45] font-semibold tracking-[-0.03em] text-pretty md:text-[1.1875rem] md:leading-[1.5]">
                  {line.text}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
