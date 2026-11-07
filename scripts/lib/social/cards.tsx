/**
 * 주간 SNS 카드 이미지(english-version-plan Phase 8-2) — next/og(satori)로 PNG 를 그린다. 사이트 1면처럼 읽히게:
 * 제호 `AI Daybook` + 폴리오 줄, 이중 잉크 괘선, 번호 붙은 세리프 헤드라인, 코발트 분야 키커 + 작은 대문자 매체명,
 * 레이더 행의 잉크 아웃라인 형식 배지, 종이 바탕·넉넉한 여백. 박스·그림자·그라데이션 없음(DESIGN.md §9).
 *
 * 팔레트·폰트(Hahmlet 800 + Noto Sans KR 500/700, Google Fonts 정적 TTF)·조판 조각은 공유 썸네일(src/lib/ogImage.tsx)과
 * 같은 것을 쓴다. 영어 헤드라인 줄 나누기·말줄임·균형 줄바꿈은 그 실측 폭 표(`latinCharEm`)와 `LineHeadline` 그대로라
 * 마지막 줄에 낱말 하나만 남지 않고, 넘치면 "…" 로 맺는다. 목록 카드는 같은 추정으로 **가장 큰 글자 크기**를 고른다
 * (`fitList` — 모든 제목이 줄 수 안에 들어가고 목록 높이가 칸에 맞는 첫 크기).
 *
 * 카드:
 *  - `card-landscape.png` 1200×675 — Korea Desk(왼쪽 머리 칸 + 오른쪽 번호 목록, 사이트 Korea Desk 밴드의 4:8 문법). X·LinkedIn.
 *  - `card-portrait.png` 1080×1350 — 큰 제호 + Korea Desk 목록 + 주간 레이더 상위 3. LinkedIn·Instagram 세로.
 *  - `card-radar.png` 1200×675 — 일요일 특집 주간 레이더 상위 6(2단). 레이더가 없으면 만들지 않는다.
 *  - `story-N.png` 1200×675 — 하이라이트 한 건씩(키커·큰 제목·첫 문장·바이라인). X 스레드 답글용(선택).
 *
 * JSX 런타임: 저장소 tsconfig 는 Next 용 `jsx: preserve` 라 tsx 가 고전 변환(React.createElement)을 쓴다 → npm 스크립트가
 * `--tsconfig scripts/lib/social/tsconfig.json`(react-jsx)으로 돌린다. ogImage.tsx 의 조각도 같은 런타임으로 실행된다.
 */
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import {
  BRAND,
  DoubleRule,
  EN_DISPLAY_TRACKING,
  EN_TITLE_TRACKING,
  FormatBadge,
  Glyphs,
  HAIRLINE,
  INK,
  INK_SOFT,
  KoreaMark,
  LineHeadline,
  MUTED,
  Nameplate,
  PAPER,
  SANS,
  fitHeadline,
  latinCharEm,
  loadFonts,
  typographicApostrophes,
  wrapWords,
  type HeadlineFit,
} from "../../../src/lib/ogImage";
import { categoryLabel, EN_MONTHS_SHORT } from "../../../src/lib/labels";
import type { SocialRadarItem, SocialStory } from "./select";
import { displaySite, firstSentence, radarShortName, weekRange, type SocialKit } from "./text";

export const LANDSCAPE = { width: 1200, height: 675 } as const;
export const PORTRAIT = { width: 1080, height: 1350 } as const;

/** 카드 헤드라인 행간 — 사이트 서브 헤드라인(20px/1.3)과 리드(1.1) 사이. */
const LIST_LINE_HEIGHT = 1.18;

