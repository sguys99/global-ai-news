import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrontPage, SectionBands, WeeklyRadarBand, radarSubtitle } from "@/components/Edition";
import { IssueBrief, issueBriefHeading } from "@/components/IssueBrief";
import { IssueDelayNotice } from "@/components/IssueDelayNotice";
import { LocaleProvider } from "@/components/LocaleProvider";
import { Masthead } from "@/components/Masthead";
import { buildEdition, issueStats } from "@/lib/edition";
import { hasHangul } from "@/lib/labels";
import { radarMeta, radarMetaBlock } from "@/lib/radarMeta";
import type { ArticleCard } from "@/lib/types";
import {
  issueDayLabel,
  weekRangeLabel,
  weeklyFormatMix,
  weeklyMetaBlock,
  type WeeklyItem,
  type WeeklyRadar,
} from "@/lib/weeklyRadar";

/**
 * 영어판 1면·마스트헤드·세 줄 요약·주간 레이더·지연 안내(Phase 3-3 C단계 G1) — en 렌더에 한글 UI 문구가 없는지.
 * 기사 데이터도 영어(titleEn·summaryEn·영문 매체)로 만든다 — 한국어 제목은 데이터라 UI 검사 대상이 아니다.
 * ko 렌더가 그대로인지는 기존 테스트(FrontPage·WeeklyRadarBand·issueBrief·issueLabels·IssueDelayNotice)가 본다.
 */

let seq = 0;
function card(p: Partial<ArticleCard>): ArticleCard {
  seq += 1;
  return {
    id: seq,
    source: { id: "hn", name: "Hacker News" },
    url: "https://x",
    titleKo: `기사${seq}`,
    summaryKo: "요약",
    titleOriginal: `Original ${seq}`,
    titleEn: `English headline ${seq}`,
    summaryEn: `English summary ${seq}.`,
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 40,
    importance: 3,
    publishedAt: "2026-10-29T00:00:00Z",
    ...p,
  };
}

const issue = () => [
  ...[
    "llm",
    "agent",
    "industry",
    "research",
    "llm",
    "agent",
    "industry",
    "physical",
    "llm",
    "oss",
  ].map((category, i) => card({ category, importance: 5 - Math.floor(i / 3) })),
  card({
    format: "oss",
    category: "oss",
    importance: 5,
    source: { id: "gh", name: "GitHub Trending" },
    url: "https://github.com/vllm-project/vllm",
    engagement: { stars: 48836, stars_today: 1203, language: "Python" },
  }),
  card({
    format: "model",
    category: "llm",
    importance: 4,
    source: { id: "hfm", name: "HuggingFace 트렌딩 모델", nameEn: "HuggingFace Trending Models" },
    url: "https://huggingface.co/meta-llama/Llama-3.1-8B",
    engagement: { params: 8.03e9, likes: 1200, downloads: 54000, pipeline_tag: "text-generation" },
  }),
  card({
    format: "paper",
    category: "research",
    importance: 3,
    source: { id: "hfp", name: "HuggingFace Papers" },
    url: "https://huggingface.co/papers/2609.21967",
    engagement: { ups: 88, citations: 12 },
  }),
];

/** 보이는 글자 + 읽히는 속성(aria-label·title)에 한글이 있으면 그 조각을 돌려준다. */
function hangulIn(root: HTMLElement): string[] {
  const found: string[] = [];
  if (hasHangul(root.textContent ?? "")) found.push(`text: ${root.textContent}`);
  for (const el of root.querySelectorAll("*")) {
    for (const attr of ["aria-label", "title", "alt"]) {
      const v = el.getAttribute(attr);
      if (v && hasHangul(v)) found.push(`${attr}: ${v}`);
    }
  }
  return found;
}

