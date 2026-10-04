/**
 * 홈 편집 지면 구성(DESIGN.md §3)의 단일 출처. 순수 함수 — 서버(빌드)·클라 어디서든 동일 결과.
 *
 * - lead/seconds: LLM 중요도 순(편집 판단) 상위 1 + 다음 N
 * - trending:     트렌딩 점수 순(커뮤니티 신호) 상위 10, 점수 > 0만
 * - sections:     카테고리별 중요도 순 상위 N(리드·서브에 실린 기사 제외), 빈 섹션 생략
 */
import { CATEGORY_LABELS } from "@/lib/labels";
import type { ArticleCard } from "@/lib/types";

export interface EditionSection {
  category: string;
  /** 해당 카테고리 전체 기사 수(리드 포함). */
  count: number;
  items: ArticleCard[];
}

export interface Edition {
  lead: ArticleCard | null;
  seconds: ArticleCard[];
  trending: ArticleCard[];
  sections: EditionSection[];
}

export const EDITION_LIMITS = { seconds: 3, trending: 10, sectionItems: 4 } as const;

/** 중요도 → 트렌딩 → 최신 순 비교자(편집 판단 정렬). */
function byEditorial(a: ArticleCard, b: ArticleCard): number {
  return (
    b.importance - a.importance ||
    b.trendingScore - a.trendingScore ||
    b.publishedAt.localeCompare(a.publishedAt)
  );
}

export function buildEdition(articles: ArticleCard[], limits = EDITION_LIMITS): Edition {
  const editorial = [...articles].sort(byEditorial);
  const [lead = null, ...rest] = editorial;
  const seconds = rest.slice(0, limits.seconds);
  const onFront = new Set([lead, ...seconds].filter(Boolean).map((a) => a!.id));

  const trending = articles
    .filter((a) => a.trendingScore > 0)
    .sort((a, b) => b.trendingScore - a.trendingScore || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limits.trending);

  const sections = Object.keys(CATEGORY_LABELS)
    .map((category) => {
      const inCategory = editorial.filter((a) => a.category === category);
      return {
        category,
        count: inCategory.length,
        items: inCategory.filter((a) => !onFront.has(a.id)).slice(0, limits.sectionItems),
      };
    })
    .filter((s) => s.items.length > 0);

  return { lead, seconds, trending, sections };
}
