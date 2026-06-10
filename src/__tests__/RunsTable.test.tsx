import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RunsTable } from "@/components/admin/RunsTable";
import type { RunRow } from "@/lib/types";

function makeRun(over: Partial<RunRow> = {}): RunRow {
  return {
    id: 1,
    started_at: "2026-06-09T03:00:00.000Z",
    finished_at: "2026-06-09T03:01:00.000Z",
    items_collected: 120,
    items_new: 34,
    llm_calls: 34,
    input_tokens: 12000,
    output_tokens: 4000,
    est_cost_usd: 0.05,
    status: "success",
    notes: null,
    ...over,
  };
}

afterEach(cleanup);

describe("RunsTable", () => {
  it("이력이 없으면 안내 문구를 보여준다", () => {
    render(<RunsTable runs={[]} />);
    expect(screen.getByText(/아직 실행 이력이 없습니다/)).toBeInTheDocument();
  });

  it("같은 실행 데이터를 모바일 카드(목록)와 데스크톱 표 양쪽에 렌더한다", () => {
    render(<RunsTable runs={[makeRun({ status: "success" })]} />);

    // 데스크톱 표
    expect(screen.getByRole("table")).toBeInTheDocument();
    // 모바일 카드 목록
    const list = screen.getByRole("list");
    expect(within(list).getByText("성공")).toBeInTheDocument();
    expect(within(list).getByText("수집 / 신규")).toBeInTheDocument();
    expect(within(list).getByText("120 / 34")).toBeInTheDocument();
  });

  it("비용 임계($0.30) 초과 실행은 카드·표 모두에서 강조한다", () => {
    render(<RunsTable runs={[makeRun({ id: 7, est_cost_usd: 0.45 })]} />);

    // 모바일 카드: 임계 초과 배경 강조
    const card = screen.getByRole("listitem");
    expect(card).toHaveClass("bg-destructive/5");
    // 비용 값은 카드·표 두 곳에 같은 포맷(0.4500)으로 나타난다
    expect(screen.getAllByText("0.4500")).toHaveLength(2);
  });

  it("notes 없는 실행은 카드에 비고 문단을 렌더하지 않는다", () => {
    render(<RunsTable runs={[makeRun({ notes: null })]} />);
    const card = screen.getByRole("listitem");
    expect(card.querySelector("p")).toBeNull();
  });
});
