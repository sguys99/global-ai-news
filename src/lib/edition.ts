/**
 * 홈 편집 지면 구성(DESIGN.md §3)의 단일 출처. 순수 함수 — 서버(빌드)·클라 어디서든 동일 결과.
 *
 * 지면(리드·서브·화제·섹션)은 "이번 호" 기사에서만 고른다 — 가장 최신 기사 게시 시각 기준
 * EDITION_WINDOW_MS 이내. 기간 제한이 없으면 과거의 중요도 5 기사가 리드를 계속 차지한다.
 * 이번 호 기사가 1면을 채우지 못할 만큼 적으면 전체 기사로 대체한다.
 *
 * - lead/seconds: LLM 중요도 순(편집 판단) 상위 1 + 다음 N
 * - trending:     트렌딩 점수 순(커뮤니티 신호) 상위 10, 점수 > 0만
 * - sections:     카테고리별 중요도 순 상위 N(리드·서브에 실린 기사 제외), 빈 섹션 생략
 * - issue:        이번 호 기사 전체(편집 순) — 호 고정 링크 지면의 "이 호의 기사" 목록
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
  issue: ArticleCard[];
}

export interface EditionLimits {
  seconds: number;
  trending: number;
  sectionItems: number;
}

export const EDITION_LIMITS: EditionLimits = { seconds: 3, trending: 10, sectionItems: 4 };

/** 이번 호 기간: 가장 최신 기사 게시 시각으로부터 48시간. */
export const EDITION_WINDOW_MS = 48 * 3600 * 1000;

/**
 * 이번 호 기사. 기준은 Date.now() 가 아니라 최신 게시 시각이라 빌드·클라에서 결과가 같고,
 * 수집이 며칠 멈춰도 지면이 비지 않는다.
 */
function currentIssue(articles: ArticleCard[], minCount: number): ArticleCard[] {
  const times = articles.map((a) => Date.parse(a.publishedAt)).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return articles;
  const since = Math.max(...times) - EDITION_WINDOW_MS;
  const recent = articles.filter((a) => Date.parse(a.publishedAt) >= since);
  return recent.length >= minCount ? recent : articles;
}

/** 중요도 → 트렌딩 → 최신 순 비교자(편집 판단 정렬). */
function byEditorial(a: ArticleCard, b: ArticleCard): number {
  return (
    b.importance - a.importance ||
    b.trendingScore - a.trendingScore ||
    b.publishedAt.localeCompare(a.publishedAt)
  );
}

export function buildEdition(
  articles: ArticleCard[],
  limits: EditionLimits = EDITION_LIMITS,
): Edition {
  const issue = currentIssue(articles, 1 + limits.seconds);
  const editorial = [...issue].sort(byEditorial);
  const [lead = null, ...rest] = editorial;
  const seconds = rest.slice(0, limits.seconds);
  const onFront = new Set([lead, ...seconds].filter(Boolean).map((a) => a!.id));

  const trending = issue
    .filter((a) => a.trendingScore > 0)
    .sort((a, b) => b.trendingScore - a.trendingScore || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limits.trending);

  const sections = Object.keys(CATEGORY_LABELS)
    .map((category) => {
      const inCategory = editorial.filter((a) => a.category === category);
      return {
        category,
        // "전체 보기"는 기간 제한 없는 분야 목록으로 이어지므로 개수는 전체 기준.
        count: articles.filter((a) => a.category === category).length,
        items: inCategory.filter((a) => !onFront.has(a.id)).slice(0, limits.sectionItems),
      };
    })
    .filter((s) => s.items.length > 0);

  return { lead, seconds, trending, sections, issue: editorial };
}
