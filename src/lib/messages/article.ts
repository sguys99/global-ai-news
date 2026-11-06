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
    /**
     * 한국 매체 원제 병기 표지(영어판 — 원제가 한국어일 때 원제 앞에 붙인다). 한국어판은 원제를 표지 없이 병기하므로
     * 이 값을 그리지 않는다(키 모양을 맞추려고 둔다).
     */
    originalInKorean: "한국어 원문 기사",
    /**
     * 영어판 묶인 보도 중 한국어 제목만 있는 보도(제목 대신 쓰는 안내)·원문 언어 안내(원문 버튼·묶인 보도 옆
     * `aitimes.com · in Korean`). 한국어판은 그리지 않는다(키 모양을 맞추려고 둔다).
     */
    koreanReport: "한국어 보도",
    inKorean: "한국어",
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
    originalInKorean: "Original article in Korean",
    koreanReport: "Korean-language report",
    inKorean: "in Korean",
    readOriginal: "Read the original",
    moreInCategory: (category: string) => `More in ${category}`,
    seeAll: "See all →",
  },
});
