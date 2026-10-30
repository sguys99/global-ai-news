import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Byline, CategoryKicker, FormatBadge } from "@/components/ArticleMeta";
import { StoryEntry } from "@/components/Story";
import type { ArticleCard } from "@/lib/types";

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
    expect(badge).toHaveClass("border", "border-foreground", "text-foreground", "text-badge");
    expect(badge.className).not.toMatch(/brand/);
  });

  it("뉴스는 아무것도 그리지 않는다", () => {
    const { container } = render(<FormatBadge format="news" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("cn() 크기 토큰 수정의 렌더 결과(시안 결정 ⑭)", () => {
  it("키커는 13px 토큰과 코발트를 함께 가진다", () => {
    render(<CategoryKicker category="physical" />);
    expect(screen.getByText("Physical AI")).toHaveClass("text-meta", "text-brand");
  });

  it("색인 키커는 text-label(12px)로 바뀌고 코발트는 남는다 + 비뉴스는 형식 배지", () => {
    render(<StoryEntry article={card()} />);
    const kicker = screen.getByText("오픈소스·도구");
    expect(kicker).toHaveClass("text-label", "text-brand");
    expect(kicker).not.toHaveClass("text-meta");
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
    expect(container.firstElementChild).toHaveClass("text-meta", "text-muted-foreground");
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
