// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmResult } from "../../scripts/lib/llm";
import {
  applyDecisions,
  backupPath,
  buildRequests,
  createLlmClassifier,
  emptyCache,
  formatReport,
  inputHash,
  loadCache,
  mergeResults,
  parseArgs,
  planReclassify,
  reclassify,
  ruleCategory,
  saveCache,
  selectRows,
  summarize,
  type Classifier,
  type ReclassifyRow,
} from "../../scripts/reclassify";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

/** [id, title_ko, category, tags] — summary_ko 가 null 이면 미게재(대상 제외). */
const SEED: [number, string, string | null, string[]][] = [
  [1, "Eka Robotics, 휴머노이드 투자 유치", "산업·정책", ["robotics"]],
  [2, "새 코딩 에이전트 출시", "Agents", ["agent"]],
  [3, "오픈 웨이트 모델 공개", "Language Models", []],
  [4, "서빙 프레임워크 v2", "MLOps", ["serving", "inference"]],
  [5, "이미 키로 저장된 기사", "llm", []],
];

function seed(): DatabaseType {
  const db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  db.prepare(
    "INSERT INTO sources (id, name, kind, url) VALUES ('tc','TechCrunch AI','rss','x')",
  ).run();
  const ins = db.prepare(
    `INSERT INTO articles (id, dedup_key, source_id, url, title_original, published_at,
       title_ko, summary_ko, category)
     VALUES (?, ?, 'tc', ?, ?, '2026-10-01T00:00:00Z', ?, ?, ?)`,
  );
  const tagId = new Map<string, number>();
  for (const [id, title, category, tags] of SEED) {
    ins.run(id, `k${id}`, `https://x/${id}`, `T${id}`, title, `요약 ${id}`, category);
    for (const t of tags) {
      if (!tagId.has(t)) {
        tagId.set(t, tagId.size + 1);
        db.prepare("INSERT INTO tags (id, name) VALUES (?, ?)").run(tagId.get(t), t);
      }
      db.prepare("INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)").run(
        id,
        tagId.get(t),
      );
    }
  }
  // 미게재(가공 실패) 기사 — 대상에서 빠진다.
  db.prepare(
    `INSERT INTO articles (id, dedup_key, source_id, url, title_original, published_at, category)
     VALUES (6, 'k6', 'tc', 'https://x/6', 'T6', '2026-10-01T00:00:00Z', 'Agents')`,
  ).run();
  return db;
}

const categories = (db: DatabaseType) =>
  Object.fromEntries(
    (
      db.prepare("SELECT id, category FROM articles ORDER BY id").all() as {
        id: number;
        category: string;
      }[]
    ).map((r) => [r.id, r.category]),
  );

const row = (id: number, category: string | null = "Agents"): ReclassifyRow => ({
  id,
  title_ko: `제목 ${id}`,
  summary_ko: `요약 ${id}`,
  category,
  tags: [],
  sourceName: "TechCrunch AI",
});

let db: DatabaseType;
beforeEach(() => {
  db = seed();
});
afterEach(() => {
  db.close();
});

describe("ruleCategory", () => {
  it("구 값은 규칙 매핑, 키는 그대로, 그 외는 null", () => {
    expect(ruleCategory("Language Models")).toBe("llm");
    expect(ruleCategory("Agents")).toBe("agent");
    expect(ruleCategory("Dev Tools")).toBe("oss");
    expect(ruleCategory("MLOps")).toBe("oss");
    expect(ruleCategory("연구·논문")).toBe("research");
    expect(ruleCategory("산업·정책")).toBe("industry");
    expect(ruleCategory("physical")).toBe("physical");
    expect(ruleCategory("기타")).toBeNull();
    expect(ruleCategory(null)).toBeNull();
    expect(ruleCategory("toString")).toBeNull();
  });
});