async function render(node: ReactNode, size: { width: number; height: number }): Promise<Buffer> {
  const res = new ImageResponse(node as React.ReactElement, { ...size, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

const typo = (s: string) => typographicApostrophes(s);

/**
 * Noto Sans KR 500 라틴 글자 폭(em) 넉넉한 추정 — 산세리프 단락(dek)의 줄 수를 미리 세어 넘치면 "…" 로 맺는다.
 * 실제 폭(Source Sans 계열, 소문자 평균 약 0.5)보다 크게 잡아 그린 줄이 추정보다 늘지 않게 한다.
 */
export function sansCharEm(ch: string): number {
  if (/[A-Z]/.test(ch)) return ch === "M" || ch === "W" ? 0.86 : 0.66;
  if (/[mw]/.test(ch)) return 0.8;
  if (/[ijlft]/.test(ch)) return 0.32;
  if (/[a-z]/.test(ch)) return 0.55;
  if (/[0-9$%]/.test(ch)) return 0.58;
  if (/[—…]/.test(ch)) return 1;
  return 0.34;
}

/** 산세리프 낱말 사이 빈 칸(em) — ogImage Glyphs 와 같은 Noto Sans KR 공백 폭. */
const SANS_SPACE_EM = 0.225;

/** 단락을 줄 폭(px)·글자 크기로 나눠 maxLines 를 넘으면 마지막 줄을 "…" 로 맺은 낱말 목록. */
export function fitSansWords(
  text: string,
  width: number,
  size: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const wordPx = (w: string) => Array.from(w).reduce((n, ch) => n + sansCharEm(ch), 0) * size;
  const gap = SANS_SPACE_EM * size;
  const lines: string[][] = [];
  let lineW = 0;
  for (const w of words) {
    const ww = wordPx(w);
    const last = lines.at(-1);
    if (last && lineW + gap + ww <= width) {
      last.push(w);
      lineW += gap + ww;
    } else {
      lines.push([w]);
      lineW = ww;
    }
  }
  if (lines.length <= maxLines) return lines.flat();
  const kept = lines.slice(0, maxLines);
  const tail = kept[maxLines - 1];
  const tailW = () => tail.reduce((n, w, i) => n + wordPx(w) + (i > 0 ? gap : 0), 0);
  while (tail.length > 1 && tailW() + wordPx("…") > width) tail.pop();
  tail[tail.length - 1] = `${tail[tail.length - 1].replace(/[,.;:—–-]+$/, "")}…`;
  return kept.flat();
}

/**
 * 산세리프 단락 — 낱말마다 글자를 하나씩 그려(ogImage Glyphs 와 같은 이유: satori 가 커닝 없이 재고 커닝을 넣어 그려
 * "Korea’s  tech" 처럼 낱말 사이가 벌어진다) flex-wrap 으로 흘린다. 줄 수는 fitSansWords 추정으로 미리 자른다.
 */
function SansParagraph({
  text,
  width,
  size,
  lineHeight,
  maxLines,
  color = INK_SOFT,
}: {
  text: string;
  width: number;
  size: number;
  lineHeight: number;
  maxLines: number;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        width,
        columnGap: size * SANS_SPACE_EM,
        fontSize: size,
        lineHeight,
        color,
        fontWeight: 500,
        maxHeight: size * lineHeight * maxLines + 2,
        overflow: "hidden",
      }}
    >
      {fitSansWords(typo(text), width, size, maxLines).map((w, i) => (
        <div key={i} style={{ display: "flex" }}>
          {/* Noto Sans KR 의 "…"(U+2026)는 가운데 높이의 한글식 말줄임이라 라틴 문장 끝에서 떠 보인다 → 마침표 셋. */}
          {Array.from(w.replace(/…$/, "..."), (ch, k) => (
            <span key={k}>{ch}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── 줄 수 추정 ─────────────────────────────────────────────────────────────

/** 제목이 width·size 에서 차지할 줄 수(maxLines 에서 자른다) — LineHeadline 과 같은 추정. */
export function headlineLines(
  title: string,
  width: number,
  size: number,
  maxLines: number,
  tracking = EN_TITLE_TRACKING,
): number {
  return Math.min(maxLines, wrapWords(typo(title), width / size, latinCharEm(tracking)).length);
}

export interface ListFit extends HeadlineFit {
  /** 목록 전체 추정 높이(px). */
  height: number;
  /** 말줄임되는 제목 수(maxLines 를 넘는 제목). */
  clipped: number;
}

/**
 * 번호 목록의 글자 크기 고르기 — 큰 것부터, 말줄임 없이 들어가고 높이 ≤ budget 인 첫 크기. 없으면 높이만 맞는 첫 크기
 * (말줄임 허용), 그것도 없으면 가장 작은 크기. `rowExtra` 는 행마다 제목 밖 높이(키커·여백·헤어라인).
 */
export function fitList(
  titles: readonly string[],
  width: number,
  budget: number,
  sizes: readonly number[],
  maxLines: number,
  rowExtra: number,
  lineHeight = LIST_LINE_HEIGHT,
): ListFit {
  const measure = (size: number): ListFit => {
    let height = 0;
    let clipped = 0;
    for (const t of titles) {
      const full = wrapWords(typo(t), width / size, latinCharEm(EN_TITLE_TRACKING)).length;
      if (full > maxLines) clipped += 1;
      height += Math.min(full, maxLines) * size * lineHeight + rowExtra;
    }
    return { size, maxLines, height, clipped };
  };
  const all = sizes.map(measure);
  return (
    all.find((f) => f.clipped === 0 && f.height <= budget) ??
    all.find((f) => f.height <= budget) ??
    all[all.length - 1]
  );
}

// ─── 조각 ────────────────────────────────────────────────────────────────────

function Frame({ children, padX, padY }: { children: ReactNode; padX: number; padY: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: `${padY}px ${padX}px`,
        background: PAPER,
        color: INK,
        fontFamily: SANS,
      }}
    >
      {children}
    </div>
  );
}

/** 작은 대문자(매체명) — 배지 글꼴(700 대문자, 자간 0.09em)의 잉크 글자. 형식 배지·KOREA 와 같은 문법. */
function SmallCaps({ text, size, color = INK }: { text: string; size: number; color?: string }) {
  return (
    <div style={{ display: "flex", color, fontWeight: 700, letterSpacing: size * 0.09 }}>
      <Glyphs text={text.toUpperCase()} size={size} />
    </div>
  );
}

/** 코발트 분야 키커 + 헤어라인 + 작은 대문자 매체명. */
function StoryKicker({ story, size }: { story: SocialStory; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.7 }}>
      <div style={{ display: "flex", color: BRAND, fontWeight: 700 }}>
        <Glyphs text={categoryLabel(story.category, "en")} size={size} />
      </div>
      <div style={{ width: 1.5, height: size * 0.95, background: HAIRLINE }} />
      <SmallCaps text={story.source} size={size * 0.84} color={INK_SOFT} />
    </div>
  );
}

/** 세리프 순위 숫자 — 1~3 코발트, 나머지 흐림(사이트 '지금 화제'·주간 레이더 순위와 같다). */
function Rank({ n, size }: { n: number; size: number }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Hahmlet",
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        color: n <= 3 ? BRAND : MUTED,
        letterSpacing: size * -0.02,
      }}
    >
      {String(n)}
    </div>
  );
}

/** 위: 제호 + 오른쪽 폴리오(흐린 산세리프 한 줄), 아래: 이중 잉크 괘선. */
function Masthead({ size, folio, folioSize }: { size: number; folio: string; folioSize: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <Nameplate size={size} />
        <div style={{ display: "flex", color: MUTED, fontWeight: 500, paddingBottom: size * 0.04 }}>
          <Glyphs text={folio} size={folioSize} />
        </div>
      </div>
      <DoubleRule marginTop={Math.round(size * 0.4)} />
    </div>
  );
}

const folioRange = (kit: SocialKit) =>
  `${weekRange(kit.week.start, kit.week.end)}${kit.week.partial ? " (so far)" : ""}`;

/** 호수 범위 "No. 132–138". */
const issueRange = (kit: SocialKit) =>
  kit.issueNos.first === kit.issueNos.last
    ? `No. ${kit.issueNos.last}`
    : `Nos. ${kit.issueNos.first}–${kit.issueNos.last}`;

/** 번호 목록 한 행: [순위 | 키커 / 헤드라인], 위 헤어라인(첫 행 제외). */
function StoryRow({
  story,
  n,
  width,
  fit,
  rankSize,
  rankWidth,
  kickerSize,
  padY,
  first,
}: {
  story: SocialStory;
  n: number;
  width: number;
  fit: HeadlineFit;
  rankSize: number;
  rankWidth: number;
  kickerSize: number;
  padY: number;
  first: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        paddingTop: first ? 0 : padY,
        paddingBottom: padY,
        borderTop: first ? "none" : `1px solid ${HAIRLINE}`,
      }}
    >
      <div style={{ display: "flex", width: rankWidth, paddingTop: 2 }}>
        <Rank n={n} size={rankSize} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", width, gap: kickerSize * 0.5 }}>
        <StoryKicker story={story} size={kickerSize} />
        <LineHeadline
          text={typo(story.title)}
          width={width}
          size={fit.size}
          lineHeight={LIST_LINE_HEIGHT}
          maxLines={fit.maxLines}
          tracking={EN_TITLE_TRACKING}
        />
      </div>
    </div>
  );
}

