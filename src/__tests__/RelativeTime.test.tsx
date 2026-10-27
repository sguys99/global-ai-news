import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RelativeTime } from "@/components/RelativeTime";
import { formatRelativeKst } from "@/lib/labels";

// 기사 2026-10-26T18:00Z(10/27 03:00 KST), 호 발행 2026-10-26T21:00Z(10/27 06:00 KST)
const ISO = "2026-10-26T18:00:00Z";
const BASE = "2026-10-26T21:00:00Z";

beforeEach(() => {
  vi.useFakeTimers();
  // 독자가 18:00 KST(= 09:00Z)에 연다
  vi.setSystemTime(new Date("2026-10-27T09:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RelativeTime", () => {
  it("정적(서버) 렌더는 base 기준 값으로 결정적이다", () => {
    const html = renderToString(<RelativeTime iso={ISO} base={BASE} />);
    expect(formatRelativeKst(ISO, BASE)).toBe("3시간 전");
    expect(html).toContain(">3시간 전</time>");
  });

  it("마운트 후 실제 시각으로 다시 계산하고 title·dateTime 을 단다", () => {
    render(<RelativeTime iso={ISO} base={BASE} className="text-xs" />);
    const el = screen.getByText("15시간 전");
    expect(el.tagName).toBe("TIME");
    expect(el.getAttribute("datetime")).toBe(ISO);
    expect(el.getAttribute("title")).toBe("2026.10.27 03:00 KST");
    expect(el.className).toContain("tabular-nums");
    expect(el.className).toContain("text-xs");
  });

  it("60초마다 갱신한다", () => {
    const iso = "2026-10-27T08:58:30Z"; // 지금보다 1분 30초 전
    render(<RelativeTime iso={iso} base={BASE} />);
    expect(screen.getByText("1분 전")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("2분 전")).toBeTruthy();
  });

  it("탭이 다시 보이면 즉시 갱신하고, 언마운트 시 타이머를 정리한다", () => {
    const iso = "2026-10-27T08:58:30Z";
    const { unmount } = render(<RelativeTime iso={iso} base={BASE} />);

    vi.setSystemTime(new Date("2026-10-27T09:30:00Z")); // 타이머 없이 시계만 이동
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("31분 전")).toBeTruthy();

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
