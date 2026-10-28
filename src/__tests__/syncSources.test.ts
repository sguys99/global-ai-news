// @vitest-environment node
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceConfig } from "../../scripts/lib/collect/rss";
import { ensureSchema } from "../../scripts/lib/initDb";
import { describeSync, syncSources } from "../../scripts/lib/syncSources";

const src = (id: string, extra: Partial<SourceConfig> = {}): SourceConfig => ({
  id,
  name: id.toUpperCase(),
  kind: "rss",
  url: `https://${id}`,
  enabled: 1,
  ...extra,
});

const rows = (db: DatabaseType) =>
  db.prepare("SELECT id, name, kind, url, enabled, format FROM sources ORDER BY id").all();

function addArticle(db: DatabaseType, sourceId: string): void {
  db.prepare(
    `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at)
     VALUES (?, ?, 'https://x', 'T', '2026-10-24T00:00:00Z')`,
  ).run(`k-${sourceId}`, sourceId);
}

describe("syncSources — configs/sources.json → sources 테이블", () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    ensureSchema(db);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("비활성 포함 전 소스를 넣고 format 생략은 news 로 둔다", () => {
    const r = syncSources(db, [
      src("aitimes"),
      src("github_llm", { kind: "github", format: "oss" }),
      src("arxiv_cs_ai", { kind: "arxiv", url: "cs.AI", enabled: 0, format: "paper" }),
    ]);
    expect(r).toEqual({
      inserted: ["aitimes", "github_llm", "arxiv_cs_ai"],
      updated: [],
      deleted: [],
      disabled: [],
    });
    expect(rows(db)).toEqual([
      {
        id: "aitimes",
        name: "AITIMES",
        kind: "rss",
        url: "https://aitimes",
        enabled: 1,
        format: "news",
      },
      {
        id: "arxiv_cs_ai",
        name: "ARXIV_CS_AI",
        kind: "arxiv",
        url: "cs.AI",
        enabled: 0,
        format: "paper",
      },
      {
        id: "github_llm",
        name: "GITHUB_LLM",
        kind: "github",
        url: "https://github_llm",
        enabled: 1,
        format: "oss",
      },
    ]);
  });

  it("바뀐 행만 갱신하고, 같은 설정을 다시 맞추면 아무것도 쓰지 않는다", () => {
    syncSources(db, [src("aitimes"), src("github_trending")]);
    const r = syncSources(db, [src("aitimes"), src("github_trending", { format: "oss" })]);
    expect(r.updated).toEqual(["github_trending"]);
    expect(r.inserted).toEqual([]);

    // 변경 없는 동기화는 읽기만 한다(prebuild 에서 돌려도 data/app.db 가 바뀌지 않음).
    const changes = () => db.prepare("SELECT total_changes()").pluck().get();
    const before = changes();
    const again = syncSources(db, [src("aitimes"), src("github_trending", { format: "oss" })]);
    expect(describeSync(again)).toBe("변경 없음");
    expect(changes()).toBe(before);
  });

  it("sources.json 에서 빠진 행: 기사가 없으면 삭제, 있으면 enabled=0 으로 남긴다", () => {
    syncSources(db, [src("aitimes"), src("reddit_localllama", { kind: "reddit" }), src("old_rss")]);
    addArticle(db, "old_rss");

    const r = syncSources(db, [src("aitimes")]);
    expect(r.deleted).toEqual(["reddit_localllama"]);
    expect(r.disabled).toEqual(["old_rss"]);
    expect(
      rows(db).map((s) => [(s as { id: string }).id, (s as { enabled: number }).enabled]),
    ).toEqual([
      ["aitimes", 1],
      ["old_rss", 0],
    ]);
    // 이미 비활성인 잔존 행은 다시 보고하지 않는다
    expect(describeSync(syncSources(db, [src("aitimes")]))).toBe("변경 없음");
    expect(describeSync(r)).toBe("삭제 1(reddit_localllama) · 비활성 1(old_rss)");
  });

  it("알 수 없는 format 은 경고 후 news, 중복 id 는 앞의 것만", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    syncSources(db, [
      src("aitimes", { format: "blog" as SourceConfig["format"] }),
      src("aitimes", { name: "dup" }),
    ]);
    expect(warn).toHaveBeenCalledOnce();
    expect(rows(db)).toEqual([
      {
        id: "aitimes",
        name: "AITIMES",
        kind: "rss",
        url: "https://aitimes",
        enabled: 1,
        format: "news",
      },
    ]);
  });
});