// ─── 가로 카드 (Korea Desk) ─────────────────────────────────────────────────

/** Korea Desk 머리 칸 dek — 사이트 영어판 Korea Desk 밴드 dek 을 주간 키트에 맞게. */
const DESK_DEK = "What Korea's tech press reported this week, summarized in English.";

const L_PAD_X = 60;
const L_PAD_Y = 46;
const L_HEAD_W = 300;
const L_COL_GAP = 36;
const L_RANK_W = 46;
const L_LIST_W = LANDSCAPE.width - L_PAD_X * 2 - L_HEAD_W - L_COL_GAP * 2 - 1;
const L_TITLE_W = L_LIST_W - L_RANK_W;

/** 가로 카드: 사이트 Korea Desk 밴드처럼 왼쪽 머리 칸(라벨·제목·dek·호수·주소) + 오른쪽 번호 목록. */
export function koreaDeskLandscape(kit: SocialKit): Promise<Buffer> {
  const stories = kit.korea;
  const kickerSize = 15;
  const padY = 11;
  // 목록 칸 높이 = 카드 − 위아래 여백 − 마스트헤드(제호 40 + 괘선) − 본문 위 여백.
  const budget = LANDSCAPE.height - L_PAD_Y * 2 - 40 - 16 - 11 - 26;
  const rowExtra = kickerSize * 1.3 + kickerSize * 0.5 + padY * 2 + 1;
  const fit = fitList(
    stories.map((s) => s.title),
    L_TITLE_W,
    budget,
    [28, 27, 26, 25, 24, 23, 22, 21, 20],
    2,
    rowExtra,
  );
  return render(
    <Frame padX={L_PAD_X} padY={L_PAD_Y}>
      <Masthead size={40} folio={`Korea Desk  ·  Week of ${folioRange(kit)}`} folioSize={18} />
      <div style={{ display: "flex", flexGrow: 1, marginTop: 26 }}>
        <div style={{ display: "flex", flexDirection: "column", width: L_HEAD_W }}>
          <div style={{ display: "flex", color: BRAND, fontWeight: 700 }}>
            <Glyphs text="From Seoul" size={17} />
          </div>
          <div style={{ display: "flex", marginTop: 8 }}>
            <LineHeadline
              text="Korea Desk"
              width={L_HEAD_W}
              size={62}
              lineHeight={1.02}
              maxLines={2}
              tracking={EN_DISPLAY_TRACKING}
            />
          </div>
          <div style={{ display: "flex", marginTop: 18 }}>
            <SansParagraph
              text={DESK_DEK}
              width={L_HEAD_W}
              size={20}
              lineHeight={1.45}
              maxLines={4}
            />
          </div>
          <div style={{ flexGrow: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", color: MUTED, fontWeight: 500 }}>
              <Glyphs
                text={`${issueRange(kit)}  ·  ${kit.counts.korean} Korean-outlet stories`}
                size={15}
              />
            </div>
            <div style={{ display: "flex", fontWeight: 700 }}>
              <Glyphs text={displaySite(kit.site)} size={16} />
            </div>
          </div>
        </div>
        <div style={{ width: 1, background: HAIRLINE, margin: `0 ${L_COL_GAP}px` }} />
        <div style={{ display: "flex", flexDirection: "column", width: L_LIST_W }}>
          {stories.map((s, i) => (
            <StoryRow
              key={s.id}
              story={s}
              n={i + 1}
              width={L_TITLE_W}
              fit={fit}
              rankSize={30}
              rankWidth={L_RANK_W}
              kickerSize={kickerSize}
              padY={padY}
              first={i === 0}
            />
          ))}
        </div>
      </div>
    </Frame>,
    LANDSCAPE,
  );
}

// ─── 세로 카드 (Korea Desk + 레이더) ─────────────────────────────────────────

const P_PAD_X = 72;
const P_PAD_Y = 64;
const P_CONTENT_W = PORTRAIT.width - P_PAD_X * 2;
const P_RANK_W = 62;
const P_TITLE_W = P_CONTENT_W - P_RANK_W;

/** 세로 카드의 레이더 최대 행 수 — 2행 미만이면 띠를 싣지 않는다(한 줄짜리 순위표는 어색하다). */
const PORTRAIT_RADAR_ROWS = 3;
const P_KICKER = 18;
const P_ROW_PAD = 16;
/**
 * 세로 카드의 고정 높이(실측에 맞춘 추정, px): 폴리오 24 + 14 + 제호 112 + 이중 괘선 35 + 머리 칸 127 + 목록 위 괘선 48 +
 * 꼬리말 67. 레이더 띠는 머리 64 + 행마다 82.
 */
const P_FIXED = 24 + 14 + 112 + 35 + 127 + 48 + 67;
const P_RADAR_HEAD = 64;
const P_RADAR_ROW = 82;
/** Korea Desk 제목 크기 후보 — 레이더 띠를 싣더라도 이 아래로는 줄이지 않는다(목록이 카드의 주인공). */
const P_SIZES = [38, 36, 34, 32, 30] as const;

/**
 * 세로 카드 배치: Korea Desk 목록을 먼저(P_SIZES 안에서 말줄임 없이) 담고, 남는 높이에 주간 레이더 3·2행이 들어가면 싣는다.
 * 어느 쪽도 안 되면 레이더 없이 더 작은 크기까지 내려간다.
 */
export function planPortrait(
  titles: readonly string[],
  radarCount: number,
): { fit: ListFit; radarRows: number } {
  const rowExtra = P_KICKER * 1.3 + P_KICKER * 0.5 + P_ROW_PAD * 2 + 1;
  const avail = PORTRAIT.height - P_PAD_Y * 2 - P_FIXED - 16;
  for (let rows = Math.min(radarCount, PORTRAIT_RADAR_ROWS); rows >= 2; rows -= 1) {
    const budget = avail - P_RADAR_HEAD - rows * P_RADAR_ROW;
    const fit = fitList(titles, P_TITLE_W, budget, P_SIZES, 3, rowExtra);
    if (fit.clipped === 0 && fit.height <= budget) return { fit, radarRows: rows };
  }
  return {
    fit: fitList(titles, P_TITLE_W, avail, [...P_SIZES, 28, 26, 24], 3, rowExtra),
    radarRows: 0,
  };
}

function RadarLine({ item }: { item: SocialRadarItem }) {
  // 저장소·모델은 식별자(owner/repo)가 이름이고, 논문은 제목이 이름·arXiv ID 가 메타다(radarShortName 과 같은 규칙).
  const name = radarShortName(item);
  const meta = [name === item.ident ? undefined : item.ident, ...(item.stats ?? [])]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "13px 0" }}>
      <div style={{ display: "flex", width: P_RANK_W - 16 }}>
        <Rank n={item.rank} size={28} />
      </div>
      <div style={{ display: "flex", width: 96 }}>
        <FormatBadge format={item.format} size={15} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, gap: 4 }}>
        <LineHeadline
          text={typo(name)}
          width={P_CONTENT_W - P_RANK_W - 112}
          size={23}
          lineHeight={1.2}
          maxLines={1}
          tracking={EN_TITLE_TRACKING}
        />
        {meta && (
          <div style={{ display: "flex", color: MUTED, fontWeight: 500 }}>
            <Glyphs text={meta} size={16} />
          </div>
        )}
      </div>
    </div>
  );
}

