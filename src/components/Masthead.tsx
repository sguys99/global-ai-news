import Link from "next/link";
import { categoryLabel, categorySlug, formatLongDate, kstDateKey } from "@/lib/labels";
import { ShareButton } from "@/components/ShareButton";
import { SITE_NAME, SITE_TAGLINE, editionPath, editionShareUrl } from "@/lib/site";

/**
 * 홈 마스트헤드 (DESIGN.md §5 masthead). 발행일·호수·에디션 통계 폴리오 + 대형 세리프 제호 +
 * 이중 잉크 괘선 + 섹션 내비(앵커). 홈(`/`)의 필터 없는 편집 지면에서만 렌더한다.
 * `id="masthead"` 는 헤더 워드마크가 스크롤 위치를 감지하는 기준점이다(HeaderWordmark).
 * 발행일은 그 호의 고정 링크(`/edition/[date]/`)다 — 날짜가 지나도 같은 지면을 다시 열 수 있다.
 * "공유"도 홈 주소가 아니라 이 고정 링크를 내보낸다(카카오톡이 홈 URL의 지난 호 미리보기를 재사용).
 */
export function Masthead({
  issueNo,
  publishedAt,
  total,
  sourceCount,
  categories,
  indexLabel = "전체 기사",
}: {
  issueNo: number;
  publishedAt: string | null;
  total: number;
  sourceCount: number;
  categories: string[];
  /** 섹션 내비 마지막 항목(#all) 라벨. 호 고정 링크 지면은 "이 호의 기사". */
  indexLabel?: string;
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
        {issueNo > 0 && <span>제 {issueNo}호</span>}
        <span>
          기사 {total}건 · 매체 {sourceCount}곳
        </span>
        <span className="ml-auto hidden md:inline">매일 06:00 KST 발행</span>
        {publishedAt && (
          <ShareButton
            url={editionShareUrl(kstDateKey(publishedAt))}
            title={`${SITE_NAME} ${formatLongDate(publishedAt)}${issueNo > 0 ? ` 제${issueNo}호` : ""}`}
            className="ml-auto md:ml-0"
          />
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-8">
        <h1 className="text-nameplate animate-rise font-serif font-extrabold whitespace-nowrap">
          Daily <span className="text-brand">AI</span> Brief
        </h1>
        <p className="text-caption text-muted-foreground max-w-[17em] md:pb-2 md:text-right">
          {SITE_TAGLINE}
        </p>
      </div>

      <div
        aria-hidden
        className="border-rule animate-draw mt-4 h-1.5 origin-left border-t-4 border-b md:mt-5"
      />

      <nav
        aria-label="지면 섹션"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0"
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
              "text-caption focus-visible:ring-ring flex-none px-2.5 py-3 font-medium outline-none first:pl-0 focus-visible:ring-2 " +
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
