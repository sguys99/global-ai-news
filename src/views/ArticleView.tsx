import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CategoryKicker,
  FormatBadge,
  ImportanceMeter,
  TagChips,
  TrendBar,
  visibleTags,
} from "@/components/ArticleMeta";
import { FollowUpThread } from "@/components/FollowUpThread";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { StoryEntry } from "@/components/Story";
import { headlineOf, sourceNameOf, summaryOf } from "@/lib/articleText";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import { categoryLabel, formatDate, shortSourceName } from "@/lib/labels";
import { articleMessages } from "@/lib/messages/article";
import { commonMessages } from "@/lib/messages/common";
import { articleJsonLd } from "@/lib/seo";
import { loadArticlePage } from "@/views/data";

/**
 * 기사 상세(`/article/[id]/`) 본문 — 언어판 공용 뷰(영어판 Phase 3-3).
 * 라우트는 generateStaticParams·메타만 두고 `<ArticleView locale=… id=… />` 를 그린다. 실을 기사·관련 기사·타임라인은
 * 로더(src/views/data.ts `loadArticlePage`)가 정하고, 범위 밖 id 는 404.
 * 제목·요약·매체명은 articleText 헬퍼로 고른다 — ko 는 예전 식 그대로(`titleKo || titleOriginal`·`summaryKo`·축약명).
 */
export function ArticleView({ locale, id }: { locale: Locale; id: number }) {
  const data = loadArticlePage(locale, id);
  if (!data) notFound();
  const { article, thumbnail, related, thread } = data;
  const t = getMessages(articleMessages, locale);
  const common = getMessages(commonMessages, locale);

  const title = headlineOf(article, locale);
  // 표시 제목이 원제와 다를 때만 원제를 병기한다(ko: 한국어 제목이 있고 원제와 다를 때 — 예전 조건과 같다).
  const showOriginalTitle = Boolean(title) && title !== article.titleOriginal;
  const summary = summaryOf(article, locale);
  // 매체 축약명(신호 패널)·원래 이름(툴팁).
  const sourceShort = sourceNameOf(article, locale);
  const sourceFull = sourceNameOf(article, locale, { full: true });

  return (
    <main className="ar-main">
      {/* 구조화 데이터는 아직 한국어 하나 — 언어별 값은 Phase 6. */}
      <JsonLd data={articleJsonLd(article, thumbnail)} />
      <Link href={localePath(locale, "/")} className="ar-back">
        <Icon name="arrowLeft" className="size-4" />
        {common.nav.today}
      </Link>

      <article className="flex flex-col">
        <header className="flex flex-col gap-4 pt-6 md:pt-8">
          {/* 형식 배지(비뉴스만) + 분야 키커 — 레이더 카드 머리와 같은 순서 */}
          {(article.format !== "news" || article.category) && (
            <span className="flex items-center gap-2">
              <FormatBadge format={article.format} locale={locale} />
              <CategoryKicker category={article.category} locale={locale} />
            </span>
          )}
          <h1 className="ar-h1">{title}</h1>
          {showOriginalTitle && (
            <p lang="en" className="text-caption text-muted-foreground">
              {article.titleOriginal}
            </p>
          )}
        </header>

        <dl className="ar-sigs">
          {/* 사이트 전체와 같은 매체 축약명 — 피드 구분("GitHub (topic:llm)")은 독자에게 매체가 아니다. 원래 이름은 툴팁. */}
          <Signal label={t.signals.source}>
            <span title={sourceFull !== sourceShort ? sourceFull : undefined}>{sourceShort}</span>
          </Signal>
          <Signal label={t.signals.published}>
            <time dateTime={article.publishedAt} className="tabular-nums">
              {formatDate(article.publishedAt, locale)}
            </time>
          </Signal>
          <Signal label={t.signals.importance}>
            {article.importance > 0 ? (
              <span className="flex items-center gap-2">
                <ImportanceMeter value={article.importance} locale={locale} />
                <span className="tabular-nums">{article.importance}/5</span>
              </span>
            ) : (
              "—"
            )}
          </Signal>
          <Signal label={t.signals.trending}>
            {article.trendingScore > 0 ? (
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{article.trendingScore}</span>
                <TrendBar value={article.trendingScore} />
              </span>
            ) : (
              "—"
            )}
          </Signal>
        </dl>

        {summary && (
          <section aria-labelledby="summary-heading" className="mt-9 flex flex-col gap-3">
            <h2 id="summary-heading" className="ar-lbl">
              {t.summary}
            </h2>
            <p className="ar-sum">{summary}</p>
          </section>
        )}

        {/* 사건 타임라인 — 요약 바로 뒤: 이 소식이 어디서 이어졌는지가 요약 다음으로 궁금한 맥락이다. */}
        <FollowUpThread entries={thread} locale={locale} />

        {article.related && article.related.length > 0 && (
          <section aria-labelledby="coverage-heading" className="ar-sect gap-1">
            <h2 id="coverage-heading" className="ar-h mb-2">
              {t.coverage(article.related.length)}
            </h2>
            <ul className="flex flex-col">
              {article.related.map((r) => (
                <li key={r.url} className="ar-li">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="story-link ar-cov"
                  >
                    {/* 저장된 매체 표시명(related_json) — 영어 매체명 찾기는 Phase 5(이름 → sourceDisplayName). */}
                    <span className="ar-cov-s">{shortSourceName(r.source)}</span>
                    <span className="headline text-caption min-w-0 flex-1">{r.title}</span>
                    <Icon
                      name="arrowUpRight"
                      className="text-muted-foreground size-3.5 shrink-0 self-center"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {article.contentRaw && (
          <section aria-labelledby="original-heading" className="ar-sect gap-3">
            <h2 id="original-heading" className="ar-h">
              {t.excerpt}
            </h2>
            <p lang="en" className="text-body text-foreground-soft">
              {article.contentRaw}
            </p>
          </section>
        )}

        {/* 영어판은 라틴 문자 태그만 보이므로 보일 태그로 판정한다(빈 래퍼 방지). */}
        {visibleTags(article.tags, locale).length > 0 && (
          <div className="mt-8">
            <TagChips tags={article.tags} locale={locale} />
          </div>
        )}

        {/* 데스크톱: 본문 흐름 끝의 인라인 CTA */}
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="ar-cta">
          {t.readOriginal}
          <Icon name="arrowUpRight" className="size-4" />
        </a>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-16">
          <div className="ar-rh">
            <h2 id="related-heading" className="ar-rh-h">
              {t.moreInCategory(categoryLabel(article.category, locale))}
            </h2>
            <Link
              href={localePath(locale, `/?category=${encodeURIComponent(article.category)}`)}
              className="ar-all"
            >
              {t.seeAll}
            </Link>
          </div>
          <div className="flex flex-col">
            {related.map((a) => (
              <StoryEntry key={a.id} article={a} hideCategory locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* 모바일: 하단 floating CTA 바. `/article/*`에서는 하단 탭 바가 null이라 충돌 없음. */}
      <div
        className="ar-bar"
        style={{
          paddingTop: "0.75rem",
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="ar-mcta">
          {t.readOriginal}
          <Icon name="arrowUpRight" className="size-4" />
        </a>
      </div>
    </main>
  );
}

function Signal({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ar-sig">
      <dt className="ar-sig-l">{label}</dt>
      <dd className="ar-sig-v">{children}</dd>
    </div>
  );
}
