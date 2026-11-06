import Link from "next/link";
import {
  categoryLabel,
  categorySlug,
  formatCountNoun,
  formatLabel,
  formatLongDate,
  issueNoLabel,
  kstDateKey,
} from "@/lib/labels";
import type { IssueStats } from "@/lib/edition";
import { IssueDelayNotice } from "@/components/IssueDelayNotice";
import { ShareButton } from "@/components/ShareButton";
import { SITE_NAME, editionPath, editionShareUrl } from "@/lib/site";
import { getMessages, localePath, plural, type Locale } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";
import { mastheadMessages } from "@/lib/messages/masthead";

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
  indexLabel,
  weekly = false,
  desk = false,
  delayNoticeIssueDate,
  delayNoticeInitialGap,
  locale = "ko",
}: {
  issueNo: number;
  publishedAt: string | null;
  /** 이번 호 통계(issueStats) — 누적 아님. 누적은 전체 기사 색인 머리에 둔다. */
  stats: IssueStats;
  /** 밴드가 있는 분야(CATEGORIES 순서) — 오늘 밴드가 없는 분야는 내비에서도 빠진다. */
  categories: string[];
  /** 섹션 내비 마지막 항목(#all) 라벨(기본 "전체 기사"). 호 고정 링크 지면은 "이 호의 기사". */
  indexLabel?: string;
  /** 주간 레이더(일요일 특집)가 실린 호 — 내비 "1면" 다음에 "주간 레이더"(#weekly)를 넣는다(지면 순서와 같다). */
  weekly?: boolean;
  /**
   * Korea Desk 밴드가 실린 호(영어판만) — 내비에 "Korea Desk"(#korea-desk)를 넣는다. 자리는 지면 순서와 같게
   * 1면(·주간 레이더) 다음, 분야 밴드 앞.
   */
  desk?: boolean;
  /** 지정하면 그 호 날짜(KST)가 오늘보다 낡았을 때 발행 지연 안내 줄을 띄운다(홈 전용). */
  delayNoticeIssueDate?: string;
  /** 빌드 시점에 계산한 지연 일수 — 정적 HTML 에 안내를 미리 담아 레이아웃 밀림을 막는다. */
  delayNoticeInitialGap?: number;
  /** 언어판(기본 ko) — 문구·날짜·내부 링크. 지연 안내 줄(클라이언트)은 LocaleProvider 로 언어를 읽는다. */
  locale?: Locale;
}) {
  const t = getMessages(mastheadMessages, locale);
  const common = getMessages(commonMessages, locale);
  return (
    <header id="masthead" className="mx-auto max-w-[1240px] px-4 pt-5 md:px-8 md:pt-7">
      <div className="text-meta text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
        {publishedAt && (
          <Link
            href={localePath(locale, editionPath(kstDateKey(publishedAt)))}
            title={t.permalinkTitle}
            className="ed-plink"
          >
            <time dateTime={publishedAt}>{formatLongDate(publishedAt, locale)}</time>
          </Link>
        )}
        {issueNo > 0 && <span className="tabular-nums">{issueNoLabel(issueNo, locale)}</span>}
        <span className="ml-auto hidden md:inline">{common.publishedDaily}</span>
        {publishedAt && (
          <ShareButton
            url={editionShareUrl(kstDateKey(publishedAt), locale)}
            title={t.shareTitle(SITE_NAME, formatLongDate(publishedAt, locale), issueNo)}
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
          <span className="text-brand">AI</span> Daybook
        </h1>
        <IssueEar stats={stats} locale={locale} />
      </div>

      <div
        aria-hidden
        className="border-rule animate-draw mt-4 h-1.5 origin-left border-t-4 border-b md:mt-5"
      />

      <nav
        aria-label={t.sectionsLabel}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {[
          { href: "#front", label: t.nav.front },
          ...(weekly ? [{ href: "#weekly", label: t.nav.weekly }] : []),
          ...(desk ? [{ href: "#korea-desk", label: t.nav.desk }] : []),
          ...categories.map((c) => ({
            href: `#section-${categorySlug(c)}`,
            label: categoryLabel(c, locale),
          })),
          { href: "#all", label: indexLabel ?? t.nav.all },
        ].map((item, i) => (
          <a
            key={item.href}
            href={item.href}
            className={i === 0 ? "ed-nav ed-nav-on" : "ed-nav ed-nav-off"}
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
 * 형식은 화면 표시명("뉴스 24 · 저장소 1") — 프롬프트용 "오픈소스"를 쓰면 이 호의 지면 "오픈소스·도구 N건"과 겹친다.
 * md 이상: 제호 오른쪽 세로 칸(왼쪽 헤어라인, 세리프 큰 숫자). 모바일: 제호 아래 두 줄.
 * "오늘"이 아니라 "이번 호" — 발행이 지연되면 보고 있는 호가 어제 것이라 "오늘"은 거짓이 된다.
 */
function IssueEar({ stats, locale }: { stats: IssueStats; locale: Locale }) {
  const t = getMessages(mastheadMessages, locale).ear;
  // 영어 둘째 줄은 비뉴스만 센다("4 repos · 2 models · 3 papers") — 첫 줄 "31 stories"와 같은 낱말이 다른 수로 읽히지 않게
  // (DESIGN.md §9 영어판 "형식 귀"). 한국어는 뉴스 포함 그대로.
  const formats =
    locale === "en" ? stats.formats.filter((f) => f.format !== "news") : stats.formats;
  return (
    <div data-testid="issue-ear" className="ed-ear">
      <span className="text-label hidden font-semibold md:block">{t.heading}</span>
      <span>
        <span className="text-foreground font-bold md:hidden">{t.prefix}</span>
        <b className="ed-ear-n">{stats.count}</b>
        <span className="ed-ear-u">{plural(stats.count, t.unit.one, t.unit.other)}</span>{" "}
        <span className="tabular-nums">{t.outlets(stats.sources)}</span>
      </span>
      {formats.length > 0 && (
        <span className="flex flex-wrap gap-x-1 md:mt-0.5">
          {formats.map(({ format, count }, i) => (
            <span key={format} className="contents">
              {i > 0 && (
                <span aria-hidden className="opacity-60">
                  ·
                </span>
              )}
              {locale === "en" ? (
                // en 은 수가 앞("4 repos") — 굵은 수 뒤에 공백 + 단·복수 명사를 잇는다.
                <span>
                  <b className="sg-em tabular-nums">{count}</b>
                  {` ${formatCountNoun(format, count, locale)}`}
                </span>
              ) : (
                <span>
                  {formatLabel(format, locale)} <b className="sg-em tabular-nums">{count}</b>
                </span>
              )}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
