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
import type { Edition, IssueBriefLine } from "@/lib/edition";
import { localePath, type Locale } from "@/lib/i18n";
import { formatMonthDay, kstDateKey } from "@/lib/labels";

export const SITE_NAME = "AI Daybook";
/** 한국어 브랜드 표기 — 검색엔진 대체 이름(WebSite alternateName). */
export const SITE_NAME_KO = "AI 데이북";
/** 홈 <title>(검색 결과 제목): 브랜드 + 한국어·영어 검색어 — 한국·글로벌 동시 타게팅. */
export const SITE_TITLE = `${SITE_NAME} — 오늘의 AI 뉴스 요약 · Daily AI News Briefing`;
export const SITE_DESCRIPTION =
  "글로벌·한국 AI 뉴스·오픈소스·모델·논문을 매일 아침 한국어로 요약하는 데일리 브리핑. Daily AI news, open source, models and papers, summarized every morning.";
/** 소개 문구 — 푸터·기본 공유 썸네일(og/default). 마스트헤드 제호 옆 자리는 이번 호 통계(귀)가 쓴다. */
export const SITE_TAGLINE = "세계와 한국의 AI 소식을 매일 아침, 한국어로 요약해 전합니다.";
/** 영어판 태그라인(english-version-plan 0-5 확정) — 영어 푸터·영어 기본 공유 썸네일. */
export const SITE_TAGLINE_EN = "The world's AI news, and Korea's, edited every morning in Seoul.";

/** 언어판 태그라인(ko 는 SITE_TAGLINE 그대로). */
export function siteTagline(locale: Locale = "ko"): string {
  return locale === "en" ? SITE_TAGLINE_EN : SITE_TAGLINE;
}

/** 배포 절대 URL(basePath 포함). 프로덕션 빌드에만 next.config 가 주입하고 dev 는 로컬. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * 정적 export 서브경로(`/global-ai-news`) — next.config 가 프로덕션 빌드에만 넣는다(dev 는 "").
 * next/link 를 거치지 않는 일반 `<a>`(보관 호로 가는 호 이동, 빌드 후 보관 지면)가 앞에 붙인다.
 * 빌드 후처리(scripts/postbuild.ts)는 Next 밖이라 같은 빌드의 out/index.html 에서 읽어 이 환경변수를 채운다.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * 방문자 집계(GoatCounter, 쿠키 없음 → 동의 배너 불필요). 대시보드는 로그인 사용자만 본다.
 * 사이트 설정 "Allow adding visitor counts on your website"가 켜져 있어야 `/counter/TOTAL.json`이 열린다.
 */
export const GOATCOUNTER_URL = "https://sguys99.goatcounter.com";

/** 푸터 누적 방문 표시 하한 — 이보다 적으면 숨긴다(작은 숫자가 공개되면 오히려 신뢰를 깎는다). */
export const VISITOR_COUNT_MIN = 100;

/**
 * 검색엔진 소유 확인 — Google Search Console·네이버 서치어드바이저 "HTML 태그" 방식의 content 값.
 * 빈 값이면 태그를 넣지 않는다(layout metadata.verification).
 */
export const GOOGLE_SITE_VERIFICATION = "";
export const NAVER_SITE_VERIFICATION = "";

/** 최상위 레이아웃 metadata.verification — 한국어·영어 레이아웃 공용(빈 값은 태그 없음). */
export const SITE_VERIFICATION: Metadata["verification"] = {
  google: GOOGLE_SITE_VERIFICATION || undefined,
  other: NAVER_SITE_VERIFICATION
    ? { "naver-site-verification": NAVER_SITE_VERIFICATION }
    : undefined,
};

/*
 * 영어판 홈 제목·설명(english-version-plan 0-5 확정, 2026-11-03). 영어 레이아웃 기본 metadata 에만 쓴다 —
 * 영어 페이지·hreflang·영어 공유 메타는 Phase 5·6 에서 붙인다.
 */
export const SITE_TITLE_EN = `${SITE_NAME} — Daily AI News Briefing from Korea and the World`;
export const SITE_DESCRIPTION_EN =
  "Every morning from Seoul: the day's top AI news, open-source repos, models and papers — with a Korea Desk on Korean AI you won't find elsewhere.";

/** RSS 피드 경로(basePath 제외, src/app/feed.xml) — 네이버 서치어드바이저 제출·구독용. */
export const FEED_PATH = "/feed.xml";

/** 2:1 — 카카오톡이 크롭 없이 쓰는 비율이자 X(트위터) large card 비율. */
export const OG_IMAGE_SIZE = { width: 1200, height: 600 } as const;

/** 호 고정 링크 경로(basePath 제외, trailingSlash 와 맞춘 끝 슬래시). */
export const editionPath = (date: string) => `/edition/${date}/`;

/** 공유용 호 고정 링크 절대 URL. 홈 주소 대신 이것을 퍼뜨려 카카오톡 캐시를 피한다(위 설명). en 은 `/en` 고정 링크. */
export const editionShareUrl = (date: string, locale: Locale = "ko") =>
  `${SITE_URL}${localePath(locale, editionPath(date))}`;

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

