import fs from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KoreaDeskBand, SectionBands } from "@/components/Edition";
import { Byline } from "@/components/ArticleMeta";
import { FeedView } from "@/components/FeedView";
import { LocaleProvider } from "@/components/LocaleProvider";
import { Masthead } from "@/components/Masthead";
import { StoryDesk, StorySectionItem } from "@/components/Story";
import { buildEdition, frontArticles, issueStats } from "@/lib/edition";
import {
  applyKoreaDesk,
  isKoreaSubject,
  koreaSubjectNames,
  koreaSubjectPattern,
  selectKoreaDesk,
} from "@/lib/koreaDesk";
import { hasHangul } from "@/lib/labels";
import { buildFeedIndex } from "@/lib/feedIndex";
import { PROMPTS_DIR } from "@/lib/paths";
import type { ArticleCard } from "@/lib/types";

/**
 * Korea Desk(영어판 Phase 5-2, DESIGN.md §9 "영어판") — 선정 규칙(한국 매체·1면 제외·한국 주제 우선·편집 순 ≤ 4),
 * 섹션 밴드에서 데스크 기사 빼기, 밴드 렌더, KOREA 표시(영어 바이라인만·데스크 안 생략·한국어판 없음).
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/en/",
  useRouter: () => ({ push: vi.fn() }),
}));

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
    titleEn: `Global headline ${seq}`,
    summaryEn: `Global summary ${seq}.`,
    category: "industry",
    format: "news",
    tags: [],
    trendingScore: 10,
    importance: 3,
    publishedAt: "2026-11-03T00:00:00Z",
    ...p,
  };
}

const AITIMES = { id: "aitimes", name: "AI타임스", nameEn: "AI Times", region: "kr" as const };

const glossary = fs.readFileSync(path.join(PROMPTS_DIR, "glossary.en.md"), "utf8");
const pattern = koreaSubjectPattern(koreaSubjectNames(glossary));
const subject = (a: ArticleCard) => isKoreaSubject(a, pattern);

/** 해외 뉴스 8건(1면을 채운다) + 한국 매체 기사(편집 순 낮게). */
function issueWithKorean(korean: Partial<ArticleCard>[]): ArticleCard[] {
  const overseas = ["llm", "agent", "industry", "research", "physical", "oss", "llm", "agent"].map(
    (category, i) => card({ category, importance: 5, trendingScore: 90 - i }),
  );
  return [...overseas, ...korean.map((p) => card({ source: AITIMES, importance: 2, ...p }))];
}

describe("koreaSubjectNames — 용어집에서 한국 기관·기업 영문명", () => {
  const names = koreaSubjectNames(glossary);
  it("한국 기관·기업 절의 영문명(괄호 설명은 떼고 약칭은 따로)", () => {
    expect(names).toEqual(
      expect.arrayContaining(["Naver Cloud", "Samsung Electronics", "KAIST", "MSIT", "Geekble"]),
    );
  });
  it("사람·직함·해외 이름 절과 소문자 일반어는 거두지 않는다", () => {
    for (const n of ["Anthropic", "OpenAI", "minister", "CEO", "sovereign AI", "Sam Altman"]) {
      expect(names).not.toContain(n);
    }
  });
  it("대조는 낱말 경계·대소문자 구분", () => {
    expect(isKoreaSubject({ titleEn: "Naver Cloud signs deal" }, pattern)).toBe(true);
    expect(isKoreaSubject({ summaryEn: "aims for KRW 1 billion" }, pattern)).toBe(true);
    expect(isKoreaSubject({ titleEn: "South Korean firms move" }, pattern)).toBe(true);
    expect(isKoreaSubject({ titleEn: "Navers and KTX" }, pattern)).toBe(false);
    expect(isKoreaSubject({ titleEn: "Anthropic expands into drug discovery" }, pattern)).toBe(
      false,
    );
  });
});

