import { getIssueArticles, getEditionRefs } from "@/lib/db";
import { buildEdition } from "@/lib/edition";
import { editionImage } from "@/lib/ogImage";
import { hasEditionThumbnail } from "@/lib/site";

/**
 * 호별 공유 썸네일(그날의 1면) → out/og/edition/<YYYY-MM-DD>.png.
 * 날짜가 파일명이라 다음 날 공유에는 새 URL이 쓰여 카카오톡 이미지 캐시에 걸리지 않는다.
 * 최근 호만 생성한다(기간: site.ts EDITION_THUMBNAIL_WINDOW_DAYS, 기준 = 최신 호 날짜) — 홈·호 고정 링크
 * 메타(editionMetadata)도 같은 판정으로 이 경로 또는 기본 썸네일을 쓴다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

const fileOf = (date: string) => `${date}.png`;

export function generateStaticParams() {
  const refs = getEditionRefs();
  const latest = refs.at(-1)?.date ?? null;
  return refs
    .filter((ref) => hasEditionThumbnail(ref.date, latest))
    .map((ref) => ({ file: fileOf(ref.date) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const ref = getEditionRefs().find((r) => fileOf(r.date) === file);
  if (!ref) return new Response(null, { status: 404 });
  return editionImage(buildEdition(getIssueArticles(ref.date)), ref);
}
