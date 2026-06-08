// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceConfig } from "@/lib/types";

// 현재 sources.json 내용(테스트마다 재설정)
let currentSources: SourceConfig[] = [];

// node:fs 의 promises.readFile/writeFile 를 모킹 — 실제 파일 접근 차단
const writeFile = vi.fn(async () => {});
vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(async () => JSON.stringify(currentSources)),
    writeFile,
  },
}));

// GitHub 클라이언트 모킹 — 기본은 로컬 폴백(hasGithubConfig=false)
const commitFile = vi.fn(async () => {});
const hasGithubConfig = vi.fn(() => false);
vi.mock("@/lib/github", () => ({
  commitFile,
  hasGithubConfig,
}));

// 모킹 후 라우트 import
const { GET, POST, PUT, DELETE } = await import("@/app/api/admin/sources/route");

const rss: SourceConfig = {
  id: "techcrunch_ai",
  name: "TechCrunch AI",
  kind: "rss",
  url: "https://techcrunch.com/feed/",
  enabled: 1,
};

function reqJson(method: string, body: unknown) {
  return new Request("http://localhost/api/admin/sources", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  currentSources = [rss];
  writeFile.mockClear();
  commitFile.mockClear();
  hasGithubConfig.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/sources", () => {
  it("현재 소스 목록을 반환", async () => {
    const res = await GET();
    const body = (await res.json()) as { sources: SourceConfig[] };
    expect(res.status).toBe(200);
    expect(body.sources).toHaveLength(1);
  });
});

describe("POST (추가)", () => {
  it("정상 소스 추가 → 로컬 파일에 저장(dev 폴백)", async () => {
    const next: SourceConfig = {
      id: "theverge_ai",
      name: "The Verge AI",
      kind: "rss",
      url: "https://www.theverge.com/rss/index.xml",
      enabled: 1,
    };
    const res = await POST(reqJson("POST", next));
    const body = (await res.json()) as { target: string; sources: SourceConfig[] };
    expect(res.status).toBe(200);
    expect(body.target).toBe("local");
    expect(writeFile).toHaveBeenCalledOnce();
    expect(body.sources.map((s) => s.id)).toContain("theverge_ai");
  });

  it("reddit url(r/...) 형식은 통과", async () => {
    const reddit: SourceConfig = {
      id: "reddit_localllama",
      name: "r/LocalLLaMA",
      kind: "reddit",
      url: "r/LocalLLaMA",
      enabled: 1,
    };
    const res = await POST(reqJson("POST", reddit));
    expect(res.status).toBe(200);
  });

  it("중복 id 는 409", async () => {
    const res = await POST(reqJson("POST", rss));
    expect(res.status).toBe(409);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("잘못된 url(절대 URL 아님) 은 400", async () => {
    const bad: SourceConfig = { ...rss, id: "bad_src", url: "not-a-url" };
    const res = await POST(reqJson("POST", bad));
    expect(res.status).toBe(400);
  });

  it("reddit 인데 r/ 형식이 아니면 400", async () => {
    const bad: SourceConfig = {
      id: "bad_reddit",
      name: "x",
      kind: "reddit",
      url: "https://reddit.com/r/x",
      enabled: 1,
    };
    const res = await POST(reqJson("POST", bad));
    expect(res.status).toBe(400);
  });

  it("GitHub 설정이 있으면 commitFile 로 커밋", async () => {
    hasGithubConfig.mockReturnValue(true);
    const next: SourceConfig = { ...rss, id: "new_src" };
    const res = await POST(reqJson("POST", next));
    const body = (await res.json()) as { target: string };
    expect(res.status).toBe(200);
    expect(body.target).toBe("github");
    expect(commitFile).toHaveBeenCalledOnce();
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("PUT (수정/토글)", () => {
  it("존재하는 id 토글 → enabled 변경 저장", async () => {
    const res = await PUT(reqJson("PUT", { ...rss, enabled: 0 }));
    const body = (await res.json()) as { sources: SourceConfig[] };
    expect(res.status).toBe(200);
    expect(body.sources.find((s) => s.id === rss.id)?.enabled).toBe(0);
  });

  it("존재하지 않는 id 는 404", async () => {
    const res = await PUT(reqJson("PUT", { ...rss, id: "ghost" }));
    expect(res.status).toBe(404);
  });
});

describe("DELETE", () => {
  it("쿼리스트링 id 로 삭제", async () => {
    const res = await DELETE(
      new Request("http://localhost/api/admin/sources?id=techcrunch_ai", { method: "DELETE" }),
    );
    const body = (await res.json()) as { sources: SourceConfig[] };
    expect(res.status).toBe(200);
    expect(body.sources).toHaveLength(0);
  });

  it("존재하지 않는 id 는 404", async () => {
    const res = await DELETE(
      new Request("http://localhost/api/admin/sources?id=ghost", { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
  });

  it("id 누락 시 400", async () => {
    const res = await DELETE(reqJson("DELETE", {}));
    expect(res.status).toBe(400);
  });
});