/** 세로 카드: 폴리오 → 큰 제호 → 이중 괘선 → Korea Desk 머리·목록 → 주간 레이더 상위 3 → 꼬리말. */
export function koreaDeskPortrait(kit: SocialKit): Promise<Buffer> {
  const stories = kit.korea;
  const { fit, radarRows } = planPortrait(
    stories.map((s) => s.title),
    kit.radar.length,
  );
  const radar = kit.radar.slice(0, radarRows);
  const kickerSize = P_KICKER;
  const padY = P_ROW_PAD;
  return render(
    <Frame padX={P_PAD_X} padY={P_PAD_Y}>
      <div
        style={{ display: "flex", justifyContent: "space-between", color: MUTED, fontWeight: 500 }}
      >
        <Glyphs text={`Weekly  ·  ${issueRange(kit)}`} size={20} />
        <Glyphs text={`Week of ${folioRange(kit)}`} size={20} />
      </div>
      <div style={{ display: "flex", marginTop: 14 }}>
        <Nameplate size={112} />
      </div>
      <DoubleRule marginTop={24} />

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginTop: 30,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: BRAND, fontWeight: 700 }}>
            <Glyphs text="From Seoul" size={20} />
          </div>
          <div style={{ display: "flex", marginTop: 6 }}>
            <LineHeadline
              text="Korea Desk"
              width={520}
              size={64}
              lineHeight={1.05}
              maxLines={1}
              tracking={EN_DISPLAY_TRACKING}
            />
          </div>
        </div>
        <div style={{ display: "flex", paddingBottom: 6 }}>
          <SansParagraph text={DESK_DEK} width={380} size={22} lineHeight={1.45} maxLines={3} />
        </div>
      </div>

      <div style={{ height: 2, background: INK, marginTop: 26, marginBottom: 20 }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {stories.map((s, i) => (
          <StoryRow
            key={s.id}
            story={s}
            n={i + 1}
            width={P_TITLE_W}
            fit={fit}
            rankSize={40}
            rankWidth={P_RANK_W}
            kickerSize={kickerSize}
            padY={padY}
            first={i === 0}
          />
        ))}
      </div>

      <div style={{ flexGrow: 1 }} />
      {radar.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ height: 2, background: INK }} />
            <div style={{ height: 1, marginTop: 3, background: INK }} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 18,
              marginTop: 18,
              marginBottom: 4,
            }}
          >
            <div style={{ display: "flex", color: BRAND, fontWeight: 700 }}>
              <Glyphs text="Sunday special" size={18} />
            </div>
            <LineHeadline
              text="Weekly radar"
              width={400}
              size={32}
              lineHeight={1.1}
              maxLines={1}
              tracking={EN_DISPLAY_TRACKING}
            />
          </div>
          {radar.map((r, i) => (
            <div
              key={r.id}
              style={{ display: "flex", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}
            >
              <RadarLine item={r} />
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 22,
          paddingTop: 18,
          borderTop: `2px solid ${INK}`,
        }}
      >
        <div style={{ display: "flex", fontWeight: 700 }}>
          <Glyphs text={displaySite(kit.site)} size={21} />
        </div>
        <div style={{ display: "flex", color: MUTED, fontWeight: 500 }}>
          <Glyphs text="Published daily at 06:00 KST" size={19} />
        </div>
      </div>
    </Frame>,
    PORTRAIT,
  );
}

