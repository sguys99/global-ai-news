// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { getArticlesUntil, getEditionRefs, getLatestPublishedAt, toListCards } from "@/lib/db";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

let db: DatabaseType;
let seq = 0;

/** 기사 1건 시드. created_at 은 SQLite datetime('now') 형식(UTC, 'YYYY-MM-DD HH:MM:SS'). */
function article(createdAt: string, publishedAt: string, published = true) {
  seq += 1;
  db.prepare(
    `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at,
                           title_ko, summary_ko, category, importance, created_at)
     VALUES (?, 'hn', ?, ?, ?, ?, ?, 'Agents', 3, ?)`,
  ).run(
    `k${seq}`,
    `https://x/${seq}`,
    `T${seq}`,
    publishedAt,
    `기사${seq}`,
    published ? "요약" : null,
    createdAt,
  );
}

function run(startedAt: string, status = "success") {
  db.prepare("INSERT INTO collection_runs (started_at, status) VALUES (?, ?)").run(
    startedAt,
    status,
  );
}

beforeEach(() => {
  seq = 0;
  db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  db.prepare(
    "INSERT INTO sources (id, name, kind, url, enabled) VALUES ('hn','Hacker News','hn','https://hn',1)",
  ).run();
});

describe("getEditionRefs — KST 날짜별 마지막 호", () => {
  it("실패 제외 실행 순번이 호수, 같은 KST 날짜는 마지막 실행, 마감은 다음 날 00:00 KST", () => {
    article("2026-10-04 21:00:30", "2026-10-04T20:00:00Z");
    run("2026-10-04T21:00:00Z"); // 10/05 06:00 KST → 1호
    run("2026-10-05T03:00:00Z", "failed"); // 호수에서 제외
    run("2026-10-05T13:00:00Z"); // 10/05 22:00 KST → 2호(같은 날 마지막)
    run("2026-10-05T21:00:00Z"); // 10/06 06:00 KST → 3호
    expect(getEditionRefs(db)).toEqual([
      {
        date: "2026-10-05",
        issueNo: 2,
        publishedAt: "2026-10-05T13:00:00Z",
        cutoff: "2026-10-05T15:00:00.000Z",
      },
      {
        date: "2026-10-06",
        issueNo: 3,
        publishedAt: "2026-10-05T21:00:00Z",
        cutoff: "2026-10-06T15:00:00.000Z",
      },
    ]);
  });

  it("첫 공개 기사보다 이른 날(빈 지면)은 빼고, 공개 기사가 없으면 빈 목록", () => {
    run("2026-10-01T21:00:00Z");
    expect(getEditionRefs(db)).toEqual([]);
    article("2026-10-03 21:00:30", "2026-10-03T20:00:00Z");
    run("2026-10-03T21:00:00Z");
    expect(getEditionRefs(db).map((r) => r.date)).toEqual(["2026-10-04"]);
  });
});

describe("getArticlesUntil / getLatestPublishedAt", () => {
  it("마감 전에 수집된 공개 기사만", () => {
    article("2026-10-05 14:59:59", "2026-10-05T10:00:00Z");
    article("2026-10-05 15:00:00", "2026-10-05T11:00:00Z");
    article("2026-10-05 10:00:00", "2026-10-05T12:00:00Z", false);
    expect(getArticlesUntil("2026-10-05T15:00:00.000Z", db).map((a) => a.titleKo)).toEqual([
      "기사1",
    ]);
  });

  it("최신 게시 시각은 공개 기사 기준, 없으면 null", () => {
    expect(getLatestPublishedAt(db)).toBeNull();
    article("2026-10-05 10:00:00", "2026-10-05T10:00:00Z");
    article("2026-10-05 10:00:00", "2026-10-06T10:00:00Z", false);
    expect(getLatestPublishedAt(db)).toBe("2026-10-05T10:00:00Z");
  });
});

describe("toListCards", () => {
  it("상세 전용 원문 발췌(contentRaw) 키만 빼고 나머지는 그대로", () => {
    article("2026-10-05 10:00:00", "2026-10-05T10:00:00Z");
    db.prepare("UPDATE articles SET content_raw = 'long body'").run();
    const [full] = getArticlesUntil("2026-10-06T00:00:00.000Z", db);
    expect(full.contentRaw).toBe("long body");
    const [card] = toListCards([full]);
    expect("contentRaw" in card).toBe(false);
    expect(card).toEqual({ ...full, contentRaw: undefined });
  });
});