describe("selectKoreaDesk — 한국 매체·1면 제외·한국 주제 우선·≤ 4", () => {
  it("1면 게재분과 해외 매체는 빼고, 한국 주제 먼저 → 편집 순", () => {
    const articles = issueWithKorean([
      { titleEn: "Anthropic expands into life sciences", importance: 3 },
      { titleEn: "NEURA Robotics opens training center", importance: 3, trendingScore: 5 },
      { titleEn: "Naver Cloud builds military supply system" },
      { titleEn: "Geekble enters robot market", summaryEn: "Targets KRW 1 billion a month." },
      { titleEn: "Cisco rewrites legacy code" },
    ]);
    const edition = buildEdition(articles);
    const front = new Set(frontArticles(edition).map((a) => a.id));
    const ids = selectKoreaDesk(edition, subject);
    expect(ids).toHaveLength(4);
    for (const id of ids) {
      expect(front.has(id)).toBe(false);
      expect(articles.find((a) => a.id === id)!.source.region).toBe("kr");
    }
    const titles = ids.map((id) => articles.find((a) => a.id === id)!.titleEn);
    // 한국 주제 2건이 먼저(편집 순), 그다음 나머지 편집 순
    expect(titles.slice(0, 2)).toEqual([
      "Naver Cloud builds military supply system",
      "Geekble enters robot market",
    ]);
    expect(titles.slice(2)).toEqual([
      "Anthropic expands into life sciences",
      "NEURA Robotics opens training center",
    ]);
  });

  it("1면 밖 한국 매체 기사가 없으면 빈 배열", () => {
    expect(selectKoreaDesk(buildEdition(issueWithKorean([])), subject)).toEqual([]);
  });
});

describe("applyKoreaDesk — 섹션 밴드에서 데스크 기사 빼기", () => {
  const articles = issueWithKorean([
    { titleEn: "Naver Cloud deal", category: "industry" },
    { titleEn: "Seoul robot fair", category: "physical" },
    { titleEn: "Korean chip policy", category: "industry" },
    { titleEn: "Cisco code rewrite", category: "industry", importance: 1 },
  ]);
  const edition = buildEdition(articles);
  const deskIds = selectKoreaDesk(edition, subject, 2);

  it("데스크 기사는 밴드에 없고, 밴드 머리 건수는 그대로 + 데스크 수", () => {
    const { sections, desk } = applyKoreaDesk(edition, deskIds);
    const banded = sections.flatMap((s) => s.items.map((a) => a.id));
    for (const id of deskIds) expect(banded).not.toContain(id);
    const industry = sections.find((s) => s.category === "industry")!;
    const before = edition.sections.find((s) => s.category === "industry")!;
    expect(industry.count).toBe(before.count);
    expect(industry.atDesk).toBe(
      deskIds.filter((id) => articles.find((a) => a.id === id)!.category === "industry").length,
    );
    expect(desk!.items.map((a) => a.id)).toEqual(deskIds);
    expect(desk!.korean).toBe(4);
  });

  it("Elsewhere = 데스크 밖 한국 매체 기사와 실린 자리", () => {
    const { desk } = applyKoreaDesk(edition, deskIds);
    expect(desk!.elsewhere.map((e) => e.article.id)).not.toEqual(expect.arrayContaining(deskIds));
    expect(desk!.elsewhere.every((e) => e.article.source.region === "kr")).toBe(true);
    expect(desk!.elsewhere.map((e) => e.place.kind)).toContain("section");
  });

  it("데스크가 없으면(한국어판) 편집 그대로 + desk null", () => {
    const { edition: same, sections, desk } = applyKoreaDesk(edition, undefined);
    expect(same).toBe(edition);
    expect(desk).toBeNull();
    expect(sections.map((s) => s.items)).toEqual(edition.sections.map((s) => s.items));
  });
});