// ─── 가로 카드 (주간 레이더) ─────────────────────────────────────────────────

/** 레이더 카드 행 수(2단 × 3). */
const RADAR_CARD_ROWS = 6;

function RadarCell({ item, width }: { item: SocialRadarItem; width: number }) {
  const meta = [item.ident, ...(item.stats ?? [])].filter(Boolean).join("  ·  ");
  return (
    <div style={{ display: "flex", width, padding: "14px 0" }}>
      <div style={{ display: "flex", width: 44, paddingTop: 2 }}>
        <Rank n={item.rank} size={28} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: width - 44, gap: 7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FormatBadge format={item.format} size={13} />
          <div style={{ display: "flex", color: BRAND, fontWeight: 700 }}>
            <Glyphs text={categoryLabel(item.category, "en")} size={15} />
          </div>
        </div>
        <LineHeadline
          text={typo(item.title)}
          width={width - 44}
          size={21}
          lineHeight={1.2}
          maxLines={2}
          tracking={EN_TITLE_TRACKING}
        />
        {meta && (
          <div style={{ display: "flex", color: MUTED, fontWeight: 500, overflow: "hidden" }}>
            <Glyphs text={meta} size={15} />
          </div>
        )}
      </div>
    </div>
  );
}

/** 주간 레이더 카드: 마스트헤드 → "Sunday special · Weekly radar" → 2단 순위표(왼쪽 1~3, 오른쪽 4~6). */
export function weeklyRadarLandscape(kit: SocialKit): Promise<Buffer> | null {
  const items = kit.radar.slice(0, RADAR_CARD_ROWS);
  if (items.length === 0) return null;
  const half = Math.ceil(items.length / 2);
  const columns = [items.slice(0, half), items.slice(half)].filter((c) => c.length > 0);
  const colW = (LANDSCAPE.width - L_PAD_X * 2 - 64 - 1) / 2;
  return render(
    <Frame padX={L_PAD_X} padY={L_PAD_Y}>
      <Masthead size={40} folio={`Sunday special  ·  Week of ${folioRange(kit)}`} folioSize={18} />
      <div
        style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 24, marginBottom: 6 }}
      >
        <LineHeadline
          text="Weekly radar"
          width={420}
          size={44}
          lineHeight={1.05}
          maxLines={1}
          tracking={EN_DISPLAY_TRACKING}
        />
        <div style={{ display: "flex", color: INK_SOFT, fontWeight: 500 }}>
          <Glyphs text="Top repos, models and papers from the week’s issues" size={19} />
        </div>
      </div>
      <div style={{ height: 2, background: INK, marginTop: 10 }} />
      <div style={{ display: "flex", flexGrow: 1 }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{ display: "flex" }}>
            {ci > 0 && <div style={{ width: 1, background: HAIRLINE, margin: "0 32px" }} />}
            <div style={{ display: "flex", flexDirection: "column", width: colW }}>
              {col.map((item, i) => (
                <div
                  key={item.id}
                  style={{ display: "flex", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}
                >
                  <RadarCell item={item} width={colW} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 14,
          borderTop: `1px solid ${HAIRLINE}`,
          color: MUTED,
          fontWeight: 500,
        }}
      >
        <Glyphs text={issueRange(kit)} size={15} />
        <div style={{ display: "flex", color: INK, fontWeight: 700 }}>
          <Glyphs text={displaySite(kit.site)} size={16} />
        </div>
      </div>
    </Frame>,
    LANDSCAPE,
  );
}

