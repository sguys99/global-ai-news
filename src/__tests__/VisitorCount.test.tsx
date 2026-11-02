import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countPath } from "@/components/Analytics";
import { VisitorCount, parseVisitorCount } from "@/components/VisitorCount";
import { GOATCOUNTER_URL, VISITOR_COUNT_MIN } from "@/lib/site";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stubFetch = (impl: () => Promise<unknown>) => {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const okJson = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe("parseVisitorCount", () => {
  it("천 단위 쉼표 문자열을 숫자로 읽는다", () => {
    expect(parseVisitorCount({ count: "1,234", count_unique: "1,234" })).toBe(1234);
    expect(parseVisitorCount({ count: "0" })).toBe(0);
  });

  it("형식이 다르면 null", () => {
    expect(parseVisitorCount(null)).toBeNull();
    expect(parseVisitorCount({})).toBeNull();
    expect(parseVisitorCount({ count: 12 })).toBeNull();
    expect(parseVisitorCount({ count: "" })).toBeNull();
  });
});

describe("VisitorCount", () => {
  it("정적 렌더엔 아무것도 없다(마운트 후 받아 그린다)", () => {
    expect(renderToString(<VisitorCount />)).toBe("");
  });

  it("하한 이상이면 누적 방문을 표시한다", async () => {
    const fetchMock = stubFetch(() => okJson({ count: "12,345" }));
    render(<VisitorCount />);
    expect(await screen.findByText("누적 방문 12,345회")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`${GOATCOUNTER_URL}/counter/TOTAL.json`);
  });

  it("하한 미만이면 숨긴다", async () => {
    const fetchMock = stubFetch(() => okJson({ count: String(VISITOR_COUNT_MIN - 1) }));
    const { container } = render(<VisitorCount />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("요청 실패·오류 응답이면 숨긴다", async () => {
    stubFetch(() => Promise.reject(new Error("offline")));
    const failed = render(<VisitorCount />);
    await waitFor(() => expect(failed.container).toBeEmptyDOMElement());
    cleanup();

    const fetchMock = stubFetch(() => Promise.resolve({ ok: false, json: () => okJson({}) }));
    const notFound = render(<VisitorCount />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(notFound.container).toBeEmptyDOMElement();
  });
});

describe("countPath", () => {
  it("trailingSlash 와 맞춰 끝 슬래시를 붙인다", () => {
    // 테스트(dev)엔 NEXT_PUBLIC_BASE_PATH 가 없어 basePath 는 빈 문자열.
    expect(countPath("/")).toBe("/");
    expect(countPath("/article/42")).toBe("/article/42/");
    expect(countPath("/edition/2026-11-01/")).toBe("/edition/2026-11-01/");
  });
});
