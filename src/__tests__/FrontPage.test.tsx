import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrontPage, issueContents } from "@/components/Edition";
import { buildEdition } from "@/lib/edition";
import type { ArticleCard } from "@/lib/types";

let seq = 0;
function card(p: Partial<ArticleCard>): ArticleCard {
  seq += 1;
  return {
    id: seq,
    source: { id: "hn", name: "Hacker News" },
    url: "https://x",
    titleKo: `기사${seq}`,
    summaryKo: "요약",
    titleOriginal: `T${seq}`,
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-10-29T00:00:00Z",
    ...p,
  };
}

/** 뉴스 10건(분야 3개 이상) — 리드 1·서브 3·브리핑 3이 찬다. */
const newsIssue = () =>
  [
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
  ].map((category, i) => card({ category, importance: 5 - Math.floor(i / 3) }));

const radarIssue = () => [
  card({ format: "oss", category: "oss", importance: 5, titleKo: "레이더-저장소" }),
  card({ format: "oss", category: "agent", importance: 4, titleKo: "레이더-저장소2" }),
  card({ format: "model", category: "llm", importance: 3, titleKo: "레이더-모델" }),
  card({ format: "paper", category: "research", importance: 2, titleKo: "레이더-논문" }),
  card({ format: "paper", category: "research", importance: 1, titleKo: "레이더-논문2" }),
];

describe("FrontPage — 오늘의 브리핑·레이더 띠", () => {
  it("브리핑은 3행 목록, 레이더 띠는 4장과 형식 라벨(REPO·MODEL·PAPER)을 그린다", () => {
    const edition = buildEdition([...newsIssue(), ...radarIssue()]);
    expect(edition.radar).toHaveLength(4);
    render(<FrontPage edition={edition} />);

    const briefs = screen.getByRole("region", { name: "오늘의 브리핑" });
    expect(within(briefs).getAllByRole("listitem")).toHaveLength(3);
    for (const a of edition.briefs) expect(within(briefs).getByText(a.titleKo)).toBeInTheDocument();

    const radar = screen.getByRole("region", { name: "오픈소스·논문 레이더" });
    const cards = within(radar).getAllByRole("listitem");
    expect(cards).toHaveLength(4);
    // 표시 순서 = 편집 순(buildEdition 의 radar 순서)
    expect(cards.map((li) => within(li).getByRole("heading").textContent)).toEqual(
      edition.radar.map((a) => a.titleKo),
    );
    expect(within(radar).getAllByText("REPO")).toHaveLength(2);
    expect(within(radar).getByText("MODEL")).toBeInTheDocument();
    expect(within(radar).getByText("PAPER")).toBeInTheDocument();
    // 레이더에는 뉴스가 없다 — 날짜·형식 라벨 없는 뉴스 카드가 섞이지 않는다
    expect(within(radar).queryByText(edition.lead!.titleKo)).toBeNull();
  });

  it("비뉴스가 0건이면 레이더가 빈 배열이고 띠 전체(머리 포함)를 숨긴다", () => {
    const edition = buildEdition(newsIssue());
    expect(edition.radar).toEqual([]);
    render(<FrontPage edition={edition} />);
    expect(screen.getByRole("region", { name: "1면" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "오픈소스·논문 레이더" })).toBeNull();
    expect(screen.queryByText("오픈소스·논문 레이더")).toBeNull();
    expect(screen.queryByText("REPO")).toBeNull();
  });

  it("뉴스가 4건 이하면 브리핑 목록을 그리지 않는다", () => {
    const edition = buildEdition([...newsIssue().slice(0, 4), ...radarIssue()]);
    expect(edition.briefs).toEqual([]);
    render(<FrontPage edition={edition} />);
    expect(screen.queryByRole("region", { name: "오늘의 브리핑" })).toBeNull();
    expect(screen.getByRole("region", { name: "오픈소스·논문 레이더" })).toBeInTheDocument();
  });
});

