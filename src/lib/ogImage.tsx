/**
 * 공유 썸네일(og:image) 렌더러 — next/og(satori)로 1200×600 PNG 를 빌드타임에 그린다.
 *
 * - 색은 globals.css 라이트 토큰의 hex 사본이다(satori 는 CSS 변수를 읽지 못한다).
 * - satori 는 woff2·가변 폰트를 못 읽으므로 Google Fonts 의 정적 TTF 를 쓴다. 헤드라인은 사이트와
 *   같은 Hahmlet, 메타는 Pretendard 와 한글 자형이 같은 계열인 Noto Sans KR.
 * - satori 제약: 자식이 둘 이상인 요소는 display:flex 여야 한다.
 */
import { ImageResponse } from "next/og";
import type { EditionInfo } from "@/lib/db";
import type { Edition } from "@/lib/edition";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FORMATS,
  FORMAT_BADGES,
  FORMAT_DISPLAY_LABELS,
  categoryLabel,
  formatLongDate,
  shortSourceName,
  toFormat,
} from "@/lib/labels";
import { OG_IMAGE_SIZE, SITE_TAGLINE } from "@/lib/site";
import type { ArticleCard } from "@/lib/types";

const PAPER = "#f4f4f1";
const INK = "#141519";
const INK_SOFT = "#3a3c43";
const MUTED = "#66686f";
const BRAND = "#2140e8";
/** 헤어라인(`border` 토큰) — 칼럼 세로선. */
const HAIRLINE = "#d8d8d2";

const SERIF = "Hahmlet";
const SANS = "Noto Sans KR";

const PAD_X = 64;
const CONTENT_WIDTH = OG_IMAGE_SIZE.width - PAD_X * 2;
const COL_GAP = 32;
/** 1면 서브 헤드라인 3단 폭. */
const COL_WIDTH = (CONTENT_WIDTH - COL_GAP * 2) / 3;

