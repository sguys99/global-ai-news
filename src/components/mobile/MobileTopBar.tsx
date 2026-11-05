import Link from "next/link";
import { HeaderWordmark } from "@/components/HeaderWordmark";
import { Icon } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";

/**
 * 모바일 전용 상단 바. 데스크톱 Header(`hidden md:block`)의 모바일 짝으로 `md:hidden`만 렌더된다.
 * 워드마크(홈에선 제호를 지나면 등장) + 검색 + 테마 토글.
 * 서버 컴포넌트라 언어를 prop 으로 받는다(SiteShell). 워드마크·테마 토글은 클라이언트라 컨텍스트로 읽는다.
 */
export function MobileTopBar({ locale = "ko" }: { locale?: Locale }) {
  const t = getMessages(commonMessages, locale);
  return (
    <header className="sh-mtb">
      <div className="sh-mtb-in">
        {/* py-2: 워드마크 링크 터치 타깃 44px(바 높이 52px 안). inline-flex 는 "AI Daybook" 의 공백을 지우므로 쓰지 않는다. */}
        <HeaderWordmark className="py-2 text-lg" />
        <nav className="-mr-2 flex items-center">
          <Button variant="ghost" size="icon" asChild aria-label={t.nav.search}>
            <Link href={localePath(locale, "/search")}>
              <Icon name="search" />
            </Link>
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
