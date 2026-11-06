"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { HTML_LANG, getMessages, type Locale } from "@/lib/i18n";
import { currentLocaleSwitchHref, localeHomeHref, otherLocale } from "@/lib/localeSwitch";
import { localeSwitchMessages } from "@/lib/messages/localeSwitch";

/**
 * 언어 전환 링크 주소(english-version-plan 5-3). 서버 HTML·하이드레이션은 대상 언어 홈(늘 있는 주소), 마운트 뒤·경로가
 * 바뀔 때마다 페이지 `<head>` 의 `<link rel="alternate" hreflang>`(같은 페이지의 대상 언어판이 있을 때만 있다)로 바꾼다.
 * 클릭 순간에도 한 번 더 읽는다 — 클라이언트 이동 직후 `<head>` 가 바뀐 것을 효과보다 먼저 누를 수 있고, 검색 쿼리도 그때 값이다.
 */
export function useLocaleSwitchHref(target: Locale) {
  const pathname = usePathname();
  const [href, setHref] = useState(() => localeHomeHref(target));
  useEffect(() => {
    setHref(currentLocaleSwitchHref(target));
  }, [pathname, target]);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.currentTarget.setAttribute("href", currentLocaleSwitchHref(target));
  };
  return { href, onClick };
}

const VARIANT_CLASS = {
  /** 데스크톱 헤더 — 내비 뒤 헤어라인으로 나눈 흐린 글자. */
  header: "sh-lsw",
  /** 모바일 상단 바 — 검색 아이콘 앞 글자 링크(44px). */
  mobile: "sh-mlsw",
  /** 푸터 내비 — 다른 푸터 링크와 같은 모양. */
  footer: "sh-fl",
} as const;

/**
 * 언어 전환 링크 — 영어 페이지 `한국어`(lang=ko), 한국어 페이지 `EN`. 대상 언어 이름을 그 언어로 쓴다(DESIGN.md §9).
 * 다른 언어판은 최상위 레이아웃이 달라 클라이언트 이동이 안 된다 — 일반 `<a>`(미리 받기 없음, 전체 로드, basePath 는
 * src/lib/localeSwitch.ts 가 붙인다). 셸 클라이언트 섬(ShellChrome) 안에서만 그린다 — 페이지 RSC 에 참조·props 가 늘지 않는다.
 */
export function LocaleSwitch({ variant }: { variant: keyof typeof VARIANT_CLASS }) {
  const target = otherLocale(useLocale());
  const t = getMessages(localeSwitchMessages, target);
  const { href, onClick } = useLocaleSwitchHref(target);
  const lang = HTML_LANG[target];
  return (
    <a
      className={VARIANT_CLASS[variant]}
      href={href}
      onClick={onClick}
      lang={lang}
      hrefLang={lang}
      aria-label={t.title}
      title={t.title}
    >
      {t.label}
    </a>
  );
}
