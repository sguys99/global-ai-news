import { buildUrlset, planSitemaps } from "@/lib/seo";
import { loadSitemapInput } from "@/views/data";

/**
 * 사이트맵 조각 → out/sitemaps/<이름>.xml(`pages.xml`·`ko-<연도>.xml`·`en-<연도>.xml`). 목록은 인덱스(src/app/sitemap.xml)와
 * 같은 계획(src/lib/seo.ts `planSitemaps`)이라 인덱스가 가리키는 파일만 만든다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return planSitemaps(loadSitemapInput()).map((f) => ({ file: f.name }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const found = planSitemaps(loadSitemapInput()).find((f) => f.name === file);
  if (!found) return new Response(null, { status: 404 });
  return new Response(buildUrlset(found.entries), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
