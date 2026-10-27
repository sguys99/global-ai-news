/**
 * 홈 편집 지면 구성(DESIGN.md §3)의 단일 출처. 순수 함수 — 서버(빌드)·클라 어디서든 동일 결과.
 *
 * 입력은 "그 호의 기사"(KST 하루에 수집된 공개 기사, getIssueArticles)다. 기간 필터·전체 기사 대체
 * 폴백은 없다 — 호 선택은 호출자 몫이고, 다른 호의 기사는 섞이지 않는다.
 *
 * - lead/seconds: LLM 중요도 순(편집 판단) 상위 1 + 다음 N
 * - trending:     트렌딩 점수 순(커뮤니티 신호) 상위 10, 점수 > 0만
 * - sections:     카테고리별 중요도 순 상위 N(리드·서브에 실린 기사 제외), 빈 섹션 생략. count 는 그 호 안의 개수
 * - issue:        그 호 기사 전체(편집 순) — 호 고정 링크 지면의 "이 호의 기사" 목록
 */
import { CATEGORY_LABELS } from "@/lib/labels";
import type { ArticleCard } from "@/lib/types";

export interface EditionSection {
  category: string;
  /** 이 호 안의 해당 카테고리 기사 수(리드 포함). */
  count: number;
  items: ArticleCard[];
}

export interface Edition {
  lead: ArticleCard | null;
  seconds: ArticleCard[];
  trending: ArticleCard[];
  sections: EditionSection[];
  issue: ArticleCard[];
}

export interface EditionLimits {
  seconds: number;
  trending: number;
  sectionItems: number;
}

export const EDITION_LIMITS: EditionLimits = { seconds: 3, trending: 10, sectionItems: 4 };

/** 중요도 → 트렌딩 → 최신 → id 순 비교자(편집 판단 정렬). id 로 입력 순서와 무관하게 리드를 고정한다. */
function byEditorial(a: ArticleCard, b: ArticleCard): number {
  return (
    b.importance - a.importance ||
    b.trendingScore - a.trendingScore ||
    b.publishedAt.localeCompare(a.publishedAt) ||
    a.id - b.id
  );
}

export function buildEdition(
  issueArticles: ArticleCard[],
  limits: EditionLimits = EDITION_LIMITS,
): Edition {
  const editorial = [...issueArticles].sort(byEditorial);
  const [lead = null, ...rest] = editorial;
  const seconds = rest.slice(0, limits.seconds);
  const onFront = new Set([lead, ...seconds].filter(Boolean).map((a) => a!.id));

  const trending = issueArticles
    .filter((a) => a.trendingScore > 0)
    .sort(
      (a, b) =>
        b.trendingScore - a.trendingScore ||
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.id - b.id,
    )
    .slice(0, limits.trending);

  const sections = Object.keys(CATEGORY_LABELS)
    .map((category) => {
      const inCategory = editorial.filter((a) => a.category === category);
      return {
        category,
        // "섹션 전체 보기"는 누적 분야 피드로 이어지지만, 개수는 이 호 기준.
        count: inCategory.length,
        items: inCategory.filter((a) => !onFront.has(a.id)).slice(0, limits.sectionItems),
      };
    })
    .filter((s) => s.items.length > 0);

  return { lead, seconds, trending, sections, issue: editorial };
}
