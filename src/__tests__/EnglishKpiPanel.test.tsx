import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EnglishKpiPanel } from "@/components/admin/EnglishKpiPanel";
import { KpiPanel } from "@/components/admin/KpiPanel";
import { parseEnglishNotes, sumEnglishNotes, type EnglishKpi } from "@/lib/englishKpi";

afterEach(cleanup);

const empty: EnglishKpi = {
  hasColumns: true,
  since: null,
  allPublished: 1255,
  overall: { published: 0, english: 0 },
  korea: { published: 0, english: 0 },
  overseas: { published: 0, english: 0 },
  checks: sumEnglishNotes([]),
  runs: [],
};

const n1 = parseEnglishNotes(
  "영어 가공 33/35건; 영어 기각 2건(한글 0·숫자 1·길이 1); 한국어 숫자 불일치 2건(900억 달러·27억)",
);

const filled: EnglishKpi = {
  hasColumns: true,
  since: "2026-11-04T21:01:00Z",
  allPublished: 1290,
  overall: { published: 35, english: 33 },
  korea: { published: 10, english: 9 },
  overseas: { published: 25, english: 24 },
  checks: sumEnglishNotes([n1]),
  runs: [
    {
      id: 143,
      startedAt: "2026-11-05T21:01:00Z",
      status: "success",
      notes: null,
      coverage: { published: 0, english: 0 },
    },
    {
      id: 142,
      startedAt: "2026-11-04T21:01:00Z",
      status: "partial",
      notes: n1,
      coverage: { published: 35, english: 33 },
    },
  ],
};

describe("EnglishKpiPanel", () => {
  it("영어판 이전이면 '아직 없음' — 0% 미터를 그리지 않는다", () => {
    render(<EnglishKpiPanel english={empty} />);
    const section = screen.getByRole("region", { name: "영어판" });
    expect(within(section).getByText("아직 없음")).toBeInTheDocument();
    expect(within(section).getByText("영어판 이전")).toBeInTheDocument();
    expect(within(section).getByText("1,255건")).toBeInTheDocument();
    expect(within(section).queryByRole("img")).not.toBeInTheDocument();
    expect(section.textContent).not.toContain("%");
  });

  it("커버리지·한국 매체/해외·기각 사유·한국어 경고·최근 회차를 보여준다", () => {
    render(<EnglishKpiPanel english={filled} />);
    const section = screen.getByRole("region", { name: "영어판" });
    expect(
      within(section).getByText(/2026\.11\.05 시작 이후 누적 · 영어 회차 1회/),
    ).toBeInTheDocument();

    // 미터는 색만이 아니라 aria-label 에 비율을 싣는다
    expect(screen.getByRole("img", { name: "영어 커버리지 94.3% (33/35건)" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "한국 매체 영어 커버리지 90% (9/10건)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "해외 매체 영어 커버리지 96% (24/25건)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("KOREA")).toBeInTheDocument();
    expect(screen.getByText(/시작 이전 게재 1,255건은 영어 없음/)).toBeInTheDocument();

    // 기각 사유 — 0건은 흐림
    const hangul = screen.getByText("한글").closest("div")!;
    expect(within(hangul).getByText("0")).toHaveClass("text-muted-foreground/60");
    const number = screen.getByText("숫자").closest("div")!;
    expect(within(number).getByText("1")).not.toHaveClass("text-muted-foreground/60");
    expect(screen.getByText("한국어 숫자 불일치").closest("dl")!.textContent).toContain("2건");

    // 최근 회차 — 최신 순, 영어 줄이 없는 회차는 '영어 기록 없음'
    const rows = within(screen.getByRole("list", { name: "최근 2회 영어 가공" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("11.06")).toBeInTheDocument();
    expect(within(rows[0]).getByText("영어 기록 없음")).toBeInTheDocument();
    expect(within(rows[1]).getByText("partial")).toBeInTheDocument();
    expect(
      within(rows[1]).getByRole("img", { name: "영어 가공 94.3% (33/35건)" }),
    ).toBeInTheDocument();
    expect(rows[1].textContent).toContain("기각 2 — 숫자 1 · 길이 1");
    expect(rows[1].textContent).toContain("한국어 숫자 2");
  });

  it("KpiPanel 은 english 를 주면 영어판 지면을 붙이고, 없으면 생략한다", () => {
    const kpi = {
      days: 30,
      runs: 3,
      successRate: 1,
      totalCost: 0.15,
      maxDailyCost: 0.05,
      avgDailyNew: 31,
      duplicateKeys: 0,
    };
    const { rerender } = render(<KpiPanel kpi={kpi} />);
    expect(screen.queryByRole("region", { name: "영어판" })).not.toBeInTheDocument();
    rerender(<KpiPanel kpi={kpi} english={empty} />);
    expect(screen.getByRole("region", { name: "영어판" })).toBeInTheDocument();
  });
});
