import Link from "next/link";
import { CategoryBadge, TagChips } from "@/components/ArticleMeta";
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
 * LLM 가공 전(또는 가공 실패)이면 한국어 제목이 없으므로 원문 제목으로 폴백한다.
 */
export function ArticleCard({ article }: { article: ArticleCardType }) {
  const title = article.titleKo || article.titleOriginal;

  return (
    <Link
      href={`/article/${article.id}`}
      className="bg-card border-border hover:border-foreground flex flex-col gap-3 rounded-lg border p-6 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-caption text-muted-foreground truncate font-medium">
            {article.source.name}
          </span>
          <CategoryBadge category={article.category} />
        </div>
        <span className="text-caption text-muted-foreground shrink-0">
          {formatDate(article.publishedAt)}
        </span>
      </div>
      <h2 className="text-body font-semibold tracking-tight">{title}</h2>
      {article.summaryKo && (
        <p className="text-caption text-muted-foreground line-clamp-3 leading-relaxed">
          {article.summaryKo}
        </p>
      )}
      <TagChips tags={article.tags} max={3} />
      {article.trendingScore > 0 && (
        <span className="text-caption text-primary mt-auto font-medium">
          Trending {article.trendingScore}
        </span>
      )}
    </Link>
  );
}
