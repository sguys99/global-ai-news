// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowNotFoundError, dispatchWorkflow, getFile } from "@/lib/github";

beforeEach(() => {
  process.env.GITHUB_REPO = "owner/repo";
  process.env.GITHUB_PAT = "ghp_test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_REPO;
  delete process.env.GITHUB_PAT;
});

function mockFetch(status: number, body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }),
  );
}

describe("dispatchWorkflow", () => {
  it("204 면 정상 반환", async () => {
    mockFetch(204);
    await expect(dispatchWorkflow("collect.yml")).resolves.toBeUndefined();
  });

  it("404 면 WorkflowNotFoundError", async () => {
    mockFetch(404);
    await expect(dispatchWorkflow("collect.yml")).rejects.toBeInstanceOf(WorkflowNotFoundError);
  });

  it("GITHUB_PAT 없으면 에러", async () => {
    delete process.env.GITHUB_PAT;
    mockFetch(204);
    await expect(dispatchWorkflow("collect.yml")).rejects.toThrow("GITHUB_REPO / GITHUB_PAT");
  });
});

describe("getFile", () => {
  it("파일이 없으면(404) sha=null", async () => {
    mockFetch(404);
    expect(await getFile("configs/sources.json")).toEqual({ sha: null, content: null });
  });

  it("base64 content 를 디코드", async () => {
    const content = '[{"id":"x"}]';
    mockFetch(200, { sha: "abc", content: Buffer.from(content).toString("base64") });
    const res = await getFile("configs/sources.json");
    expect(res).toEqual({ sha: "abc", content });
  });
});