describe("KoreaDeskBand·밴드 머리·KOREA 표시 렌더", () => {
  const articles = issueWithKorean([
    { titleEn: "Naver Cloud deal", summaryEn: "Naver Cloud signed a deal.", category: "industry" },
    { titleEn: "Korean chip policy", summaryEn: "Policy summary.", category: "industry" },
    { titleEn: "Cisco code rewrite", summaryEn: "Cisco summary.", category: "industry" },
  ]);
  const edition = buildEdition(articles);
  const { sections, desk } = applyKoreaDesk(edition, selectKoreaDesk(edition, subject, 2));

  it("데스크 밴드: 라벨·제목·dek·Elsewhere·안내, 데스크 안 바이라인에는 KOREA 없음, 한글 없음", () => {
    const { container } = render(
      <KoreaDeskBand desk={desk!} indexLabel="All stories" locale="en" />,
    );
    expect(screen.getByText("From Seoul")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Korea Desk" })).toBeInTheDocument();
    expect(screen.getByText("Elsewhere in this issue")).toBeInTheDocument();
    expect(container.textContent).toContain("3 stories in this issue come from Korean outlets");
    const grid = container.querySelector(".ed-dk-g")!;
    expect(grid.querySelectorAll("li")).toHaveLength(2);
    expect(grid.querySelector(".sg-region")).toBeNull();
    expect(hasHangul(container.textContent ?? "")).toBe(false);
  });

  it("섹션 밴드 머리: · N at the Korea Desk, 밴드 항목의 한국 매체에는 KOREA 표시", () => {
    const { container } = render(<SectionBands sections={sections} locale="en" />);
    expect(container.textContent).toMatch(/· 2 at the Korea Desk/);
    const marks = container.querySelectorAll(".sg-region");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent).toBe("KOREAKorean outlet");
  });

  it("KOREA 표시: 영어 바이라인만 — 한국어판·데스크 칸·해외 매체는 없음", () => {
    const kr = articles.find((a) => a.source.region === "kr")!;
    const en = render(<Byline article={kr} locale="en" />);
    expect(en.container.querySelector(".sg-region")?.textContent).toBe("KOREAKorean outlet");
    expect(within(en.container).getByText("Korean outlet")).toHaveClass("sr-only");
    en.unmount();
    const ko = render(<Byline article={kr} locale="ko" />);
    expect(ko.container.querySelector(".sg-region")).toBeNull();
    expect(ko.container.textContent).not.toContain("KOREA");
    ko.unmount();
    const desk = render(<StoryDesk article={kr} locale="en" />);
    expect(desk.container.querySelector(".sg-region")).toBeNull();
    desk.unmount();
    const item = render(<StorySectionItem article={kr} locale="en" />);
    expect(item.container.querySelector(".sg-region")).not.toBeNull();
    item.unmount();
    const overseas = render(<Byline article={articles[0]} locale="en" />);
    expect(overseas.container.querySelector(".sg-region")).toBeNull();
  });

  it("마스트헤드: 영어 내비에 Korea Desk(1면 다음), 귀 둘째 줄은 비뉴스만", () => {
    const withPaper = [...articles, card({ format: "paper", category: "research" })];
    render(
      <Masthead
        issueNo={140}
        publishedAt="2026-11-02T21:05:00Z"
        stats={issueStats(withPaper)}
        categories={sections.map((s) => s.category)}
        desk
        locale="en"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const links = within(nav)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(links.slice(0, 2)).toEqual(["Front page", "Korea Desk"]);
    const ear = screen.getByTestId("issue-ear");
    // 둘째 줄(형식 구성)에 뉴스 건수가 없다 — "12 stories" 는 첫 줄 총계뿐.
    expect(ear.lastElementChild!.textContent).toBe("1 paper");
  });
});

describe("FeedView — 영어 홈 지면(Korea Desk 포함)", () => {
  it("1면 → 레이더 → Korea Desk → 섹션 밴드 순, 데스크 기사는 밴드에 없고 화면에 한글이 없다", () => {
    const articles = issueWithKorean([
      {
        titleEn: "Naver Cloud deal",
        summaryEn: "Naver Cloud signed a deal.",
        category: "industry",
      },
      { titleEn: "Seoul robot fair", summaryEn: "A fair in Seoul.", category: "physical" },
      { titleEn: "Cisco code rewrite", summaryEn: "Cisco summary.", category: "industry" },
    ]);
    const deskIds = selectKoreaDesk(buildEdition(articles), subject, 2);
    const { container } = render(
      <LocaleProvider locale="en">
        <FeedView
          issueArticles={articles}
          index={buildFeedIndex(articles, "en")}
          indexTotal={articles.length}
          sources={[]}
          tags={[]}
          options={{}}
          editionInfo={{ issueNo: 140, publishedAt: "2026-11-02T21:05:00Z" }}
          desk={deskIds}
          locale="en"
        />
      </LocaleProvider>,
    );
    const desk = container.querySelector("#korea-desk")!;
    expect(desk).not.toBeNull();
    const ids = [...container.querySelectorAll("main > section, main > div > section")].map(
      (el) => el.id,
    );
    expect(ids.indexOf("korea-desk")).toBeGreaterThan(ids.indexOf("front"));
    const firstBand = ids.findIndex((id) => id.startsWith("section-"));
    expect(ids.indexOf("korea-desk")).toBeLessThan(firstBand);
    for (const band of container.querySelectorAll('[id^="section-"]')) {
      expect(band.textContent).not.toContain("Naver Cloud deal");
      expect(band.textContent).not.toContain("Seoul robot fair");
    }
    expect(hasHangul(container.textContent ?? "")).toBe(false);
  });

  it("한국어 홈은 데스크도 KOREA 표시도 없다(desk 를 넘기지 않는다)", () => {
    const articles = issueWithKorean([{ titleEn: "Naver Cloud deal", category: "industry" }]);
    const { container } = render(
      <FeedView
        issueArticles={articles}
        index={buildFeedIndex(articles)}
        indexTotal={articles.length}
        sources={[]}
        tags={[]}
        options={{}}
        editionInfo={{ issueNo: 140, publishedAt: "2026-11-02T21:05:00Z" }}
      />,
    );
    expect(container.querySelector("#korea-desk")).toBeNull();
    expect(container.querySelector(".sg-region")).toBeNull();
  });
});
