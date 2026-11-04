import Link from "next/link";
import { VisitorCount } from "@/components/VisitorCount";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";
import { footerMessages } from "@/lib/messages/footer";
import { siteTagline } from "@/lib/site";

/**
 * 전역 푸터 (DESIGN.md v2 footer). 굵은 잉크 괘선 + 세리프 제호 + 태그라인 + 콜로폰.
 * 태그라인(SITE_TAGLINE, en SITE_TAGLINE_EN)은 마스트헤드 제호 옆에서 옮겨 왔다(그 자리는 이번 호 통계 '귀').
 * 테마에 따라 색이 자동 전환된다. 서버 컴포넌트라 언어를 prop 으로 받는다(SiteShell) — 방문 줄은 컨텍스트로 읽는다.
 */
/** 44px 터치 타깃 — 음수 마진으로 시각 높이는 유지(모바일만). */
const footLink = "hover:text-brand -my-3 inline-flex min-h-11 items-center md:my-0 md:min-h-0";

export function Footer({ locale = "ko" }: { locale?: Locale }) {
  const common = getMessages(commonMessages, locale);
  const t = getMessages(footerMessages, locale);
  return (
    <footer className="border-rule mt-auto border-t-4">
      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 pt-7 pb-10 md:grid-cols-[1fr_auto] md:items-end md:px-8">
        <div className="flex flex-col gap-2">
          <span className="font-serif text-[2.5rem] leading-none font-extrabold tracking-[-0.045em]">
            <span className="text-brand">AI</span> Daybook
          </span>
          <p className="text-caption text-foreground-soft max-w-md">{siteTagline(locale)}</p>
          <p className="text-meta text-muted-foreground max-w-md">{t.colophon}</p>
          <p className="text-label text-muted-foreground">
            © {new Date().getFullYear()} Nasica Inc. All rights reserved.
          </p>
          <VisitorCount />
        </div>

        <nav className="text-caption flex gap-6 font-semibold">
          <Link href={localePath(locale, "/")} className={footLink}>
            {common.nav.today}
          </Link>
          <Link href={localePath(locale, "/search")} className={footLink}>
            {common.nav.search}
          </Link>
          {/* 운영 콘솔(/admin)은 로컬 전용 도구 — 정적 배포 산출엔 없으므로 공개 푸터에 노출하지 않는다. */}
        </nav>
      </div>
    </footer>
  );
}
