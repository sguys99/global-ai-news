/**
 * 주간 SNS 키트 글 초안(english-version-plan Phase 8-2) — X 스레드·LinkedIn·Reddit·Hacker News 를 순수 함수로 만든다.
 * 사람이 검토해 손으로 올린다(이 코드는 어디에도 올리지 않는다).
 *
 * 규칙:
 *  - 모든 링크는 영어 페이지 절대 주소 + `?utm_source=<x|linkedin|reddit|hn>`. GoatCounter(count.js)가 utm_source 를
 *    리퍼러로 기록하고, 집계 경로는 쿼리를 떼므로(src/components/Analytics.tsx) 페이지 수는 갈라지지 않는다.
 *    canonical 은 쿼리 없는 주소라 검색 색인에도 영향이 없다.
 *  - X 글자 수는 twitter-text v3 가중 길이로 센다: URL 은 길이와 상관없이 23, 코드 포인트 0–4351·8192–8205·8208–8223·
 *    8242–8247 은 1, 나머지(한글·→·…·이모지)는 2, 한도 280(https://docs.x.com/fundamentals/counting-characters).
 *  - 영어 출력에 한글이 섞이면 실패한다(`assertNoHangul` — 영어판 한글 누출 검사와 같은 판정).
 *  - 문체: 과장 없는 영어(“breakthrough”·“game-changer” 없음), 이모지 없음, 해시태그는 LinkedIn 끝 3개만.
 */
import { containsHangul } from "../enHangulCheck";
import {
  categoryLabel,
  EN_MONTHS_SHORT,
  EN_WEEKDAYS,
  FORMAT_BADGES,
} from "../../../src/lib/labels";
import type { SocialRadarItem, SocialStory, SocialWeek } from "./select";

/** 배포 사이트 절대 주소(basePath 포함) — next.config 의 SITE_ORIGIN + BASE_PATH 와 같다. `--site` 로 바꾼다. */
export const DEFAULT_SITE_URL = "https://sguys99.github.io/global-ai-news";
/** 공개 저장소(HN 첫 댓글 — 파이프라인을 직접 볼 수 있게). */
export const REPO_URL = "https://github.com/sguys99/global-ai-news";

export const CHANNELS = ["x", "linkedin", "reddit", "hn"] as const;
export type Channel = (typeof CHANNELS)[number];

// ─── 주소 ────────────────────────────────────────────────────────────────────

/** 주소에 utm_source 를 단다(기존 쿼리·해시 유지, 이미 있으면 바꾼다). */
export function withUtm(url: string, channel: Channel): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", channel);
  return u.toString();
}

const trimSite = (site: string) => site.replace(/\/+$/, "");

/** 영어 홈 `/en/`. */
export const enHomeUrl = (site: string, channel: Channel) =>
  withUtm(`${trimSite(site)}/en/`, channel);
/** 영어 기사 `/en/article/<id>/`. */
export const enArticleUrl = (site: string, id: number, channel: Channel) =>
  withUtm(`${trimSite(site)}/en/article/${id}/`, channel);
/** 영어 호 `/en/edition/<날짜>/`. */
export const enEditionUrl = (site: string, date: string, channel: Channel) =>
  withUtm(`${trimSite(site)}/en/edition/${date}/`, channel);
/** 글 본문에 보이는 사이트 주소(스킴 없이) — 카드 꼬리말. */
export const displaySite = (site: string) => `${trimSite(site).replace(/^https?:\/\//, "")}/en`;

/**
 * 주를 대표하는 링크: 전체 주면 일요일 영어 호(주간 레이더가 실린 지면), 부분 주면 영어 홈(그 주 일요일 호는 아직 없다).
 */
export function weekUrl(site: string, week: SocialWeek, channel: Channel): string {
  return week.partial ? enHomeUrl(site, channel) : enEditionUrl(site, week.end, channel);
}

// ─── 날짜 ────────────────────────────────────────────────────────────────────

const parseKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d, w: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** 주 기간: "Nov 2–8, 2026" · "Oct 26 – Nov 1, 2026" · "Dec 28, 2026 – Jan 3, 2027". */
export function weekRange(start: string, end: string): string {
  const a = parseKey(start);
  const b = parseKey(end);
  const mon = (m: number) => EN_MONTHS_SHORT[m - 1];
  if (a.y !== b.y) return `${mon(a.m)} ${a.d}, ${a.y} – ${mon(b.m)} ${b.d}, ${b.y}`;
  if (a.m !== b.m) return `${mon(a.m)} ${a.d} – ${mon(b.m)} ${b.d}, ${b.y}`;
  return `${mon(a.m)} ${a.d}–${b.d}, ${b.y}`;
}

