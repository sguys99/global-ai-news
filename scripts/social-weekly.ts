/**
 * 주간 SNS 키트 CLI (english-version-plan Phase 8-2) — 일요일 호가 나온 뒤 한 주의 Korea Desk 하이라이트·주간 레이더로
 * X·LinkedIn·Reddit·HN 글 초안(posts.md)과 카드 이미지(PNG)를 만든다. **어디에도 올리지 않는다** — 사람이 검토해 손으로 올린다.
 * 선정은 scripts/lib/social/select.ts, 글은 text.ts, 카드는 cards.tsx. DB 는 src/lib/db.ts 로 읽기만 한다.
 *
 * 실행: npm run social:weekly -- [--week YYYY-MM-DD(일요일)] [--partial] [--out data/social] [--locale en]
 *                                [--show-hn] [--no-images] [--no-story-cards] [--site <배포 주소>]
 *
 *   --week        그 일요일로 끝나는 KST 월~일 주. 기본: DB 의 가장 최근 일요일 호.
 *   --partial     일요일 호가 아직 없으면 월요일 ~ DB 최신 호로 만든다(없으면 오류로 멈춘다).
 *   --out         출력 루트(기본 data/social, git 제외) — <out>/<일요일>/posts.md·card-*.png·story-N.png·kit.json.
 *   --locale      en 만 지원한다(영어권 확산용 키트).
 *   --show-hn     Hacker News 제출 초안(출시 때 한 번)을 posts.md 에 더한다.
 *   --no-images   글 초안만(카드 렌더는 Google Fonts 에서 폰트를 받는다 — 오프라인이면 이걸로).
 *   --no-story-cards  기사별 카드(story-N.png)를 만들지 않는다.
 *   --site        링크의 사이트 주소(기본 https://sguys99.github.io/global-ai-news).
 *
 * 예: npm run social:weekly -- --week 2026-11-01 --show-hn
 *     npm run social:weekly -- --week 2026-11-08 --partial
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hasEnglish } from "../src/lib/articleText";
import { getEditionRefs, getFollowUpThread, getIssueArticles } from "../src/lib/db";
import { buildEdition } from "../src/lib/edition";
import { isKoreaSubject, koreaSubjectNames, koreaSubjectPattern } from "../src/lib/koreaDesk";
import { CONFIGS_DIR, DATA_DIR, PROMPTS_DIR } from "../src/lib/paths";
import type { ArticleCard } from "../src/lib/types";
import { weeklyMetaBlock } from "../src/lib/weeklyRadar";
import { sourceDisplayName, englishSource } from "../src/lib/labels";
import { loadWeeklyRadar, localeArticles } from "../src/views/data";
import {
  eventKeyFromThreads,
  latestSundayIssue,
  resolveWeek,
  selectKoreaHighlights,
  selectWeekLeads,
  toSocialRadar,
  toSocialStory,
  type SocialStory,
} from "./lib/social/select";
import {
  DEFAULT_SITE_URL,
  buildDrafts,
  renderPostsMarkdown,
  type SocialKit,
} from "./lib/social/text";

interface Args {
  week?: string;
  partial: boolean;
  out: string;
  locale: string;
  showHn: boolean;
  images: boolean;
  storyCards: boolean;
  site: string;
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    week: value("--week"),
    partial: argv.includes("--partial"),
    out: value("--out") ?? path.join(DATA_DIR, "social"),
    locale: value("--locale") ?? "en",
    showHn: argv.includes("--show-hn"),
    images: !argv.includes("--no-images"),
    storyCards: !argv.includes("--no-story-cards"),
    site: value("--site") ?? DEFAULT_SITE_URL,
  };
}

/** 한국 주제 판정식(영어판 Korea Desk 와 같은 용어집 기반 — views/data.ts koreaSubjectRe 와 같은 입력). */
function koreaPattern(): RegExp {
  try {
    return koreaSubjectPattern(
      koreaSubjectNames(readFileSync(path.join(PROMPTS_DIR, "glossary.en.md"), "utf8")),
    );
  } catch {
    return koreaSubjectPattern([]);
  }
}

/** 켜진 수집 소스 수(configs/sources.json). */
function enabledSourceCount(): number {
  try {
    const sources = JSON.parse(readFileSync(path.join(CONFIGS_DIR, "sources.json"), "utf8")) as {
      enabled?: number | boolean;
    }[];
    // enabled 는 1/0(admin 스키마) — 비어 있으면 켜진 것으로 본다(syncSources 와 같다).
    return sources.filter((s) => s.enabled === undefined || Boolean(s.enabled)).length;
  } catch {
    return 0;
  }
}

