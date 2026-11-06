"use client";

import Link from "next/link";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { VisitorCount } from "@/components/VisitorCount";
import { localePath } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";
import { footerMessages } from "@/lib/messages/footer";
import { siteTagline } from "@/lib/site";

/**
 * 전역 푸터 (DESIGN.md v2 footer). 굵은 잉크 괘선 + 세리프 제호 + 태그라인 + 콜로폰.
 * 태그라인(SITE_TAGLINE, en SITE_TAGLINE_EN)은 마스트헤드 제호 옆에서 옮겨 왔다(그 자리는 이번 호 통계 '귀').
 * 테마에 따라 색이 자동 전환된다. 셸 클라이언트 섬(ShellChrome)의 일부라 언어는 컨텍스트로 읽는다(Phase 4-1 —
 * 서버 컴포넌트면 푸터 요소 트리가 모든 페이지 RSC 에 실린다). 저작권 연도는 빌드 시각 값을 prop 으로 받는다
 * (서버 HTML 과 브라우저 하이드레이션이 같은 값을 쓰게 — 없으면 지금 연도, 테스트용).
 */
/** 44px 터치 타깃 — 음수 마진으로 시각 높이는 유지(모바일만, globals.css `.sh-fl`). */
const footLink = "sh-fl";

export function Footer({ year = new Date().getFullYear() }: { year?: number }) {
  const locale = useLocale();
  const common = useMessages(commonMessages);
  const t = useMessages(footerMessages);
  return (
    <footer className="border-rule mt-auto border-t-4">
      <div className="sh-ft-in">
        <div className="flex flex-col gap-2">
          <span className="sh-ft-np">
            <span className="text-brand">AI</span> Daybook
          </span>
          <p className="text-caption text-foreground-soft max-w-md">{siteTagline(locale)}</p>
          <p className="text-meta text-muted-foreground max-w-md">{t.colophon}</p>
          <p className="text-label text-muted-foreground">
            © {year} Nasica Inc. All rights reserved.
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
          {/* 언어 전환(5-3): 헤더와 같은 링크(`한국어` / `EN`). */}
          <LocaleSwitch variant="footer" />
          {/* 운영 콘솔(/admin)은 로컬 전용 도구 — 정적 배포 산출엔 없으므로 공개 푸터에 노출하지 않는다. */}
        </nav>
      </div>
    </footer>
  );
}