/** "Week of Oct 26 – Nov 1, 2026", 부분 주는 "Week of Nov 2–8, 2026 (through Saturday)". */
export function weekLabel(week: Pick<SocialWeek, "start" | "end" | "partial" | "through">): string {
  const base = `Week of ${weekRange(week.start, week.end)}`;
  return week.partial ? `${base} (through ${EN_WEEKDAYS[parseKey(week.through).w]})` : base;
}

// ─── 글자 수 ─────────────────────────────────────────────────────────────────

/** X(t.co)가 바꾸는 링크 길이. */
export const X_URL_LENGTH = 23;
export const X_LIMIT = 280;
const X_LIGHT_RANGES: readonly [number, number][] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];
const URL_RE = /https?:\/\/\S+/g;
/** 스킴 없는 도메인 — X 가 링크로 바꿀 수 있다(예: "Character.ai"). 23 과 실제 길이 중 큰 쪽으로 센다(넘치지 않게). */
const BARE_DOMAIN_RE =
  /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|ai|co|kr|dev|app|me|so|tv|ly|xyz|tech|news|info|gg)\b(?:\/\S*)?/gi;

const weightOf = (text: string) =>
  Array.from(text).reduce((sum, ch) => {
    const cp = ch.codePointAt(0)!;
    return sum + (X_LIGHT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 1 : 2);
  }, 0);

/** twitter-text v3 가중 길이(링크 23). */
export function xLength(text: string): number {
  let n = 0;
  const rest = text.normalize("NFC").replace(URL_RE, () => {
    n += X_URL_LENGTH;
    return "";
  });
  const bare = rest.replace(BARE_DOMAIN_RE, (m) => {
    n += Math.max(X_URL_LENGTH, weightOf(m));
    return "";
  });
  return n + weightOf(bare);
}

/** 낱말 수(LinkedIn 분량) — 링크·해시태그도 한 낱말. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// ─── 문장 ────────────────────────────────────────────────────────────────────

/** 마침표 뒤에서 끊지 않는 약어(대소문자 무시) — "U.S. chipmakers" 를 두 문장으로 보지 않게. */
const ABBREVIATIONS = new Set([
  "u.s",
  "u.k",
  "u.n",
  "e.u",
  "inc",
  "co",
  "corp",
  "ltd",
  "jr",
  "sr",
  "dr",
  "mr",
  "ms",
  "no",
  "vs",
  "e.g",
  "i.e",
  "st",
  "approx",
]);

/** 요약의 첫 문장(끝 구두점 포함). 나눌 곳이 없으면 전체. */
export function firstSentence(text: string): string {
  const t = text.trim();
  const re = /([.!?])["”’)]?\s+(?=["“‘(]?[A-Z0-9])/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const before = t.slice(0, m.index);
    const word = before.split(/\s+/).at(-1)?.toLowerCase() ?? "";
    if (m[1] === "." && (ABBREVIATIONS.has(word) || /^[a-z]$/i.test(word))) continue;
    return t.slice(0, m.index + m[0].trimEnd().length);
  }
  return t;
}

/**
 * 낱말 경계에서 잘라 `measure(결과) ≤ max` 가 되게 하고 "…" 를 붙인다(끝 쉼표·마침표는 뗀다). 이미 들어가면 그대로.
 * 한 낱말도 못 넣으면 빈 문자열.
 */
export function truncateWords(text: string, max: number, measure: (s: string) => number): string {
  if (measure(text) <= max) return text;
  const words = text.split(/\s+/);
  while (words.length > 0) {
    words.pop();
    const head = words.join(" ").replace(/[\s,.;:—–-]+$/, "");
    if (head && measure(`${head}…`) <= max) return `${head}…`;
  }
  return "";
}

// ─── 한글 검사 ───────────────────────────────────────────────────────────────

/** 영어 출력에 한글이 있으면 던진다 — 어느 조각인지 앞부분을 문구에 담는다. */
export function assertNoHangul(parts: Record<string, string>): void {
  const bad = Object.entries(parts).filter(([, text]) => containsHangul(text));
  if (bad.length > 0) {
    throw new Error(
      `영어 출력에 한글이 있습니다: ${bad.map(([k, t]) => `${k} — ${t.slice(0, 60)}`).join(" / ")}`,
    );
  }
}

