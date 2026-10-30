/**
 * 트렌딩 점수 산출 (코드 전용, LLM 무관). PRD §3.2.
 * engagement 신호(points/ups/comments/stars/stars_today/citations/likes)를 로그 정규화하고 최신성으로 보정한다.
 */
import type { RawItem } from "../../src/lib/types";

/**
 * 0~100 정수 점수.
 * - signal: points|ups(45%), num_comments(25%), stars(30%), stars_today(40%), citations(40%), likes(40%) 의
 *   log1p 정규화 합을 1.0 로 클램프. stars_today 는 GitHub Trending, citations 는 arXiv,
 *   likes 는 HF 모델 전용 신호로, 없으면 0 → 기존 소스 점수는 영향받지 않는다.
 *   stars_today(Δstars) 상한 2000: 일간 트렌딩 상위는 하루 수백~2천여 개(2026-10 기준 90~2,371)다.
 *   누적 stars 는 오래된 대형 저장소면 늘 만점이라, 오늘 얼마나 화제인지는 증가분이 가른다.
 *   likes 상한 2000: 생성 30일 이내 트렌딩 모델은 대개 수백~수천(2026-10 기준 145~3,659)이라
 *   상위 대형 공개만 만점에 닿는다. HF 모델의 downloads·hf_trending 은 점수에 쓰지 않는다
 *   (downloads 는 양자화 재배포가 부풀리고, hf_trending 은 HF 자체 순위라 중복 신호다).
 * - recency: 24h 이내 1.0, 이후 선형 감쇠(하한 0.5). 단 likes 가 있는 항목(HF 모델)은 감쇠하지 않는다.
 *   HF 모델의 publishedAt 은 생성 시각(30일 이내)이라 트렌딩 목록에 처음 오른 날에도 대개 64시간을 넘겨
 *   하한 0.5 에 걸린다(2026-10-29 실측 6건 모두 200~700h). 그러면 likes 항이 설계(0.4, stars_today 와 동급)의
 *   절반만 반영돼 likes 2,041 모델이 20점으로 생성 7일 이내 335★ 저장소(23점)보다 낮았다. likes 는 수집 시점에
 *   HF 트렌딩 목록에 있다는 "지금" 신호이므로 생성 후 경과로 깎지 않는다(실측 18~20 → 35~40).
 *   HF 논문(ups)·arXiv(citations)도 게시일 기준으로 대개 0.5 지만, ups 는 Reddit 과 같은 칸이라 여기서 가르지 않는다.
 * RSS 처럼 engagement 가 없으면 signal=0 → 점수 0.
 */
export function trendingScore(item: RawItem): number {
  const e = item.engagement ?? {};
  const norm = (x = 0, cap: number) => Math.min(1, Math.log1p(x) / Math.log1p(cap));

  const signal = Math.min(
    1,
    0.45 * norm(e.points ?? e.ups ?? 0, 500) +
      0.25 * norm(e.num_comments ?? 0, 300) +
      0.3 * norm(e.stars ?? 0, 2000) +
      0.4 * norm(e.stars_today ?? 0, 2000) +
      0.4 * norm(e.citations ?? 0, 800) +
      0.4 * norm(e.likes ?? 0, 2000),
  );

  const ageH = (Date.now() - new Date(item.publishedAt).getTime()) / 3.6e6;
  const decay = ageH <= 24 ? 1.0 : Math.max(0.5, 1 - (ageH - 24) / 80);
  const recency = e.likes !== undefined ? 1.0 : decay;

  return Math.round(100 * signal * recency);
}
