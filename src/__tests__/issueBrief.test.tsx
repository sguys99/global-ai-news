// 세 줄 요약 읽기·고르기·표시(db → edition → site/latest.json → 띠). 쓰기·거르기는 brief.test.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { buildLatestFeed } from "../../scripts/export-latest";
import { ensureSchema } from "../../scripts/lib/initDb";
import { FeedView } from "@/components/FeedView";
import { IssueBrief, issueBriefHeading } from "@/components/IssueBrief";
import { getIssueBriefs, parseBriefJson } from "@/lib/db";
import { buildEdition, frontArticles, selectIssueBrief } from "@/lib/edition";
import { buildFeedIndex } from "@/lib/feedIndex";
import { editionMetadata, editionShare } from "@/lib/site";
import type { ArticleCard } from "@/lib/types";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

let seq = 0;
function card(p: Partial<ArticleCard> = {}): ArticleCard {
  seq += 1;
  return {
    id: seq,
    source: { id: "hn", name: "Hacker News" },
    url: `https://x/${seq}`,
    titleKo: `기사${seq}`,
    summaryKo: "요약",
    titleOriginal: `T${seq}`,
    category: "agent",
    format: "news",
    tags: [],
    trendingScore: 0,
    importance: 3,
    publishedAt: "2026-10-30T00:00:00Z",
    ...p,
  };
}

const line = (id: number, text = `기사 ${id}번을 요약한 한 줄`) => ({ id, text });

describe("parseBriefJson", () => {
  it("정상 줄만 남기고 손상·모양이 다른 값은 빈 목록", () => {
    expect(parseBriefJson('[{"id":1,"text":" 한 줄 "},{"id":"2","text":"x"},{"id":3}]')).toEqual([
      { id: 1, text: "한 줄" },
    ]);
    expect(parseBriefJson("{not json")).toEqual([]);
    expect(parseBriefJson('{"id":1}')).toEqual([]);
    expect(parseBriefJson(null)).toEqual([]);
  });
});

describe("getIssueBriefs", () => {
  let db: DatabaseType;
  const run = (savedAt: string, brief: string | null, status = "success") =>
    db
      .prepare(
        "INSERT INTO collection_runs (started_at, finished_at, status, brief_json) VALUES (?, ?, ?, ?)",
      )
      .run(savedAt, savedAt, status, brief);

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  });

  it("그 KST 날짜에 저장한 실패 아닌 실행의 요약, 최신 실행 먼저", () => {
    run("2026-10-29T21:05:00Z", JSON.stringify([line(1), line(2)])); // 10-30 06:05 KST
    run("2026-10-30T03:00:00Z", JSON.stringify([line(5), line(6)])); // 10-30 12:00 KST 재수집
    run("2026-10-30T04:00:00Z", JSON.stringify([line(8), line(9)]), "failed");
    run("2026-10-30T16:00:00Z", JSON.stringify([line(7), line(8)])); // 10-31 01:00 KST — 다음 호
    run("2026-10-30T05:00:00Z", null);
    expect(getIssueBriefs("2026-10-30", db).map((ls) => ls.map((l) => l.id))).toEqual([
      [5, 6],
      [1, 2],
    ]);
  });

  it("brief_json 컬럼이 없는 옛 DB 에서도 깨지지 않고 빈 배열(요약 없이 렌더)", () => {
    const old = new Database(":memory:");
    old.exec(`CREATE TABLE collection_runs (id INTEGER PRIMARY KEY, started_at TEXT NOT NULL,
      finished_at TEXT, status TEXT NOT NULL, notes TEXT)`);
    old
      .prepare("INSERT INTO collection_runs (started_at, status) VALUES (?, 'success')")
      .run("2026-10-29T21:05:00Z");
    expect(getIssueBriefs("2026-10-30", old)).toEqual([]);
    // prebuild(initDb --existing)의 ensureSchema 가 컬럼을 더하면 읽힌다
    ensureSchema(old);
    expect(
      (old.prepare("PRAGMA table_info(collection_runs)").all() as { name: string }[]).map(
        (c) => c.name,
      ),
    ).toContain("brief_json");
    expect(getIssueBriefs("2026-10-30", old)).toEqual([]);
  });
});

