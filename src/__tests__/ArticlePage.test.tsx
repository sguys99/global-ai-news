import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleCard, FollowUpEntry } from "@/lib/types";

// 상세 페이지는 빌드타임 DB 조회(서버 컴포넌트) — 조회 계층만 가짜로 바꿔 렌더한다.
const db = vi.hoisted(() => ({
  article: null as ArticleCard | null,
  thread: [] as FollowUpEntry[],
}));
vi.mock("@/lib/db", () => ({
  getArticle: () => db.article,
  getFeed: () => [],
  getFollowUpThread: () => db.thread,
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

/** 사건 타임라인 한 줄. issuedAt 21:00 UTC = 다음 날 06:00 KST 호. */
function entry(
  id: number,
  relation: FollowUpEntry["relation"],
  issuedAt: string,
  p: Partial<FollowUpEntry> = {},
): FollowUpEntry {
  return {
    id,
    titleKo: `기사 ${id}`,
    titleOriginal: `Story ${id}`,
    sourceName: "GitHub (topic:llm)",
    issuedAt,
    relation,
    ...p,
  };
}

const thread = () => screen.queryByRole("region", { name: /이전 보도|후속 보도|사건 흐름/ });

describe("상세 사건 타임라인 — 후속 보도 연결", () => {
  beforeEach(() => {
    db.article = article({ id: 7, format: "news" });
    db.thread = [];
  });

  it("연결이 없으면 섹션이 없다", async () => {
    await renderPage();
    expect(thread()).toBeNull();
  });

  it("이전 보도만: 머리 '이전 보도', 제목 링크·호 날짜·매체 축약명·날짜 차, 보고 있는 기사는 표지 한 줄", async () => {
    db.thread = [
      entry(3, "earlier", "2026-10-27T21:00:00Z", { titleKo: "미스트랄, 라지 4 발표" }),
      entry(7, "current", "2026-10-30T21:00:00Z"),
    ];
    await renderPage();
    const section = thread()!;
    expect(within(section).getByRole("heading").textContent).toBe("이전 보도");
    const link = within(section).getByRole("link");
    expect(link).toHaveAttribute("href", "/article/3");
    expect(link.textContent).toContain("미스트랄, 라지 4 발표");
    expect(link.textContent).toContain("이전 보도");
    expect(link.textContent).toContain("GitHub"); // 축약명
    expect(link.textContent).not.toContain("topic:llm");
    expect(link.textContent).toContain("3일 전");
    expect(within(section).getByText("10.28")).toHaveAttribute("title", "2026.10.28 호");
    // 보고 있는 기사: 링크가 아니고 제목을 되풀이하지 않는다.
    const current = within(section).getByText("지금 보는 기사").closest("[aria-current]");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
  });

  it("후속 보도만(여럿): 머리 '후속 보도 · N건', 날짜 순, '같은 날'·'N일 뒤'", async () => {
    db.thread = [
      entry(7, "current", "2026-10-27T21:00:00Z"),
      entry(8, "later", "2026-10-28T03:00:00Z"),
      entry(9, "later", "2026-10-29T21:00:00Z", { titleKo: "" }),
    ];
    await renderPage();
    const section = thread()!;
    expect(within(section).getByRole("heading").textContent).toBe("후속 보도 · 2건");
    const links = within(section).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/article/8", "/article/9"]);
    expect(links[0].textContent).toContain("같은 날");
    expect(links[1].textContent).toContain("2일 뒤");
    expect(links[1].textContent).toContain("Story 9"); // 한국어 제목이 없으면 원제
  });

  it("둘 다: 머리 '사건 흐름 · N건'(보고 있는 기사 포함), 이전 → 이 기사 → 후속 순", async () => {
    db.thread = [
      entry(3, "earlier", "2026-10-26T21:00:00Z"),
      entry(7, "current", "2026-10-27T21:00:00Z"),
      entry(9, "later", "2026-10-28T21:00:00Z"),
    ];
    await renderPage();
    const section = thread()!;
    expect(within(section).getByRole("heading").textContent).toBe("사건 흐름 · 3건");
    const rows = within(section).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("이전 보도"),
      expect.stringContaining("지금 보는 기사"),
      expect.stringContaining("후속 보도"),
    ]);
  });

  it("요약 바로 뒤, '같은 소식, 다른 매체' 앞에 둔다", async () => {
    db.article = article({
      id: 7,
      related: [{ source: "The Verge", url: "https://v/1", title: "Other" }],
    });
    db.thread = [
      entry(3, "earlier", "2026-10-26T21:00:00Z"),
      entry(7, "current", "2026-10-27T21:00:00Z"),
    ];
    const { container } = await renderPage();
    const headings = [...container.querySelectorAll("h2")].map((h) => h.id);
    expect(headings.indexOf("thread-heading")).toBe(headings.indexOf("summary-heading") + 1);
    expect(headings.indexOf("coverage-heading")).toBeGreaterThan(
      headings.indexOf("thread-heading"),
    );
  });
});
