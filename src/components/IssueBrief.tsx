import Link from "next/link";
import { ISSUE_BRIEF_LIMITS, type IssueBriefLine } from "@/lib/edition";
import { cn } from "@/lib/utils";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import { issueBriefMessages } from "@/lib/messages/issueBrief";

/** 줄 수 → 머리 문구("세 줄 요약", en "Three things to know"). 2줄만 남은 호에 "세 줄"이라 쓰면 틀린 말이 된다. */
export function issueBriefHeading(count: number, locale: Locale = "ko"): string {
  return getMessages(issueBriefMessages, locale).heading(count);
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
  locale = "ko",
}: {
  lines: readonly IssueBriefLine[];
  className?: string;
  /** 언어판(기본 ko) — 머리 문구·기사 링크. 줄(text)은 데이터라 그대로 싣는다. */
  locale?: Locale;
}) {
  if (lines.length < ISSUE_BRIEF_LIMITS.min) return null;
  const t = getMessages(issueBriefMessages, locale);

  return (
    <section
      aria-labelledby="issue-brief-heading"
      data-testid="issue-brief"
      className={cn("mx-auto max-w-[1240px] px-4 md:px-8", className)}
    >
      <div className="ed-br">
        <div className="flex items-baseline gap-x-2 md:flex-col md:gap-y-1 md:pt-[3px]">
          <h2
            id="issue-brief-heading"
            className="font-serif text-[1.0625rem] leading-none font-extrabold tracking-[-0.03em]"
          >
            {t.heading(lines.length)}
          </h2>
          <span aria-hidden className="text-label text-muted-foreground md:hidden">
            ·
          </span>
          <span className="text-label text-muted-foreground">{t.subtitle}</span>
        </div>

        <ol className="divide-border mt-1.5 divide-y md:mt-0 md:flex md:flex-col md:gap-y-2 md:divide-y-0">
          {lines.map((line, i) => (
            <li key={line.id}>
              <Link href={localePath(locale, `/article/${line.id}`)} className="story-link ed-br-a">
                <span aria-hidden className="ed-br-n">
                  {i + 1}
                </span>
                <span className="headline ed-br-h">{line.text}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