// ─── 키트 ────────────────────────────────────────────────────────────────────

export interface SocialKit {
  site: string;
  week: SocialWeek;
  /** 이 주 첫 호·마지막 호 번호. */
  issueNos: { first: number; last: number };
  /** 이 주 영어판 기사 수·그중 한국 매체 수. */
  counts: { stories: number; korean: number };
  /** 켜져 있는 수집 소스 수(configs/sources.json — HN 첫 댓글). */
  sourceCount: number;
  korea: SocialStory[];
  leads: SocialStory[];
  radar: SocialRadarItem[];
}

/** 레이더 행의 짧은 이름 — 식별자(owner/repo·org/model)가 있으면 그것, 논문은 제목(arXiv ID 는 읽히지 않는다). */
export function radarShortName(item: SocialRadarItem): string {
  return item.ident && item.format !== "paper" ? item.ident : item.title;
}

/** "Industry & Policy" · 레이더 형식 배지 표기 없이 분야명만. */
const kicker = (s: Pick<SocialStory, "category">) => categoryLabel(s.category, "en");

// ─── X ───────────────────────────────────────────────────────────────────────

/** X 스레드: 머리 1 + 하이라이트마다 1 + 맺음(레이더·리드·매일 발행) 1. 모든 글 ≤ 280(가중). */
export function buildXThread(kit: SocialKit): string[] {
  const { site, week, korea } = kit;
  const range = weekRange(week.start, week.end);
  const n = korea.length;
  const head = [
    `What Korea's tech press reported this week, in English: ${n === 1 ? "one story" : `${n} stories`} from the AI Daybook Korea Desk (${range}${week.partial ? ", so far" : ""}).`,
    `A thread, one story per post:`,
    weekUrl(site, week, "x"),
  ].join("\n\n");

  const posts = [head];
  korea.forEach((s, i) => {
    const url = enArticleUrl(site, s.id, "x");
    const lead = `${i + 1}/${n} ${s.title}`;
    const by = `Via ${s.source} (in Korean)\n${url}`;
    const compose = (dek: string) => [lead, dek, by].filter(Boolean).join("\n\n");
    // 요약 첫 문장은 통째로 들어갈 때만 싣는다 — 문장 중간에서 "…" 로 끊긴 글은 성의 없어 보인다(제목만으로도 한 글이 된다).
    const sentence = firstSentence(s.summary);
    let post = xLength(compose(sentence)) <= X_LIMIT ? compose(sentence) : compose("");
    if (xLength(post) > X_LIMIT) {
      // 제목이 아주 길면 요약 없이, 그래도 넘치면 제목을 줄인다.
      const titleRoom = X_LIMIT - xLength(`${i + 1}/${n} \n\n${by}`);
      post = [`${i + 1}/${n} ${truncateWords(s.title, titleRoom, xLength)}`, by].join("\n\n");
    }
    posts.push(post);
  });

  posts.push(buildXClosing(kit));
  return posts;
}

/** 맺음 글: 이 주 레이더 상위(들어가는 만큼) + 매일 06:00 KST 발행 안내 + 홈 링크. */
function buildXClosing(kit: SocialKit): string {
  const tail = `A new issue every morning at 06:00 KST, free and without ads:\n${enHomeUrl(kit.site, "x")}`;
  const radar = kit.radar.map((r) => `${r.rank}. ${radarShortName(r)}`);
  for (let k = radar.length; k >= 1; k -= 1) {
    const text = [
      `Also on this week's open-source radar:\n${radar.slice(0, k).join("\n")}`,
      tail,
    ].join("\n\n");
    if (xLength(text) <= X_LIMIT) return text;
  }
  return tail;
}

// ─── LinkedIn ────────────────────────────────────────────────────────────────

export const LINKEDIN_WORDS = { min: 150, max: 250 } as const;

/**
 * LinkedIn 글: 짧은 단락, 번호 목록(제목 + 첫 문장 + 매체), 링크는 본문 끝 한 번, 해시태그 3개. 250 낱말을 넘으면 뒤 기사부터
 * 첫 문장을 뗀다. 마크다운은 쓰지 않는다(LinkedIn 은 그리지 않는다).
 */
