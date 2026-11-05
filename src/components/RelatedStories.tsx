"use client";

import { useLocale } from "@/components/LocaleProvider";
import { StoryEntry } from "@/components/Story";
import type { EntryCard } from "@/lib/feedIndex";

/**
 * 상세 "같은 분야 기사" 목록 — 클라이언트 섬(Phase 4-1 페이지 무게, 분석 순위 5).
 * 서버 컴포넌트로 그리면 카드마다 렌더된 요소 트리가 RSC(인라인 `self.__next_f`)에 실린다. 섬은 목록 카드(toEntryCard)만
 * props 로 받아 같은 StoryEntry(hideCategory)를 그린다 — 정적 HTML 은 서버 렌더와 같다. 언어는 LocaleProvider 컨텍스트.
 */
export function RelatedStories({ cards }: { cards: EntryCard[] }) {
  const locale = useLocale();
  return cards.map((a) => <StoryEntry key={a.id} article={a} hideCategory locale={locale} />);
}
