/**
 * 사이트 정체성·공유 미리보기(Open Graph) 단일 출처.
 *
 * 카카오톡 스크랩봇은 og:title·og:description·og:image·og:url 을 읽는다.
 * - og:image 는 JPG/PNG, 비율 1:1·2:1·4:3 만 그대로 쓴다(그 밖은 자동 크롭) → 2:1.
 * - og:url 이 요청 URL과 다르면 og:url 쪽 메타를 다시 읽는다 → 각 페이지 자신의 경로를 정확히
 *   넣는다(다른 페이지를 가리키면 스크랩이 한 단계 늘어 실패 지점이 생긴다).
 * - 스크랩 결과(제목·설명·이미지 URL)는 **페이지 URL 단위**로 "약 1시간 이상"(상한 비공개) 캐시되고,
 *   카카오톡 앱도 따로 캐시한다. 서버에서 무효화할 수단이 없어(초기화는 공유 디버거 수동뿐) 주소가
 *   고정인 홈(`/`)은 다음 날에도 지난 호 미리보기가 뜬다 — 썸네일 파일명·버전 쿼리는 HTML을 다시
 *   읽을 때만 효과가 있다. 그래서 공유는 날짜마다 새 주소인 호 고정 링크로 한다(editionShareUrl·
 *   ShareButton). 같은 날짜에 호가 또 나오면 그 날짜 링크도 앞선 호로 캐시될 수 있다(1일 1호 전제).
 * - 스크랩은 페이지 HTML 전체를 받으므로 목록 페이지는 가볍게 유지한다(db.ts toListCards).
 */
import type { Metadata } from "next";
import type { EditionInfo } from "@/lib/db";
import type { Edition } from "@/lib/edition";
import { formatMonthDay, kstDateKey } from "@/lib/labels";

export const SITE_NAME = "Daily AI Brief";
export const SITE_DESCRIPTION =
  "글로벌·한국 AI/IT 뉴스를 매일 한국어 요약으로 제공하는 데일리 브리핑";
/** 마스트헤드·기본 공유 썸네일의 소개 문구. */
export const SITE_TAGLINE = "세계와 한국의 AI 소식을 매일 아침, 한국어로 요약해 전합니다.";

/** 배포 절대 URL(basePath 포함). 프로덕션 빌드에만 next.config 가 주입하고 dev 는 로컬. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** 2:1 — 카카오톡이 크롭 없이 쓰는 비율이자 X(트위터) large card 비율. */
export const OG_IMAGE_SIZE = { width: 1200, height: 600 } as const;

/** 호 고정 링크 경로(basePath 제외, trailingSlash 와 맞춘 끝 슬래시). */
export const editionPath = (date: string) => `/edition/${date}/`;

/** 공유용 호 고정 링크 절대 URL. 홈 주소 대신 이것을 퍼뜨려 카카오톡 캐시를 피한다(위 설명). */
export const editionShareUrl = (date: string) => `${SITE_URL}${editionPath(date)}`;

/*
 * 공유 이미지 경로(basePath 제외). 정적 export 가 `out/og/**.png` 로 내보내며,
 * 확장자가 있어야 GitHub Pages 가 image/png 로 서빙한다(src/app/og/).
 */
export const OG_DEFAULT_IMAGE = "/og/default.png";
export const ogEditionImagePath = (date: string) => `/og/edition/${date}.png`;
export const ogArticleImagePath = (id: number) => `/og/article/${id}.png`;

/**
 * 기사 썸네일 생성 기간: 최신 게시 시각 기준 7일. 전 기사를 그리면 하루 수십 장씩 쌓여
 * GitHub Pages 용량(1GB)·빌드 시간을 잠식한다 → 공유가 몰리는 최근 기사만, 나머지는 기본 썸네일.
 */
export const ARTICLE_THUMBNAIL_WINDOW_MS = 7 * 24 * 3600 * 1000;

