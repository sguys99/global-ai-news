import type { AnchorHTMLAttributes } from "react";
import { localePath, type Locale } from "@/lib/i18n";

/** 정적 export 서브경로(`/global-ai-news`) — next.config 가 프로덕션 빌드에만 넣는다(dev 는 ""). */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * 기사 상세 주소(basePath 포함, 끝 슬래시). `next/link` 가 프로덕션에서 그리던 href 와 같다
 * (`/global-ai-news/article/12/`, 영어 `/global-ai-news/en/article/12/`). dev 는 basePath 가 없고
 * trailingSlash 도 꺼져 있어 `/article/12/` → `/article/12` 로 한 번 리다이렉트된다.
 */
export function articleHref(id: number, locale: Locale = "ko"): string {
  return `${BASE_PATH}${localePath(locale, `/article/${id}/`)}`;
}

type ArticleLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  /** 기사 id(`articles.id`) — `id` 는 `<a id>` 속성 이름이라 피한다. */
  articleId: number;
  locale?: Locale;
};

/**
 * 기사 페이지로 가는 링크 — `next/link` 가 아니라 일반 `<a>`(Phase 4-1 페이지 무게, 분석 순위 9).
 *
 * 기사 페이지의 RSC(`article/<id>/index.txt`)는 빌드 뒤 지운다(scripts/postbuild.ts). `next/link` 는 화면에 들어온
 * 링크마다 그 `.txt` 를 미리 받고(prefetch) 클릭 이동도 그것으로 하므로, 없으면 404 응답(404.html)을 헛받는다.
 * 일반 `<a>` 는 미리 받지 않고 클릭하면 기사 HTML 을 전체 로드한다(공용 JS·CSS·폰트는 캐시).
 * 렌더 HTML 은 `next/link` 와 같은 `<a href class>` 다. 훅이 없어 서버·클라이언트 컴포넌트 어디서나 쓴다.
 */
export function ArticleLink({ articleId, locale = "ko", ...rest }: ArticleLinkProps) {
  // 속성 순서(class → href)도 next/link 렌더와 같게 — 정적 HTML 회귀 비교가 링크 줄을 그대로 맞춘다.
  return <a {...rest} href={articleHref(articleId, locale)} />;
}
