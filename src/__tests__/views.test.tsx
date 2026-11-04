import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditionRef } from "@/lib/db";
import { articleMessages } from "@/lib/messages/article";
import { editionMessages } from "@/lib/messages/edition";
import type { ArticleCard } from "@/lib/types";

// 뷰는 빌드타임 DB 조회(서버 컴포넌트, 동기) — 조회 계층만 가짜로 바꾸고 목록 카드 변환 등은 실제 함수를 쓴다.
const db = vi.hoisted(() => ({
  refs: [] as EditionRef[],
  issue: [] as ArticleCard[],
}));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  getEditionRefs: () => db.refs,
  getIssueArticles: () => db.issue,
  getIssueBriefs: () => [],
  getWeekRadarCandidates: () => [],
  getSourcesWithCounts: () => [],
  getActiveTags: () => ["mcp"],
}));
// 검색 본문은 브라우저에서 색인을 받는다 — 정적 셸만 본다.
vi.mock("@/components/SearchClient", () => ({ SearchClient: () => null }));

import { EditionView } from "@/views/EditionView";
import { SearchView } from "@/views/SearchView";
import { loadEdition, loadSearch, localeArticles } from "@/views/data";

function ref(date: string, issueNo: number): EditionRef {
  return {
    date,
    issueNo,
    publishedAt: `${date}T00:00:00+09:00`,
    cutoff: `${date}T15:00:00Z`,
  };
}

function card(id: number): ArticleCard {
  return {
    id,
    source: { id: "hn", name: "Hacker News" },
    url: `https://x/${id}`,
    titleKo: `기사${id}`,
    summaryKo: "요약",
    titleOriginal: `T${id}`,
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-11-02T00:00:00Z",
  };
}

describe("EditionView — 호 고정 링크 본문(한국어)", () => {
  beforeEach(() => {
    db.refs = [ref("2026-11-02", 1), ref("2026-11-03", 2), ref("2026-11-04", 3)];
    db.issue = [card(1), card(2)];
  });

  it("지난 호: 안내 줄 + 오늘의 지면 링크(/), 색인 머리 '이 호의 기사'·건수, 섹션 내비 마지막 항목", () => {
    render(<EditionView locale="ko" date="2026-11-03" />);
    const back = screen.getByRole("link", { name: "오늘의 지면 보기 →" });
    expect(back).toHaveAttribute("href", "/");
    expect(back.parentElement?.textContent).toBe("지난 호 지면입니다. 오늘의 지면 보기 →");
    const index = screen.getByRole("region", { name: "이 호의 기사" });
    expect(within(index).getByRole("heading", { level: 2 }).textContent).toBe("이 호의 기사");
    expect(within(index).getByText("2건")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "지면 섹션" });
    expect(within(nav).getByRole("link", { name: "이 호의 기사" })).toHaveAttribute("href", "#all");
  });

  it("최신 호(다음 호 없음)는 지난 호 안내 줄이 없다", () => {
    render(<EditionView locale="ko" date="2026-11-04" />);
    expect(screen.queryByText(/지난 호 지면입니다/)).toBeNull();
  });

  it("목록 밖 날짜는 404(notFound)", () => {
    expect(() => render(<EditionView locale="ko" date="2026-01-01" />)).toThrow();
  });
});

describe("SearchView — 검색 정적 셸(한국어)", () => {
  it("머리 키커 '검색'·제목 '기사 찾기'", () => {
    render(<SearchView locale="ko" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("기사 찾기");
    expect(screen.getByText("검색")).toBeInTheDocument();
  });
});

describe("뷰 로더 — 언어판 데이터 범위", () => {
  it("ko 는 기사 목록을 그대로 둔다", () => {
    const list = [card(1), card(2)];
    expect(localeArticles("ko", list)).toBe(list);
  });

  it("en 은 거르기(hasEnglish, Phase 5)가 생기기 전까지 빌드를 멈춘다 — 한국어가 영어 페이지에 새지 않게", () => {
    db.refs = [ref("2026-11-04", 3)];
    expect(() => localeArticles("en", [card(1)])).toThrow(/Phase 5/);
    expect(() => loadEdition("en", "2026-11-04")).toThrow(/Phase 5/);
    expect(() => loadSearch("en")).toThrow(/Phase 5/);
  });
});

describe("뷰 문구 — 영어 건수는 복수형", () => {
  it("호 색인 건수 stories, 다른 매체 보도 outlets", () => {
    expect(editionMessages.ko.count(3)).toBe("3건");
    expect(editionMessages.en.count(1)).toBe("1 story");
    expect(editionMessages.en.count(31)).toBe("31 stories");
    expect(articleMessages.ko.coverage(2)).toBe("같은 소식, 다른 매체 · 2곳");
    expect(articleMessages.en.coverage(1)).toBe("Also reported by 1 outlet");
    expect(articleMessages.ko.moreInCategory("에이전트")).toBe("에이전트의 다른 기사");
    expect(articleMessages.en.moreInCategory("Agents")).toBe("More in Agents");
  });
});