describe("selectRows", () => {
  it("게재된 기사만 id 순으로, 태그는 정렬해 읽는다", () => {
    const rows = selectRows(db);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[3].tags).toEqual(["inference", "serving"]);
    expect(rows[0].sourceName).toBe("TechCrunch AI");
  });

  it("--only-legacy 는 6개 키가 아닌 행만, --limit 는 앞에서 N건", () => {
    expect(selectRows(db, { onlyLegacy: true }).map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(selectRows(db, { limit: 2 }).map((r) => r.id)).toEqual([1, 2]);
  });
});

describe("buildRequests", () => {
  it("chunkSize 건씩 묶고 id·매체·제목·요약·태그를 싣는다", () => {
    const rows = Array.from({ length: 45 }, (_, i) => row(i + 1));
    rows[0].tags = ["robotics", "vla"];
    const chunks = buildRequests(rows, 20, { system: "SYS" });
    expect(chunks.map((c) => c.ids.length)).toEqual([20, 20, 5]);
    expect(chunks.map((c) => c.request.id)).toEqual([
      "reclassify-0",
      "reclassify-1",
      "reclassify-2",
    ]);
    const user = chunks[0].request.params.messages[0].content as string;
    expect(user).toContain("id=1 | TechCrunch AI | 제목 1 | 요약 1 | 태그: robotics, vla");
    // 기존 분류는 LLM 에 보내지 않는다(구 값에 끌려가지 않게).
    expect(user).not.toContain("Agents");
    expect(chunks[0].request.params.system).toBe("SYS");
    expect(chunks[0].request.params.output_config?.format).toBeDefined();
  });

  it("기본 시스템 프롬프트에 분야 정의(categories.md)가 들어간다", () => {
    const [chunk] = buildRequests([row(1)], 10);
    expect(chunk.request.params.system).toContain("Physical AI 최우선");
  });
});

describe("mergeResults", () => {
  it("LLM 결과가 규칙을 덮고, 빠진 기사·틀린 판정은 규칙 폴백·집계한다", () => {
    const rows = [row(1, "산업·정책"), row(2, "Agents"), row(3, "MLOps")];
    const { decisions, invalid, missing } = mergeResults(rows, [
      { id: 1, category: "physical" },
      { id: 1, category: "industry" }, // 중복 → 버림
      { id: 2, category: "Agents" }, // 키 아님 → 버림
      { id: 99, category: "llm" }, // 요청에 없던 id → 버림
    ]);
    expect(decisions.map((d) => [d.next, d.source])).toEqual([
      ["physical", "llm"],
      ["agent", "rule"],
      ["oss", "rule"],
    ]);
    expect(invalid).toBe(3);
    expect(missing).toBe(2);
  });
});

describe("summarize / formatReport", () => {
  it("전후 분포·전이표·규칙 대비 변경·physical 이동을 센다", () => {
    const { decisions } = mergeResults(
      [row(1, "산업·정책"), row(2, "Agents"), row(3, "Agents"), row(4, "llm")],
      [
        { id: 1, category: "physical" },
        { id: 2, category: "agent" },
        { id: 3, category: "oss" },
        { id: 4, category: "llm" },
      ],
    );
    const s = summarize(decisions);
    expect(s.before).toEqual({ "산업·정책": 1, Agents: 2, llm: 1 });
    expect(s.after).toEqual({ physical: 1, agent: 1, oss: 1, llm: 1 });
    expect(s.transitions.Agents).toEqual({ agent: 1, oss: 1 });
    expect(s.changedFromRule).toBe(2);
    expect(s.toUpdate).toBe(3);
    expect(s.toPhysical).toEqual([{ id: 1, title: "제목 1", from: "산업·정책" }]);

    const report = formatReport(s);
    expect(report).toContain("Physical AI 로 이동 1건");
    expect(report).toContain("#1 [산업·정책] 제목 1");
    expect(report).toContain("physical (Physical AI)");
  });

  it("구 값도 키도 아니고 LLM 결과도 없으면 미해결로 두고 UPDATE 하지 않는다", () => {
    const s = summarize(mergeResults([row(1, "기타")], []).decisions);
    expect(s.unresolved).toBe(1);
    expect(s.toUpdate).toBe(0);
    expect(s.after).toEqual({ 기타: 1 });
  });
});

