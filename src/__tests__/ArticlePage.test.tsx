import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleCard } from "@/lib/types";

// 상세 페이지는 빌드타임 DB 조회(서버 컴포넌트) — 조회 계층만 가짜로 바꿔 렌더한다.
const db = vi.hoisted(() => ({
  article: null as ArticleCard | null,
}));
vi.mock("@/lib/db", () => ({
  getArticle: () => db.article,
  getFeed: () => [],
  getAllArticleIds: () => [],
  getLatestPublishedAt: () => null,
}));

import ArticlePage from "@/app/article/[id]/page";

function article(p: Partial<ArticleCard>): ArticleCard {
  return {
    id: 7,
    source: { id: "gh_llm", name: "GitHub (topic:llm)" },
    url: "https://github.com/a/b",
    titleKo: "제목",
    summaryKo: "요약",
    titleOriginal: "Title",
    category: "",
    format: "oss",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-10-30T00:00:00Z",
    related: [],
    ...p,
  };
}

const renderPage = async () => render(await ArticlePage({ params: Promise.resolve({ id: "7" }) }));

/** 신호 패널(dl)의 "매체" 값. */
const outlet = () => screen.getByText("매체").nextElementSibling as HTMLElement;

describe("상세 신호 패널 — 매체는 사이트 공통 축약명", () => {
  beforeEach(() => {
    db.article = null;
  });

  it("피드 구분이 붙은 소스명 대신 매체 축약명, 원래 이름은 툴팁", async () => {
    db.article = article({ source: { id: "gh_llm", name: "GitHub (topic:llm)" } });
    await renderPage();
    expect(outlet().textContent).toBe("GitHub");
    expect(outlet().querySelector("[title]")).toHaveAttribute("title", "GitHub (topic:llm)");
    expect(screen.queryByText("GitHub (topic:llm)")).toBeNull();
  });

  it("Hugging Face 는 공식 표기 — 360px 에서 잘리던 'HuggingFace Daily P…' 대신 짧은 이름", async () => {
    db.article = article({
      format: "paper",
      source: { id: "hf_daily_papers", name: "HuggingFace Daily Papers" },
    });
    await renderPage();
    expect(outlet().textContent).toBe("Hugging Face");
  });

  it("축약이 없는 매체는 이름 그대로, 툴팁 없음", async () => {
    db.article = article({ format: "news", source: { id: "hn", name: "Hacker News" } });
    await renderPage();
    expect(outlet().textContent).toBe("Hacker News");
    expect(outlet().querySelector("[title]")).toBeNull();
  });
});
