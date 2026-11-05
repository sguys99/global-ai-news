import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/*
 * 호 이동(EditionPager) — 보관 호(Phase 4-3)로 가는 링크는 next/link 가 아니라 일반 `<a>` 다. 보관 지면에는 RSC(index.txt)가
 * 없어 next/link 의 미리 받기·클라이언트 전환이 404 를 헛받는다. next/link 를 표지 달린 `<a>` 로 바꿔 둘을 가린다.
 */
vi.mock("next/link", () => ({
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: ReactNode;
  }) => (
    <a data-next-link="" className={className} href={href}>
      {children}
    </a>
  ),
}));

import { EditionPager } from "@/components/EditionPager";

const ref = (date: string, issueNo: number, archived?: boolean) => ({
  date,
  issueNo,
  publishedAt: `${date}T06:00:00+09:00`,
  cutoff: `${date}T23:59:59+09:00`,
  ...(archived === undefined ? {} : { archived }),
});

describe("EditionPager — 보관 호", () => {
  it("보관 호는 일반 <a>(basePath 포함 주소·같은 클래스), 나머지는 next/link", () => {
    render(<EditionPager prev={ref("2026-08-07", 50, true)} next={ref("2026-08-09", 52, false)} />);
    const prev = screen.getByRole("link", { name: /이전 호/ });
    const next = screen.getByRole("link", { name: /다음 호/ });
    expect(prev.hasAttribute("data-next-link")).toBe(false);
    expect(prev.getAttribute("href")).toBe("/edition/2026-08-07/"); // 테스트 환경 basePath ""
    expect(prev.textContent).toBe("← 이전 호제50호8월 7일(금)");
    expect(next.hasAttribute("data-next-link")).toBe(true);
    expect(next.getAttribute("href")).toBe("/edition/2026-08-09/");
    // 렌더 HTML 은 요소 종류만 다르다 — 클래스는 같은 묶음(방향 정렬만 다르다).
    expect(prev.className.replace("items-start", "")).toBe(
      next.className.replace("items-end text-right", ""),
    );
  });

  it("archived 가 없으면(기존 호출) next/link", () => {
    render(<EditionPager prev={ref("2026-11-03", 140)} next={null} />);
    expect(screen.getByRole("link", { name: /이전 호/ }).hasAttribute("data-next-link")).toBe(true);
  });
});
