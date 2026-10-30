import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IssueDelayNotice } from "@/components/IssueDelayNotice";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("IssueDelayNotice", () => {
  it("서버(정적) 렌더는 initialGap 이 0 이면 비우고, 1 이상이면 안내를 이미 담는다", () => {
    vi.setSystemTime(new Date("2026-10-27T05:00:00Z"));
    expect(renderToString(<IssueDelayNotice issueDate="2026-10-25" />)).toBe("");
    const html = renderToString(
      <IssueDelayNotice issueDate="2026-10-25" issueNo={131} initialGap={2} />,
    );
    expect(html).toContain("발행 지연");
    expect(html).toContain("10.25(일) 호 이후 새 호 지연 · 2일째");
    expect(html).toContain("10월 25일 일요일 제131호");
  });

  it("initialGap 으로 첫 렌더부터 보이고(마운트 전 효과 없이), 마운트 후 현재 시각으로 갱신된다", () => {
    vi.setSystemTime(new Date("2026-10-27T05:00:00Z")); // 14:00 KST
    const { container } = render(<IssueDelayNotice issueDate="2026-10-27" initialGap={1} />);
    // 효과가 호 날짜=오늘로 판단해 안내를 걷는다(서버가 낡은 빌드 기준으로 그렸더라도 클라가 바로잡음).
    expect(container.querySelector("[role=status]")).toBeNull();
  });

  it("호 날짜가 오늘이면 숨긴다", () => {
    vi.setSystemTime(new Date("2026-10-27T05:00:00Z")); // 14:00 KST
    render(<IssueDelayNotice issueDate="2026-10-27" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("어제 호는 08:00 KST 전에는 숨기고 이후에 '발행 전'으로 보인다", () => {
    vi.setSystemTime(new Date("2026-10-26T22:30:00Z")); // 10/27 07:30 KST
    render(<IssueDelayNotice issueDate="2026-10-26" issueNo={132} />);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      vi.setSystemTime(new Date("2026-10-26T23:01:00Z")); // 08:01 KST
      vi.advanceTimersByTime(60_000);
    });
    const status = screen.getByRole("status");
    expect(status.textContent).toBe(
      "발행 전" +
        "10.27(화) 호 발행 전 · 10.26(월) 호를 보는 중" +
        "10월 27일 화요일 호는 아직 발행 전입니다 — 지금은 10월 26일 월요일 제132호를 보고 계십니다.",
    );
    // 전체 문장의 앞 구절(오늘 호)만 잉크로 강조한다.
    expect(status.querySelector("b")?.textContent).toBe("10월 27일 화요일 호");
  });

  it("이틀 이상 지난 호는 이른 시각에도 '발행 지연'으로 보인다", () => {
    vi.setSystemTime(new Date("2026-10-26T20:00:00Z")); // 10/27 05:00 KST
    render(<IssueDelayNotice issueDate="2026-10-25" issueNo={131} />);
    const status = screen.getByRole("status");
    expect(status.firstElementChild?.textContent).toBe("발행 지연");
    expect(status.textContent).toContain(
      "10월 25일 일요일 제131호 이후 새 호가 나오지 않았습니다 — 발행이 2일째 늦어지고 있습니다.",
    );
  });
});