export function buildLinkedIn(kit: SocialKit): string {
  const { site, week, korea, leads } = kit;
  const range = weekRange(week.start, week.end);
  const deks = korea.map((s) => firstSentence(s.summary));
  const compose = () =>
    [
      `Korea Desk, ${range}${week.partial ? " (so far)" : ""}`,
      `Much of what Korea's tech press reports about AI never makes it into English. AI Daybook summarizes it in English every morning. ${korea.length === 1 ? "Here is the story" : `Here are ${korea.length} stories`} worth knowing from this week:`,
      ...korea.map((s, i) =>
        [`${i + 1}. ${s.title} (${s.source})`, deks[i]].filter(Boolean).join("\n"),
      ),
      ...(leads.length > 0
        ? [`Elsewhere this week: ${leads.map((s) => s.title).join("; ")}.`.replace(/\.\.$/, ".")]
        : []),
      `The full week, with links to every original report: ${weekUrl(site, week, "linkedin")}`,
      `AI Daybook is a free side project I build and run. Stories are collected and summarized automatically, and every item links to its source.`,
      `#AI #SouthKorea #TechNews`,
    ].join("\n\n");
  let text = compose();
  for (let i = deks.length - 1; i >= 0 && wordCount(text) > LINKEDIN_WORDS.max; i -= 1) {
    deks[i] = "";
    text = compose();
  }
  return text;
}

// ─── Reddit ──────────────────────────────────────────────────────────────────

export const REDDIT_TITLE_LIMIT = 300;

/**
 * Reddit 글(값이 먼저, 관계 공개는 끝에 분명히): 제목 + 마크다운 본문. 기사마다 영어 요약 전문과 **원문(한국어) 링크를 먼저**,
 * 우리 영어 페이지는 그다음. 홍보 링크는 끝의 주 링크 한 번뿐이다.
 */
export function buildReddit(kit: SocialKit): { title: string; body: string } {
  const { site, week, korea } = kit;
  const range = weekRange(week.start, week.end);
  const title = `What Korea's tech press reported about AI this week (${range}), summarized in English`;
  const body = [
    `Korean-language AI news rarely gets translated, so here are ${korea.length === 1 ? "the story" : `${korea.length} stories`} from Korean outlets this week that seemed worth knowing, each with a short English summary:`,
    ...korea.map((s, i) =>
      [
        `**${i + 1}. ${s.title}**`,
        "",
        s.summary,
        "",
        `[Original report, ${s.source} (Korean)](${s.url}) · [English summary](${enArticleUrl(site, s.id, "reddit")})`,
      ].join("\n"),
    ),
    "---",
    `Disclosure: I made AI Daybook, a free, ad-free side project that collects AI news every morning and summarizes Korean-language stories in English. The summaries are written by an LLM (Claude Haiku) from the original articles and pass automated number and language checks, but they can still be wrong, so the original is linked first. The whole week is here: ${weekUrl(site, week, "reddit")}`,
    `Corrections and suggestions for Korean sources are very welcome.`,
  ].join("\n\n");
  return { title: truncateWords(title, REDDIT_TITLE_LIMIT, (s) => s.length), body };
}

// ─── Hacker News ─────────────────────────────────────────────────────────────

/** HN 제목 한도(제출 양식이 80자에서 막는다 — 공식 문서에는 없고 양식 제약). */
export const HN_TITLE_LIMIT = 80;

/**
 * HN 제출 초안(출시 때 한 번). Show HN 규칙상 "읽을거리·목록"은 Show HN 이 아니므로 기본은 일반 제출이고, Show HN 은
 * 공개 저장소(직접 돌려 볼 수 있는 파이프라인)를 앞세운 변형이다 — 어느 쪽을 쓸지는 8-2 계획서의 판단을 따른다.
 * 첫 댓글은 배경 → 무엇이 다른가 → 어떻게 만드나 → 한계 → 바라는 피드백. 마케팅 말투 없음, 추천 부탁 없음.
 */