/**
 * 호 썸네일 생성 기간: DB 최신 호 날짜 기준 30일(KST 날짜 30개) — 최신 호 날짜와 그 앞 29일까지 포함하고,
 * 30일 전 날짜부터는 기본 썸네일이다. 기사 썸네일과 같은 이유(호마다 PNG 가 쌓여 Pages 용량 잠식)로
 * 공유가 몰리는 최근 호만 그린다. 기준이 벽시계가 아니라 DB 라 같은 app.db 면 산출물이 같다.
 * 생성(og/edition/[file] generateStaticParams)과 참조(editionMetadata)가 이 판정 하나를 같이 쓴다.
 */
export const EDITION_THUMBNAIL_WINDOW_DAYS = 30;

export function hasEditionThumbnail(date: string, latestEditionDate: string | null): boolean {
  if (!latestEditionDate) return false;
  const day = (key: string) => Date.parse(`${key}T00:00:00Z`) / (24 * 3600 * 1000);
  const age = day(latestEditionDate) - day(date);
  return age >= 0 && age < EDITION_THUMBNAIL_WINDOW_DAYS;
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

type ShareMetadata = Pick<Metadata, "openGraph" | "twitter" | "alternates">;

/**
 * 페이지별 openGraph·twitter·alternates 메타. Next 메타데이터는 최상위 키 단위로 얕게 병합되어
 * 페이지가 openGraph·alternates 를 정의하면 레이아웃 값이 통째로 대체되므로 공통 필드를 매번 채운다.
 * canonical = og:url 과 같은 경로(필터 쿼리 `?category=` 등은 정규 주소로 모인다), RSS 링크는 모든 페이지에.
 * 상대 URL은 레이아웃의 metadataBase(SITE_URL) 기준으로 절대화된다.
 */
export function shareMetadata({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  article,
}: ShareOptions): ShareMetadata {
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
    // X 는 twitter:title·description·image 가 없으면 og:title·description·image 를 쓴다(X Cards 문서
    // "Getting started with Cards"·"Cards markup" — OpenGraph 대체). 그래서 og 와 같은 값을 다시 적지 않는다.
    // 단 Next(15.5 resolve-metadata postProcessMetadata)는 openGraph 가 있으면 빠진 twitter title·description·images 를
    // og 값으로 **스스로 채워** 출력한다 — title·description 은 공개 API 로 막을 수 없다. images 만 빈 배열이면
    // "지정됨"으로 보고 채우지 않아 twitter:image(+ 자동 채움이면 width·height·alt·type) 줄이 빠진다(Phase 4-1, 분석 순위 6).
    twitter: { card: "summary_large_image", images: [] },
    alternates: {
      canonical: path,
      types: { "application/rss+xml": [{ url: FEED_PATH, title: SITE_NAME }] },
    },
  };
}

/** 리드·서브 헤드라인 표시 제목(한국어 가공 전이면 원문). */
const headline = (a: { titleKo: string; titleOriginal: string }) => a.titleKo || a.titleOriginal;

/**
 * 홈 공유 문구·이미지 버전. 제목 = 1면 리드 헤드라인, 설명 = 발행일·호수 + 세 줄 요약(있으면) 또는 서브 헤드라인.
 * 세 줄 요약 중 리드를 요약한 줄은 뺀다 — 바로 위 제목(리드 헤드라인)과 같은 소식이 두 번 읽힌다. 빼고 남은 줄이
 * 없으면 서브 헤드라인으로 돌아간다(요약이 없는 지난 호도 같은 경로).
 * 버전은 호수·리드가 바뀔 때마다 달라져, 페이지가 다시 스크랩될 때 이전 썸네일 캐시를 피한다.
 */
export function editionShare(
  edition: Pick<Edition, "lead" | "seconds">,
  info: EditionInfo,
  brief: readonly IssueBriefLine[] = [],
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
  const briefMore = brief.filter((line) => line.id !== lead.id).map((line) => line.text);
  const more = (briefMore.length > 0 ? briefMore : seconds.map(headline)).join(" · ");
  return {
    title: headline(lead),
    description: more ? `${dateline} — ${more}` : dateline,
    version: `${info.issueNo}-${lead.id}`,
  };
}

/**
 * 호 공유 메타(홈·호 고정 링크 공용): 제목 = 1면 리드, 설명 = 세 줄 요약(없으면 서브), 썸네일 = 그날 1면.
 * `path` 는 og:url — 공유되는 페이지 자신의 경로(홈 "/", 호 고정 링크 "/edition/[date]/").
 * `latestEditionDate` 는 DB 최신 호 날짜(getLatestEditionRef) — 썸네일 기간(hasEditionThumbnail) 밖의
 * 호는 PNG 를 만들지 않으므로 기본 썸네일을 쓴다.
 */
export function editionMetadata(
  edition: Pick<Edition, "lead" | "seconds">,
  info: EditionInfo,
  path: string,
  latestEditionDate: string | null,
  brief: readonly IssueBriefLine[] = [],
): ShareMetadata {
  const { title, description, version } = editionShare(edition, info, brief);
  if (!edition.lead || !info.publishedAt) return shareMetadata({ title, description, path });
  const date = kstDateKey(info.publishedAt);
  if (!hasEditionThumbnail(date, latestEditionDate)) {
    return shareMetadata({ title, description, path });
  }
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