/** 레이더 메타(식별자·수치)를 한 줄 문자열로 — 사이트 주간 레이더 행과 같은 표기("당일 +N" → "That day +N"). */
function radarMetaText(item: Parameters<typeof weeklyMetaBlock>[0]) {
  const block = weeklyMetaBlock(item, sourceDisplayName(englishSource(item.source), "en"), "en");
  return { ident: block.id?.value, stats: block.stats.map((s) => s.text) };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.locale !== "en") {
    console.error(`--locale 은 en 만 지원합니다(받은 값: ${args.locale}).`);
    return 1;
  }

  const refs = getEditionRefs();
  const issueDates = refs.map((r) => r.date);
  const sunday = args.week ?? latestSundayIssue(issueDates);
  if (!sunday) {
    console.error("DB 에 일요일 호가 없습니다 — --week 와 --partial 로 지정하세요.");
    return 1;
  }
  let week;
  try {
    week = resolveWeek(sunday, issueDates, { partial: args.partial });
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  // 그 주 영어판 기사(호 날짜와 함께)와 날마다 영어판 1면 리드.
  const pattern = koreaPattern();
  const koreaSubject = (a: ArticleCard) => isKoreaSubject(a, pattern);
  const stories: SocialStory[] = [];
  const dailyLeads: SocialStory[] = [];
  for (const date of week.dates) {
    const issue = localeArticles("en", getIssueArticles(date));
    for (const a of issue) {
      const s = toSocialStory(a, date, koreaSubject);
      if (s) stories.push(s);
    }
    const lead = buildEdition(issue).lead;
    const leadStory = lead && hasEnglish(lead) ? toSocialStory(lead, date, koreaSubject) : null;
    if (leadStory) dailyLeads.push(leadStory);
  }

  // 한 사건 = 후속 보도 타임라인(follow_up_of 로 이어진 기사들).
  const eventOf = eventKeyFromThreads(
    stories.map((s) => getFollowUpThread(s.id).map((e) => e.id)).filter((ids) => ids.length > 1),
  );
  const korea = selectKoreaHighlights(stories, eventOf);
  if (korea.length === 0) {
    console.error(
      `${week.start} ~ ${week.through}: 영어가 있는 한국 매체 기사가 없어 키트를 만들 수 없습니다.`,
    );
    return 1;
  }
  const leads = selectWeekLeads(dailyLeads, korea, eventOf);
  const radar = toSocialRadar(loadWeeklyRadar("en", week.end), radarMetaText);

  const weekRefs = refs.filter((r) => week.dates.includes(r.date));
  const kit: SocialKit = {
    site: args.site,
    week,
    issueNos: { first: weekRefs[0].issueNo, last: weekRefs.at(-1)!.issueNo },
    counts: { stories: stories.length, korean: stories.filter((s) => s.korea).length },
    sourceCount: enabledSourceCount(),
    korea,
    leads,
    radar,
  };

  const outDir = path.resolve(args.out, week.end);
  mkdirSync(outDir, { recursive: true });

  // 카드 — 폰트를 받지 못하면 글만 남기고 알린다.
  const images: string[] = [];
  if (args.images) {
    try {
      const cards = await import("./lib/social/cards");
      const write = (name: string, buf: Buffer) => {
        writeFileSync(path.join(outDir, name), buf);
        images.push(name);
      };
      write("card-landscape.png", await cards.koreaDeskLandscape(kit));
      write("card-portrait.png", await cards.koreaDeskPortrait(kit));
      const radarCard = cards.weeklyRadarLandscape(kit);
      if (radarCard) write("card-radar.png", await radarCard);
      if (args.storyCards) {
        for (const [i, s] of korea.entries()) {
          write(`story-${i + 1}.png`, await cards.storyLandscape(kit, s, i + 1));
        }
      }
    } catch (err) {
      console.error(`카드 렌더 실패(글 초안은 계속 만든다): ${(err as Error).message}`);
    }
  }

  const drafts = buildDrafts(kit, { showHn: args.showHn });
  const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  writeFileSync(
    path.join(outDir, "posts.md"),
    renderPostsMarkdown(kit, drafts, { images, generatedAt }),
  );
  writeFileSync(
    path.join(outDir, "kit.json"),
    `${JSON.stringify({ generatedAt, ...kit }, null, 2)}\n`,
  );

  console.log(
    [
      `[social] ${week.start} ~ ${week.through}${week.partial ? " (부분 주)" : ""} · 제${kit.issueNos.first}~${kit.issueNos.last}호`,
      `  영어판 기사 ${kit.counts.stories}건(한국 매체 ${kit.counts.korean}) → Korea Desk ${korea.length} · 리드 ${leads.length} · 레이더 ${radar.length}`,
      ...korea.map((s, i) => `  ${i + 1}. [${s.source}] ${s.title}`),
      `  → ${path.relative(process.cwd(), outDir)}/posts.md${images.length ? ` + ${images.join(", ")}` : ""}`,
    ].join("\n"),
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
