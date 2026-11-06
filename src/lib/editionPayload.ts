/**
 * 호 고정 링크 지면의 클라이언트 섬(EditionBody) 페이로드 — 서버 뷰가 짜고(`packEdition`) 섬이 되살린다(`unpackEdition`).
 * 영어판 Phase 4-1(호 페이지 ≤ 150KB).
 *
 * 1면·레이더·섹션 밴드를 서버 컴포넌트로 그리면 렌더 트리(요소·className)가 통째로 RSC 페이로드(`index.txt` + HTML 인라인
 * 두 벌)에 실리고, "이 호의 기사" 색인(클라이언트)은 같은 기사를 카드 props 로 한 번 더 싣는다. 섬 하나가 이 호 기사를
 * **한 벌의 행**으로 받아 모든 밴드를 그리면 페이로드에는 데이터만 남고, 정적 HTML 은 같은 컴포넌트의 SSR 이라 그대로다.
 *
 * - 행은 홈·검색 색인 조각과 같은 인코딩(src/lib/indexShards.ts `encodeRow`·`decodeRow`)이다. 매체 이름·형식은 매체 표로
 *   빼고, 지면이 그리지 않는 태그는 빈 배열로 둔다. 행 순서 = 편집 순 = 색인 순(`edition.issue`).
 * - 편집(리드·서브·브리핑·레이더·화제·섹션)은 서버가 `buildEdition` 으로 정한 결과를 기사 id 로만 넘긴다 — 클라이언트가
 *   다시 계산하지 않으니 어긋날 일이 없다.
 * - 레이더 칸만 메타 레일(owner/repo·arXiv ID·★ 수치)이 읽는 원문 URL·메트릭을 덧붙인다.
 *
 * 서버 전용 모듈(db·fs)을 import 하지 않는다(클라이언트 번들에 들어간다).
 */
import type { Edition } from "@/lib/edition";
import type { Locale } from "@/lib/i18n";
import { decodeRow, encodeRow, type IndexRow, type ManifestSource } from "@/lib/indexShards";
import type { ArticleCard, Engagement, StoryCard } from "@/lib/types";
import type { WeeklyRadar } from "@/lib/weeklyRadar";

/** 레이더 칸: [기사 id, 원문 URL, 메트릭(있을 때만)]. */
export type EditionRadarSlot = [id: number, url: string, engagement?: Engagement];

/** 섹션 밴드: [분야 키, 호 안 분야 건수, 그중 1면 건수, 밴드 항목 id]. */
export type EditionSectionSlot = [category: string, count: number, onFront: number, ids: number[]];

/** 섬 하나가 받는 호 지면 데이터. */
export interface EditionPayload {
  /** 매체 id → 이름·형식(행의 매체 칸이 가리킨다). 영문명은 영어판에만. */
  sources: Record<string, ManifestSource>;
  /** 이 호 기사 전체 행(편집 순 = 색인 순). */
  rows: IndexRow[];
  lead: number | null;
  seconds: number[];
  briefs: number[];
  radar: EditionRadarSlot[];
  trending: number[];
  sections: EditionSectionSlot[];
  /** Korea Desk 선정 기사 id(영어판만 — 섬이 src/lib/koreaDesk.ts `applyKoreaDesk` 로 밴드를 짠다). 한국어판은 키가 없다. */
  desk?: number[];
}

const ids = (cards: readonly { id: number }[]) => cards.map((a) => a.id);

/** 서버: 편집 결과 → 섬 페이로드. 행의 제목·요약은 그 언어판의 것(encodeRow — ko 는 원제 폴백 포함). */
export function packEdition(
  edition: Edition<ArticleCard>,
  locale: Locale,
  desk?: readonly number[],
): EditionPayload {
  const sources: Record<string, ManifestSource> = {};
  for (const a of edition.issue) {
    if (sources[a.source.id]) continue;
    // 형식은 소스 속성(sources.format)이라 같은 매체의 기사는 형식이 같다(색인 조각 매체 표와 같은 전제).
    const s: ManifestSource = { name: a.source.name, format: a.format };
    if (locale === "en" && a.source.nameEn) s.nameEn = a.source.nameEn;
    // 지역(KOREA 표시·Korea Desk)도 영어판에만.
    if (locale === "en" && a.source.region) s.region = a.source.region;
    sources[a.source.id] = s;
  }
  return {
    sources,
    rows: edition.issue.map((a) => encodeRow({ ...a, tags: [] }, locale, false)),
    lead: edition.lead?.id ?? null,
    seconds: ids(edition.seconds),
    briefs: ids(edition.briefs),
    radar: edition.radar.map(
      (a): EditionRadarSlot => (a.engagement ? [a.id, a.url, a.engagement] : [a.id, a.url]),
    ),
    trending: ids(edition.trending),
    sections: edition.sections.map(
      (s): EditionSectionSlot => [s.category, s.count, s.onFront, ids(s.items)],
    ),
    ...(desk?.length ? { desk: [...desk] } : {}),
  };
}

/** 클라이언트: 페이로드 → 편집(지면 카드). 행에 없는 id 는 만들 수 없다(packEdition 이 issue 전체를 행으로 싣는다). */
export function unpackEdition(payload: EditionPayload, locale: Locale): Edition<StoryCard> {
  const issue: StoryCard[] = payload.rows.map((row) =>
    decodeRow(row, { locale, sources: payload.sources }),
  );
  const byId = new Map(issue.map((a) => [a.id, a]));
  const card = (id: number): StoryCard => {
    const a = byId.get(id);
    if (!a) throw new Error(`edition payload: unknown article ${id}`);
    return a;
  };
  const cards = (list: readonly number[]) => list.map(card);
  return {
    lead: payload.lead === null ? null : card(payload.lead),
    seconds: cards(payload.seconds),
    briefs: cards(payload.briefs),
    radar: payload.radar.map(([id, url, engagement]) =>
      engagement ? { ...card(id), url, engagement } : { ...card(id), url },
    ),
    trending: cards(payload.trending),
    sections: payload.sections.map(([category, count, onFront, items]) => ({
      category,
      count,
      onFront,
      items: cards(items),
    })),
    issue,
  };
}

/**
 * 주간 레이더를 섬 props 로 — 한국어판은 그리지 않는 영어 제목·영문 매체명을 뗀다. 영어판은 거꾸로 한국어 제목
 * (`title` — 영어판은 titleEn 만 그린다)을 비운다(영어 페이지 RSC 에 한국어가 실리지 않게).
 * 순위·식별자·수치는 그대로라 밴드 렌더는 같다.
 */
export function packWeekly(weekly: WeeklyRadar | null, locale: Locale): WeeklyRadar | null {
  if (!weekly) return weekly;
  if (locale === "en") {
    return { ...weekly, items: weekly.items.map((item) => ({ ...item, title: "" })) };
  }
  return {
    ...weekly,
    items: weekly.items.map((item) => {
      const ko = { ...item, source: { name: item.source.name } };
      delete ko.titleEn;
      return ko;
    }),
  };
}
