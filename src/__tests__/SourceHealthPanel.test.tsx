import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SourceHealthPanel } from "@/components/admin/SourceHealthPanel";
import { assessSourceHealth, type HealthRunInput } from "@/lib/sourceHealth";

const runs: HealthRunInput[] = [
  "techcrunch_ai: 20건(신규 9); industrial_ai: 실패 Status code 403; anthropic_news: 0건(신규 0)",
  "techcrunch_ai: 20건(신규 4); industrial_ai: 실패 Status code 403; anthropic_news: 0건(신규 0)",
  "techcrunch_ai: 20건(신규 7); industrial_ai: 실패 Status code 403; anthropic_news: 0건(신규 0)",
].map((notes, i) => ({ id: i + 1, startedAt: `2026-10-2${i + 7}T21:00:00.000Z`, notes }));

const sources = [
  { id: "techcrunch_ai", name: "TechCrunch AI", enabled: 1 },
  { id: "industrial_ai", name: "Industrial AI", enabled: 1 },
  { id: "anthropic_news", name: "Anthropic News", enabled: 1 },
  { id: "gnews_vla", name: "Google News: VLA", enabled: 1 },
  { id: "it_can_think", name: "It Can Think!", enabled: 0 },
];

afterEach(cleanup);

describe("SourceHealthPanel", () => {
  it("회차가 없으면 안내 문구", () => {
    render(<SourceHealthPanel report={assessSourceHealth(sources, [])} />);
    expect(screen.getByText(/수집 기록이 없습니다/)).toBeInTheDocument();
  });

  it("주의 이상 소스를 행으로, 정상 소스는 접힌 목록으로 보여준다", () => {
    render(<SourceHealthPanel report={assessSourceHealth(sources, runs)} />);

    expect(
      screen.getByText(/최근 3회 · 마지막 10\.30 회차 · 활성 소스 4개 · 비활성 1개 제외/),
    ).toBeInTheDocument();

    const error = screen.getByText("industrial_ai").closest("li")!;
    expect(within(error).getByText("오류")).toHaveClass("text-destructive");
    expect(within(error).getByText("3회 연속 수집 실패")).toBeInTheDocument();
    expect(within(error).getByText("Status code 403")).toBeInTheDocument();
    expect(within(error).getByText("창 안에 없음")).toBeInTheDocument();
    expect(within(error).getByRole("img", { name: "최근 3회: 수집 실패 3" })).toBeInTheDocument();

    const warn = screen.getByText("anthropic_news").closest("li")!;
    expect(within(warn).getByText("경고")).toBeInTheDocument();
    expect(within(warn).getByText(/3회 연속 0건/)).toBeInTheDocument();

    // 새 소스(회차 기록 없음)는 행 대신 한 줄 — 축약명 + id 로 구분된다.
    expect(screen.getByText("gnews_vla").closest("li")).toBeNull();
    expect(screen.getByText("기록 없음 1개")).toBeInTheDocument();
    expect(screen.getByText("gnews_vla").parentElement).toHaveAttribute(
      "title",
      "Google News: VLA (gnews_vla)",
    );

    // 정상 소스는 <details> 안 — 마지막 신규 날짜 대신 띠만.
    const details = screen.getByText(/정상 1개/).closest("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("techcrunch_ai")).toBeInTheDocument();
    expect(screen.queryByText("it_can_think")).not.toBeInTheDocument();
  });

  it("모두 정상이면 안내 한 줄", () => {
    render(<SourceHealthPanel report={assessSourceHealth(sources.slice(0, 1), runs)} />);
    expect(screen.getByText("모든 활성 소스가 정상입니다.")).toBeInTheDocument();
  });
});
