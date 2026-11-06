"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useLocaleSwitchHref } from "@/components/LocaleSwitch";
import { getMessages } from "@/lib/i18n";
import {
  browserLanguages,
  readNoticeDismissed,
  shouldShowEnglishNotice,
  writeNoticeDismissed,
} from "@/lib/localeSwitch";
import { localeSwitchMessages } from "@/lib/messages/localeSwitch";

/**
 * 한국어 페이지 영어 안내 줄 `Read AI Daybook in English →`(english-version-plan 5-3, DESIGN.md §9 "언어 전환").
 * 브라우저 선호 언어에 ko 가 없을 때만 **마운트 뒤** 헤더 바로 아래 한 줄 — 정적 HTML 에는 없어 크롤러·한국어 독자는 보지 않고,
 * 리다이렉트하지 않는다. 헤어라인 아래·배경 없음·화살표만 코발트, 닫기 44px(localStorage 에 기억). 링크는 언어 전환과 같은
 * 규칙(같은 페이지의 영어판, 없으면 영어 홈). 셸 클라이언트 섬(ShellChrome)이 한국어 셸에서만 그린다.
 */
export function EnglishNotice() {
  const [visible, setVisible] = useState(false);
  const { href, onClick } = useLocaleSwitchHref("en");
  const t = getMessages(localeSwitchMessages, "en");

  useEffect(() => {
    setVisible(shouldShowEnglishNotice(browserLanguages(), readNoticeDismissed()));
  }, []);

  if (!visible) return null;
  return (
    <div className="sh-rie" lang="en">
      <div className="sh-rie-in">
        <a className="sh-rie-a" href={href} onClick={onClick} hrefLang="en">
          <span className="sh-rie-t">{t.notice}</span>
          <span className="text-brand" aria-hidden="true">
            →
          </span>
        </a>
        <button
          type="button"
          className="sh-rie-x"
          aria-label={t.dismiss}
          onClick={() => {
            writeNoticeDismissed();
            setVisible(false);
          }}
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}
