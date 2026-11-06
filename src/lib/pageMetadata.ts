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
import { headlineOf, summaryOf } from "@/lib/articleText";
import { LOCALES, type Locale } from "@/lib/i18n";
import { categoryLabel, formatLongDate, issueNoLabel, localeTags } from "@/lib/labels";
import {
  OG_LOCALE,
  SITE_DESCRIPTION,
  SITE_DESCRIPTION_EN,
  SITE_NAME,
  SITE_TITLE,
  SITE_TITLE_EN,
  SITE_URL,
  SITE_VERIFICATION,
  editionMetadata,
  editionPath,
  hreflangLanguages,
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
 * 페이지 metadata 에 두 언어판 짝을 더한다(english-version-plan 5-3·6-2): `alternates.languages` → `<link rel="alternate"
 * hreflang="ko|en|x-default">`(x-default = 영어 주소, site.ts `hreflangLanguages`)와 `og:locale:alternate`(상대 언어판의
 * og:locale — 페이지 openGraph 가 있을 때). 둘 다 **상대 언어판이 있을 때만** 싣는 같은 판정이라 여기 한 곳에서 붙인다.
 * `languages` 는 src/views/data.ts `languageAlternates` 결과 — null(짝이 없는 페이지: 영어 본문이 없는 기사의 한국어판,
 * 영어 기사가 없는 호)이면 metadata 를 **그대로**(같은 객체) 돌려준다. 기존 alternates(canonical·RSS)는 그대로 두고
 * languages 만 얹는다(Next 는 최상위 키 단위로 병합하므로 alternates·openGraph 객체를 통째로 만든다).
 * 셸의 언어 전환 링크(src/lib/localeSwitch.ts)가 이 `<link>` 중 `ko`·`en` 을 읽는다.
 */
export function withLanguageAlternates(
  metadata: Metadata,
  languages: Readonly<Record<Locale, string>> | null,
): Metadata {
  if (!languages) return metadata;
  const og = metadata.openGraph;
  const alternateLocale = og?.locale
    ? LOCALES.map((l) => OG_LOCALE[l]).filter((v) => v !== og.locale)
    : null;
  return {
    ...metadata,
    alternates: { ...metadata.alternates, languages: hreflangLanguages(languages) },
    ...(og && alternateLocale ? { openGraph: { ...og, alternateLocale } } : {}),
  };
}

// ─── 영어판(Phase 5-2 제목·설명, Phase 6-1 공유 메타·canonical) ────────────────────────────

/**
 * 영어판 최상위 레이아웃 metadata(`(en)/en/layout.tsx`). 영어 보관 지면(archivePage.ts)도 같은 값으로 `<head>` 를 병합한다.
 * 공유 메타 기본값은 영어(og:locale en_US·영어 기본 썸네일·`/en/feed.xml`) — 한국어 레이아웃과 같은 모양이다.
 */
export const EN_LAYOUT_METADATA: Metadata = {
  // og:url·og:image 상대 경로의 절대화 기준 — 영어 페이지에도 반드시 필요하다(없으면 og:image 경고·오류).
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE_EN,
  description: SITE_DESCRIPTION_EN,
  ...shareMetadata({ title: SITE_NAME, description: SITE_DESCRIPTION_EN, locale: "en" }),
  verification: SITE_VERIFICATION,
};

/**
 * 영어 기사 상세(`/en/article/[id]/`) metadata — 라우트와 영어 보관 지면 공용. 제목 `{title_en} — AI Daybook`, 설명 `summary_en`,
 * 공유 메타는 한국어판과 같은 모양에 영어 값(분야 영어 표시명, 태그는 라틴 문자만 — 영어 화면과 같은 `localeTags`).
 * `thumbnail` 은 영어 전용 썸네일 경로(views/data.ts `articleThumbnail(article, "en")` — 최근 7일만), 없으면 영어 기본 썸네일.
 */
export function englishArticlePageMetadata(article: ArticleCard, thumbnail?: string): Metadata {
  const title = headlineOf(article, "en");
  const summary = summaryOf(article, "en");
  return {
    title: `${title} — ${SITE_NAME}`,
    description: summary || undefined,
    ...shareMetadata({
      title,
      description: summary || SITE_DESCRIPTION_EN,
      path: `/article/${article.id}/`,
      locale: "en",
      image: thumbnail ? { path: thumbnail, alt: title } : undefined,
      article: {
        publishedTime: article.publishedAt,
        section: categoryLabel(article.category, "en") || undefined,
        tags: localeTags(article.tags, "en"),
      },
    }),
  };
}

/**
 * 영어 호 고정 링크(`/en/edition/[date]/`) metadata — 라우트와 영어 보관 호 공용. 제목
 * `AI News Briefing — Tuesday, November 3, 2026 (No. 140) — AI Daybook`. 설명·공유 메타는 한국어판과 같은 editionMetadata 에
 * 영어 값(설명 = 리드 줄을 뺀 영어 세 줄 요약, 없으면 서브 헤드라인). `edition` 은 영어판 편집(영어 기사만), `latestEditionDate`
 * 는 한국어와 같은 DB 최신 호 날짜 — 영어 호 썸네일도 같은 30일 창이다(보관 호는 늘 창 밖 → 영어 기본 썸네일).
 */
export function englishEditionPageMetadata(
  ref: EditionInfo & { date: string; publishedAt: string },
  edition: Pick<Edition, "lead" | "seconds">,
  latestEditionDate: string | null,
  brief: readonly IssueBriefLine[] = [],
): Metadata {
  const no = ref.issueNo > 0 ? ` (${issueNoLabel(ref.issueNo, "en")})` : "";
  const share = editionMetadata(
    edition,
    ref,
    editionPath(ref.date),
    latestEditionDate,
    brief,
    "en",
  );
  return {
    title: `AI News Briefing — ${formatLongDate(ref.publishedAt, "en")}${no} — ${SITE_NAME}`,
    description: share.openGraph?.description,
    ...share,
  };
}

const ENGLISH_SEARCH_TITLE = `Search AI News — ${SITE_NAME}`;

/** 영어 검색(`/en/search/`). */
export const ENGLISH_SEARCH_METADATA: Metadata = {
  title: ENGLISH_SEARCH_TITLE,
  description: SITE_DESCRIPTION_EN,
  ...shareMetadata({
    title: ENGLISH_SEARCH_TITLE,
    description: SITE_DESCRIPTION_EN,
    path: "/search/",
    locale: "en",
  }),
};
