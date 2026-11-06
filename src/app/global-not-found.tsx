import type { Metadata, Viewport } from "next";
import { NotFoundNotice, notFoundLangScript } from "@/components/NotFoundNotice";
import { notFoundMessages } from "@/lib/messages/notFound";
import { SITE_NAME } from "@/lib/site";
import { SiteShell, siteViewport } from "./SiteShell";

/*
 * 앱 전체 404(next.config experimental.globalNotFound). 최상위 레이아웃이 언어마다 하나라 루트 레이아웃이 없으므로
 * 이 파일이 문서 전체(`<html>`·`<body>`)를 직접 그린다 — 셸은 두 레이아웃과 같은 SiteShell, viewport 도 같은 값.
 * 정적 export 는 이것을 out/404.html 한 장으로 내고 GitHub Pages·nginx 가 모든 없는 경로(`/en/…` 포함)에 쓴다.
 * 그래서 두 언어를 함께 싣고, `/en` 아래면 `<head>` 스크립트가 lang 을 en 으로 바꿔 영어 단을 앞에 놓는다.
 * 정적 HTML 의 lang 은 ko 로 남지만 404 는 색인되지 않는다(Next 가 넣는 robots noindex).
 * 셸(헤더·모바일 바·푸터·하단 탭)은 `localeFromDocument` — 하이드레이션 뒤 문서 lang 을 따라 `/en` 아래면 영어 문구·`/en` 링크.
 */

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: `${notFoundMessages.ko.title} · ${notFoundMessages.en.title} — ${SITE_NAME}`,
  // robots noindex 는 Next 가 not-found 응답에 스스로 넣는다(여기 또 적으면 메타가 두 줄 나온다).
};

export const viewport: Viewport = siteViewport;

export default function GlobalNotFound() {
  return (
    <SiteShell
      locale="ko"
      localeFromDocument
      head={<script dangerouslySetInnerHTML={{ __html: notFoundLangScript(BASE_PATH) }} />}
    >
      <NotFoundNotice />
    </SiteShell>
  );
}