describe("selectIssueBrief", () => {
  beforeEach(() => {
    seq = 0;
  });

  // 뉴스 6건(리드·서브 3·브리핑 2) + 저장소 1건(레이더) + 1면 밖 기사는 없다
  function issue() {
    const lead = card({ importance: 5, category: "llm" });
    const s1 = card({ importance: 4, category: "agent" });
    const s2 = card({ importance: 4, category: "industry" });
    const s3 = card({ importance: 4, category: "physical" });
    const b1 = card({ importance: 3, category: "oss" });
    const b2 = card({ importance: 2, category: "research" });
    const repo = card({ importance: 4, format: "oss", category: "oss" });
    const edition = buildEdition([b2, repo, s1, lead, b1, s3, s2]);
    return { edition, lead, s1, s2, s3, b1, b2, repo };
  }

  it("1면 위계 순(리드 → 서브 → 브리핑 → 레이더)으로 늘어놓는다 — 리드 줄이 늘 첫 줄", () => {
    const { edition, lead, s2, repo } = issue();
    const lines = selectIssueBrief(edition, [[line(repo.id), line(s2.id), line(lead.id)]]);
    expect(lines.map((l) => l.id)).toEqual([lead.id, s2.id, repo.id]);
    expect(frontArticles(edition)[0].id).toBe(lead.id);
  });

  it("이 호 기사가 아닌 줄·같은 기사 둘째 줄을 빼고, 2줄 미만이면 띠 없음", () => {
    const { edition, lead, s1 } = issue();
    expect(
      selectIssueBrief(edition, [[line(lead.id), line(999), line(lead.id, "다른 문장")]]),
    ).toEqual([]);
    expect(
      selectIssueBrief(edition, [[line(999), line(lead.id), line(s1.id)]]).map((l) => l.id),
    ).toEqual([lead.id, s1.id]);
    expect(selectIssueBrief(edition, [])).toEqual([]);
  });

  it("재수집으로 후보가 여럿이면 1면 기사를 더 많이 덮는 쪽, 같으면 최신 실행", () => {
    const { edition, lead, s1, s2, b2, repo } = issue();
    const leftover = [line(b2.id), line(repo.id)]; // 최신 실행(잔여분) — 1면 2건
    const morning = [line(lead.id), line(s1.id), line(s2.id)]; // 아침 회차 — 1면 3건
    expect(selectIssueBrief(edition, [leftover, morning]).map((l) => l.id)).toEqual([
      lead.id,
      s1.id,
      s2.id,
    ]);
    const tie = [line(s1.id), line(s2.id)];
    expect(selectIssueBrief(edition, [leftover, tie]).map((l) => l.id)).toEqual([b2.id, repo.id]);
  });

  it("최대 3줄", () => {
    const { edition, lead, s1, s2, s3 } = issue();
    expect(
      selectIssueBrief(edition, [[line(s3.id), line(s2.id), line(s1.id), line(lead.id)]]),
    ).toHaveLength(3);
  });
});

describe("editionShare — 세 줄 요약을 공유 설명으로", () => {
  const info = { issueNo: 42, publishedAt: "2026-10-29T21:00:00Z" };

  it("설명 = 제호·발행일·호수 + 리드 줄을 뺀 요약 줄", () => {
    const lead = card({ titleKo: "리드 기사" });
    const sub = card({ titleKo: "서브 기사" });
    const brief = [
      line(lead.id, "리드를 요약한 줄"),
      line(sub.id, "서브를 요약한 줄"),
      line(99, "셋째 줄"),
    ];
    const share = editionShare({ lead, seconds: [sub] }, info, brief);
    expect(share.title).toBe("리드 기사");
    expect(share.description).toBe(
      "Daily AI Brief 10월 30일(금) 제42호 — 서브를 요약한 줄 · 셋째 줄",
    );
  });

  it("요약이 없거나 리드 줄뿐이면 예전처럼 서브 헤드라인", () => {
    const lead = card({ titleKo: "리드 기사" });
    const sub = card({ titleKo: "서브 기사" });
    const plain = editionShare({ lead, seconds: [sub] }, info);
    expect(plain.description).toBe("Daily AI Brief 10월 30일(금) 제42호 — 서브 기사");
    expect(editionShare({ lead, seconds: [sub] }, info, [line(lead.id)]).description).toBe(
      plain.description,
    );
  });

  it("og:description·twitter description 에 실린다", () => {
    const lead = card({ titleKo: "리드 기사" });
    const meta = editionMetadata({ lead, seconds: [] }, info, "/", [
      line(lead.id),
      line(77, "둘째 줄 요약"),
    ]);
    expect(meta.openGraph?.description).toBe("Daily AI Brief 10월 30일(금) 제42호 — 둘째 줄 요약");
    expect(meta.twitter?.description).toBe("Daily AI Brief 10월 30일(금) 제42호 — 둘째 줄 요약");
  });
});

