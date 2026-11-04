import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Byline,
  CategoryKicker,
  FormatBadge,
  ImportanceMeter,
  RegionBadge,
  TagChips,
  visibleTags,
} from "@/components/ArticleMeta";
import { FollowUpThread, dayGap } from "@/components/FollowUpThread";
import { LocaleProvider } from "@/components/LocaleProvider";
import { RelativeTime } from "@/components/RelativeTime";
import { hasHangul } from "@/lib/labels";
import type { ArticleCard, FollowUpEntry } from "@/lib/types";

/*
 * 영어판 Phase 3-3 C단계 — 기사 신호(ArticleMeta)·사건 타임라인·상대 시각의 영어 화면에 한글이 없는지,
 * 한국어 화면은 그대로인지. 영어 화면은 영어 데이터(영문 매체명·영문 원제)로 그린다.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** 화면 글자 + 읽기 라벨·툴팁(aria-label·title) — 스크린리더·hover 로 드러나는 문구까지 본다. */
function uiText(root: Element): string {
  const attrs = Array.from(root.querySelectorAll("*")).flatMap((el) =>
    ["aria-label", "title"].map((a) => el.getAttribute(a) ?? ""),
  );
  return [root.textContent ?? "", ...attrs].join(" ");
}

const card = (p: Partial<ArticleCard> = {}): ArticleCard => ({
  id: 1,
  source: { id: "tc", name: "TechCrunch" },
  url: "https://techcrunch.com/a",
  titleKo: "제목",
  summaryKo: "요약",
  titleOriginal: "Title",
  titleEn: "Title",
  summaryEn: "Summary.",
  category: "oss",
  format: "oss",
  tags: [],
  trendingScore: 40,
  importance: 4,
  publishedAt: "2026-10-29T00:00:00Z",
  related: [
    { title: "Other", url: "https://x.com/1", source: "The Verge" },
    { title: "Other 2", url: "https://x.com/2", source: "Wired" },
  ],
  ...p,
});