describe("영어판 1면(FrontPage·SectionBands)", () => {
  it("en 렌더에 한글이 없고, 문구·링크가 영어판이다", () => {
    const edition = buildEdition(issue());
    const { container } = render(
      <>
        <FrontPage edition={edition} locale="en" />
        <SectionBands sections={edition.sections} locale="en" />
      </>,
    );
    expect(hangulIn(container)).toEqual([]);
    expect(screen.getByRole("region", { name: "Front page" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Today's briefing" })).toBeInTheDocument();
    const radar = screen.getByRole("region", { name: "Open source & papers radar" });
    expect(within(radar).getByText("Repos, models and papers in this issue")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trending now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: edition.lead!.titleEn! })).toBeInTheDocument();
    // 내부 링크는 /en 접두(테스트의 next/link 는 `/en/?q` 의 끝 슬래시를 떼어 `/en?q` 로 그린다)
    const hrefs = [...container.querySelectorAll("a[href^='/']")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((h) => /^\/en[/?]/.test(h!))).toBe(true);
    // 레이더 메타 레일의 스크린리더 문구
    expect(container.textContent).toContain("Stars: 48,836");
    expect(container.textContent).toContain("Parameters: about 8 billion");
  });

  it("섹션 밴드 머리: 건수·1면 게재 수·분야 전체 링크", () => {
    const edition = buildEdition(issue());
    render(<SectionBands sections={edition.sections} locale="en" />);
    const s = edition.sections[0];
    const links = screen.getAllByRole("link", { name: "All stories in this section →" });
    expect(links[0].getAttribute("href")).toMatch(
      new RegExp(`^/en/?\\?category=${encodeURIComponent(s.category)}$`),
    );
  });
});

describe("영어판 마스트헤드·세 줄 요약", () => {
  it("폴리오·귀·섹션 내비가 영어(31 stories · 18 outlets 꼴)", () => {
    const articles = issue();
    const edition = buildEdition(articles);
    // 안쪽 클라이언트 컴포넌트(공유 버튼·지연 안내)는 영어 레이아웃의 LocaleProvider 로 언어를 읽는다.
    const { container } = render(
      <LocaleProvider locale="en">
        <Masthead
          issueNo={140}
          publishedAt="2026-11-02T21:30:00Z"
          stats={issueStats(articles)}
          categories={edition.sections.map((s) => s.category)}
          weekly
          locale="en"
        />
      </LocaleProvider>,
    );
    expect(hangulIn(container)).toEqual([]);
    expect(container.textContent).toContain("Tuesday, November 3, 2026");
    expect(container.textContent).toContain("No. 140");
    expect(container.textContent).toContain("Published daily at 06:00 KST");
    const ear = screen.getByTestId("issue-ear");
    expect(ear.textContent).toContain("13 stories · 4 outlets");
    // 영어 둘째 줄은 비뉴스만(DESIGN.md §9 영어판 "형식 귀") — 첫 줄 "13 stories" 와 낱말이 겹치지 않게.
    expect(ear.lastElementChild!.textContent).toBe("1 repo·1 model·1 paper");
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const labels = within(nav)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(labels[0]).toBe("Front page");
    expect(labels[1]).toBe("Weekly radar");
    expect(labels.at(-1)).toBe("All stories");
    // next/link 가 테스트에서 끝 슬래시를 뗀다(빌드는 trailingSlash 로 붙인다).
    expect(screen.getByTitle("Permalink to this issue").getAttribute("href")).toMatch(
      /^\/en\/edition\/2026-11-03\/?$/,
    );
  });

  it("세 줄 요약 띠: 머리·보조 문구·링크", () => {
    const { container } = render(
      <IssueBrief
        lines={[
          { id: 1, text: "First line" },
          { id: 2, text: "Second line" },
        ]}
        locale="en"
      />,
    );
    expect(hangulIn(container)).toEqual([]);
    expect(screen.getByRole("heading", { name: "Two things to know" })).toBeInTheDocument();
    expect(screen.getByText("This issue at a glance")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /First line/ }).getAttribute("href")).toBe(
      "/en/article/1/",
    );
    expect(issueBriefHeading(3, "en")).toBe("Three things to know");
    expect(issueBriefHeading(3)).toBe("세 줄 요약");
  });
});

describe("영어판 발행 지연 안내(LocaleProvider)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("영어 레이아웃 컨텍스트에서는 영어 라벨", () => {
    vi.setSystemTime(new Date("2026-10-27T05:00:00Z")); // 14:00 KST
    render(
      <LocaleProvider locale="en">
        <IssueDelayNotice issueDate="2026-10-25" issueNo={131} initialGap={2} />
      </LocaleProvider>,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Delayed");
    expect(hasHangul(status.textContent ?? "")).toBe(false);
  });
});

