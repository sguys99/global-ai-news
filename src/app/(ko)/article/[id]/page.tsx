import type { Metadata } from "next";
import { articlePageMetadata, withLanguageAlternates } from "@/lib/pageMetadata";
import { ArticleView } from "@/views/ArticleView";
import { articleThumbnail, languageAlternates, loadArticle, localeArticleIds } from "@/views/data";

/*
 * 한국어 기사 상세(`/article/[id]/`) 라우트 — 경로 목록·메타만 두고 본문은 src/views/ArticleView.tsx(언어판 공용).
 */

/**
 * 정적 export: 기사 상세를 빌드타임에 사전 생성한다 — 보관 대상(호 날짜가 최신 호보다 90일 이상 앞, src/lib/archive.ts)은
 * 빼고. 그 기사들은 빌드 후처리(scripts/lib/archive.ts)가 같은 주소에 가벼운 보관 지면으로 쓴다.
 * 경로 목록은 언어판 공용 `localeArticleIds`(src/views/data.ts) — 영어 라우트도 같은 함수를 부른다.
 */
export function generateStaticParams() {
  return localeArticleIds("ko").map((id) => ({ id: String(id) }));
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
  return withLanguageAlternates(
    articlePageMetadata(article, articleThumbnail(article)),
    languageAlternates({ kind: "article", id: article.id }),
  );
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArticleView locale="ko" id={Number(id)} />;
}
