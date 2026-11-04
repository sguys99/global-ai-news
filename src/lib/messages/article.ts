import { defineMessages, plural } from "@/lib/i18n";

/**
 * 기사 상세 본문(src/views/ArticleView.tsx) 문구 — 신호 패널·요약·다른 매체 보도·원문 발췌·원문 CTA·같은 분야 기사.
 * 돌아가기 링크("오늘의 지면")는 셸 내비와 같은 말이라 common 의 `nav.today` 를 쓴다.
 * 사건 타임라인·키커·태그 칩처럼 컴포넌트 안의 문구는 그 컴포넌트 이름공간 몫이다(Phase 3-3 C단계).
 */
export const articleMessages = defineMessages({
  ko: {
    /** 신호 패널(dl) 칸 이름. */
    signals: {
      source: "매체",
      published: "게시",
      importance: "중요도",
      trending: "화제 지수",
    },
    summary: "한국어 요약",
    /** 같은 사건의 다른 매체 보도(related_json) 머리. */
    coverage: (n: number) => `같은 소식, 다른 매체 · ${n}곳`,
    /** 원문 발췌(contentRaw) 머리 — 발췌는 원문 언어 그대로다. */
    excerpt: "원문 발췌 · English",
    readOriginal: "원문 기사 읽기",
    /** 같은 분야 기사 머리 — 인자는 분야 표시명(categoryLabel). */
    moreInCategory: (category: string) => `${category}의 다른 기사`,
    seeAll: "전체 보기 →",
  },
  en: {
    signals: {
      source: "Outlet",
      published: "Published",
      importance: "Importance",
      trending: "Trending",
    },
    summary: "Summary",
    coverage: (n: number) => `Also reported by ${n} ${plural(n, "outlet", "outlets")}`,
    excerpt: "Original excerpt",
    readOriginal: "Read the original",
    moreInCategory: (category: string) => `More in ${category}`,
    seeAll: "See all →",
  },
});