describe("영어판 주간 레이더", () => {
  const item = (id: number, p: Partial<WeeklyItem> = {}): WeeklyItem => ({
    id,
    title: `주간${id}`,
    titleEn: `Weekly pick ${id}`,
    format: "paper",
    category: "research",
    source: { name: "HuggingFace Papers" },
    url: `https://huggingface.co/papers/2610.${30000 + id}`,
    engagement: { ups: 100 + id },
    issueDate: "2026-10-27",
    ...p,
  });
  const weekly: WeeklyRadar = {
    start: "2026-10-26",
    end: "2026-11-01",
    items: [
      item(1, {
        format: "oss",
        url: "https://github.com/o/r",
        source: { name: "GitHub Trending" },
        engagement: { stars: 900, stars_today: 120 },
      }),
      item(2),
      item(3),
      item(4),
    ],
    candidates: 23,
    formats: [
      { format: "oss", count: 1 },
      { format: "paper", count: 3 },
    ],
  };

  it("밴드 머리·각주·행이 영어이고 한글이 없다", () => {
    const { container } = render(<WeeklyRadarBand weekly={weekly} locale="en" />);
    expect(hangulIn(container)).toEqual([]);
    const band = screen.getByRole("region", { name: "Weekly radar" });
    expect(within(band).getByText("Sunday special")).toBeInTheDocument();
    expect(within(band).getByText("Oct 26 – Nov 1 · 1 repo · 3 papers")).toBeInTheDocument();
    expect(band.textContent).toContain("Picked from 23 repos, models and papers");
    expect(band.textContent).toContain("Tuesday issue");
    expect(band.textContent).toContain("That day");
    expect(screen.getByRole("heading", { name: "Weekly pick 1" })).toBeInTheDocument();
    expect(within(band).getAllByRole("link")[0].getAttribute("href")).toBe("/en/article/1/");
  });

  it("순수 함수 영어판 — ko 기본값은 그대로", () => {
    expect(issueDayLabel("2026-10-20", "en")).toBe("Tuesday issue");
    expect(issueDayLabel("2026-10-20")).toBe("화요일 호");
    expect(weekRangeLabel("2026-10-26", "2026-11-01", "en")).toBe("Oct 26 – Nov 1");
    expect(weeklyFormatMix([{ format: "model", count: 1 }], "en")).toBe("1 model");
    const block = weeklyMetaBlock(weekly.items[0], "GitHub", "en");
    expect(block.stats.map((m) => m.text)).toEqual(["★ 900", "That day +120"]);
    expect(block.stats[1].label).toBe("New stars that day: 120");
  });
});

describe("영어판 레이더 메타·보조 문구", () => {
  it("radarMeta en: 낱말·label 이 영어, 화면 값은 같은 표기", () => {
    const meta = radarMeta(
      {
        format: "oss",
        url: "https://github.com/vllm-project/vllm",
        engagement: { stars: 48836, stars_today: 1203, language: "Python" },
      },
      "en",
    );
    expect(meta.map((m) => m.text)).toEqual([
      "vllm-project/vllm",
      "★ 48.8k",
      "Today +1,203",
      "Python",
    ]);
    expect(meta.map((m) => m.label)).toEqual([
      "Repository: vllm-project/vllm",
      "Stars: 48,836",
      "New stars today: 1,203",
      "Language: Python",
    ]);
    const paper = radarMeta(
      { format: "paper", url: "https://arxiv.org/abs/2609.21967", engagement: { citations: 3 } },
      "en",
    );
    expect(paper.map((m) => m.text)).toEqual(["arXiv 2609.21967", "Cited 3"]);
    expect(
      radarMetaBlock({ format: "paper", url: "", source: { name: "Takara" } }, "Takara", "en").id
        ?.label,
    ).toBe("Source: Takara");
    const params = (n: number) =>
      radarMeta({ format: "model", url: "", engagement: { params: n } }, "en")[0]?.label;
    expect(params(3.5e8)).toBe("Parameters: about 350 million");
    expect(params(1.2e12)).toBe("Parameters: about 1.2 trillion");
  });

  it("radarSubtitle en", () => {
    expect(radarSubtitle([{ format: "paper" }, { format: "oss" }], "en")).toBe(
      "Repos and papers in this issue",
    );
    expect(radarSubtitle([{ format: "model" }], "en")).toBe("Models in this issue");
    expect(radarSubtitle([], "en")).toBe("");
  });
});
