"use client";

import { useMemo } from "react";
import { FrontPage, SectionBands, WeeklyRadarBand } from "@/components/Edition";
import { useLocale, useMessages } from "@/components/LocaleProvider";
import { StoryIndex } from "@/components/StoryIndex";
import { unpackEdition, type EditionPayload } from "@/lib/editionPayload";
import { editionMessages } from "@/lib/messages/edition";
import type { WeeklyRadar } from "@/lib/weeklyRadar";

/**
 * 호 고정 링크 지면 본문의 클라이언트 섬 — 1면(리드·서브·오늘의 브리핑·지금 화제·이 호의 지면·레이더) · 주간 레이더(일요일) ·
 * 섹션 밴드 · "이 호의 기사" 색인을 이 호 기사 한 벌(행 페이로드, src/lib/editionPayload.ts)로 그린다(영어판 Phase 4-1).
 *
 * 서버 컴포넌트로 그리면 렌더 트리가 RSC 페이로드에 실리고 색인은 같은 기사를 카드 props 로 또 싣는다 — 섬은 데이터만 싣는다.
 * 정적 HTML 은 같은 컴포넌트(Edition·Story·StoryIndex)의 SSR 이라 서버 렌더 때와 같다. 마스트헤드·세 줄 요약·호 이동은
 * 서버에 남는다(뷰 src/views/EditionView.tsx). 언어는 prop 이 아니라 컨텍스트로 읽는다(한국어 레이아웃은 공급자 없이 ko).
 */
export function EditionBody({
  edition: payload,
  weekly,
}: {
  edition: EditionPayload;
  /** 주간 레이더(일요일 호만, 아니면 null). */
  weekly: WeeklyRadar | null;
}) {
  const locale = useLocale();
  const t = useMessages(editionMessages);
  const edition = useMemo(() => unpackEdition(payload, locale), [payload, locale]);

  return (
    <>
      <FrontPage edition={edition} locale={locale} />
      {weekly && <WeeklyRadarBand weekly={weekly} locale={locale} />}
      <SectionBands sections={edition.sections} locale={locale} />
      <section id="all" aria-label={t.index} className="scroll-mt-20">
        <div className="border-rule mb-5 flex items-baseline gap-3 border-t-2 pt-3">
          <h2 className="text-display-md font-serif font-extrabold">{t.index}</h2>
          <span className="ed-cnt">{t.count(edition.issue.length)}</span>
        </div>
        <StoryIndex articles={edition.issue} />
      </section>
    </>
  );
}
