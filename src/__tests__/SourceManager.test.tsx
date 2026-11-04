import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceManager } from "@/components/admin/SourceManager";
import type { SourceConfig } from "@/lib/types";

const SOURCES: SourceConfig[] = [
  {
    id: "aitimes",
    name: "AI타임스",
    nameEn: "AI Times",
    region: "kr",
    kind: "rss",
    url: "https://a",
    enabled: 1,
  },
  { id: "geeknews", name: "GeekNews", kind: "rss", url: "https://g", enabled: 1 },
];

describe("SourceManager — 영어판 소스 속성(region·nameEn)", () => {
  it("한국 매체 행에만 KOREA 배지와 영문명을 보인다", () => {
    render(<SourceManager initial={SOURCES} />);
    const [, korean, overseas] = screen.getAllByRole("row");
    expect(within(korean).getByText("KOREA")).toBeInTheDocument();
    expect(within(korean).getByText("AI Times")).toHaveAttribute("lang", "en");
    expect(within(overseas).queryByText("KOREA")).toBeNull();
  });

  it("수정을 누르면 폼에 영문명·지역이 채워지고, 비우면 생략(해외·영문명 없음)으로 돌아간다", () => {
    render(<SourceManager initial={SOURCES} />);
    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    const nameEn = screen.getByLabelText(/nameEn/) as HTMLInputElement;
    const region = screen.getByLabelText("region") as HTMLSelectElement;
    expect(nameEn.value).toBe("AI Times");
    expect(region.value).toBe("kr");
    fireEvent.change(nameEn, { target: { value: "" } });
    fireEvent.change(region, { target: { value: "" } });
    expect(nameEn.value).toBe("");
    expect(region.value).toBe("");
  });
});
