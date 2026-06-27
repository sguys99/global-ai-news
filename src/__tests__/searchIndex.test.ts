// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSearchDocument, queryMatchingIds } from "@/lib/searchIndex";
import type { SearchIndexEntry } from "@/lib/types";

/** search.test.ts 와 유사한 시드를 인덱스 항목으로 구성(본문 없음). */
function entry(p: Partial<SearchIndexEntry> & Pick<SearchIndexEntry, "id">): SearchIndexEntry {
  return {
    source: { id: "hackernews", name: "Hacker News" },
    url: "https://x",
    titleKo: "",
    summaryKo: "",
    titleOriginal: "",
    category: "",
    tags: [],
    trendingScore: 0,
    importance: 0,
    publishedAt: "2026-01-01T00:00:00Z",
    ...p,
  };
}

const ENTRIES: SearchIndexEntry[] = [
  entry({
    id: 1,
    titleKo: "에이전트 프레임워크 출시",
    summaryKo: "새로운 LLM 에이전트",
    titleOriginal: "Agent Framework Released",
    tags: ["agent", "llm"],
  }),
  entry({
    id: 2,
    titleKo: "데이터베이스 최적화",
    summaryKo: "쿼리 성능 개선",
    titleOriginal: "Database Optimization Tips",
    tags: ["database"],
  }),
  entry({ id: 3, titleOriginal: "Rust Memory Safety" }),
];

const index = buildSearchDocument(ENTRIES);

describe("queryMatchingIds", () => {
  it("영문 토큰을 원문 제목에서 매칭", () => {
    expect(queryMatchingIds(index, "Agent")).toContain(1);
  });

  it("한국어 토큰을 title_ko/summary_ko 에서 매칭", () => {
    expect(queryMatchingIds(index, "에이전트")).toEqual([1]);
  });

  it("한국어 부분 문자열(full 토크나이즈)도 매칭", () => {
    // '레임' 은 '프레임워크'의 부분 문자열
    expect(queryMatchingIds(index, "레임")).toEqual([1]);
  });

  it("태그명으로 매칭", () => {
    expect(queryMatchingIds(index, "database")).toContain(2);
  });

  it("빈 질의는 빈 배열", () => {
    expect(queryMatchingIds(index, "")).toEqual([]);
    expect(queryMatchingIds(index, "   ")).toEqual([]);
  });

  it("매칭 없으면 빈 배열", () => {
    expect(queryMatchingIds(index, "존재하지않는키워드xyz")).toEqual([]);
  });
});