export function hasArticleThumbnail(
  publishedAt: string,
  latestPublishedAt: string | null,
): boolean {
  if (!latestPublishedAt) return false;
  return Date.parse(publishedAt) >= Date.parse(latestPublishedAt) - ARTICLE_THUMBNAIL_WINDOW_MS;
}

export interface ShareImage {
  path: string;
  alt: string;
  /** 내용이 바뀌는 이미지의 캐시 무효화용 쿼리(`?v=`). */
  version?: string;
}

const DEFAULT_IMAGE: ShareImage = { path: OG_DEFAULT_IMAGE, alt: SITE_NAME };

export interface ShareOptions {
  title: string;
  description: string;
  /** basePath 제외 페이지 경로. trailingSlash 설정과 맞춰 끝 슬래시를 붙인다(리다이렉트 방지). */
  path?: string;
  image?: ShareImage;
  article?: { publishedTime: string; section?: string; tags?: string[] };
}

/**
 * 페이지별 openGraph·twitter 메타. Next 메타데이터는 최상위 키 단위로 얕게 병합되어
 * 페이지가 openGraph 를 정의하면 레이아웃 값이 통째로 대체되므로 공통 필드를 매번 채운다.
 * 상대 URL은 레이아웃의 metadataBase(SITE_URL) 기준으로 절대화된다.
 */
export function shareMetadata({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  article,
}: ShareOptions): Pick<Metadata, "openGraph" | "twitter"> {
  const imageUrl = image.version
    ? `${image.path}?v=${encodeURIComponent(image.version)}`
    : image.path;
  const common = {
    title,
    description,
    url: path,
    siteName: SITE_NAME,
    locale: "ko_KR",
    images: [{ url: imageUrl, ...OG_IMAGE_SIZE, alt: image.alt, type: "image/png" }],
  };
  return {
    openGraph: article
      ? { ...common, type: "article", ...article }
      : { ...common, type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

/** 리드·서브 헤드라인 표시 제목(한국어 가공 전이면 원문). */
const headline = (a: { titleKo: string; titleOriginal: string }) => a.titleKo || a.titleOriginal;

/**
 * 홈 공유 문구·이미지 버전. 제목 = 1면 리드 헤드라인, 설명 = 발행일·호수 + 서브 헤드라인.
 * 버전은 호수·리드가 바뀔 때마다 달라져, 페이지가 다시 스크랩될 때 이전 썸네일 캐시를 피한다.
 */
export function editionShare(
  edition: Pick<Edition, "lead" | "seconds">,
  info: EditionInfo,
): { title: string; description: string; version: string } {
  const { lead, seconds } = edition;
  if (!lead) return { title: SITE_NAME, description: SITE_DESCRIPTION, version: "0" };

  const dateline = [
    SITE_NAME,
    info.publishedAt ? formatMonthDay(info.publishedAt) : "",
    info.issueNo > 0 ? `제${info.issueNo}호` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const more = seconds.map(headline).join(" · ");
  return {
    title: headline(lead),
    description: more ? `${dateline} — ${more}` : dateline,
    version: `${info.issueNo}-${lead.id}`,
  };
}

/**
 * 호 공유 메타(홈·호 고정 링크 공용): 제목 = 1면 리드, 썸네일 = 그날 1면.
 * `path` 는 og:url — 공유되는 페이지 자신의 경로(홈 "/", 호 고정 링크 "/edition/[date]/").
 */
export function editionMetadata(
  edition: Pick<Edition, "lead" | "seconds">,
  info: EditionInfo,
  path: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  const { title, description, version } = editionShare(edition, info);
  if (!edition.lead || !info.publishedAt) return shareMetadata({ title, description, path });
  const date = kstDateKey(info.publishedAt);
  return shareMetadata({
    title,
    description,
    path,
    image: {
      path: ogEditionImagePath(date),
      alt: `${formatMonthDay(info.publishedAt)} 1면: ${title}`,
      version,
    },
  });
}