/** Google Fonts css2 에서 정적 TTF(전체 글리프)를 받는다. */
async function loadFont(family: string, weight: number): Promise<ArrayBuffer> {
  const query = `family=${family.replace(/ /g, "+")}:wght@${weight}`;
  const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}`)).text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  const res = src ? await fetch(src) : null;
  if (!res?.ok) throw new Error(`OG 이미지 폰트 로드 실패: ${family} ${weight}`);
  return res.arrayBuffer();
}

type OgFonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

/**
 * 폰트는 프로세스(빌드 워커)당 한 번만 받는다. satori 는 fonts 배열 객체를 키로 파싱 결과를
 * 캐시하므로 같은 배열을 계속 넘겨야 썸네일 수백 장도 다운로드 3회·파싱 1회로 끝난다.
 */
let fonts: Promise<OgFonts> | null = null;

function loadFonts(): Promise<OgFonts> {
  fonts ??= Promise.all([loadFont(SERIF, 800), loadFont(SANS, 500), loadFont(SANS, 700)])
    .then(
      ([serif, sans, sansBold]): OgFonts => [
        { name: SERIF, data: serif, weight: 800, style: "normal" },
        { name: SANS, data: sans, weight: 500, style: "normal" },
        { name: SANS, data: sansBold, weight: 700, style: "normal" },
      ],
    )
    .catch((err) => {
      fonts = null;
      throw err;
    });
  return fonts;
}

async function render(node: React.ReactElement): Promise<ImageResponse> {
  return new ImageResponse(node, { ...OG_IMAGE_SIZE, fonts: await loadFonts() });
}

const headline = (a: ArticleCard) => a.titleKo || a.titleOriginal;

/** 제호 "Daily AI Brief" — AI 만 코발트(Masthead 와 동일). */
function Nameplate({ size }: { size: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: size * 0.26,
        fontFamily: SERIF,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: size * -0.03,
      }}
    >
      <span>Daily</span>
      <span style={{ color: BRAND }}>AI</span>
      <span>Brief</span>
    </div>
  );
}

/** Hahmlet 800 글자 폭(em) 추정 — 실측(한글 0.93·공백 0.26·라틴 대문자 평균 0.82)보다 넉넉히. */
function charEm(ch: string): number {
  if (/[ㄱ-ㆎ가-힣一-鿿]/.test(ch)) return 0.93;
  if (/[A-Z%&…]/.test(ch)) return 0.86;
  if (/[a-z0-9]/.test(ch)) return 0.66;
  return 0.45;
}

const WORD_GAP_EM = 0.26;

const wordEm = (w: string) => Array.from(w).reduce((sum, ch) => sum + charEm(ch), 0);
const lineEmOf = (ws: string[]) =>
  ws.reduce((sum, w) => sum + wordEm(w), 0) + WORD_GAP_EM * Math.max(0, ws.length - 1);
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

/** 앞에서부터 줄 폭(em)이 찰 때까지 어절을 담는 줄 나누기(줄 수 제한 없음). */
function greedyLines(words: string[], lineEm: number): string[][] {
  const lines: string[][] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && lineEmOf([...last, word]) <= lineEm) last.push(word);
    else lines.push([word]);
  }
  return lines;
}

/**
 * 어절을 줄 폭(em)에 채워 maxLines 를 넘으면 마지막 줄을 "…" 로 맺는다. 높이로만 자르면
 * "일시 금지 추진"이 "일시 금지"로 보이듯 뜻이 바뀔 수 있어, 잘렸다는 표시를 반드시 남긴다.
 */
export function fitWords(text: string, lineEm: number, maxLines: number): string[] {
  const lines = greedyLines(wordsOf(text), lineEm);
  if (lines.length <= maxLines) return lines.flat();
  const kept = lines.slice(0, maxLines);
  const tail = kept[maxLines - 1];
  while (tail.length > 1 && lineEmOf(tail) + wordEm("…") > lineEm) tail.pop();
  tail[tail.length - 1] += "…";
  return kept.flat();
}

/** 제목을 줄 폭(em)으로 나눈 줄들(추정 폭 기준, 줄 수 제한 없음) — 균형 줄바꿈 검증용. */
export function wrapWords(text: string, lineEm: number): string[][] {
  return greedyLines(wordsOf(text), lineEm);
}

/** 균형 줄바꿈 폭의 여유(em) — 추정 폭의 반올림 오차로 줄이 하나 늘어 마지막 어절이 잘리지 않게. */
const BALANCE_SLACK_EM = 0.3;

/**
 * 균형 줄바꿈(CSS `text-wrap: balance`) 폭(em). 줄 수를 늘리지 않는 가장 좁은 폭을 이분 탐색으로 찾아
 * 마지막 줄에 어절 하나("…투자 / 유치")만 남는 일을 막는다. satori 의 textWrap:'balance' 는 한 텍스트 노드에만
 * 듣는데 헤드라인은 어절별 span(flex-wrap)이라 직접 계산한다. 한 줄이거나 maxLines 를 넘어 말줄임되는 제목은
 * 원래 폭 그대로. 실제 글자 폭 ≤ 추정 폭(charEm)이므로 이 폭에서도 실제 줄 수는 늘지 않는다.
 */
export function balancedLineEm(text: string, lineEm: number, maxLines: number): number {
  const words = wordsOf(text);
  const count = greedyLines(words, lineEm).length;
  if (count <= 1 || count > maxLines) return lineEm;
  let lo = Math.max(...words.map(wordEm));
  let hi = lineEm;
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (greedyLines(words, mid).length > count) lo = mid;
    else hi = mid;
  }
  return Math.min(lineEm, hi + BALANCE_SLACK_EM);
}

/**
 * 세리프 헤드라인, 어절 단위 줄바꿈. satori 의 wordBreak:keep-all 은 Intl.Segmenter 단어
 * 경계라 구두점·문자 체계 경계(`'코어'|,` `Reflection|의`)에서도 끊는다 → 어절을 줄바꿈 금지
 * span 으로 감싸 flex-wrap 으로 흘린다. 추정이 빗나가도 maxHeight 로 줄 수는 지킨다.
 */
function Headline({
  text,
  width,
  size,
  lineHeight,
  maxLines,
  tracking = 0,
  balance = false,
}: {
  text: string;
  width: number;
  size: number;
  lineHeight: number;
  maxLines: number;
  tracking?: number;
  /** 균형 줄바꿈(balancedLineEm) — 상자 폭을 줄 수가 같은 가장 좁은 폭으로 줄인다. */
  balance?: boolean;
}) {
  const boxWidth = balance ? balancedLineEm(text, width / size, maxLines) * size : width;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        width: boxWidth,
        columnGap: size * WORD_GAP_EM,
        maxHeight: size * lineHeight * maxLines,
        overflow: "hidden",
        fontFamily: SERIF,
        fontWeight: 800,
        fontSize: size,
        lineHeight,
        letterSpacing: size * tracking,
      }}
    >
      {fitWords(text, width / size, maxLines).map((word, i) => (
        <span key={i} style={{ whiteSpace: "nowrap" }}>
          {word}
        </span>
      ))}
    </div>
  );
}

/** 마스트헤드 이중 잉크 괘선(굵은 선 + 가는 선). */
function DoubleRule({ marginTop }: { marginTop: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop }}>
      <div style={{ height: 6, background: INK }} />
      <div style={{ height: 2, marginTop: 3, background: INK }} />
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: `44px ${PAD_X}px`,
        background: PAPER,
        color: INK,
        fontFamily: SANS,
      }}
    >
      {children}
    </div>
  );
}

/** 리드 헤드라인 글자 크기: 길수록 줄여 3줄 안에 담는다. */
function leadFontSize(title: string): number {
  if (title.length <= 24) return 68;
  if (title.length <= 40) return 60;
  return 52;
}

/**
 * 기사 썸네일 헤드라인 크기·줄 수: 아래 서브 헤드라인 단이 없어 1면 리드보다 크게 쓴다.
 * 괘선~바이라인 사이 높이(약 384px)에 키커와 함께 들어가는 조합이다.
 */
function articleHeadline(title: string): { size: number; maxLines: number } {
  if (title.length <= 20) return { size: 88, maxLines: 2 };
  if (title.length <= 30) return { size: 76, maxLines: 3 };
  if (title.length <= 45) return { size: 64, maxLines: 3 };
  return { size: 54, maxLines: 3 };
}

/**
 * 형식 배지(REPO·MODEL·PAPER) — 사이트 FormatBadge 와 같은 잉크 아웃라인, 코발트 없음(강조색은
 * 하나). 썸네일은 작게 축소돼 보이므로 선은 2px. 뉴스는 배지가 없어 null.
 */
function FormatBadge({ format, size }: { format: string; size: number }) {
  const badge = FORMAT_BADGES[toFormat(format)];
  if (!badge) return null;
  return (
    <div
      style={{
        display: "flex",
        padding: `${size * 0.12}px ${size * 0.45}px`,
        border: `2px solid ${INK}`,
        color: INK,
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: size * 0.08,
      }}
    >
      {badge}
    </div>
  );
}

/**
 * 호 형식 구성 "뉴스 22 · 저장소 3 · 논문 3" — FORMATS 순, 화면 표시명(마스트헤드 귀와 같은 말), 0건 형식은 뺀다.
 * 전부 뉴스면 "이번 호 N건"과 같은 말이라 빈 문자열.
 */
export function formatMix(articles: Pick<ArticleCard, "format">[]): string {
  const counts = new Map<string, number>();
  for (const a of articles)
    counts.set(toFormat(a.format), (counts.get(toFormat(a.format)) ?? 0) + 1);
  if (counts.size < 2) return "";
  return FORMATS.filter((f) => counts.has(f))
    .map((f) => `${FORMAT_DISPLAY_LABELS[f]} ${counts.get(f)}`)
    .join(" · ");
}

/** 기본 썸네일(상세·검색 등): 제호 + 소개 + 분야 목록. */
export function defaultImage(): Promise<ImageResponse> {
  const kicker = "매일 06:00 KST 발행";
  // 분야 표시명엔 가운뎃점이 들어 있어("오픈소스·도구") 구분자는 점 대신 헤어라인 세로선.
  const categories = CATEGORIES.map((key) => CATEGORY_LABELS[key]);
  return render(
    <Frame>
      <div style={{ flexGrow: 1 }} />
      <div style={{ fontSize: 26, fontWeight: 700, color: BRAND }}>{kicker}</div>
      <div style={{ display: "flex", marginTop: 18 }}>
        <Nameplate size={116} />
      </div>
      <DoubleRule marginTop={26} />
      <div style={{ marginTop: 30, fontSize: 34, fontWeight: 500, color: INK_SOFT }}>
        {SITE_TAGLINE}
      </div>
      <div style={{ flexGrow: 1 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontSize: 22,
          fontWeight: 700,
          color: MUTED,
        }}
      >
        {categories.map((label, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {i > 0 && <div style={{ width: 2, height: 18, background: HAIRLINE }} />}
            <span>{label}</span>
          </div>
        ))}
      </div>
    </Frame>,
  );
}

/**
 * 호 썸네일 키커 — "1면" + 리드 분야. "오늘의 1면"은 지난 호 고정 링크를 공유하면 틀린 말이 되고,
 * 호 날짜·호수는 바로 위 데이트라인에 있다. 분야 표시명에 가운뎃점이 있어("산업·정책") 구분은 헤어라인으로 그린다.
 */
export function editionKicker(lead: Pick<ArticleCard, "category">): string[] {
  return ["1면", categoryLabel(lead.category)].filter(Boolean);
}

/** 호 기사 수 — 마스트헤드 귀와 같은 말("이번 호 N건"). 발행이 늦은 날·지난 호에서 "오늘"은 틀린 말이다. */
export function issueCountLabel(count: number): string {
  return `이번 호 ${count}건`;
}

/**
 * 호 썸네일 = 그 호의 1면: 마스트헤드 + 리드 헤드라인 + 서브 헤드라인 3건.
 * 키커 줄 오른쪽에 "이번 호 N건"(마스트헤드 귀와 같은 호 기사 수)과 형식 구성을 둔다.
 */
export function editionImage(
  edition: Pick<Edition, "lead" | "seconds" | "issue">,
  info: EditionInfo,
): Promise<ImageResponse> {
  const { lead } = edition;
  if (!lead) return defaultImage();

  const seconds = edition.seconds.slice(0, 3);
  const dateline = [
    info.publishedAt ? formatLongDate(info.publishedAt) : "",
    info.issueNo > 0 ? `제 ${info.issueNo}호` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  const kicker = editionKicker(lead);
  const title = headline(lead);
  const size = leadFontSize(title);
  const mix = formatMix(edition.issue);

  return render(
    <Frame>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <Nameplate size={46} />
        <div style={{ fontSize: 22, fontWeight: 500, color: MUTED }}>{dateline}</div>
      </div>
      <DoubleRule marginTop={18} />

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginTop: 34,
          marginBottom: 12,
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, color: BRAND }}>
          {kicker.map((part, i) => (
            <div key={part} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {i > 0 && <div style={{ width: 2, height: 20, background: HAIRLINE }} />}
              <span>{part}</span>
            </div>
          ))}
        </div>
        {edition.issue.length > 0 && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span>{issueCountLabel(edition.issue.length)}</span>
            {mix && <span style={{ fontSize: 21, fontWeight: 500, color: MUTED }}>{mix}</span>}
          </div>
        )}
      </div>
      <Headline
        text={title}
        width={CONTENT_WIDTH}
        size={size}
        lineHeight={1.22}
        maxLines={3}
        tracking={-0.02}
        balance
      />

      <div style={{ flexGrow: 1 }} />
      {seconds.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: COL_GAP,
            paddingTop: 16,
            borderTop: `2px solid ${INK}`,
          }}
        >
          {seconds.map((a) => (
            <div
              key={a.id}
              style={{ display: "flex", flexDirection: "column", width: COL_WIDTH, gap: 6 }}
            >
              <div style={{ fontSize: 17, fontWeight: 700, color: BRAND }}>
                {categoryLabel(a.category)}
              </div>
              <Headline
                text={headline(a)}
                width={COL_WIDTH}
                size={22}
                lineHeight={1.32}
                maxLines={3}
              />
            </div>
          ))}
        </div>
      )}
    </Frame>,
  );
}

/** 중요도 1–5 도트(4–5는 코발트) — ArticleMeta ImportanceMeter 와 같은 신호. */
function ImportanceDots({ value }: { value: number }) {
  const fill = value >= 4 ? BRAND : INK;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, color: MUTED, fontWeight: 500 }}>
      <span>중요도</span>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              border: `2px solid ${i > value ? MUTED : fill}`,
              background: i > value ? "transparent" : fill,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** 기사 썸네일: 제호·게시일 + 분야 키커(+ 비뉴스 형식 배지) + 헤드라인 + 매체·중요도 바이라인. */
export function articleImage(article: ArticleCard): Promise<ImageResponse> {
  const title = headline(article);
  const { size, maxLines } = articleHeadline(title);

  return render(
    <Frame>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <Nameplate size={46} />
        <div style={{ fontSize: 22, fontWeight: 500, color: MUTED }}>
          {formatLongDate(article.publishedAt)}
        </div>
      </div>
      <DoubleRule marginTop={18} />

      {/* 키커·헤드라인은 괘선과 바이라인 사이 세로 중앙 — 짧은 제목에서 지면이 비지 않게. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flexGrow: 1,
          padding: "24px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: BRAND }}>
            {categoryLabel(article.category) || "AI 뉴스"}
          </span>
          <FormatBadge format={article.format} size={17} />
        </div>
        <Headline
          text={title}
          width={CONTENT_WIDTH}
          size={size}
          lineHeight={1.22}
          maxLines={maxLines}
          tracking={-0.02}
          balance
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 32,
          paddingTop: 18,
          borderTop: `2px solid ${INK}`,
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        <span>{shortSourceName(article.source.name)}</span>
        {article.importance > 0 && <ImportanceDots value={article.importance} />}
      </div>
    </Frame>,
  );
}