describe("latest.json brief", () => {
  const NOW = new Date("2026-10-30T00:00:00Z");
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    db.prepare(
      "INSERT INTO sources (id, name, kind, url, enabled) VALUES ('hn','HN','hn','u',1)",
    ).run();
    const ins = db.prepare(
      `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at,
         title_ko, summary_ko, category, importance, created_at)
       VALUES (?, 'hn', ?, ?, '2026-10-29T00:00:00Z', ?, '요약', 'llm', ?, '2026-10-29 21:10:00')`,
    );
    for (let i = 1; i <= 3; i += 1) ins.run(`k${i}`, `https://x/${i}`, `T${i}`, `기사${i}`, 6 - i);
    db.prepare(
      "INSERT INTO collection_runs (started_at, finished_at, status, brief_json) VALUES (?, ?, 'success', ?)",
    ).run(
      "2026-10-29T21:00:00Z",
      "2026-10-29T21:12:00Z",
      JSON.stringify([line(3, "셋째 기사 요약"), line(1, "첫째 기사 요약")]),
    );
  });

  it("최신 호 요약을 1면 순으로 싣는다(id 는 items 의 id)", () => {
    const feed = buildLatestFeed(NOW, db);
    expect(feed.version).toBe(1);
    expect(feed.brief).toEqual({
      date: "2026-10-30",
      issueNo: 1,
      lines: [
        { id: 1, text: "첫째 기사 요약" },
        { id: 3, text: "셋째 기사 요약" },
      ],
    });
    const ids = new Set(feed.items.map((a) => a.id));
    expect(feed.brief!.lines.every((l) => ids.has(l.id))).toBe(true);
  });

  it("요약이 없거나 기사가 창 밖이면 null — 키는 늘 있다", () => {
    db.prepare("UPDATE collection_runs SET brief_json = NULL").run();
    expect(buildLatestFeed(NOW, db).brief).toBeNull();
    db.prepare("UPDATE collection_runs SET brief_json = ?").run(JSON.stringify([line(1), line(2)]));
    expect(buildLatestFeed(new Date("2026-11-05T00:00:00Z"), db)).toMatchObject({
      items: [],
      brief: null,
    });
    expect(JSON.parse(JSON.stringify(buildLatestFeed(NOW, db)))).toHaveProperty("brief");
  });
});

describe("IssueBrief 띠", () => {
  it("번호 목록 + 줄마다 기사 링크, 머리는 줄 수를 센다", () => {
    render(
      <IssueBrief
        lines={[line(11, "첫 줄 요약"), line(12, "둘째 줄 요약"), line(13, "셋째 줄 요약")]}
      />,
    );
    const band = screen.getByRole("region", { name: "세 줄 요약" });
    const items = within(band).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole("link")).toHaveAttribute("href", "/article/11");
    expect(within(items[2]).getByRole("link", { name: /셋째 줄 요약/ })).toBeInTheDocument();
    expect(band.querySelector("ol")).not.toBeNull();
  });

  it("2줄이면 '두 줄 요약', 1줄 이하면 아무것도 그리지 않는다", () => {
    expect(issueBriefHeading(2)).toBe("두 줄 요약");
    expect(issueBriefHeading(3)).toBe("세 줄 요약");
    expect(renderToString(<IssueBrief lines={[line(1)]} />)).toBe("");
    expect(renderToString(<IssueBrief lines={[]} />)).toBe("");
  });

  it("FeedView: 요약이 있으면 마스트헤드와 1면 사이에, 없으면 예전 마크업 그대로", () => {
    const articles = [card(), card()];
    const props = {
      issueArticles: articles,
      index: buildFeedIndex(articles),
      indexTotal: articles.length,
      sources: [{ id: "hn", name: "Hacker News" }],
      tags: [],
      options: {},
      editionInfo: { issueNo: 7, publishedAt: "2026-10-29T21:05:00Z" },
    };
    const without = renderToString(<FeedView {...props} />);
    expect(without).not.toContain('data-testid="issue-brief"');
    expect(renderToString(<FeedView {...props} brief={[]} />)).toBe(without);

    const withBrief = renderToString(
      <FeedView
        {...props}
        brief={[line(articles[0].id, "첫 줄 요약"), line(articles[1].id, "둘째 줄 요약")]}
      />,
    );
    const band = withBrief.indexOf('data-testid="issue-brief"');
    expect(band).toBeGreaterThan(withBrief.indexOf('id="masthead"'));
    expect(band).toBeLessThan(withBrief.indexOf('id="front"'));
    // 필터 모드는 지면이 없으므로 띠도 없다
    expect(
      renderToString(
        <FeedView {...props} options={{ category: "agent" }} brief={[line(1), line(2)]} />,
      ),
    ).not.toContain("issue-brief");
  });
});
