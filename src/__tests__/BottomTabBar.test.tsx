import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomTabBar } from "@/components/mobile/BottomTabBar";

// usePathname을 라우트별로 갈아끼울 수 있도록 모킹한다.
const usePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BottomTabBar", () => {
  it("피드(/)에서 피드 탭만 active(text-primary)로 표시된다", () => {
    usePathname.mockReturnValue("/");
    render(<BottomTabBar />);

    const feed = screen.getByRole("link", { name: "피드" });
    const search = screen.getByRole("link", { name: "검색" });

    expect(feed).toHaveClass("text-primary", "font-semibold");
    expect(search).not.toHaveClass("text-primary");
    expect(search).toHaveClass("text-muted-foreground");
  });

  it("검색(/search)에서 검색 탭이 active로 표시된다", () => {
    usePathname.mockReturnValue("/search");
    render(<BottomTabBar />);

    const feed = screen.getByRole("link", { name: "피드" });
    const search = screen.getByRole("link", { name: "검색" });

    expect(search).toHaveClass("text-primary", "font-semibold");
    expect(feed).not.toHaveClass("text-primary");
  });

  it("쿼리스트링이 붙은 /search?q=foo 에서도 검색 탭이 active다", () => {
    usePathname.mockReturnValue("/search");
    render(<BottomTabBar />);

    expect(screen.getByRole("link", { name: "검색" })).toHaveClass("text-primary");
  });

  it("상세(/article/123)에서는 렌더하지 않는다(null)", () => {
    usePathname.mockReturnValue("/article/123");
    const { container } = render(<BottomTabBar />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("두 탭 모두 올바른 href를 가진다", () => {
    usePathname.mockReturnValue("/");
    render(<BottomTabBar />);

    expect(screen.getByRole("link", { name: "피드" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "검색" })).toHaveAttribute("href", "/search");
  });
});
