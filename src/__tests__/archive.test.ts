// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  ARCHIVE_WINDOW_DAYS,
  isArchivedIssueDate,
  planArchive,
  type ArchivePlan,
} from "@/lib/archive";

/*
 * 보관 등급(Phase 4-3) 규칙 — 단일 출처 src/lib/archive.ts. 경계는 호 썸네일 창(hasEditionThumbnail)과 같은 셈:
 * 나이(최신 호 날짜 − 호 날짜, KST 달력 일) 0~89 는 전체 페이지, 90 이상은 보관.
 */

describe("isArchivedIssueDate", () => {
  it("창은 90일", () => {
    expect(ARCHIVE_WINDOW_DAYS).toBe(90);
  });

  it("나이 89 는 전체 페이지, 90 부터 보관 — 기준은 DB 최신 호", () => {
    expect(isArchivedIssueDate("2026-08-08", "2026-11-05")).toBe(false); // 89일
    expect(isArchivedIssueDate("2026-08-07", "2026-11-05")).toBe(true); // 90일
    expect(isArchivedIssueDate("2026-06-07", "2026-11-05")).toBe(true);
    expect(isArchivedIssueDate("2026-11-05", "2026-11-05")).toBe(false); // 최신 호 자신
  });

  it("월·연도 경계도 달력 일로 센다", () => {
    // 2026-10-03 → 2027-01-01 = 31 + 30 + 29 = 90일
    expect(isArchivedIssueDate("2026-10-04", "2027-01-01")).toBe(false); // 89일
    expect(isArchivedIssueDate("2026-10-03", "2027-01-01")).toBe(true); // 90일
  });

  it("최신 호보다 뒤·최신 호 없음·빈·잘못된 날짜는 보관이 아니다(전체 페이지가 안전한 기본값)", () => {
    expect(isArchivedIssueDate("2026-12-01", "2026-11-05")).toBe(false);
    expect(isArchivedIssueDate("2026-01-01", null)).toBe(false);
    expect(isArchivedIssueDate("", "2026-11-05")).toBe(false);
    expect(isArchivedIssueDate(undefined, "2026-11-05")).toBe(false);
    expect(isArchivedIssueDate("not-a-date", "2026-11-05")).toBe(false);
  });

  it("창을 바꿔 부를 수 있다(리허설용)", () => {
    expect(isArchivedIssueDate("2026-10-26", "2026-11-05", 10)).toBe(true);
    expect(isArchivedIssueDate("2026-10-27", "2026-11-05", 10)).toBe(false);
  });
});

describe("planArchive", () => {
  const plan = planArchive({
    latestEditionDate: "2026-11-05",
    articleIds: [3, 1, 2, 4, 2],
    articleIssueDates: new Map([
      [1, "2026-06-07"],
      [2, "2026-08-07"],
      [3, "2026-08-08"],
      // 4: 호 날짜를 모른다 → 전체 페이지
    ]),
    editionDates: ["2026-11-05", "2026-06-07", "2026-08-07", "2026-08-08"],
  });

  it("기사·호를 전체/보관으로 서로소로 나누고 정렬한다", () => {
    expect(plan).toEqual<ArchivePlan>({
      latestEditionDate: "2026-11-05",
      liveArticleIds: [3, 4],
      archivedArticleIds: [1, 2],
      liveEditionDates: ["2026-08-08", "2026-11-05"],
      archivedEditionDates: ["2026-06-07", "2026-08-07"],
    });
  });

  it("최신 호가 없으면 보관 없음", () => {
    const empty = planArchive({
      latestEditionDate: null,
      articleIds: [1],
      articleIssueDates: new Map([[1, "2020-01-01"]]),
      editionDates: ["2020-01-01"],
    });
    expect(empty.archivedArticleIds).toEqual([]);
    expect(empty.archivedEditionDates).toEqual([]);
  });
});

/*
 * 라우트 generateStaticParams 가 보관 대상을 빼는지 — DB 계층만 가짜로(getArchivePlan) 실제 라우트를 부른다.
 */
const fakePlan: ArchivePlan = {
  latestEditionDate: "2026-11-05",
  liveArticleIds: [10, 11],
  archivedArticleIds: [1, 2],
  liveEditionDates: ["2026-11-04", "2026-11-05"],
  archivedEditionDates: ["2026-06-07"],
};
vi.mock("@/lib/db", () => ({
  getArchivePlan: () => fakePlan,
  getLatestEditionRef: () => null,
}));
vi.mock("@/views/EditionView", () => ({ EditionView: () => null }));
vi.mock("@/views/ArticleView", () => ({ ArticleView: () => null }));
vi.mock("@/views/data", () => ({
  loadEdition: () => null,
  loadArticle: () => null,
  articleThumbnail: () => undefined,
}));

describe("라우트 — 보관 대상은 전체 페이지를 만들지 않는다", () => {
  it("기사 상세", async () => {
    const { generateStaticParams, dynamicParams } = await import("@/app/(ko)/article/[id]/page");
    expect(generateStaticParams()).toEqual([{ id: "10" }, { id: "11" }]);
    expect(dynamicParams).toBe(false);
  });

  it("호 고정 링크", async () => {
    const { generateStaticParams, dynamicParams } = await import("@/app/(ko)/edition/[date]/page");
    expect(generateStaticParams()).toEqual([{ date: "2026-11-04" }, { date: "2026-11-05" }]);
    expect(dynamicParams).toBe(false);
  });
});
