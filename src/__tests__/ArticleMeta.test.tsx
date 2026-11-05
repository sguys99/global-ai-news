import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Byline,
  CategoryKicker,
  FormatBadge,
  ImportanceMeter,
  RegionBadge,
} from "@/components/ArticleMeta";
import { StoryEntry } from "@/components/Story";
import type { ArticleCard } from "@/lib/types";
import { GLOBALS_CSS, applyOf, expandedClasses } from "./componentCss";

const card = (p: Partial<ArticleCard> = {}): ArticleCard => ({
  id: 1,
  source: { id: "gh", name: "GitHub (topic:llm)" },
  url: "https://github.com/a/b",
  titleKo: "제목",
  summaryKo: "요약",
  titleOriginal: "Title",
  category: "oss",
  format: "oss",
  tags: [],
  trendingScore: 40,
  importance: 3,
  publishedAt: "2026-10-29T00:00:00Z",
  ...p,
});

describe("FormatBadge — 형식 배지(시안 결정 ⑪)", () => {
  it.each([
    ["oss", "REPO", "저장소"],
    ["model", "MODEL", "모델"],
    ["paper", "PAPER", "논문"],
  ] as const)("%s: 화면은 %s(aria-hidden), 스크린리더는 %s", (format, visible, spoken) => {
    const { container } = render(<FormatBadge format={format} />);
    const caps = screen.getByText(visible);
    expect(caps).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(spoken)).toHaveClass("sr-only");
    // 잉크 1px 아웃라인·10.5px 토큰, 코발트 없음
    const badge = container.firstElementChild!;
    expect(badge).toHaveClass("sg-badge");
    expect(expandedClasses(badge)).toEqual(
      expect.arrayContaining(["border", "border-foreground", "text-foreground", "text-badge"]),
    );
    expect(expandedClasses(badge).join(" ")).not.toMatch(/brand/);
  });

  it("뉴스는 아무것도 그리지 않는다", () => {
    const { container } = render(<FormatBadge format="news" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RegionBadge — 지역 배지(영어판 1-1, 형식 배지와 같은 문법)", () => {
  it("kr: 화면은 KOREA(aria-hidden), 스크린리더는 한국 매체 — 잉크 아웃라인, 코발트 없음", () => {
    const { container } = render(<RegionBadge region="kr" />);
    expect(screen.getByText("KOREA")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("한국 매체")).toHaveClass("sr-only");
    const badge = container.firstElementChild!;
    expect(badge).toHaveClass("sg-badge");
    expect(expandedClasses(badge)).toEqual(
      expect.arrayContaining(["border", "border-foreground", "text-foreground", "text-badge"]),
    );
    expect(expandedClasses(badge).join(" ")).not.toMatch(/brand/);
  });

  it("해외(지역 없음)는 아무것도 그리지 않는다", () => {
    const { container } = render(<RegionBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("cn() 크기 토큰 수정의 렌더 결과(시안 결정 ⑭)", () => {
  it("키커는 13px 토큰과 코발트를 함께 가진다", () => {
    render(<CategoryKicker category="physical" />);
    const kicker = screen.getByText("Physical AI");
    expect(kicker).toHaveClass("sg-kick");
    expect(expandedClasses(kicker)).toEqual(expect.arrayContaining(["text-meta", "text-brand"]));
  });

  it("색인 키커는 text-label(12px)로 바뀌고 코발트는 남는다 + 비뉴스는 형식 배지", () => {
    render(<StoryEntry article={card()} />);
    const kicker = screen.getByText("오픈소스·도구");
    // 키커 묶음(sg-kick: text-meta·text-brand)은 컴포넌트 층, 덮어쓰는 text-label 은 유틸리티 층이라 12px 이 이긴다
    // (예전엔 twMerge 가 text-meta 를 지웠다 — 지금은 cascade layer 가 같은 결과를 낸다).
    expect(kicker).toHaveClass("sg-kick", "text-label");
    expect(kicker).not.toHaveClass("text-meta");
    expect(applyOf("sg-kick")).toEqual(expect.arrayContaining(["text-meta", "text-brand"]));
    expect(screen.getByText("REPO")).toBeInTheDocument();
  });

  it("색인: 뉴스는 배지 없음, hideCategory 여도 비뉴스 배지는 남는다", () => {
    const { unmount } = render(<StoryEntry article={card({ format: "news" })} />);
    expect(screen.queryByText("REPO")).toBeNull();
    unmount();
    render(<StoryEntry article={card({ format: "paper" })} hideCategory />);
    expect(screen.queryByText("오픈소스·도구")).toBeNull();
    expect(screen.getByText("PAPER")).toBeInTheDocument();
  });

  it("바이라인은 13px 토큰과 회색을 함께 가진다", () => {
    const { container } = render(<Byline article={card()} />);
    const byline = container.firstElementChild!;
    expect(byline).toHaveClass("sg-by");
    expect(expandedClasses(byline)).toEqual(
      expect.arrayContaining(["text-meta", "text-muted-foreground"]),
    );
  });
});

describe("Byline showFormat — 섹션 밴드(시안 결정 ⑬)", () => {
  it("비뉴스는 매체명 앞에 배지, 뉴스는 매체명만", () => {
    const { unmount } = render(<Byline article={card({ format: "paper" })} showFormat compact />);
    const badge = screen.getByText("PAPER");
    const source = screen.getByText("GitHub");
    expect(badge.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    render(<Byline article={card({ format: "news" })} showFormat />);
    expect(screen.queryByText("PAPER")).toBeNull();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });
});

describe("ImportanceMeter — 칸은 클래스 없는 <i> 5개, 채움은 CSS(data-v)", () => {
  it.each([1, 3, 4, 5])("중요도 %i: 라벨·칸 수 그대로, data-v 로 채울 칸 수를 넘긴다", (v) => {
    render(<ImportanceMeter value={v} />);
    const meter = screen.getByRole("img", { name: `중요도 ${v}/5` });
    expect(meter).toHaveClass("sg-imp");
    expect(meter).toHaveAttribute("data-v", String(v));
    const dots = meter.querySelectorAll("i");
    expect(dots).toHaveLength(5);
    for (const i of dots) expect(i.getAttribute("class")).toBeNull();
  });

  it("소수는 채운 칸 수(내림)로, 0 이하는 그리지 않는다", () => {
    const { container, unmount } = render(<ImportanceMeter value={0} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    render(<ImportanceMeter value={3.5} />);
    expect(screen.getByRole("img")).toHaveAttribute("data-v", "3");
  });

  it("globals.css: 빈 칸 회색 테두리 /80, 1–3 잉크 채움, 4–5 코발트 채움", () => {
    expect(applyOf("sg-imp > i")).toEqual(
      expect.arrayContaining(["size-1.5", "rounded-full", "border", "border-muted-foreground/80"]),
    );
    expect(GLOBALS_CSS).toMatch(
      /\.sg-imp\[data-v="3"\] > i:nth-child\(-n \+ 3\) \{\s*@apply border-foreground bg-foreground;/,
    );
    expect(GLOBALS_CSS).toMatch(/\.sg-imp\[data-v="5"\] > i \{\s*@apply border-brand bg-brand;/);
  });
});
