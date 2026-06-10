import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FilterSheet } from "@/components/mobile/FilterSheet";
import type { SearchOptions } from "@/lib/db";

const sources = [
  { id: "techcrunch", name: "TechCrunch AI" },
  { id: "github", name: "GitHub (topic:llm)" },
];
const tags = ["LLM", "오픈소스"];

function renderSheet(current: SearchOptions = {}) {
  return render(
    <FilterSheet current={current} sources={sources} tags={tags} basePath="/search" />,
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("FilterSheet", () => {
  it("초기에는 시트가 닫혀 있어 FilterBar(소스 칩)가 렌더되지 않는다", () => {
    renderSheet();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "TechCrunch" })).not.toBeInTheDocument();
  });

  it("트리거를 누르면 시트가 열리고 재사용된 FilterBar 칩이 렌더된다", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /필터/ }));

    expect(screen.getByRole("dialog", { name: "필터" })).toBeInTheDocument();
    // FilterBar 재사용: 소스 축약 라벨 + 태그 링크가 보인다
    expect(screen.getByRole("link", { name: "TechCrunch" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LLM" })).toBeInTheDocument();
  });

  it("'결과 보기'를 누르면 시트가 닫힌다", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /필터/ }));
    fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ESC 키로 시트를 닫는다", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /필터/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("적용된 소스·태그 수를 트리거 배지로 표기한다(정렬 제외)", () => {
    renderSheet({ source: "techcrunch", tag: "LLM", sort: "importance" });
    // 트리거 버튼 텍스트에 활성 개수 2가 포함된다
    expect(screen.getByRole("button", { name: /필터/ })).toHaveTextContent("2");
  });

  it("활성 필터가 없으면 배지를 표기하지 않는다", () => {
    renderSheet();
    const trigger = screen.getByRole("button", { name: /필터/ });
    expect(trigger).not.toHaveTextContent("1");
    expect(trigger).not.toHaveTextContent("2");
  });
});
