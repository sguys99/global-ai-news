/**
 * 페이지 metadata 빌더(서버 전용 — 라우트·빌드 후 보관 지면) — 한국어 레이아웃 기본값, 기사 상세, 호 고정 링크.
 *
 * 전체 페이지 라우트(`(ko)/layout.tsx`·`(ko)/article/[id]`·`(ko)/edition/[date]`)와 빌드 후 보관 지면
 * (src/lib/archivePage.ts, english-version-plan Phase 4-3)이 같은 함수로 `<head>` 를 만들어 제목·설명·공유 메타가 같다.
 * site.ts 와 나눈 까닭: site.ts 는 클라이언트 컴포넌트(Footer·Analytics…)도 import 하므로, 여기 있는 모듈 수준 값
 * (`KO_LAYOUT_METADATA`)과 labels 의존이 셸 클라이언트 번들에 끌려 들어가 모든 페이지에 청크가 하나 늘었다(+139B/쪽).
 */
import type { Metadata } from "next";
import type { EditionInfo } from "@/lib/db";
import type { Edition, IssueBriefLine } from "@/lib/edition";
import { categoryLabel, formatLongDate, issueNoLabel } from "@/lib/labels";
import {
  SITE_DESCRIPTION,
  SITE_DESCRIPTION_EN,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  SITE_VERIFICATION,
  editionMetadata,
  editionPath,
  shareMetadata,
} from "@/lib/site";
import type { ArticleCard } from "@/lib/types";

/**
 * 한국어 최상위 레이아웃 metadata(`(ko)/layout.tsx`). 페이지 metadata 는 최상위 키 단위로 이것을 덮는다(Next 얕은 병합).
 * 빌드 후 보관 지면(src/lib/archivePage.ts)도 같은 병합으로 `<head>` 를 만들므로 여기 한 곳에 둔다.
 */
export const KO_LAYOUT_METADATA: Metadata = {
  // og:url·og:image 상대 경로의 절대화 기준(basePath 포함).
  metadataBase: new URL(SITE_URL),
  // 홈은 페이지 title 이 없어 이 값을 쓴다(검색 결과 제목). 상세·호·검색은 페이지가 "… — AI Daybook" 으로 덮는다.
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // 공유 메타를 따로 정의하지 않은 페이지의 기본값. og:url·canonical 은 페이지마다 달라 두지 않는다.
  ...shareMetadata({ title: SITE_NAME, description: SITE_DESCRIPTION }),
  verification: SITE_VERIFICATION,
};

/**
 * 기사 상세(`/article/[id]/`) metadata — 전체 페이지 라우트와 보관 지면이 같이 쓴다(제목·설명·공유 메타가 같다).
 * `thumbnail` 은 전용 공유 썸네일 경로(최근 기사만, views/data.ts articleThumbnail) — 없으면 기본 썸네일.
 */
export function articlePageMetadata(article: ArticleCard, thumbnail?: string): Metadata {
  const title = article.titleKo || article.titleOriginal;
  const description = article.summaryKo || SITE_DESCRIPTION;
  return {
    title: `${title} — ${SITE_NAME}`,
    description: article.summaryKo || undefined,
    ...shareMetadata({
      title,
      description,
      path: `/article/${article.id}/`,
      image: thumbnail ? { path: thumbnail, alt: title } : undefined,
      article: {
        publishedTime: article.publishedAt,
        section: categoryLabel(article.category) || undefined,
        tags: article.tags,
      },
    }),
  };
}

/**
 * 호 고정 링크(`/edition/[date]/`) metadata — 전체 페이지 라우트와 보관 지면 공용. 썸네일은 editionMetadata 가 고른다
 * (호 썸네일 창 밖이면 기본 썸네일 — 보관 호는 늘 창 밖이다).
 */
export function editionPageMetadata(
  ref: EditionInfo & { date: string; publishedAt: string },
  edition: Pick<Edition, "lead" | "seconds">,
  latestEditionDate: string | null,
  brief: readonly IssueBriefLine[] = [],
): Metadata {
  return {
    title: `${formatLongDate(ref.publishedAt)} AI 뉴스 브리핑 제${ref.issueNo}호 — ${SITE_NAME}`,
    ...editionMetadata(edition, ref, editionPath(ref.date), latestEditionDate, brief),
  };
}

/**
 * 영어 호 고정 링크(`/en/edition/[date]/`) metadata — 제목·설명만(공유 메타·canonical·hreflang 은 영어판 Phase 6).
 * 제목 `AI News Briefing — Tuesday, November 3, 2026 (No. 140) — AI Daybook`, 설명은 그 호의 영어 세 줄 요약
 * (없으면 영어 사이트 설명). 한국어 출력(`editionPageMetadata`)은 건드리지 않는다.
 */
export function editionPageMetadataEn(
  ref: EditionInfo & { publishedAt: string },
  brief: readonly IssueBriefLine[] = [],
): Metadata {
  const no = ref.issueNo > 0 ? ` (${issueNoLabel(ref.issueNo, "en")})` : "";
  return {
    title: `AI News Briefing — ${formatLongDate(ref.publishedAt, "en")}${no} — ${SITE_NAME}`,
    description: brief.length > 0 ? brief.map((l) => l.text).join(" · ") : SITE_DESCRIPTION_EN,
  };
}
