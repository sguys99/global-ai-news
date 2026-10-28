// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getArticlesUntil,
  getEditionRefs,
  getIssueArticles,
  getLatestEditionRef,
  getLatestPublishedAt,
  toListCards,
} from "@/lib/db";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

let db: DatabaseType;
let seq = 0;

/** 기사 1건 시드. created_at 은 SQLite datetime('now') 형식(UTC, 'YYYY-MM-DD HH:MM:SS'). */
function article(createdAt: string, publishedAt: string, published = true, importance = 3) {
  seq += 1;
  db.prepare(
    `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at,
                           title_ko, summary_ko, category, importance, created_at)
     VALUES (?, 'hn', ?, ?, ?, ?, ?, 'agent', ?, ?)`,
  ).run(
    `k${seq}`,
    `https://x/${seq}`,
    `T${seq}`,
    publishedAt,
    `기사${seq}`,
    published ? "요약" : null,
    importance,
    createdAt,
  );
}

function run(startedAt: string, status = "success", finishedAt: string | null = null) {
  db.prepare("INSERT INTO collection_runs (started_at, finished_at, status) VALUES (?, ?, ?)").run(
    startedAt,
    finishedAt,
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
    article("2026-10-05 21:00:30", "2026-10-05T20:00:00Z");
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

  it("공개 기사가 없으면 빈 목록", () => {
    run("2026-10-01T21:00:00Z");
    article("2026-10-01 21:00:30", "2026-10-01T20:00:00Z", false); // 미공개
    expect(getEditionRefs(db)).toEqual([]);
  });

  it("실행만 있고 공개 기사가 0건인 날은 빠지되 호수 순번은 그대로", () => {
    run("2026-10-01T21:00:00Z"); // 10/02 → 1호, 기사 없음
    run("2026-10-02T21:00:00Z"); // 10/03 → 2호, 기사 있음
    run("2026-10-03T21:00:00Z"); // 10/04 → 3호, 기사 없음
    run("2026-10-04T21:00:00Z"); // 10/05 → 4호, 기사 있음
    run("2026-10-05T21:00:00Z"); // 10/06 → 5호, 기사 없음(최신)
    article("2026-10-02 21:00:30", "2026-10-02T20:00:00Z");
    article("2026-10-04 21:00:30", "2026-10-04T20:00:00Z");
    expect(getEditionRefs(db).map((r) => [r.date, r.issueNo])).toEqual([
      ["2026-10-03", 2],
      ["2026-10-05", 4],
    ]);
    expect(getLatestEditionRef(db)?.issueNo).toBe(4);
  });

  it("자정을 넘겨 저장한 실행은 기사가 들어온 다음 날 호가 된다", () => {
    run("2026-10-05T14:50:00Z", "success", "2026-10-05T15:10:00Z"); // 23:50 시작 → 10/06 00:10 KST 종료
    article("2026-10-05 15:10:00", "2026-10-05T14:00:00Z"); // 10/06 00:10 KST 저장
    expect(getEditionRefs(db)).toEqual([
      {
        date: "2026-10-06",
        issueNo: 1,
        publishedAt: "2026-10-05T15:10:00Z",
        cutoff: "2026-10-06T15:00:00.000Z",
      },
    ]);
    expect(getIssueArticles("2026-10-06", db)).toHaveLength(1);
  });

  it("같은 KST 날의 여러 실행은 1개 호: 기사는 모두 포함, 호수는 마지막 실행", () => {
    run("2026-10-04T21:00:00Z", "success", "2026-10-04T21:20:00Z"); // 10/05 06:00 → 1호
    run("2026-10-05T03:00:00Z", "success", "2026-10-05T03:10:00Z"); // 10/05 12:00 → 2호
    article("2026-10-04 21:10:00", "2026-10-04T20:00:00Z");
    article("2026-10-05 03:05:00", "2026-10-05T02:00:00Z");
    const refs = getEditionRefs(db);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      date: "2026-10-05",
      issueNo: 2,
      publishedAt: "2026-10-05T03:10:00Z",
    });
    expect(getIssueArticles("2026-10-05", db)).toHaveLength(2);
  });
});

describe("getIssueArticles — KST 하루 수집분", () => {
  it("UTC 14:59:59 는 같은 KST 날, 15:00:00 은 다음 날 호", () => {
    article("2026-10-04 14:59:59", "2026-10-04T10:00:00Z"); // 10/04 23:59:59 KST
    article("2026-10-04 15:00:00", "2026-10-04T11:00:00Z"); // 10/05 00:00:00 KST
    article("2026-10-05 14:59:59", "2026-10-05T12:00:00Z"); // 10/05 23:59:59 KST
    article("2026-10-05 15:00:00", "2026-10-05T13:00:00Z"); // 10/06 00:00:00 KST
    expect(getIssueArticles("2026-10-04", db).map((a) => a.titleKo)).toEqual(["기사1"]);
    expect(getIssueArticles("2026-10-05", db).map((a) => a.titleKo)).toEqual(["기사3", "기사2"]);
    expect(getIssueArticles("2026-10-06", db).map((a) => a.titleKo)).toEqual(["기사4"]);
  });

  it("미공개 기사와 다른 날 수집분은 빼고, 중요도 내림차순", () => {
    article("2026-10-04 21:00:30", "2026-10-04T20:00:00Z", true, 2);
    article("2026-10-04 21:00:30", "2026-10-01T20:00:00Z", true, 5); // 게시는 오래돼도 그날 수집분
    article("2026-10-04 21:00:30", "2026-10-04T20:00:00Z", false, 5);
    article("2026-10-03 21:00:30", "2026-10-04T20:00:00Z", true, 5); // 전날 호
    article("2026-10-04 21:00:30", "2026-10-04T19:00:00Z", true, 4);
    expect(getIssueArticles("2026-10-05", db).map((a) => a.titleKo)).toEqual([
      "기사2",
      "기사5",
      "기사1",
    ]);
    expect(getIssueArticles("2026-10-07", db)).toEqual([]);
  });
});

describe("getLatestEditionRef — 홈 최신 호", () => {
  it("호가 없으면 null", () => {
    expect(getLatestEditionRef(db)).toBeNull();
    run("2026-10-04T21:00:00Z"); // 실행만 있고 공개 기사 없음
    expect(getLatestEditionRef(db)).toBeNull();
  });

  it("마지막 호를 돌려주고, 실패 회차는 무시", () => {
    article("2026-10-04 21:00:30", "2026-10-04T20:00:00Z");
    article("2026-10-05 21:00:30", "2026-10-05T20:00:00Z");
    run("2026-10-04T21:00:00Z"); // 10/05 06:00 KST → 1호
    run("2026-10-05T21:00:00Z"); // 10/06 06:00 KST → 2호
    run("2026-10-06T21:00:00Z", "failed"); // 10/07 실패 — 최신 호 아님
    expect(getLatestEditionRef(db)).toEqual({
      date: "2026-10-06",
      issueNo: 2,
      publishedAt: "2026-10-05T21:00:00Z",
      cutoff: "2026-10-06T15:00:00.000Z",
    });
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
