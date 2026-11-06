/**
 * Korea Desk(영어판 전용 밴드, DESIGN.md §9 "영어판" · english-version-plan 5-1 결정) — 선정·섹션 밴드 보정의 단일 출처.
 * 순수 함수(서버·클라이언트 공용, fs·db import 없음) — 홈(FeedView)과 호 고정 링크(EditionBody)가 같은 함수로 같은 밴드를 만든다
 * (주간 레이더와 같은 규칙).
 *
 * 선정(`selectKoreaDesk`, 서버 빌드타임): 그 호의 한국 매체(`source.region === "kr"`) 기사 중 1면 본문(리드·서브·브리핑·레이더)
 * 게재분을 빼고, **한국 주제**(영어 제목·요약에 Korea·Korean·Seoul·KRW 나 용어집의 한국 기관·기업 영문명 — `isKoreaSubject`)
 * 를 먼저, 남으면 편집 순(중요도 → 화제 → 최신, `edition.issue` 순서)으로 ≤ 4건. 한국 매체가 해외 소식도 많이 옮겨서
 * 매체 기준만 쓰면 데스크 절반이 해외 기업 소식이 된다(5-1 시안 제140호).
 *
 * 지면 적용(`applyKoreaDesk`, 섬): 선정 id 를 받아 데스크 기사를 영어 섹션 밴드에서 빼고(같은 기사를 두 번 싣지 않는다)
 * 밴드를 그 호 기사로 다시 채운다 — 밴드 머리는 `7 stories · 2 on the front page · 2 at the Korea Desk`.
 * 머리 칸의 "Elsewhere in this issue"(데스크 밖 한국 매체 기사와 실린 자리)도 여기서 만든다. 한국어판은 부르지 않는다.
 */
import { EDITION_LIMITS, frontArticles, type Edition, type EditionSection } from "@/lib/edition";
import type { StoryCard } from "@/lib/types";

/** 데스크 최대 건수(2×2). */
export const KOREA_DESK_LIMIT = 4;
/** 머리 칸 "Elsewhere in this issue" 최대 줄 수. */
export const KOREA_DESK_ELSEWHERE_LIMIT = 4;

/** 한국 주제 기본 낱말 — 영어 본문에 이 낱말이 있으면 한국 소식으로 본다(대소문자 구분, 낱말 경계). */
const KOREA_WORDS = /\b(?:Korea|Korean|Koreans|Seoul|KRW)\b/;

/** 용어집에서 한국 기관·기업 이름을 거둘 절(`### …` 머리). 사람·직함·해외 이름 절은 뺀다. */
const KOREAN_GLOSSARY_SECTIONS = [
  "Government, public bodies and law",
  "Large companies",
  "AI, robotics and software startups",
  "Universities and research institutes",
  "Events and venues",
];

/**
 * 용어집(configs/prompts/glossary.en.md) → 한국 기관·기업 영문명 목록(순수 함수 — 파일 읽기는 서버 로더 몫).
 * 위 절의 `- 키 → English · 키 → English` 항목에서 영문 쪽만 거둔다. 괄호 설명은 떼고(`Solar (Upstage model)` → `Solar`)
 * 괄호 안 약칭(`(MSIT)`)은 따로 담는다. 소문자로 시작하는 일반어(`sovereign AI`, `the National Assembly's …`)는 버린다.
 */
export function koreaSubjectNames(glossaryMarkdown: string): string[] {
  const names = new Set<string>();
  let inSection = false;
  for (const raw of glossaryMarkdown.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("### ")) {
      inSection = KOREAN_GLOSSARY_SECTIONS.includes(line.slice(4).trim());
      continue;
    }
    if (!inSection || !line.startsWith("- ")) continue;
    // `키 · 키 → English · 키 → English` — 화살표 다음 조각의 첫 ` · ` 앞까지가 영문(마지막 조각은 끝까지).
    const parts = line.slice(2).split("→").slice(1);
    for (const part of parts) {
      const english = part.split(" · ")[0].trim();
      for (const m of english.matchAll(/\(([^)]*)\)/g)) {
        if (/^[A-Z][A-Za-z0-9&]{1,9}$/.test(m[1].trim())) names.add(m[1].trim());
      }
      const bare = english.replace(/\s*\([^)]*\)/g, "").trim();
      if (bare && /^[A-Z0-9]/.test(bare)) names.add(bare);
    }
  }
  return [...names];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 이름 목록 → 낱말 경계 대조식(대소문자 구분). 이름이 없으면 기본 낱말만. */
export function koreaSubjectPattern(names: readonly string[]): RegExp {
  if (names.length === 0) return KOREA_WORDS;
  // 긴 이름 먼저 — "Naver Cloud" 가 "Naver" 보다 먼저 걸리게(결과는 같지만 읽기 쉽다).
  const alts = [...names].sort((a, b) => b.length - a.length).map(escapeRe);
  return new RegExp(`${KOREA_WORDS.source}|(?<![\\w-])(?:${alts.join("|")})(?![\\w-])`);
}

