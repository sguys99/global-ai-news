// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INDEXNOW_KEY,
  INDEXNOW_MAX_URLS,
  buildIndexNowPayload,
  buildIndexNowUrls,
  indexNowKeyFile,
  indexNowOutcome,
  isValidIndexNowKey,
  latestIssuePaths,
  outFileOfPath,
} from "../../scripts/lib/indexNow";

const SITE = "https://sguys99.github.io/global-ai-news";
const PUBLIC = path.resolve(__dirname, "../../public");

describe("키 파일", () => {
  it("public/<키>.txt 의 내용이 키와 같고, 키 형식이 규약에 맞는다", () => {
    const file = path.join(PUBLIC, indexNowKeyFile());
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8").trim()).toBe(INDEXNOW_KEY);
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
    expect(isValidIndexNowKey(INDEXNOW_KEY)).toBe(true);
  });

  it("public/ 에 다른 키 파일(32자 16진수 .txt)이 남아 있지 않다", () => {
    const keys = readdirSync(PUBLIC).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
    expect(keys).toEqual([indexNowKeyFile()]);
  });

  it("키 형식 — 8~128자, 영문·숫자·-", () => {
    expect(isValidIndexNowKey("abc-1234")).toBe(true);
    expect(isValidIndexNowKey("short")).toBe(false);
    expect(isValidIndexNowKey("has space1")).toBe(false);
    expect(isValidIndexNowKey("x".repeat(129))).toBe(false);
  });
});

describe("latestIssuePaths", () => {
  it("한국어 홈·호·기사 전부, 영어는 영어 본문 있는 기사와 그 호만", () => {
    expect(
      latestIssuePaths({
        date: "2026-11-06",
        articles: [
          { id: 3, english: true },
          { id: 1, english: false },
          { id: 2, english: true },
        ],
      }),
    ).toEqual([
      "/",
      "/edition/2026-11-06/",
      "/article/3/",
      "/article/1/",
      "/article/2/",
      "/en/",
      "/en/edition/2026-11-06/",
      "/en/article/3/",
      "/en/article/2/",
    ]);
  });

  it("영어 기사가 없으면 영어 호는 빼고 영어 홈만", () => {
    expect(latestIssuePaths({ date: "2026-11-06", articles: [{ id: 1, english: false }] })).toEqual(
      ["/", "/edition/2026-11-06/", "/article/1/", "/en/"],
    );
  });
});

describe("buildIndexNowUrls", () => {
  it("절대 URL, 중복 제거, 산출물에 없는 페이지는 missing", () => {
    const exists = (rel: string) => rel !== "en/article/2/index.html";
    const r = buildIndexNowUrls(["/", "/en/", "/en/article/2/", "/"], SITE, exists);
    expect(r.urls).toEqual([`${SITE}/`, `${SITE}/en/`]);
    expect(r.missing).toEqual(["/en/article/2/"]);
    expect(outFileOfPath("/")).toBe("index.html");
    expect(outFileOfPath("/en/edition/2026-11-06/")).toBe("en/edition/2026-11-06/index.html");
  });
});

describe("buildIndexNowPayload", () => {
  it("host·key·keyLocation(basePath 아래 키 파일)·urlList", () => {
    const p = buildIndexNowPayload([`${SITE}/`, `${SITE}/en/article/1/`], SITE);
    expect(p).toEqual({
      host: "sguys99.github.io",
      key: INDEXNOW_KEY,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urlList: [`${SITE}/`, `${SITE}/en/article/1/`],
    });
  });

  it("키 파일 디렉터리 밖·다른 호스트·https 아님·빈 목록·상한 초과·잘못된 키는 던진다", () => {
    expect(() => buildIndexNowPayload(["https://sguys99.github.io/other/"], SITE)).toThrow(/범위/);
    expect(() => buildIndexNowPayload([`${SITE}-x/`], SITE)).toThrow(/범위/);
    expect(() => buildIndexNowPayload(["https://example.com/global-ai-news/"], SITE)).toThrow(
      /범위/,
    );
    expect(() => buildIndexNowPayload(["http://localhost:3000/"], "http://localhost:3000")).toThrow(
      /https/,
    );
    expect(() => buildIndexNowPayload([], SITE)).toThrow(/없다/);
    const many = Array.from({ length: INDEXNOW_MAX_URLS + 1 }, (_, i) => `${SITE}/article/${i}/`);
    expect(() => buildIndexNowPayload(many, SITE)).toThrow(/상한/);
    expect(() => buildIndexNowPayload([`${SITE}/`], SITE, "bad key")).toThrow(/키/);
  });
});

describe("indexNowOutcome", () => {
  it("200·202 만 성공", () => {
    expect(indexNowOutcome(200).ok).toBe(true);
    expect(indexNowOutcome(202)).toEqual({ ok: true, meaning: "접수 — 키 확인 대기" });
    for (const s of [0, 400, 403, 422, 429, 500]) expect(indexNowOutcome(s).ok).toBe(false);
    expect(indexNowOutcome(0).meaning).toBe("요청 실패(네트워크)");
  });
});