describe("reclassify", () => {
  const fake = (map: Record<number, string>) =>
    vi.fn<Classifier>(async (rows) =>
      rows.filter((r) => map[r.id]).map((r) => ({ id: r.id, category: map[r.id] })),
    );

  it("dry-run 은 DB 를 쓰지 않는다", async () => {
    const before = categories(db);
    const res = await reclassify(db, { classify: fake({ 1: "physical" }) });
    expect(res.written).toBe(0);
    expect(res.summary.toUpdate).toBe(4);
    expect(categories(db)).toEqual(before);
  });

  it("apply 는 LLM 값(없으면 규칙)으로 바꾸고, 이미 같은 값인 행과 미게재 행은 건드리지 않는다", async () => {
    const res = await reclassify(db, { classify: fake({ 1: "physical", 3: "llm" }), apply: true });
    expect(res.written).toBe(4);
    expect(categories(db)).toEqual({
      1: "physical",
      2: "agent",
      3: "llm",
      4: "oss",
      5: "llm",
      6: "Agents",
    });
    // FTS 가 articles 와 어긋나지 않는다.
    db.prepare("INSERT INTO articles_fts(articles_fts, rank) VALUES('integrity-check', 1)").run();
    const hit = db
      .prepare("SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?")
      .all('"휴머노이드"') as { rowid: number }[];
    expect(hit.map((h) => h.rowid)).toEqual([1]);
  });

  it("--only-legacy 는 키로 저장된 행을 분류기에 보내지 않는다", async () => {
    const classify = fake({});
    await reclassify(db, { classify, onlyLegacy: true });
    expect(classify.mock.calls[0][0].map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it("분류기가 없으면 규칙 매핑만 쓴다", async () => {
    const res = await reclassify(db, { apply: true });
    expect(res.requested).toBe(0);
    expect(categories(db)).toMatchObject({ 1: "industry", 2: "agent", 3: "llm", 4: "oss" });
  });

  it("캐시 적중 행은 분류기에 보내지 않고, 입력이 바뀐 행은 다시 묻는다", async () => {
    const cache = emptyCache();
    const first = fake({ 1: "physical", 2: "agent", 3: "llm", 4: "oss", 5: "llm" });
    await planReclassify(db, { classify: first, cache, cacheSalt: "s" });
    expect(first).toHaveBeenCalledTimes(1);
    expect(Object.keys(cache.entries)).toHaveLength(5);

    // 기사 2를 다시 가공(요약 변경) → 그 행만 미적중.
    db.prepare("UPDATE articles SET summary_ko = '바뀐 요약' WHERE id = 2").run();
    const second = fake({ 2: "oss" });
    const plan = await planReclassify(db, { classify: second, cache, cacheSalt: "s" });
    expect(second.mock.calls[0][0].map((r) => r.id)).toEqual([2]);
    expect(plan.requested).toBe(1);
    expect(plan.decisions.map((d) => [d.row.id, d.next, d.source])).toEqual([
      [1, "physical", "cache"],
      [2, "oss", "llm"],
      [3, "llm", "cache"],
      [4, "oss", "cache"],
      [5, "llm", "cache"],
    ]);

    // salt(모델·분야 정의)가 바뀌면 전부 다시 묻는다.
    const third = fake({});
    await planReclassify(db, { classify: third, cache, cacheSalt: "other" });
    expect(third.mock.calls[0][0]).toHaveLength(5);
  });

  it("규칙 폴백 결과는 캐시에 남기지 않는다(다음 실행에서 다시 묻는다)", async () => {
    const cache = emptyCache();
    await planReclassify(db, { classify: fake({ 1: "physical" }), cache });
    expect(Object.keys(cache.entries)).toEqual(["1"]);
  });
});

describe("applyDecisions", () => {
  it("한 트랜잭션으로 쓴다 — 중간에 실패하면 아무 행도 바뀌지 않는다", async () => {
    db.exec(`CREATE TRIGGER fail_on_4 BEFORE UPDATE OF category ON articles
             WHEN new.id = 4 BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
    const before = categories(db);
    const { decisions } = await planReclassify(db);
    expect(() => applyDecisions(db, decisions)).toThrow("boom");
    expect(categories(db)).toEqual(before);
  });
});

describe("createLlmClassifier", () => {
  const message = (text: string) =>
    ({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 10 },
    }) as unknown as Anthropic.Message;

  it("모든 묶음을 run 한 번에 보내고, 묶음별로 실린 id 만 받는다", async () => {
    const run = vi.fn(async (reqs: { id: string }[]) => {
      const out = new Map<string, LlmResult>();
      // 0번 묶음: 정상 + 다른 묶음 id(3) 섞임 / 1번 묶음: 실패
      out.set(reqs[0].id, {
        batch: true,
        message: message(
          JSON.stringify({
            articles: [
              { id: 1, category: "physical" },
              { id: 2, category: "agent" },
              { id: 3, category: "llm" },
            ],
          }),
        ),
      });
      out.set(reqs[1].id, { batch: true, message: null, error: "batch errored" });
      return out;
    });
    const classify = createLlmClassifier({
      runner: { run },
      model: "claude-haiku-4-5",
      chunkSize: 2,
      maxCostUsd: 1,
      batch: true,
      system: "SYS",
      log: () => {},
    });
    const verdicts = await classify([row(1), row(2), row(3)]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toHaveLength(2);
    expect(verdicts).toEqual([
      { id: 1, category: "physical" },
      { id: 2, category: "agent" },
    ]);
  });

  it("예상 비용이 상한을 넘으면 호출하지 않고 throw", async () => {
    const run = vi.fn();
    const classify = createLlmClassifier({
      runner: { run },
      model: "claude-haiku-4-5",
      chunkSize: 20,
      maxCostUsd: 0,
      batch: true,
      log: () => {},
    });
    await expect(classify([row(1)])).rejects.toThrow("상한");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("parseArgs", () => {
  it("기본은 dry-run, --apply 로만 쓴다", () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(parseArgs(["--dry-run"]).apply).toBe(false);
    const a = parseArgs(["--apply", "--only-legacy", "--limit", "20", "--chunk", "10"]);
    expect(a).toMatchObject({ apply: true, onlyLegacy: true, limit: 20, chunk: 10 });
    expect(parseArgs(["--max-cost", "0.2"]).maxCost).toBe(0.2);
  });

  it("모순·잘못된 옵션은 거부한다", () => {
    expect(() => parseArgs(["--apply", "--dry-run"])).toThrow();
    expect(() => parseArgs(["--limit", "0"])).toThrow();
    expect(() => parseArgs(["--limit"])).toThrow();
    expect(() => parseArgs(["--bogus"])).toThrow();
  });
});

describe("파일 I/O", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "reclassify-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("백업 경로는 KST 날짜, 같은 날 백업이 있으면 접미사를 붙인다", () => {
    const dbPath = path.join(dir, "app.db");
    // 2026-10-28 16:00 UTC = 10-29 01:00 KST
    const now = new Date("2026-10-28T16:00:00Z");
    expect(backupPath(dbPath, now)).toBe(`${dbPath}.bak-20261029`);
    writeFileSync(`${dbPath}.bak-20261029`, "");
    expect(backupPath(dbPath, now)).toBe(`${dbPath}.bak-20261029-2`);
    writeFileSync(`${dbPath}.bak-20261029-2`, "");
    expect(backupPath(dbPath, now)).toBe(`${dbPath}.bak-20261029-3`);
  });

  it("캐시를 저장·복원하고, 없거나 깨진 파일은 빈 캐시로 읽는다", () => {
    const file = path.join(dir, "cache.json");
    expect(loadCache(file)).toEqual(emptyCache());
    const cache = emptyCache();
    cache.entries["7"] = { hash: inputHash(row(7)), category: "physical" };
    saveCache(file, cache);
    expect(existsSync(file)).toBe(true);
    expect(loadCache(file)).toEqual(cache);
    writeFileSync(file, "{not json");
    expect(loadCache(file)).toEqual(emptyCache());
  });
});