/** 영어 제목·요약이 한국 소식인지(`koreaSubjectPattern` 대조). */
export function isKoreaSubject(
  article: { titleEn?: string; summaryEn?: string },
  pattern: RegExp,
): boolean {
  return pattern.test(`${article.titleEn ?? ""}\n${article.summaryEn ?? ""}`);
}

/**
 * 데스크 선정(서버, 빌드타임) — 그 호 한국 매체 기사 중 1면 밖, 한국 주제 먼저 → 편집 순, ≤ limit. 표시도 이 순서.
 * `edition.issue` 는 편집 순이다(buildEdition). 결과는 기사 id.
 */
export function selectKoreaDesk<C extends StoryCard>(
  edition: Pick<Edition<C>, "lead" | "seconds" | "briefs" | "radar" | "issue">,
  koreaSubject: (article: C) => boolean,
  limit = KOREA_DESK_LIMIT,
): number[] {
  const front = new Set(frontArticles(edition).map((a) => a.id));
  const candidates = edition.issue.filter((a) => a.source.region === "kr" && !front.has(a.id));
  const subject = candidates.filter(koreaSubject);
  const rest = candidates.filter((a) => !subject.includes(a));
  return [...subject, ...rest].slice(0, limit).map((a) => a.id);
}

/** 데스크 밖 한국 매체 기사가 실린 자리 — 1면, 분야 섹션 밴드, 그 밖(색인에만). */
export type KoreaDeskPlace =
  | { kind: "front" }
  | { kind: "section"; category: string }
  | { kind: "index" };

export interface KoreaDesk<C extends StoryCard = StoryCard> {
  /** 데스크 기사(선정 순). */
  items: C[];
  /** 데스크 밖 한국 매체 기사(편집 순, ≤ KOREA_DESK_ELSEWHERE_LIMIT)와 실린 자리. */
  elsewhere: { article: C; place: KoreaDeskPlace }[];
  /** 이 호의 한국 매체 기사 수(1면·데스크·밴드 모두). */
  korean: number;
}

/** 섹션 밴드 + 데스크 건수(밴드 머리 `· 2 at the Korea Desk`). */
export type DeskSection<C extends StoryCard> = EditionSection<C> & { atDesk: number };

/**
 * 지면 적용(섬·홈 공용) — 데스크 id 로 섹션 밴드를 다시 짜고(1면·데스크 게재분 제외, 분야당 ≤ 4, 빈 분야 생략) 데스크를 되살린다.
 * 데스크가 비면(`deskIds` 없음·빈 배열) 입력 그대로 + desk null — 한국어판과 영어판의 한국 매체 없는 호.
 */
export function applyKoreaDesk<C extends StoryCard>(
  edition: Edition<C>,
  deskIds: readonly number[] | undefined,
  sectionItems = EDITION_LIMITS.sectionItems,
): { edition: Edition<C>; sections: DeskSection<C>[]; desk: KoreaDesk<C> | null } {
  const byId = new Map(edition.issue.map((a) => [a.id, a]));
  const items = (deskIds ?? []).map((id) => byId.get(id)).filter((a): a is C => Boolean(a));
  if (items.length === 0) {
    return {
      edition,
      sections: edition.sections.map((s) => ({ ...s, atDesk: 0 })),
      desk: null,
    };
  }
  const front = new Set(frontArticles(edition).map((a) => a.id));
  const atDesk = new Set(items.map((a) => a.id));
  // 데스크 기사는 1면 밖이라 그 분야는 이미 밴드가 있다 — 밴드 순서(CATEGORIES 순)·건수는 그대로 두고 항목만 다시 고른다.
  // 남은 항목이 없으면 밴드(와 내비 항목)가 빠진다.
  const sections: DeskSection<C>[] = edition.sections
    .map(({ category, count, onFront }) => {
      const inCategory = edition.issue.filter((a) => a.category === category);
      return {
        category,
        count,
        onFront,
        atDesk: inCategory.filter((a) => atDesk.has(a.id)).length,
        items: inCategory
          .filter((a) => !front.has(a.id) && !atDesk.has(a.id))
          .slice(0, sectionItems),
      };
    })
    .filter((s) => s.items.length > 0);

  const banded = new Map<number, string>();
  for (const s of sections) for (const a of s.items) banded.set(a.id, s.category);
  const korean = edition.issue.filter((a) => a.source.region === "kr");
  const elsewhere = korean
    .filter((a) => !atDesk.has(a.id))
    .slice(0, KOREA_DESK_ELSEWHERE_LIMIT)
    .map((article) => {
      const category = banded.get(article.id);
      const place: KoreaDeskPlace = front.has(article.id)
        ? { kind: "front" }
        : category
          ? { kind: "section", category }
          : { kind: "index" };
      return { article, place };
    });

  return {
    edition: { ...edition, sections },
    sections,
    desk: { items, elsewhere, korean: korean.length },
  };
}
