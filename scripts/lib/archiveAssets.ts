/**
 * 보관 지면(Phase 4-3)이 같은 빌드에서 빌려 쓰는 것 — out/index.html(홈, 같은 `npm run build` 의 전체 페이지)의 `<head>` 에서
 * 공유 CSS·폰트 preload·아이콘·viewport/theme-color 태그와 `<html class>`(next/font 변수), 그리고 사이트 주소(canonical)·
 * basePath(CSS 경로)를 읽는다. 해시가 든 파일명이라 빌드마다 바뀌므로 하드코딩하지 않는다.
 *
 * 이 모듈은 src/lib/site.ts 를 import 하지 않는다 — CLI(scripts/postbuild.ts)가 여기서 읽은 basePath·사이트 주소로
 * NEXT_PUBLIC_BASE_PATH·NEXT_PUBLIC_SITE_URL 을 먼저 채운 뒤에 렌더러(site.ts 가 모듈 상수로 읽는다)를 불러온다.
 * 못 읽으면 크게 실패한다(엉뚱한 CSS 를 거는 보관 지면이 배포되지 않게).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BuildAssets } from "../../src/lib/archivePage";

/** 기준 페이지 — 한국어 홈. 모든 페이지가 같은 공유 CSS·폰트를 쓴다(앱 전체 CSS 한 묶음, 레이아웃 공용). */
export const ASSET_SOURCE_PAGE = "index.html";

export interface ExportSite {
  /** basePath(`/global-ai-news`, 없으면 ""). */
  basePath: string;
  /** 사이트 절대 주소(basePath 포함, 끝 슬래시 없음) — 홈 canonical 에서. */
  siteUrl: string;
}

export type ExportAssets = BuildAssets & ExportSite;

function headOf(html: string, file: string): string {
  const end = html.indexOf("</head>");
  if (end < 0) throw new Error(`${file} 에 </head> 가 없다 — 정적 export 페이지가 아니다`);
  return html.slice(0, end);
}

/** `<link …>`·`<meta …>` 한 태그를 같은 뜻의 짧은 HTML 로(React 의 `/>`·빈 속성 `crossorigin=""` 정리). */
function normalizeTag(tag: string): string {
  return tag.replace(/\s*\/>$/, ">").replace(/ crossorigin=""/g, " crossorigin");
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** out/index.html 의 `<head>` 에서 보관 지면용 공용 조각을 읽는다. 하나라도 못 찾으면 던진다. */
export function readBuildAssets(outDir: string): ExportAssets {
  const file = path.join(outDir, ASSET_SOURCE_PAGE);
  if (!existsSync(file)) {
    throw new Error(`${file} 가 없다 — 보관 지면은 같은 빌드의 전체 페이지에서 CSS·폰트를 읽는다`);
  }
  const head = headOf(readFileSync(file, "utf8"), file);
  const fail = (what: string): never => {
    throw new Error(
      `${file} 에서 ${what} 을(를) 찾지 못했다 — Next 출력 형식이 바뀌었는지 확인할 것`,
    );
  };

  const htmlClass =
    /<html\b[^>]*\sclass="([^"]+)"/.exec(head)?.[1] ?? fail("<html class>(next/font 변수)");
  const links = head.match(/<link\b[^>]*>/g) ?? [];
  const metas = head.match(/<meta\b[^>]*>/g) ?? [];

  const stylesheets = links
    .filter((l) => attr(l, "rel") === "stylesheet")
    .map((l) => attr(l, "href") ?? "")
    .filter(Boolean);
  if (stylesheets.length === 0) fail('<link rel="stylesheet">');

  const fontPreloadTags = links
    .filter((l) => attr(l, "rel") === "preload" && attr(l, "as") === "font")
    .map(normalizeTag);
  const iconTags = links
    .filter((l) => ["icon", "apple-touch-icon"].includes(attr(l, "rel") ?? ""))
    .map(normalizeTag);
  if (iconTags.length === 0) fail('<link rel="icon">');

  const viewportTags = metas
    .filter((m) => ["viewport", "theme-color"].includes(attr(m, "name") ?? ""))
    .map(normalizeTag);
  if (!viewportTags.some((m) => attr(m, "name") === "viewport")) fail('<meta name="viewport">');

  const canonical =
    links.find((l) => attr(l, "rel") === "canonical")?.match(/\shref="([^"]+)"/)?.[1] ??
    fail('<link rel="canonical">(홈 — 사이트 주소)');
  const siteUrl = canonical.replace(/\/$/, "");

  // basePath = 공유 CSS 경로에서 `/_next/` 앞부분(next.config assetPrefix·basePath). 사이트 주소도 그 경로로 끝나야 한다.
  const cssPath = stylesheets[0];
  const at = cssPath.indexOf("/_next/");
  if (at < 0) fail(`_next CSS 경로(${cssPath})`);
  const basePath = cssPath.slice(0, at);
  if (!siteUrl.endsWith(basePath)) {
    throw new Error(
      `${file}: 사이트 주소(${siteUrl})가 basePath(${basePath})로 끝나지 않는다 — canonical·CSS 경로가 서로 다른 빌드다`,
    );
  }

  return { htmlClass, viewportTags, iconTags, fontPreloadTags, stylesheets, basePath, siteUrl };
}
