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
  it("서버(정적) 렌더는 아무것도 그리지 않는다", () => {
    vi.setSystemTime(new Date("2026-10-27T05:00:00Z"));
    expect(renderToString(<IssueDelayNotice issueDate="2026-10-25" />)).toBe("");
  });

  it("호 날짜가 오늘이면 숨긴다", () => {
    vi.setSystemTime(new Date("2026-10-27T05:00:00Z")); // 14:00 KST
    render(<IssueDelayNotice issueDate="2026-10-27" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("어제 호는 08:00 KST 전에는 숨기고 이후에 보인다", () => {
    vi.setSystemTime(new Date("2026-10-26T22:30:00Z")); // 10/27 07:30 KST
    render(<IssueDelayNotice issueDate="2026-10-26" />);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      vi.setSystemTime(new Date("2026-10-26T23:01:00Z")); // 08:01 KST
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("status").textContent).toBe(
      "최신 호10월 26일(월) 발행 — 오늘 호는 아직 발행 전입니다",
    );
  });

  it("이틀 이상 지난 호는 이른 시각에도 보인다", () => {
    vi.setSystemTime(new Date("2026-10-26T20:00:00Z")); // 10/27 05:00 KST
    render(<IssueDelayNotice issueDate="2026-10-25" />);
    expect(screen.getByRole("status").textContent).toContain("10월 25일(일) 발행 이후");
  });
});
