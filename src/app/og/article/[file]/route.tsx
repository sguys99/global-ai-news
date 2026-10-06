import { getArticle, getFeed, getLatestPublishedAt } from "@/lib/db";
import { articleImage } from "@/lib/ogImage";
import { hasArticleThumbnail } from "@/lib/site";

/**
 * 기사 공유 썸네일 → out/og/article/<id>.png. 최근 기사만 생성한다(기간: site.ts
 * ARTICLE_THUMBNAIL_WINDOW_MS) — 상세 페이지 메타도 같은 판정으로 이 경로 또는 기본 썸네일을 쓴다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  const latest = getLatestPublishedAt();
  return getFeed()
    .filter((a) => hasArticleThumbnail(a.publishedAt, latest))
    .map((a) => ({ file: `${a.id}.png` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const article = getArticle(Number(file.replace(/\.png$/, "")));
  if (!article) return new Response(null, { status: 404 });
  return articleImage(article);
}