export function buildHackerNews(kit: SocialKit): {
  regular: { title: string; url: string };
  showHn: { title: string; url: string };
  comment: string;
} {
  const { site, counts, sourceCount } = kit;
  const comment = [
    `A lot of what Korea's AI industry is doing (chips, sovereign models, robotics, policy) is reported in Korean outlets days before it reaches English coverage, or never does. I built AI Daybook to read it alongside global AI news: a daily briefing with a "Korea Desk" of Korean-language stories summarized in English.`,
    `How it works: a GitHub Actions job runs at 06:00 KST, collects ${sourceCount} RSS and API sources (Korean and international news, GitHub trending, Hugging Face, arXiv), and has Claude Haiku pick up to 35 items, group duplicates, and write Korean and English summaries through the Message Batches API. Code checks reject English summaries whose numbers or amounts don't appear in the source. Everything is stored in a SQLite file committed to the repo and published as a static site on GitHub Pages, so a daily run costs under $0.10 and hosting is free.`,
    `This week's issues carried ${counts.stories} stories in English, ${counts.korean} of them from Korean outlets. There's no signup, no tracking cookies, and every item links to its original source.`,
    `Known limits: the summaries are machine-written and can be wrong (I review samples and fix errors), and Korean source coverage is still thin on some days. I'd like feedback on two things: whether the English reads naturally, and which Korean sources I'm missing.`,
    `Code: ${REPO_URL}`,
  ].join("\n\n");
  return {
    regular: {
      title: truncateWords(
        "AI Daybook: Korea's AI news, summarized in English every morning",
        HN_TITLE_LIMIT,
        (s) => s.length,
      ),
      url: enHomeUrl(site, "hn"),
    },
    showHn: {
      title: truncateWords(
        "Show HN: A $0.10/day LLM pipeline that publishes Korea's AI news in English",
        HN_TITLE_LIMIT,
        (s) => s.length,
      ),
      url: REPO_URL,
    },
    comment,
  };
}

// ─── posts.md ────────────────────────────────────────────────────────────────

export interface KitDrafts {
  x: string[];
  linkedin: string;
  reddit: { title: string; body: string };
  hn?: ReturnType<typeof buildHackerNews>;
}

/** 키트 전체 초안을 만들고 영어 출력의 한글을 검사한다. */
export function buildDrafts(
  kit: SocialKit,
  { showHn = false }: { showHn?: boolean } = {},
): KitDrafts {
  const drafts: KitDrafts = {
    x: buildXThread(kit),
    linkedin: buildLinkedIn(kit),
    reddit: buildReddit(kit),
  };
  if (showHn) drafts.hn = buildHackerNews(kit);
  assertNoHangul({
    ...Object.fromEntries(drafts.x.map((p, i) => [`x[${i}]`, p])),
    linkedin: drafts.linkedin,
    "reddit.title": drafts.reddit.title,
    "reddit.body": drafts.reddit.body,
    ...(drafts.hn
      ? {
          "hn.regular": drafts.hn.regular.title,
          "hn.show": drafts.hn.showHn.title,
          "hn.comment": drafts.hn.comment,
        }
      : {}),
  });
  return drafts;
}

const fence = (text: string) => ["```text", text, "```"].join("\n");

/**
 * posts.md — 검토용 한 파일. 머리(주·호·건수·이미지 목록) → X → LinkedIn → Reddit → (HN) → 올리기 전 확인 목록.
 * 설명 문구는 한국어(운영자용), 붙여 넣을 글은 코드 블록 안 영어.
 */
