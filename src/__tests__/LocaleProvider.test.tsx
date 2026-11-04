import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider, useLocale, useMessages } from "@/components/LocaleProvider";
import { commonMessages } from "@/lib/messages/common";

function Probe() {
  const locale = useLocale();
  const t = useMessages(commonMessages);
  return (
    <p data-testid="probe">
      {locale}|{t.nav.search}|{t.visits(2)}
    </p>
  );
}

describe("LocaleProvider", () => {
  it("공급자 밖은 ko(기존 컴포넌트 테스트·한국어 레이아웃)", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("ko|검색|누적 방문 2회");
  });

  it("en 공급자 안은 영어 문구", () => {
    render(
      <LocaleProvider locale="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("en|Search|2 visits");
  });
});
