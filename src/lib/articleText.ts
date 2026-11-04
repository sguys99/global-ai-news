/**
 * 기사 카드의 언어별 표시 문자열(영어판 Phase 3-2) — 제목·요약·매체명을 고르는 규칙의 단일 출처.
 *
 * ko 는 지금 컴포넌트가 쓰는 식과 같다(`titleKo || titleOriginal`, `summaryKo`, `shortSourceName(source.name)`).
 * en 은 **한국어 가공 텍스트(titleKo·summaryKo)로 절대 폴백하지 않는다** — 영어 페이지에 한국어가 섞이면 품질 신호가
 * 나빠진다(english-version-plan 기본값). 영어판은 `hasEnglish` 가 참인 기사만 싣는 것이 전제이고, 아래 폴백은 그 전제가
 * 깨졌을 때의 방어선이다:
 *  - 제목: titleEn → 원제(titleOriginal, 한글이 없을 때만 — 한국 매체 원제는 한국어다) → 빈 문자열.
 *  - 요약: summaryEn → 빈 문자열(원문 발췌는 요약이 아니고, 요약 칸은 비면 그리지 않는 게 지금 규칙이다).
 *  - 매체: labels.ts `sourceDisplayName`(축약 맵의 라틴 이름 → nameEn → name).
 *
 * 입력은 구조 타입이라 ArticleCard·SearchIndexEntry·IndexCard(원제 없음)·FollowUpEntry(매체가 문자열) 모두 받는다.
 */
import type { Locale } from "@/lib/i18n";
import { hasHangul, sourceDisplayName } from "@/lib/labels";
import type { ArticleSource } from "@/lib/types";

/** 제목 필드(IndexCard 는 원제가 없고 만들 때 원제 폴백을 titleKo 에 넣었다 — src/lib/feedIndex.ts). */
export interface HeadlineFields {
  titleKo: string;
  titleOriginal?: string;
  titleEn?: string;
}

/** 표시 제목. ko `titleKo || titleOriginal`(기존 식), en `titleEn || 라틴 원제 || ""`. */
export function headlineOf(a: HeadlineFields, locale: Locale = "ko"): string {
  if (locale === "en") {
    if (a.titleEn) return a.titleEn;
    return a.titleOriginal && !hasHangul(a.titleOriginal) ? a.titleOriginal : "";
  }
  return a.titleKo || a.titleOriginal || "";
}

/** 표시 요약. ko `summaryKo`, en `summaryEn`(없으면 빈 문자열 — 한국어로 폴백하지 않는다). */
export function summaryOf(
  a: { summaryKo: string; summaryEn?: string },
  locale: Locale = "ko",
): string {
  return locale === "en" ? (a.summaryEn ?? "") : a.summaryKo;
}

/**
 * 매체 표시명. 기본은 축약명(바이라인·칩), `full` 이면 원래 이름(툴팁·상세 신호 패널).
 * ko 는 `shortSourceName(source.name)` / `source.name` 그대로.
 */
export function sourceNameOf(
  a: { source: Pick<ArticleSource, "name" | "nameEn"> },
  locale: Locale = "ko",
  { full = false }: { full?: boolean } = {},
): string {
  return sourceDisplayName(a.source, locale, full);
}

/**
 * 영어판에 실을 수 있는 기사인지 — 영어 제목과 요약이 둘 다 있어야 한다(품질 검사 기각·가공 전은 둘 다 비어 있다).
 * 영어판 지면·색인·사이트맵·hreflang 이 모두 이 판정을 따른다(영어 없는 기사는 한국어판에만, hreflang 없음).
 * 목록용 카드(toListCard)는 영어 필드를 떼므로, 판정은 떼기 전의 카드로 한다 — 영어 필드가 아예 없는 타입
 * (SearchIndexEntry·IndexCard)을 넘기면 타입 오류(공통 속성 없음)가 나서 이 실수를 막는다.
 */
export function hasEnglish(a: { titleEn?: string; summaryEn?: string }): boolean {
  return Boolean(a.titleEn?.trim() && a.summaryEn?.trim());
}
