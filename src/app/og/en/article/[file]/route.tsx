import { getFeed, getLatestPublishedAt } from "@/lib/db";
import { articleImage } from "@/lib/ogImage";
import { hasArticleThumbnail } from "@/lib/site";
import { loadArticle, localeArticles } from "@/views/data";

/**
 * 영어 기사 공유 썸네일 → out/og/en/article/<id>.png (english-version-plan 6-2). 만드는 기사 = 영어판에 실린 기사
 * (`localeArticles("en")` = hasEnglish) 중 한국어판과 같은 창(hasArticleThumbnail, 기준 = 최신 게시 시각) — 영어 상세 메타
 * (`articleThumbnail(article, "en")`)도 같은 판정으로 이 경로 또는 영어 기본 썸네일을 쓴다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  const latest = getLatestPublishedAt();
  return localeArticles("en", getFeed())
    .filter((a) => hasArticleThumbnail(a.publishedAt, latest))
    .map((a) => ({ file: `${a.id}.png` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const article = loadArticle("en", Number(file.replace(/\.png$/, "")));
  if (!article) return new Response(null, { status: 404 });
  return articleImage(article, "en");
}
