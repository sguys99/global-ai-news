import type { Metadata } from "next";
import { englishArticlePageMetadata, withLanguageAlternates } from "@/lib/pageMetadata";
import { ArticleView } from "@/views/ArticleView";
import { articleThumbnail, languageAlternates, loadArticle, localeArticleIds } from "@/views/data";

/*
 * 영어 기사 상세(`/en/article/[id]/`) 라우트 — 경로 목록·메타만 두고 본문은 src/views/ArticleView.tsx(언어판 공용).
 * 경로는 영어 본문이 있고(hasEnglish) 보관 대상이 아닌 기사만(`localeArticleIds("en")`). 90일 지난 영어 기사는
 * 빌드 후처리(scripts/lib/archive.ts)가 같은 주소에 영어 보관 지면으로 쓴다 — 두 쪽이 같은 보관 계획을 본다.
 */
export function generateStaticParams() {
  return localeArticleIds("en").map((id) => ({ id: String(id) }));
}

/** 목록 밖 id(영어 없는 기사·보관 기사)는 산출물에 없어 정적 404. */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const article = loadArticle("en", Number(id));
  if (!article) return {};
  // 영어판 기사(hasEnglish)라 영어 썸네일 판정(articleThumbnail "en")이 og/en/article PNG 생성 조건과 같다.
  return withLanguageAlternates(
    englishArticlePageMetadata(article, articleThumbnail(article, "en")),
    languageAlternates({ kind: "article", id: article.id }),
  );
}

export default async function EnglishArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArticleView locale="en" id={Number(id)} />;
}
