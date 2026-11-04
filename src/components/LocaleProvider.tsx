"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale, type MessageNamespace } from "@/lib/i18n";

/**
 * 클라이언트 컴포넌트용 언어 컨텍스트(영어판 Phase 3). 서버 컴포넌트는 `locale` prop 을 받고 이것을 쓰지 않는다.
 * 기본값이 ko 라 공급자 없이 그려도(한국어 레이아웃·기존 컴포넌트 테스트) 한국어가 나온다 —
 * 한국어 레이아웃은 공급자를 두지 않아도 되고, 영어 레이아웃만 `<LocaleProvider locale="en">` 으로 감싼다.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** 지금 언어(공급자 밖이면 ko). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** 이름공간의 지금 언어 문구. 예: `const t = useMessages(commonMessages); t.nav.search`. */
export function useMessages<S>(ns: MessageNamespace<S>): S {
  return ns[useLocale()];
}