describe("ArticleMeta — 영어판", () => {
  it("키커·형식 배지·지역 배지·중요도 미터가 영어 표시명·라벨을 쓴다", () => {
    const { container } = render(
      <div>
        <CategoryKicker category="oss" locale="en" />
        <FormatBadge format="paper" locale="en" />
        <RegionBadge region="kr" locale="en" />
        <ImportanceMeter value={4} locale="en" />
      </div>,
    );
    expect(screen.getByText("Open Source & Tools")).toBeInTheDocument();
    expect(screen.getByText("Paper")).toHaveClass("sr-only");
    expect(screen.getByText("Korean outlet")).toHaveClass("sr-only");
    expect(screen.getByRole("img", { name: "Importance 4 of 5" })).toBeInTheDocument();
    expect(hasHangul(uiText(container))).toBe(false);
  });

  it("바이라인: 영문 매체명·영어 날짜·'+N more'·화제 지수 — 한글 없음", () => {
    const { container } = render(<Byline article={card()} showTrend showFormat locale="en" />);
    const text = container.textContent ?? "";
    expect(text).toContain("TechCrunch +2 more");
    expect(text).toContain("Oct 29, 2026");
    expect(text).toContain("Trending 40");
    expect(hasHangul(uiText(container))).toBe(false);
  });

  it("바이라인: 한글 이름 매체는 영문 매체명(nameEn)을 쓴다", () => {
    const { container } = render(
      <Byline
        article={card({ source: { id: "etnews", name: "전자신문", nameEn: "Electronic Times" } })}
        locale="en"
      />,
    );
    expect(container.textContent).toContain("Electronic Times");
    expect(hasHangul(uiText(container))).toBe(false);
  });

  it("바이라인 상대 시각(RelativeTime)은 컨텍스트 언어를 따른다", () => {
    const html = renderToString(
      <LocaleProvider locale="en">
        <Byline
          article={card({ publishedAt: "2026-10-26T18:00:00Z" })}
          timeBase="2026-10-26T21:00:00Z"
          locale="en"
        />
      </LocaleProvider>,
    );
    expect(html).toContain(">3 hours ago</time>");
    expect(hasHangul(html)).toBe(false);
  });

  it("한국어 바이라인은 그대로다(축약명·외 N곳·화제·중요도 라벨)", () => {
    const { container } = render(
      <Byline article={card({ source: { id: "gh", name: "GitHub (topic:llm)" } })} showTrend />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("GitHub 외 2곳");
    expect(text).toContain("화제 40");
    expect(text).toContain("2026.10.29");
    expect(screen.getByRole("img", { name: "중요도 4/5" })).toBeInTheDocument();
  });

  it("태그 칩: 영어판은 라틴 문자 태그만, 한국어판은 전량", () => {
    const tags = ["openai", "에이전트", "MCP", "로봇"];
    expect(visibleTags(tags, "en")).toEqual(["openai", "MCP"]);
    expect(visibleTags(tags)).toEqual(tags);

    const en = render(<TagChips tags={tags} locale="en" />);
    expect(en.container.textContent).toBe("#openai#MCP");
    en.unmount();

    const ko = render(<TagChips tags={tags} max={3} />);
    expect(ko.container.textContent).toBe("#openai#에이전트#MCP+1");
    ko.unmount();

    // 영어판에서 다 걸러지면 아무것도 그리지 않는다
    const none = render(<TagChips tags={["에이전트"]} locale="en" />);
    expect(none.container).toBeEmptyDOMElement();
  });
});

const entry = (p: Partial<FollowUpEntry>): FollowUpEntry => ({
  id: 1,
  titleKo: "한국어 제목",
  titleOriginal: "English title",
  sourceName: "TechCrunch",
  issuedAt: "2026-11-03T00:00:00Z",
  relation: "current",
  ...p,
});

describe("FollowUpThread — 영어판", () => {
  const entries = [
    entry({
      id: 1,
      relation: "earlier",
      issuedAt: "2026-11-01T00:00:00Z",
      titleKo: "첫 보도",
      titleOriginal: "First",
    }),
    entry({ id: 2, relation: "current" }),
    entry({
      id: 3,
      relation: "later",
      issuedAt: "2026-11-04T00:00:00Z",
      titleKo: "후속",
      titleOriginal: "Next",
    }),
  ];

  it("머리·관계·날짜 차·현재 기사 표지가 영어이고 링크는 /en 접두어", () => {
    const { container } = render(<FollowUpThread entries={entries} locale="en" />);
    expect(screen.getByRole("heading", { name: "Story timeline · 3 stories" })).toBeInTheDocument();
    expect(screen.getByText("This story")).toBeInTheDocument();
    expect(screen.getByText("2 days earlier")).toBeInTheDocument();
    expect(screen.getByText("1 day later")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /First/ })).toHaveAttribute("href", "/en/article/1");
    expect(hasHangul(uiText(container))).toBe(false);
  });

  it("한국어판은 그대로다", () => {
    render(<FollowUpThread entries={entries} />);
    expect(screen.getByRole("heading", { name: "사건 흐름 · 3건" })).toBeInTheDocument();
    expect(screen.getByText("지금 보는 기사")).toBeInTheDocument();
    expect(screen.getByText("2일 전")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /첫 보도/ })).toHaveAttribute("href", "/article/1");
  });

  it("dayGap 언어판", () => {
    expect(dayGap("2026-11-03", "2026-11-03T00:00:00Z", "en")).toBe("Same day");
    expect(dayGap("2026-11-03", "2026-11-05T00:00:00Z", "en")).toBe("2 days later");
    expect(dayGap("2026-11-03", "2026-11-02T00:00:00Z")).toBe("1일 전");
  });
});

describe("RelativeTime — 영어판", () => {
  it("영어 상대 시각과 영어 툴팁(… KST)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T09:00:00Z"));
    render(
      <LocaleProvider locale="en">
        <RelativeTime iso="2026-10-27T07:00:00Z" base="2026-10-27T07:30:00Z" />
      </LocaleProvider>,
    );
    const time = screen.getByText("2 hours ago");
    expect(time).toHaveAttribute("title", "Oct 27, 2026, 16:00 KST");
    expect(hasHangul(uiText(time.parentElement!))).toBe(false);
  });
});
