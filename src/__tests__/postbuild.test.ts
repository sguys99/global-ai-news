// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  POSTBUILD_STEPS,
  articleRscFiles,
  formatPostbuildSummary,
  removeArticleRsc,
  runPostbuild,
  type PostbuildStep,
} from "../../scripts/lib/postbuild";
import { archiveStep } from "../../scripts/lib/archive";

let out: string;

function put(rel: string, content = "x") {
  const abs = path.join(out, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** 정적 export 모양의 작은 out/ — 기사·호·홈·영어 기사, 그리고 지우면 안 되는 비슷한 이름들. */
function fixture() {
  put("index.html", "<html>");
  put("index.txt", "home-rsc");
  put("404.html", "404");
  put("article/1/index.html", "a1");
  put("article/1/index.txt", "1234567890"); // 10 B
  put("article/22/index.html", "a22");
  put("article/22/index.txt", "12345"); // 5 B
  put("en/article/3/index.html", "en3");
  put("en/article/3/index.txt", "123"); // 3 B
  put("edition/2026-11-04/index.html", "ed");
  put("edition/2026-11-04/index.txt", "ed-rsc");
  put("search/index.txt", "search-rsc");
  put("og/article/1.png", "png");
  put("article/notes/index.txt", "not an article id");
  put("article/9/other.txt", "not index.txt");
}

beforeEach(() => {
  out = mkdtempSync(path.join(os.tmpdir(), "postbuild-test-"));
});
afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

describe("articleRscFiles", () => {
  it("한국어·영어 기사 id 디렉터리의 index.txt 만 고른다", () => {
    fixture();
    expect(articleRscFiles(out)).toEqual([
      "article/1/index.txt",
      "article/22/index.txt",
      "en/article/3/index.txt",
    ]);
  });

  it("기사 디렉터리가 없으면 빈 목록", () => {
    put("index.html");
    expect(articleRscFiles(out)).toEqual([]);
  });
});

describe("removeArticleRsc", () => {
  it("기사 .txt 만 지우고 HTML·호·홈·검색 RSC·og 는 남긴다", () => {
    fixture();
    expect(removeArticleRsc(out)).toEqual({ files: 3, bytes: 18 });
    for (const gone of ["article/1/index.txt", "article/22/index.txt", "en/article/3/index.txt"]) {
      expect(existsSync(path.join(out, gone))).toBe(false);
    }
    for (const kept of [
      "index.txt",
      "article/1/index.html",
      "en/article/3/index.html",
      "edition/2026-11-04/index.txt",
      "search/index.txt",
      "og/article/1.png",
      "article/notes/index.txt",
      "article/9/other.txt",
    ]) {
      expect(existsSync(path.join(out, kept))).toBe(true);
    }
    expect(readFileSync(path.join(out, "article/1/index.html"), "utf8")).toBe("a1");
  });

  it("멱등 — 두 번째는 0건", () => {
    fixture();
    removeArticleRsc(out);
    expect(removeArticleRsc(out)).toEqual({ files: 0, bytes: 0 });
  });
});

describe("runPostbuild", () => {
  it("out/ 이 없으면 크게 실패한다", () => {
    expect(() => runPostbuild(path.join(out, "missing"))).toThrow(/정적 export 산출물이 없다/);
  });

  it("index.html 이 없는 디렉터리는 정적 export 가 아니다", () => {
    put("article/1/index.txt");
    expect(() => runPostbuild(out)).toThrow(/index\.html/);
    expect(existsSync(path.join(out, "article/1/index.txt"))).toBe(true);
  });

  it("단계를 순서대로 돌리고 단계별 결과를 모은다", () => {
    fixture();
    const order: string[] = [];
    const steps: PostbuildStep[] = [
      { name: "first", run: () => (order.push("first"), { files: 1, bytes: 100 }) },
      { name: "second", run: () => (order.push("second"), { files: 2, bytes: 1_500_000 }) },
    ];
    const report = runPostbuild(out, steps);
    expect(order).toEqual(["first", "second"]);
    expect(report.steps).toEqual([
      { name: "first", files: 1, bytes: 100 },
      { name: "second", files: 2, bytes: 1_500_000 },
    ]);
    expect(formatPostbuildSummary(report)).toBe(
      "postbuild: first 1개 −0.00 MB · second 2개 −1.50 MB (합계 3개 −1.50 MB)",
    );
  });

  it("기본 단계 목록: 기사 RSC 삭제 → 보관 지면(Phase 4-3)", () => {
    fixture();
    expect(POSTBUILD_STEPS.map((s) => s.name)).toEqual(["기사 RSC(.txt) 삭제", "보관 지면"]);
    expect(POSTBUILD_STEPS[0].run).toBe(removeArticleRsc);
    expect(POSTBUILD_STEPS[1].run).toBe(archiveStep);
    // 보관 지면 단계는 DB·같은 빌드의 out/index.html 이 필요하다(archiveWrite.test.ts) — 여기서는 첫 단계만 돌린다.
    const first = [POSTBUILD_STEPS[0]];
    expect(runPostbuild(out, first).steps[0]).toMatchObject({ files: 3, bytes: 18 });
    expect(runPostbuild(out, first).steps[0]).toMatchObject({ files: 0, bytes: 0 });
  });

  it("쓰는 단계는 +바이트와 설명을 요약에 붙인다", () => {
    fixture();
    const report = runPostbuild(out, [
      { name: "rsc", run: () => ({ files: 2, bytes: 2_000_000 }) },
      {
        name: "보관 지면",
        run: () => ({ files: 3, bytes: 0, addedBytes: 1_250_000, detail: "기사 2·호 1" }),
      },
    ]);
    expect(formatPostbuildSummary(report)).toBe(
      "postbuild: rsc 2개 −2.00 MB · 보관 지면 3개 +1.25 MB(기사 2·호 1) (합계 5개 −2.00 MB +1.25 MB)",
    );
  });
});
