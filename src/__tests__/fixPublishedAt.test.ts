// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyFix,
  extractPublishedTime,
  judge,
  parseArgs,
  planFix,
  selectRows,
  type PageFetcher,
} from "../../scripts/fix-published-at";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/** AI타임스 기사 페이지 머리(2026-11 실제 형식). */
const page = (time: string) =>
  `<html><head><meta property="og:type" content="article" />
   <meta property="article:published_time" content="${time}" /></head></html>`;

describe("extractPublishedTime", () => {
  it("article:published_time(시간대 포함)을 ISO UTC 로 읽는다", () => {
    expect(extractPublishedTime(page("2026-10-05T20:48:07+09:00"))).toBe(
      "2026-10-05T11:48:07.000Z",
    );
    expect(
      extractPublishedTime(
        `<meta content="2026-10-05T20:48:07+0900" name="article:published_time">`,
      ),
    ).toBe("2026-10-05T11:48:07.000Z");
  });

  it("메타가 없거나 시간대가 없으면 null", () => {
    expect(extractPublishedTime("<html></html>")).toBeNull();
    expect(extractPublishedTime(page("2026-10-05 20:48:07"))).toBeNull();
  });
});

describe("judge", () => {
  it("저장값이 페이지보다 9시간 늦으면 보정, 같으면 이미 맞음, 그 밖은 불일치", () => {
    expect(judge("2026-10-05T20:48:07.000Z", "2026-10-05T11:48:07.000Z")).toBe("fix");
    expect(judge("2026-06-09T09:54:20.000Z", "2026-06-09T09:54:20.000Z")).toBe("ok");
    expect(judge("2026-06-09T09:54:20.000Z", "2026-06-09T05:54:20.000Z")).toBe("mismatch");
  });
});

describe("planFix · applyFix", () => {
  let db: DatabaseType;
  let requested: string[];

  // [id, 저장 published_at, created_at, 페이지 시각(없으면 404)]
  // 1·2: 로컬(KST) 회차라 맞음, 3·4·5: UTC 러너 회차(+9h), 4 는 페이지 404, 6: 표본 없는 회차
  const ROWS: [number, string, string, string | null][] = [
    [1, "2026-06-09T09:54:20.000Z", "2026-06-09 11:39:26", "2026-06-09T18:54:20+09:00"],
    [2, "2026-06-09T09:40:40.000Z", "2026-06-09 11:39:29", "2026-06-09T18:40:40+09:00"],
    [3, "2026-10-05T20:48:07.000Z", "2026-10-06 01:42:58", "2026-10-05T20:48:07+09:00"],
    [4, "2026-10-05T19:48:15.000Z", "2026-10-06 01:42:58", null],
    [5, "2026-10-05T19:05:00.000Z", "2026-10-06 01:42:59", "2026-10-05T19:05:00+09:00"],
    [6, "2026-10-16T17:02:19.000Z", "2026-10-16 21:05:03", null],
  ];

  beforeEach(() => {
    requested = [];
    db = new Database(":memory:");
    db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    db.prepare(
      "INSERT INTO sources (id, name, kind, url) VALUES ('aitimes', 'AI타임스', 'rss', 'u')",
    ).run();
    const insert = db.prepare(
      `INSERT INTO articles (id, source_id, url, dedup_key, title_original, published_at, created_at)
       VALUES (?, 'aitimes', ?, ?, ?, ?, ?)`,
    );
    for (const [id, pub, created] of ROWS) {
      insert.run(id, `https://a.com/${id}`, `k${id}`, `t${id}`, pub, created);
    }
  });

  afterEach(() => db.close());

  const fetchPage: PageFetcher = async (url) => {
    requested.push(url);
    const time = ROWS.find(([id]) => url === `https://a.com/${id}`)?.[3];
    if (!time) throw new Error("Status code 404");
    return page(time);
  };

  const run = (perRun = 2) => planFix(selectRows(db, ["aitimes"]), fetchPage, { perRun });

  it("회차 표본으로 판정을 정해 회차 전체에 편다 — 실패한 표본은 다음 행으로 대신한다", async () => {
    const decisions = await run();
    expect(decisions.map((d) => [d.row.id, d.verdict, d.checked])).toEqual([
      [1, "ok", true],
      [2, "ok", true],
      [3, "fix", true],
      [4, "fix", false],
      [5, "fix", true],
      [6, "unverified", false],
    ]);
    expect(decisions[3].nextIso).toBe("2026-10-05T10:48:15.000Z");
    expect(decisions[5].error).toBe("Status code 404");
  });

  it("회차당 표본 수만큼만 페이지를 받는다", async () => {
    await run(1);
    expect(requested.sort()).toEqual(["https://a.com/1", "https://a.com/3", "https://a.com/6"]);
  });

  it("보정을 쓰고, 다시 돌려도 더 바꾸지 않는다(멱등)", async () => {
    expect(applyFix(db, await run())).toBe(3);
    const stored = db.prepare("SELECT published_at FROM articles ORDER BY id").pluck().all();
    expect(stored).toEqual([
      "2026-06-09T09:54:20.000Z",
      "2026-06-09T09:40:40.000Z",
      "2026-10-05T11:48:07.000Z",
      "2026-10-05T10:48:15.000Z",
      "2026-10-05T10:05:00.000Z",
      "2026-10-16T17:02:19.000Z",
    ]);
    const again = await run();
    expect(again.map((d) => d.verdict)).toEqual(["ok", "ok", "ok", "ok", "ok", "unverified"]);
    expect(applyFix(db, again)).toBe(0);
  });

  it("회차 표본 판정이 섞이면 확인한 행만 따른다", async () => {
    // 3 을 이미 고쳐 둔 상태 — 회차 표본(3·5)이 ok·fix 로 섞인다.
    db.prepare("UPDATE articles SET published_at = '2026-10-05T11:48:07.000Z' WHERE id = 3").run();
    const decisions = await run();
    expect(decisions.slice(2, 5).map((d) => [d.row.id, d.verdict])).toEqual([
      [3, "ok"],
      [4, "unverified"],
      [5, "fix"],
    ]);
  });
});

describe("parseArgs", () => {
  it("기본은 dry-run·aitimes,irobotnews·회차당 2건", () => {
    expect(parseArgs([])).toMatchObject({
      apply: false,
      sources: ["aitimes", "irobotnews"],
      perRun: 2,
    });
    expect(parseArgs(["--apply", "--sources", "aitimes", "--per-run", "3"])).toMatchObject({
      apply: true,
      sources: ["aitimes"],
      perRun: 3,
    });
    expect(() => parseArgs(["--apply", "--dry-run"])).toThrow();
  });
});
