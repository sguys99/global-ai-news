import Link from "next/link";
import {
  FORMAT_LABELS,
  categoryLabel,
  categorySlug,
  formatLongDate,
  kstDateKey,
} from "@/lib/labels";
import type { IssueStats } from "@/lib/edition";
import { IssueDelayNotice } from "@/components/IssueDelayNotice";
import { ShareButton } from "@/components/ShareButton";
import { SITE_NAME, editionPath, editionShareUrl } from "@/lib/site";

/**
 * 홈 마스트헤드 (DESIGN.md §5 masthead, 시안 docs/design/mockups/front-v3.html).
 * 발행일·호수 폴리오 + (지연 시) 발행 지연 안내 줄 + 대형 세리프 제호와 그 옆 '귀'(이번 호 통계)
 * + 이중 잉크 괘선 + 섹션 내비(앵커). 홈(`/`)의 필터 없는 편집 지면과 호 고정 링크 지면에서 렌더한다.
 * `id="masthead"` 는 헤더 워드마크가 스크롤 위치를 감지하는 기준점이다(HeaderWordmark).
 * 발행일은 그 호의 고정 링크(`/edition/[date]/`)다 — 날짜가 지나도 같은 지면을 다시 열 수 있다.
 * "공유"도 홈 주소가 아니라 이 고정 링크를 내보낸다(카카오톡이 홈 URL의 지난 호 미리보기를 재사용).
 * 태그라인(SITE_TAGLINE)은 제호 옆 자리를 귀에 내주고 푸터·기본 공유 썸네일에만 둔다.
 */
export function Masthead({
  issueNo,
  publishedAt,
  stats,
  categories,
  indexLabel = "전체 기사",
  delayNoticeIssueDate,
  delayNoticeInitialGap,
}: {
  issueNo: number;
  publishedAt: string | null;
  /** 이번 호 통계(issueStats) — 누적 아님. 누적은 전체 기사 색인 머리에 둔다. */
  stats: IssueStats;
  /** 밴드가 있는 분야(CATEGORIES 순서) — 오늘 밴드가 없는 분야는 내비에서도 빠진다. */
  categories: string[];
  /** 섹션 내비 마지막 항목(#all) 라벨. 호 고정 링크 지면은 "이 호의 기사". */
  indexLabel?: string;
  /** 지정하면 그 호 날짜(KST)가 오늘보다 낡았을 때 발행 지연 안내 줄을 띄운다(홈 전용). */
  delayNoticeIssueDate?: string;
  /** 빌드 시점에 계산한 지연 일수 — 정적 HTML 에 안내를 미리 담아 레이아웃 밀림을 막는다. */
  delayNoticeInitialGap?: number;
}) {
  return (
    <header id="masthead" className="mx-auto max-w-[1240px] px-4 pt-5 md:px-8 md:pt-7">
      <div className="text-meta text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
        {publishedAt && (
          <Link
            href={editionPath(kstDateKey(publishedAt))}
            title="이 호의 고정 링크"
            className="text-foreground focus-visible:ring-ring font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-2"
          >
            <time dateTime={publishedAt}>{formatLongDate(publishedAt)}</time>
          </Link>
        )}
        {issueNo > 0 && <span className="tabular-nums">제{issueNo}호</span>}
        <span className="ml-auto hidden md:inline">매일 06:00 KST 발행</span>
        {publishedAt && (
          <ShareButton
            url={editionShareUrl(kstDateKey(publishedAt))}
            title={`${SITE_NAME} ${formatLongDate(publishedAt)}${issueNo > 0 ? ` 제${issueNo}호` : ""}`}
            className="ml-auto md:ml-0"
          />
        )}
      </div>
      {delayNoticeIssueDate && (
        <IssueDelayNotice
          issueDate={delayNoticeIssueDate}
          issueNo={issueNo}
          initialGap={delayNoticeInitialGap}
        />
      )}

      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-8">
        <h1 className="text-nameplate animate-rise font-serif font-extrabold whitespace-nowrap">
          Daily <span className="text-brand">AI</span> Brief
        </h1>
        <IssueEar stats={stats} />
      </div>

      <div
        aria-hidden
        className="border-rule animate-draw mt-4 h-1.5 origin-left border-t-4 border-b md:mt-5"
      />

      <nav
        aria-label="지면 섹션"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {[
          { href: "#front", label: "1면" },
          ...categories.map((c) => ({
            href: `#section-${categorySlug(c)}`,
            label: categoryLabel(c),
          })),
          { href: "#all", label: indexLabel },
        ].map((item, i) => (
          <a
            key={item.href}
            href={item.href}
            className={
              "text-caption focus-visible:ring-ring flex-none px-2.5 py-3 font-medium whitespace-nowrap outline-none first:pl-0 focus-visible:ring-2 " +
              (i === 0
                ? "text-foreground decoration-brand underline decoration-2 underline-offset-[14px]"
                : "text-foreground-soft hover:text-foreground")
            }
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

/**
 * 제호 '귀'(신문 제호 옆 작은 안내 칸) — 이번 호 N건 · 매체 M곳 + 형식 구성(0건 형식 생략).
 * md 이상: 제호 오른쪽 세로 칸(왼쪽 헤어라인, 세리프 큰 숫자). 모바일: 제호 아래 두 줄.
 * "오늘"이 아니라 "이번 호" — 발행이 지연되면 보고 있는 호가 어제 것이라 "오늘"은 거짓이 된다.
 */
function IssueEar({ stats }: { stats: IssueStats }) {
  return (
    <div
      data-testid="issue-ear"
      className="text-meta text-muted-foreground border-border flex flex-col gap-0.5 md:flex-none md:border-l md:pt-0.5 md:pb-1.5 md:pl-5"
    >
      <span className="text-label hidden font-semibold md:block">이번 호</span>
      <span>
        <span className="text-foreground font-bold md:hidden">{"이번 호 "}</span>
        <b className="text-foreground font-bold tabular-nums md:mr-0.5 md:font-serif md:text-[2.125rem] md:leading-[1.05] md:font-extrabold md:tracking-[-0.04em]">
          {stats.count}
        </b>
        <span className="md:text-foreground md:mr-1.5 md:font-serif md:text-[1.0625rem] md:leading-none md:font-bold">
          건
        </span>{" "}
        <span className="tabular-nums">· 매체 {stats.sources}곳</span>
      </span>
      {stats.formats.length > 0 && (
        <span className="flex flex-wrap gap-x-1 md:mt-0.5">
          {stats.formats.map(({ format, count }, i) => (
            <span key={format} className="contents">
              {i > 0 && (
                <span aria-hidden className="opacity-60">
                  ·
                </span>
              )}
              <span>
                {FORMAT_LABELS[format]}{" "}
                <b className="text-foreground-soft font-semibold tabular-nums">{count}</b>
              </span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
