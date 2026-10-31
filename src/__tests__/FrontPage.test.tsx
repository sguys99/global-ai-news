import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrontPage, SectionBands, issueContents, radarSubtitle } from "@/components/Edition";
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

describe("RadarBand — 칸 수(1–4)에 맞춘 열, 빈 열 없음", () => {
  const nonNews = () => [
    card({ format: "oss", category: "agent", importance: 5, titleKo: "R-저장소" }),
    card({ format: "paper", category: "research", importance: 4, titleKo: "R-논문" }),
    card({ format: "model", category: "llm", importance: 3, titleKo: "R-모델" }),
    card({ format: "paper", category: "physical", importance: 2, titleKo: "R-논문2" }),
  ];
  const renderRadar = (k: number) => {
    const edition = buildEdition([...newsIssue(), ...nonNews().slice(0, k)]);
    expect(edition.radar).toHaveLength(k);
    render(<FrontPage edition={edition} />);
    const radar = screen.getByRole("region", { name: "오픈소스·논문 레이더" });
    return { radar, list: within(radar).getByRole("list"), edition };
  };

  it("4건: lg 4열 / md 2열 / 모바일 가로 스냅(변경 없음)", () => {
    const { radar, list } = renderRadar(4);
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(list).toHaveClass(
      "lg:grid-cols-4",
      "md:grid-cols-2",
      "overflow-x-auto",
      "auto-cols-[64%]",
    );
    expect(within(radar).getByText("이번 호의 저장소·모델·논문")).toBeInTheDocument();
  });

  it("3건: md 이상 같은 폭 3열, 4열 트랙을 쓰지 않는다", () => {
    const { radar, list } = renderRadar(3);
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(list).toHaveClass("md:grid-cols-3", "overflow-x-auto");
    expect(list).not.toHaveClass("lg:grid-cols-4");
    expect(list).not.toHaveClass("md:grid-cols-2");
    // 칸마다 subgrid(본문 | 메타 레일) — 레일 헤어라인 정렬 유지
    for (const li of within(list).getAllByRole("listitem"))
      expect(li).toHaveClass("row-span-2", "grid-rows-subgrid");
    expect(within(radar).getByText("이번 호의 저장소·모델·논문")).toBeInTheDocument();
  });

  it("2건: md 이상 같은 폭 2열, 보조 문구는 실린 형식만", () => {
    const { radar, list } = renderRadar(2);
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveClass("md:grid-cols-2");
    expect(list).not.toHaveClass("lg:grid-cols-4");
    expect(within(radar).getByText("이번 호의 저장소·논문")).toBeInTheDocument();
  });

  it("1건: 스크롤러 없이 띠 전폭 가로 한 줄(1면과 같은 8:4) — 메타 레일은 세로 헤어라인", () => {
    const { radar, list } = renderRadar(1);
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(list).not.toHaveClass("overflow-x-auto");
    expect(list.className).not.toMatch(/grid-cols-/);
    const link = within(items[0]).getByRole("link");
    expect(link).toHaveClass("md:grid", "md:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]");
    expect(link).not.toHaveClass("grid-rows-subgrid");
    // 머리·제목·요약 — 요약은 제목 옆 칸(md)
    expect(within(link).getByRole("heading")).toHaveClass("md:col-start-1", "md:row-start-2");
    expect(within(link).getByText("요약")).toHaveClass("md:col-start-2", "md:row-start-2");
    // 레일: 모바일은 위 가로선, md 이상은 왼쪽 세로선
    const rail = link.lastElementChild as HTMLElement;
    expect(rail).toHaveClass("border-t", "md:border-t-0", "md:border-l");
    expect(within(radar).getByText("이번 호의 저장소")).toBeInTheDocument();
  });

  it("radarSubtitle: FORMATS 순 화면 표시명, 뉴스·빈 목록은 제외", () => {
    expect(radarSubtitle([{ format: "paper" }, { format: "oss" }])).toBe("이번 호의 저장소·논문");
    expect(radarSubtitle([{ format: "model" }])).toBe("이번 호의 모델");
    expect(radarSubtitle([])).toBe("");
  });
});

describe("SectionBands — 항목이 4건 미만인 밴드도 빈 열 없이", () => {
  const band = (k: number) => ({
    category: "llm",
    count: k + 1,
    onFront: 1,
    items: Array.from({ length: k }, (_, i) => card({ category: "llm", titleKo: `S${k}-${i}` })),
  });
  const grids = () =>
    Array.from(document.querySelectorAll<HTMLElement>("section[id^='section-'] > .grid"));

  it("칸 수별 lg 열: 4건 1.5fr+3 · 3건 3열 · 2건 1fr:2fr · 1건 한 칸 — 대표 칸은 늘 1/3", () => {
    const sections = [4, 3, 2, 1].map((k, i) => ({
      ...band(k),
      category: ["llm", "agent", "oss", "industry"][i],
    }));
    render(<SectionBands sections={sections} />);
    const [g4, g3, g2, g1] = grids();
    expect(g4).toHaveClass("lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]");
    expect(g3).toHaveClass("lg:grid-cols-3");
    expect(g2).toHaveClass("lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]");
    expect(g1.className).not.toMatch(/grid-cols-\[|md:grid-cols|lg:grid-cols/);
    expect(g4.children).toHaveLength(4);
    expect(g3.children).toHaveLength(3);
    expect(g2.children).toHaveLength(2);
    expect(g1.children).toHaveLength(1);
  });

  it("세로 헤어라인은 줄의 첫 칸이 아닌 칸에만 — 3건 md 는 대표가 두 칸을 차지", () => {
    render(<SectionBands sections={[band(3)]} />);
    const [g3] = grids();
    const [c0, c1, c2] = Array.from(g3.children);
    expect(c0).toHaveClass("md:col-span-2", "lg:col-span-1");
    expect(c0.className).not.toMatch(/border-l/);
    expect(c1).toHaveClass("lg:border-l");
    expect(c1).not.toHaveClass("md:border-l");
    expect(c2).toHaveClass("md:border-l");
  });

  it("1건 밴드: 대표 기사를 [제목 | 요약·바이라인] 가로 한 줄로", () => {
    render(<SectionBands sections={[band(1)]} />);
    const [g1] = grids();
    const link = within(g1).getByRole("link");
    expect(link).toHaveClass("md:grid", "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]");
    expect(within(link).getByRole("heading")).toHaveClass("md:row-span-2", "font-serif");
  });

  it("2건 이상 밴드의 항목은 가로 한 줄 변형을 쓰지 않는다", () => {
    render(<SectionBands sections={[band(2)]} />);
    for (const link of within(grids()[0]).getAllByRole("link"))
      expect(link).not.toHaveClass("md:grid");
  });
});