export function renderPostsMarkdown(
  kit: SocialKit,
  drafts: KitDrafts,
  { images = [], generatedAt }: { images?: string[]; generatedAt: string },
): string {
  const { week } = kit;
  const label = weekLabel(week);
  const lines: string[] = [
    `# AI Daybook 주간 SNS 키트 — ${label}`,
    "",
    `- 생성: ${generatedAt} · 호: 제${kit.issueNos.first}호 ~ 제${kit.issueNos.last}호 (${week.dates[0]} ~ ${week.through})`,
    `- 이 주 영어판 기사 ${kit.counts.stories}건(한국 매체 ${kit.counts.korean}건) · Korea Desk 하이라이트 ${kit.korea.length}건 · 리드 ${kit.leads.length}건 · 주간 레이더 ${kit.radar.length}건`,
    ...(week.partial
      ? [
          `- **부분 주**: ${week.end}(일요일) 호가 아직 없어 ${week.through}까지로 만들었다. 주 링크는 영어 홈을 가리킨다 — 일요일 호가 나온 뒤 다시 만들면 일요일 호 링크가 된다.`,
        ]
      : []),
    `- 이미지: ${images.length > 0 ? images.map((f) => `\`${f}\``).join(" · ") : "없음"}`,
    `- 링크는 모두 \`?utm_source=<채널>\` — GoatCounter 리퍼러로 채널별 유입을 본다(\`npm run kpi -- traffic\`).`,
    "",
    "## 이번 주 고른 기사",
    "",
    "| # | 제목 | 매체 | 분야 | 호 | 중요도 | 영어 페이지 |",
    "| - | ---- | ---- | ---- | -- | ------ | ----------- |",
    ...kit.korea.map(
      (s, i) =>
        `| ${i + 1} | ${s.title.replace(/\|/g, "\\|")} | ${s.source} | ${kicker(s)} | ${s.issueDate} | ${s.importance}${s.koreaSubject ? "" : " (해외 주제)"} | ${enArticleUrl(kit.site, s.id, "x").replace(/\?.*$/, "")} |`,
    ),
    "",
    ...(kit.leads.length > 0
      ? [
          "이 주의 리드(Korea Desk 밖):",
          "",
          ...kit.leads.map((s) => `- ${s.title} — ${s.source} (${s.issueDate})`),
          "",
        ]
      : []),
    ...(kit.radar.length > 0
      ? [
          "주간 레이더(상위):",
          "",
          ...kit.radar.map(
            (r) =>
              `- ${r.rank}. [${FORMAT_BADGES[r.format]}] ${r.title}${r.ident ? ` — \`${r.ident}\`` : ""}${r.stats ? ` · ${r.stats.join(" · ")}` : ""}`,
          ),
          "",
        ]
      : []),
    "## X 스레드",
    "",
    "첫 글에 `card-landscape.png` 를 붙이고, 나머지는 답글로 이어 단다(기사별 카드 `story-N.png` 는 선택). 괄호 안은 X 가중 글자 수(링크 23).",
    "",
    ...drafts.x.flatMap((post, i) => [
      `**${i === 0 ? "머리" : i === drafts.x.length - 1 ? "맺음" : `기사 ${i}`}** (${xLength(post)}/${X_LIMIT})`,
      "",
      fence(post),
      "",
    ]),
    "## LinkedIn",
    "",
    `\`card-portrait.png\` 를 붙인다. ${wordCount(drafts.linkedin)}낱말(목표 ${LINKEDIN_WORDS.min}~${LINKEDIN_WORDS.max}). 링크를 본문 대신 첫 댓글에 둘지는 계획서 참고.`,
    "",
    fence(drafts.linkedin),
    "",
    "## Reddit",
    "",
    "올리기 전에 그 서브레딧의 규칙(자기 홍보·추적 링크·주간 스레드)을 다시 본다. 추적 링크를 막는 곳이면 `?utm_source=reddit` 을 지운다.",
    "",
    `제목 (${drafts.reddit.title.length}/${REDDIT_TITLE_LIMIT}):`,
    "",
    fence(drafts.reddit.title),
    "",
    "본문(마크다운 편집기):",
    "",
    fence(drafts.reddit.body),
    "",
  ];
  if (drafts.hn) {
    const { regular, showHn, comment } = drafts.hn;
    lines.push(
      "## Hacker News (출시 때 한 번)",
      "",
      "Show HN 은 '직접 써 볼 수 있는 것'만 된다 — 뉴스 목록·읽을거리는 일반 제출이다(계획서 참고). 추천·댓글 부탁 금지.",
      "",
      `일반 제출 (${regular.title.length}/${HN_TITLE_LIMIT}):`,
      "",
      fence(`${regular.title}\n${regular.url}`),
      "",
      `Show HN 변형 — 공개 저장소(파이프라인)를 앞세울 때 (${showHn.title.length}/${HN_TITLE_LIMIT}):`,
      "",
      fence(`${showHn.title}\n${showHn.url}`),
      "",
      "첫 댓글(제출 직후 본인이 단다):",
      "",
      fence(comment),
      "",
    );
  }
  lines.push(
    "## 올리기 전 확인",
    "",
    "- [ ] 기사마다 영어 제목·요약을 원문과 대조했다(숫자·이름·시제).",
    "- [ ] 링크를 한 번씩 열어 본다(영어 페이지가 있는지, 404 아닌지).",
    "- [ ] 이미지의 줄바꿈·말줄임이 어색하지 않다.",
    "- [ ] 채널 규칙(자기 홍보 비율·주간 스레드·플레어)을 다시 확인했다.",
    "- [ ] 올린 시각과 주소를 기록해 둔다(2주차·4주차 리뷰).",
    "",
  );
  return lines.join("\n");
}