describe("FrontPage — Phase 6-2 시안 반영", () => {
  const radarWithMeta = () => [
    card({
      format: "oss",
      category: "agent",
      importance: 5,
      titleKo: "레이더-저장소",
      source: { id: "gh", name: "GitHub Trending" },
      url: "https://github.com/milind-soni/OpenMausBot",
      engagement: { stars: 7406, stars_today: 1190, language: "TypeScript" },
      trendingScore: 67,
    }),
    card({
      format: "model",
      category: "llm",
      importance: 4,
      titleKo: "레이더-모델",
      source: { id: "hf", name: "HuggingFace 트렌딩 모델" },
      url: "https://huggingface.co/RecursiveSI/flint",
      engagement: {
        params: 39_785_287_456,
        pipeline_tag: "text-generation",
        likes: 1238,
        downloads: 16_598,
      },
      trendingScore: 38,
    }),
    card({
      format: "paper",
      category: "research",
      importance: 3,
      titleKo: "레이더-논문",
      source: { id: "hfp", name: "HuggingFace Daily Papers" },
      url: "https://huggingface.co/papers/2610.34283",
      engagement: { ups: 408 },
      trendingScore: 22,
    }),
    card({
      format: "paper",
      category: "physical",
      importance: 2,
      titleKo: "레이더-결측",
      source: { id: "tk", name: "Takara TLDR" },
      url: "https://example.com/p",
    }),
  ];

  it("레이더 카드: 배지 + 분야 키커 머리, 메타 레일(식별자·수치·SVG 기호·스크린리더 문구)", () => {
    const edition = buildEdition([...newsIssue(), ...radarWithMeta()]);
    render(<FrontPage edition={edition} />);
    const radar = screen.getByRole("region", { name: "오픈소스·논문 레이더" });
    const [repo, model, paper, missing] = within(radar).getAllByRole("listitem");

    // 머리: 배지 다음 코발트 키커
    expect(within(repo).getByText("REPO")).toBeInTheDocument();
    expect(within(repo).getByText("에이전트")).toHaveClass("text-brand");
    expect(within(repo).getByText("저장소")).toHaveClass("sr-only");

    // 리포: owner/repo · ★ 7,406 · 오늘 +1,190 · 언어 — 1만 미만은 쉼표 정수
    expect(within(repo).getByText("milind-soni/OpenMausBot")).toBeInTheDocument();
    expect(within(repo).getByText("7,406").tagName).toBe("B");
    expect(within(repo).getByText("+1,190")).toBeInTheDocument();
    expect(within(repo).getByText("스타 7,406개")).toHaveClass("sr-only");
    expect(within(repo).getByText("오늘 스타 1,190개 증가")).toHaveClass("sr-only");
    expect(repo.querySelector('svg[data-icon="★"]')).toHaveAttribute("aria-hidden", "true");
    // 기호는 글자가 아니라 SVG — 모바일에서 이모지로 바뀌지 않는다
    expect(repo.textContent).not.toMatch(/[★♥↓▲]/);

    // 모델: 식별자 줄 + 40B · 태스크 · ♥ · ↓(1만 이상 축약)
    expect(within(model).getByText("RecursiveSI/flint")).toBeInTheDocument();
    expect(within(model).getByText("40B")).toBeInTheDocument();
    expect(within(model).getByText("text-generation")).toBeInTheDocument();
    expect(within(model).getByText("1,238")).toBeInTheDocument();
    expect(within(model).getByText("16.6k")).toBeInTheDocument();
    expect(model.querySelector('svg[data-icon="♥"]')).not.toBeNull();
    expect(model.querySelector('svg[data-icon="↓"]')).not.toBeNull();

    // 논문: arXiv ID · ▲ 408
    // 식별자는 label 이 화면 표기와 같다(화면용 aria-hidden + 스크린리더용 sr-only)
    expect(within(paper).getAllByText("arXiv 2610.34283")).toHaveLength(2);
    expect(within(paper).getByText("408")).toBeInTheDocument();
    expect(paper.querySelector('svg[data-icon="▲"]')).not.toBeNull();

    // 식별자·수치가 모두 없으면 매체명(결정 ⑩)
    expect(within(missing).getByText("Takara TLDR")).toBeInTheDocument();
  });

  it("오늘의 브리핑 행: md 키커 칸 + 모바일용 바이라인 병합 키커, 제목·매체·중요도", () => {
    const edition = buildEdition(newsIssue());
    render(<FrontPage edition={edition} />);
    const briefs = screen.getByRole("region", { name: "오늘의 브리핑" });
    const [first] = within(briefs).getAllByRole("listitem");
    const a = edition.briefs[0];
    const link = within(first).getByRole("link");
    expect(link).toHaveAttribute("href", `/article/${a.id}`);
    expect(link).toHaveClass("min-h-11");
    // 키커는 두 번(md 칸 · 모바일 바이라인) — 각자 반대 폭에서 숨는다
    const kickers = within(first).getAllByText(
      /^(LLM|에이전트|산업·정책|연구·논문|Physical AI|오픈소스·도구)$/,
    );
    expect(kickers).toHaveLength(2);
    expect(kickers[0]).toHaveClass("max-md:hidden");
    expect(kickers[1].parentElement).toHaveClass("md:hidden");
    expect(within(first).getByRole("heading", { level: 3 })).toHaveTextContent(a.titleKo);
    expect(
      within(first).getByRole("img", { name: `중요도 ${a.importance}/5` }),
    ).toBeInTheDocument();
  });

  it("지금 화제: 비뉴스는 매체명 대신 형식 배지, 뉴스는 매체명", () => {
    const news = card({
      trendingScore: 58,
      importance: 5,
      source: { id: "hn", name: "Hacker News Front Page" },
    });
    const edition = buildEdition([...newsIssue(), news, ...radarWithMeta()]);
    render(<FrontPage edition={edition} />);
    const hot = screen.getByRole("complementary", { name: "지금 화제" });
    const rows = within(hot).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText("REPO")).toBeInTheDocument();
    expect(within(rows[0]).queryByText("GitHub Trending")).toBeNull();
    expect(within(rows[1]).getByText("Hacker News")).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/^(REPO|MODEL|PAPER)$/)).toBeNull();
    expect(within(rows[2]).getByText("MODEL")).toBeInTheDocument();
  });

  it("이 호의 지면: 분야별 건수·1면 수, CATEGORIES 순, 섹션 앵커(밴드 없으면 #front)", () => {
    const edition = buildEdition([...newsIssue(), ...radarWithMeta()]);
    const rows = issueContents(edition);
    expect(rows.map((r) => r.category)).toEqual([
      "llm",
      "agent",
      "physical",
      "oss",
      "research",
      "industry",
    ]);
    for (const r of rows) {
      expect(r.count).toBe(edition.issue.filter((a) => a.category === r.category).length);
      const banded = edition.sections.some((s) => s.category === r.category);
      expect(r.href).toBe(banded ? `#section-${r.category}` : "#front");
    }
    expect(rows.reduce((n, r) => n + r.onFront, 0)).toBe(
      1 + edition.seconds.length + edition.briefs.length + edition.radar.length,
    );

    render(<FrontPage edition={edition} />);
    const nav = screen.getByRole("navigation", { name: "이 호의 지면" });
    expect(nav).toHaveClass("hidden", "lg:block");
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(rows.length);
    expect(links[0]).toHaveAttribute("href", rows[0].href);
    expect(links[0]).toHaveTextContent(`LLM${rows[0].count}건`);
  });

  it("이 호의 지면: 기사가 없는 분야는 행을 만들지 않는다", () => {
    const edition = buildEdition(
      ["llm", "llm", "agent", "agent", "industry"].map((category) => card({ category })),
    );
    expect(issueContents(edition).map((r) => r.category)).toEqual(["llm", "agent", "industry"]);
  });
});
