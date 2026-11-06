import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CategoryKicker,
  Dot,
  FormatBadge,
  ImportanceMeter,
  TagChips,
  TrendBar,
  visibleTags,
} from "@/components/ArticleMeta";
import { FollowUpThread } from "@/components/FollowUpThread";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { RelatedStories } from "@/components/RelatedStories";
import { headlineOf, isKoreanOriginal, sourceNameOf, summaryOf, urlHost } from "@/lib/articleText";
import { toEntryCard } from "@/lib/feedIndex";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import {
  REGION_BADGES,
  categoryLabel,
  formatDate,
  hasHangul,
  regionLabel,
  sourceDisplayName,
} from "@/lib/labels";
import { articleMessages } from "@/lib/messages/article";
import { commonMessages } from "@/lib/messages/common";
import { articleJsonLd } from "@/lib/seo";
import { loadArticlePage } from "@/views/data";

/**
 * 기사 상세(`/article/[id]/`) 본문 — 언어판 공용 뷰(영어판 Phase 3-3).
 * 라우트는 generateStaticParams·메타만 두고 `<ArticleView locale=… id=… />` 를 그린다. 실을 기사·관련 기사·타임라인은
 * 로더(src/views/data.ts `loadArticlePage`)가 정하고, 범위 밖 id 는 404.
 * 제목·요약·매체명은 articleText 헬퍼로 고른다 — ko 는 예전 식 그대로(`titleKo || titleOriginal`·`summaryKo`·축약명).
 *
 * 영어판(Phase 5-2, 시안 docs/design/mockups/en-article.html): 한국 매체의 한국어 원제는 h1 아래 왼쪽 2px 헤어라인으로
 * 들인 단락에 "Original article in Korean" 라벨과 함께 `lang="ko"` 로 병기하고(영어 페이지의 한글 허용은 이 줄뿐), 한글
 * 원문 발췌는 싣지 않으며, 묶인 보도의 한국어 제목은 "Korean-language report" + `etnews.com · in Korean` 으로 바꾼다
 * (로더가 매체를 영문명으로 바꾼다). 머리 줄은 `KOREA · 분야`(한국 매체, DESIGN.md 영어판 B안), 원문 버튼 옆(모바일은 아래)에
 * `aitimes.com · in Korean`. 영어 글자 크기·자간은 globals.css 끝 "영어판 기사" 블록이 `:root[lang="en"]` 으로 맞춘다.
 * 한국어판 마크업은 바이트까지 그대로다 — 영어 전용 요소·클래스는 모두 locale 분기 안에 있다.
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
  // 영어판에서 한글이 든 원문 텍스트(한국 매체 원제·발췌·묶인 보도 제목) 판정. 한국어판은 언제나 거짓.
  const koreanInEnglish = (text: string) => locale === "en" && hasHangul(text);
  const koreanOriginal = koreanInEnglish(article.titleOriginal);
  // 한국어판은 원래 값 그대로(빈 문자열까지 — RSC 페이로드가 바뀌지 않게), 영어판은 한글 발췌만 뺀다.
  const excerpt = koreanInEnglish(article.contentRaw ?? "") ? undefined : article.contentRaw;
  // 영어판 한국 매체 표지(KOREA)와 원문 언어 안내(`aitimes.com · in Korean`). 한국어판은 둘 다 없다.
  const korea = locale === "en" && article.source.region === "kr";
  const koreanHost =
    locale === "en" && isKoreanOriginal(article) ? urlHost(article.url) || null : null;
  const ctaNote = koreanHost && (
    <span className="ar-ctan">
      <b>{koreanHost}</b> · {t.inKorean}
    </span>
  );
  const cta = (
    <a href={article.url} target="_blank" rel="noopener noreferrer" className="ar-cta">
      {t.readOriginal}
      <Icon name="arrowUpRight" className="size-4" />
    </a>
  );
  const mobileCta = (
    <a href={article.url} target="_blank" rel="noopener noreferrer" className="ar-mcta">
      {t.readOriginal}
      <Icon name="arrowUpRight" className="size-4" />
    </a>
  );

  return (
    <main className="ar-main">
      {/* 구조화 데이터(NewsArticle) — 언어판마다 자기 제목·요약·주소·inLanguage. 영어판은 한글을 싣지 않는다(src/lib/seo.ts). */}
      <JsonLd data={articleJsonLd(article, thumbnail, locale)} />
      <Link href={localePath(locale, "/")} className="ar-back">
        <Icon name="arrowLeft" className="size-4" />
        {common.nav.today}
      </Link>

      <article className="flex flex-col">
        <header className="flex flex-col gap-4 pt-6 md:pt-8">
          {/* 형식 배지(비뉴스만) + 분야 키커 — 레이더 카드 머리와 같은 순서 */}
          {(article.format !== "news" || article.category || korea) && (
            <span className="flex items-center gap-2">
              <FormatBadge format={article.format} locale={locale} />
              {/* 영어판 한국 매체: 배지 글꼴 글자 KOREA + 점(DESIGN.md 영어판 — 상자는 형식 배지 몫). */}
              {korea && (
                <>
                  <span className="sg-region">
                    <span aria-hidden>{REGION_BADGES.kr}</span>
                    <span className="sr-only">{regionLabel("kr", locale)}</span>
                  </span>
                  {article.category && <Dot />}
                </>
              )}
              <CategoryKicker category={article.category} locale={locale} />
            </span>
          )}
          <h1 className="ar-h1">{title}</h1>
          {showOriginalTitle &&
            (koreanOriginal ? (
              // 원제는 '읽으라는' 줄이 아니라 '원문이 한국어'라는 증거라 작고 흐리게(시안 주석 1).
              <p className="ar-orig">
                <span className="ar-orig-l">{t.originalInKorean}</span>
                <span className="ar-orig-t" lang="ko">
                  {article.titleOriginal}
                </span>
              </p>
            ) : (
              <p lang="en" className="text-caption text-muted-foreground">
                {article.titleOriginal}
              </p>
            ))}
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
                    {/* 저장된 매체 표시명(related_json) — 영어판은 로더가 영문명으로 바꿔 둔다(views/data.ts). */}
                    <span className="ar-cov-s">
                      {koreanInEnglish(r.source)
                        ? ""
                        : sourceDisplayName({ name: r.source }, locale)}
                    </span>
                    {r.koreanTitle ? (
                      // 영어판: 한국어 제목만 있는 보도 — 제목 대신 안내 + 원문 주소·언어(시안 주석 3 B안).
                      <span className="headline ar-cov-k">
                        {t.koreanReport}
                        {urlHost(r.url) && (
                          <small>
                            {urlHost(r.url)} · {t.inKorean}
                          </small>
                        )}
                      </span>
                    ) : (
                      <span className="headline text-caption min-w-0 flex-1">
                        {koreanInEnglish(r.title) ? "" : r.title}
                      </span>
                    )}
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

        {/* 영어판은 한글 발췌(한국 매체)를 싣지 않는다 — 영어 페이지다. */}
        {excerpt && (
          <section aria-labelledby="original-heading" className="ar-sect gap-3">
            <h2 id="original-heading" className="ar-h">
              {t.excerpt}
            </h2>
            <p lang="en" className="text-body text-foreground-soft">
              {excerpt}
            </p>
          </section>
        )}

        {/* 영어판은 라틴 문자 태그만 보이므로 보일 태그로 판정한다(빈 래퍼 방지). */}
        {visibleTags(article.tags, locale).length > 0 && (
          <div className="mt-8">
            <TagChips tags={article.tags} locale={locale} />
          </div>
        )}

        {/* 데스크톱: 본문 흐름 끝의 인라인 CTA. 영어판 한국어 원문은 옆에 `aitimes.com · in Korean`. */}
        {ctaNote ? (
          <div className="ar-ctaw">
            {cta}
            {ctaNote}
          </div>
        ) : (
          cta
        )}
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
            <RelatedStories cards={related.map((a) => toEntryCard(a, locale))} />
          </div>
        </section>
      )}

      {/* 모바일: 하단 floating CTA 바. `/article/*`에서는 하단 탭 바가 null이라 충돌 없음. */}
      <div
        className={ctaNote ? "ar-bar ar-barn" : "ar-bar"}
        style={{
          paddingTop: "0.75rem",
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        {mobileCta}
        {ctaNote}
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
