import { getArticlesUntil, getEditionRefs } from "@/lib/db";
import { buildEdition } from "@/lib/edition";
import { editionImage } from "@/lib/ogImage";

/**
 * 호별 공유 썸네일(그날의 1면) → out/og/edition/<YYYY-MM-DD>.png.
 * 날짜가 파일명이라 다음 날 공유에는 새 URL이 쓰여 카카오톡 이미지 캐시에 걸리지 않는다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

const fileOf = (date: string) => `${date}.png`;

export function generateStaticParams() {
  return getEditionRefs().map((ref) => ({ file: fileOf(ref.date) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const ref = getEditionRefs().find((r) => fileOf(r.date) === file);
  if (!ref) return new Response(null, { status: 404 });
  return editionImage(buildEdition(getArticlesUntil(ref.cutoff)), ref);
}
