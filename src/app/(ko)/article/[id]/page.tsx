import type { Metadata } from "next";
import { getAllArticleIds } from "@/lib/db";
import { categoryLabel } from "@/lib/labels";
import { SITE_DESCRIPTION, SITE_NAME, shareMetadata } from "@/lib/site";
import { ArticleView } from "@/views/ArticleView";
import { articleThumbnail, loadArticle } from "@/views/data";

/*
 * 한국어 기사 상세(`/article/[id]/`) 라우트 — 경로 목록·메타만 두고 본문은 src/views/ArticleView.tsx(언어판 공용).
 */

/** 정적 export: 전 기사 상세를 빌드타임에 전수 사전 생성한다. */
export function generateStaticParams() {
  return getAllArticleIds().map((id) => ({ id: String(id) }));
}

/** 목록 밖 id는 산출물에 없어 정적 404(generateStaticParams로만 생성). */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const article = loadArticle("ko", Number(id));
  if (!article) return {};
  const title = article.titleKo || article.titleOriginal;
  const description = article.summaryKo || SITE_DESCRIPTION;
  const thumbnail = articleThumbnail(article);
  return {
    title: `${title} — ${SITE_NAME}`,
    description: article.summaryKo || undefined,
    ...shareMetadata({
      title,
      description,
      path: `/article/${article.id}/`,
      image: thumbnail ? { path: thumbnail, alt: title } : undefined,
      article: {
        publishedTime: article.publishedAt,
        section: categoryLabel(article.category) || undefined,
        tags: article.tags,
      },
    }),
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArticleView locale="ko" id={Number(id)} />;
}
