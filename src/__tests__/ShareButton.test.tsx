import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Masthead } from "@/components/Masthead";
import { ShareButton } from "@/components/ShareButton";
import { SITE_URL } from "@/lib/site";

const URL_ = "https://example.com/edition/2026-10-08/";
const writeText = vi.fn<(text: string) => Promise<void>>();

/** jsdom 에는 matchMedia·Web Share·Clipboard 가 없어 기기 유형별로 심는다. */
function setDevice({
  touch,
  share,
}: {
  touch: boolean;
  share?: (data: ShareData) => Promise<void>;
}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: touch && q === "(pointer: coarse)", media: q }),
  });
  Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: share });
}

beforeEach(() => {
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  writeText.mockReset();
});

describe("ShareButton", () => {
  it("터치 기기 + Web Share 지원 → OS 공유 시트로 고정 링크를 넘기고 복사하지 않는다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setDevice({ touch: true, share });
    render(<ShareButton url={URL_} title="제113호" />);

    fireEvent.click(screen.getByRole("button", { name: /공유/ }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "제113호", url: URL_ }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("공유 시트를 닫으면(AbortError) 복사로 넘어가지 않는다", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError"));
    setDevice({ touch: true, share });
    render(<ShareButton url={URL_} title="t" />);

    fireEvent.click(screen.getByRole("button", { name: /공유/ }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
  });

  it("데스크톱(정밀 포인터)은 Web Share 가 있어도 링크를 복사하고 완료를 알린다", async () => {
    const share = vi.fn();
    setDevice({ touch: false, share });
    render(<ShareButton url={URL_} title="t" />);

    fireEvent.click(screen.getByRole("button", { name: /공유/ }));

    await screen.findByRole("button", { name: /링크 복사됨/ });
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(share).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("링크를 복사했습니다");
  });

  it("클립보드가 막히면 프롬프트로 링크를 보여 준다", async () => {
    setDevice({ touch: false });
    writeText.mockRejectedValue(new Error("denied"));
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    render(<ShareButton url={URL_} title="t" />);

    fireEvent.click(screen.getByRole("button", { name: /공유/ }));

    await waitFor(() => expect(prompt).toHaveBeenCalledWith(expect.any(String), URL_));
  });
});

describe("Masthead 공유", () => {
  it("홈 주소가 아니라 KST 발행일의 호 고정 링크를 공유한다", async () => {
    setDevice({ touch: false });
    // 2026-10-07 22:29 UTC = 2026-10-08 07:29 KST
    render(
      <Masthead
        issueNo={113}
        publishedAt="2026-10-07T22:29:49.427Z"
        total={30}
        sourceCount={12}
        categories={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /공유/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/edition/2026-10-08/`));
  });

  it("발행 정보가 없으면(수집 전) 공유 버튼을 그리지 않는다", () => {
    render(<Masthead issueNo={0} publishedAt={null} total={0} sourceCount={0} categories={[]} />);
    expect(screen.queryByRole("button", { name: /공유/ })).toBeNull();
  });
});
