import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HTML_LANG, localePath, type Locale, type MessagesOf } from "@/lib/i18n";
import { notFoundMessages } from "@/lib/messages/notFound";

type NotFoundCopy = MessagesOf<typeof notFoundMessages>;

/**
 * 영어 단의 바로 가기 링크가 가리킬 언어판. 영어 페이지(`/en/…`)가 아직 없어(Phase 5 전) 한국어 지면을 가리킨다 —
 * `/en/` 으로 보내면 이 404 로 되돌아온다. **Phase 5 에서 영어 홈·검색이 생기면 "en" 으로 바꾼다**(이 한 줄).
 */
export const NOT_FOUND_EN_LINK_LOCALE: Locale = "ko";

/**
 * `/en` 아래에서 열린 404 면 문서 언어를 en 으로 바꾸는 `<head>` 인라인 스크립트(본문 파싱 전에 돌아 깜박임 없음).
 * 정적 404.html 은 한 장이라 lang 을 미리 정할 수 없다. `<html suppressHydrationWarning>` 이 속성 차이를 넘긴다.
 * basePath 는 프로덕션 `/global-ai-news`, dev 는 "".
 */
export function notFoundLangScript(basePath: string): string {
  const prefix = JSON.stringify(`${basePath}/en`);
  return `(function(){var p=location.pathname,e=${prefix};if(p===e||p.indexOf(e+"/")===0)document.documentElement.lang="en"})()`;
}

/*
 * 두 단의 글자 위계. 기본은 한국어 단이 앞·크게(LEAD), 영어 단이 뒤·작게(SECOND)다.
 * 문서 lang 이 en 이면(`lang-en:` — globals.css) 같은 클래스가 서로 자리를 바꾼다: 순서(order)와 크기를 맞바꾼다.
 */
const LEAD = {
  column: "order-1 lang-en:order-3",
  headline: "text-display-lg font-extrabold lang-en:text-headline lang-en:font-bold",
  body: "text-body text-foreground-soft lang-en:text-caption lang-en:text-muted-foreground",
  link: "text-title lang-en:text-caption",
} as const;

const SECOND = {
  column: "order-3 lang-en:order-1",
  headline: "text-headline font-bold lang-en:text-display-lg lang-en:font-extrabold",
  body: "text-caption text-muted-foreground lang-en:text-body lang-en:text-foreground-soft",
  link: "text-caption lang-en:text-title",
} as const;

/**
 * 앱 전체 404 본문(global-not-found.tsx) — 신문 '독자 안내' 지면. 마스트헤드 문법을 그대로 빌린다:
 * 제호 자리에 세리프 404(모바일은 세 글자라 제호보다 크게 72px) + 귀(상태 줄), 4px+1px 이중 잉크 괘선,
 * 그 아래 한국어 본단과 영어 곁단(lg 이상 2단 7:4, 세로 헤어라인 / 미만 1단).
 * 강조색은 키커의 코발트 하나, 박스·그림자 없음. 바로 가기는 헤어라인 줄 목록(44px 이상 터치 타깃, hover 는 글자만 코발트).
 */
export function NotFoundNotice() {
  const ko = notFoundMessages.ko;
  const en = notFoundMessages.en;
  return (
    <main
      id="not-found"
      className="mx-auto w-full max-w-[1240px] px-4 pt-5 pb-16 md:px-8 md:pt-7 md:pb-24"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-8">
        <p
          aria-hidden
          className="text-nameplate animate-rise font-serif font-extrabold tabular-nums max-md:text-[4.5rem]"
        >
          404
        </p>
        <p
          data-testid="not-found-status"
          className="text-meta border-border flex flex-wrap gap-x-1.5 md:flex-col md:gap-0.5 md:border-l md:pb-1.5 md:pl-5"
        >
          <span className="text-foreground font-bold">{ko.status}</span>
          <span aria-hidden className="text-muted-foreground md:hidden">
            ·
          </span>
          <span lang={HTML_LANG.en} className="text-muted-foreground">
            {en.status}
          </span>
        </p>
      </div>

      <div
        aria-hidden
        className="border-rule animate-draw mt-4 h-1.5 origin-left border-t-4 border-b md:mt-5"
      />

      <div className="mt-8 grid gap-12 md:mt-10 lg:grid-cols-[minmax(0,7fr)_auto_minmax(0,4fr)] lg:gap-10">
        <NoticeColumn locale="ko" copy={ko} tone={LEAD} heading="h1" />
        {/* 단 사이 세로 헤어라인(lg 이상). 모바일은 위 단의 바로 가기 목록 밑줄이 구획을 맡아 따로 긋지 않는다. */}
        <div aria-hidden className="bg-border order-2 hidden w-px lg:block" />
        <NoticeColumn
          locale="en"
          copy={en}
          tone={SECOND}
          heading="h2"
          linkLocale={NOT_FOUND_EN_LINK_LOCALE}
        />
      </div>
    </main>
  );
}

function NoticeColumn({
  locale,
  copy,
  tone,
  heading: Heading,
  linkLocale = locale,
}: {
  locale: Locale;
  copy: NotFoundCopy;
  tone: typeof LEAD | typeof SECOND;
  heading: "h1" | "h2";
  /** 바로 가기 링크의 언어판(기본은 단의 언어). */
  linkLocale?: Locale;
}) {
  const links = [
    { href: localePath(linkLocale, "/"), label: copy.links.today },
    { href: localePath(linkLocale, "/search"), label: copy.links.search },
  ];
  return (
    <section lang={HTML_LANG[locale]} className={`${tone.column} max-w-[42em]`}>
      <p className="text-meta text-brand font-bold tracking-[0.02em]">{copy.kicker}</p>
      <Heading className={`${tone.headline} animate-rise mt-2 font-serif text-pretty`}>
        {copy.headline}
      </Heading>
      <p className={`${tone.body} mt-3`}>{copy.body}</p>
      <nav aria-label={copy.linksLabel} className="mt-6">
        <ul className="border-rule border-t">
          {links.map(({ href, label }) => (
            <li key={label} className="border-border border-b">
              <Link
                href={href}
                className={`${tone.link} story-link group focus-visible:ring-ring flex min-h-11 items-center justify-between gap-4 py-2.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset`}
              >
                <span className="headline">{label}</span>
                <ArrowRight
                  aria-hidden
                  className="text-muted-foreground group-hover:text-brand size-4 shrink-0 transition-[color,transform] duration-150 ease-out group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
