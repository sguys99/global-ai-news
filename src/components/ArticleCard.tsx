import Link from "next/link";
import type { ArticleCard as ArticleCardType } from "@/lib/types";

/** ISO8601 → 'YYYY.MM.DD' 표기. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * 피드 카드. DESIGN store-utility-card (흰 카드, hairline 보더, rounded.lg, 그림자 금지).
 * Phase 1: LLM 가공 전이므로 한국어 제목이 없으면 원문 제목을 표시한다.
 */
export function ArticleCard({ article }: { article: ArticleCardType }) {
  const title = article.titleKo || article.titleOriginal;

  return (
    <Link
      href={`/article/${article.id}`}
      className="bg-card border-border hover:border-primary flex flex-col gap-3 rounded-lg border p-5 transition-colors"
    >
      <div className="text-caption text-muted-foreground flex items-center justify-between">
        <span className="font-medium">{article.source.name}</span>
        <span>{formatDate(article.publishedAt)}</span>
      </div>
      <h2 className="text-body font-semibold tracking-tight">{title}</h2>
      <span className="text-caption text-primary mt-auto font-medium">
        Trending {article.trendingScore}
      </span>
    </Link>
  );
}