// ─── 기사 카드 ───────────────────────────────────────────────────────────────

const STORY_FITS: readonly HeadlineFit[] = [
  { size: 64, maxLines: 2 },
  { size: 58, maxLines: 3 },
  { size: 54, maxLines: 3 },
  { size: 50, maxLines: 3 },
  { size: 46, maxLines: 4 },
  { size: 42, maxLines: 4 },
];

/** 'YYYY-MM-DD' → "Oct 28, 2026". */
const shortDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return `${EN_MONTHS_SHORT[m - 1]} ${d}, ${y}`;
};

/** 기사 카드: 마스트헤드 → 번호·분야 키커 → 큰 헤드라인 → 첫 문장(2줄) → 바이라인 `KOREA · AI Times · 날짜`. */
export function storyLandscape(kit: SocialKit, story: SocialStory, n: number): Promise<Buffer> {
  const width = LANDSCAPE.width - L_PAD_X * 2;
  const title = typo(story.title);
  const fit = fitHeadline(title, width, STORY_FITS, latinCharEm(EN_DISPLAY_TRACKING));
  return render(
    <Frame padX={L_PAD_X} padY={L_PAD_Y}>
      <Masthead size={40} folio={`Korea Desk  ·  Week of ${folioRange(kit)}`} folioSize={18} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flexGrow: 1,
          padding: "20px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", color: BRAND, fontWeight: 700 }}>
            <Glyphs text={`${n} of ${kit.korea.length}`} size={21} />
          </div>
          <div style={{ width: 1.5, height: 20, background: HAIRLINE }} />
          <div style={{ display: "flex", color: BRAND, fontWeight: 700 }}>
            <Glyphs text={categoryLabel(story.category, "en")} size={21} />
          </div>
        </div>
        <LineHeadline
          text={title}
          width={width}
          size={fit.size}
          lineHeight={1.1}
          maxLines={fit.maxLines}
          tracking={EN_DISPLAY_TRACKING}
        />
        {fit.maxLines <= 3 && (
          <div style={{ display: "flex", marginTop: 20 }}>
            <SansParagraph
              text={firstSentence(story.summary)}
              width={940}
              size={22}
              lineHeight={1.5}
              maxLines={fit.maxLines <= 2 ? 3 : 2}
            />
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 16,
          borderTop: `2px solid ${INK}`,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 20, fontWeight: 700 }}
        >
          {story.korea && <KoreaMark size={16} />}
          {story.korea && <span style={{ color: MUTED, fontWeight: 500 }}>·</span>}
          <Glyphs text={story.source} size={20} />
          <span style={{ color: MUTED, fontWeight: 500 }}>·</span>
          <div style={{ display: "flex", color: MUTED, fontWeight: 500 }}>
            <Glyphs text={shortDate(story.issueDate)} size={20} />
          </div>
        </div>
        <div style={{ display: "flex", color: MUTED, fontWeight: 500 }}>
          <Glyphs text={displaySite(kit.site)} size={17} />
        </div>
      </div>
    </Frame>,
    LANDSCAPE,
  );
}
