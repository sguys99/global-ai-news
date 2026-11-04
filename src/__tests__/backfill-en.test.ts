// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyBackfill,
  assertWithinBudget,
  attentionOf,
  buildRequests,
  buildSystemPrompt,
  checkOutputs,
  englishCoverage,
  estimateRequestsCost,
  exitCodeOf,
  formatConsoleReport,
  formatMarkdownSummary,
  glossaryStats,
  kstDayStart,
  koreanWarningsOf,
  mergeOutputs,
  overlayKoFixes,
  parseArgs,
  parseKoFixes,
  planKoFixes,
  selectTargets,
  tallyOutcomes,
  targetStats,
  type BackfillChunk,
  type BackfillReport,
  type BackfillRow,
  type KoFix,
} from "../../scripts/backfill-en";
import { MAX_INPUT_CHARS } from "../../scripts/lib/enrich";
import { parseGlossary } from "../../scripts/lib/glossary";
import type { LlmResult } from "../../scripts/lib/llm";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

const GLOSSARY = parseGlossary(
  [
    "- 포스코DX → POSCO DX",
    "- 육군 → South Korean Army · 육군 군수사령부 → Army Logistics Command",
    "- Family names (usual spellings): 김 → Kim · 박 → Park",
  ].join("\n"),
);

interface SeedRow {
  id: number;
  source: "tc" | "ait" | "gh";
  title: string;
  content: string | null;
  titleKo: string | null;
  summaryKo: string | null;
  titleEn?: string | null;
  summaryEn?: string | null;
  createdAt: string;
}

const SEED: SeedRow[] = [
  {
    id: 1,
    source: "tc",
    title: "Anthropic reveals $900B AI spending commitments ahead of IPO",
    content: "Anthropic disclosed $900B in spending commitments.",
    titleKo: "Anthropic, IPO 앞두고 AI 투자 900억 달러 공약",
    summaryKo: "Anthropic이 900억 달러를 투자하겠다고 공약했다.",
    createdAt: "2026-10-01 01:00:00",
  },
  {
    // KST 2026-11-01 01:00 — UTC 날짜로는 10-31 이지만 호는 11-01.
    id: 2,
    source: "ait",
    title: "포스코DX, AI 스타트업 인핸스에 20억 투자",
    content: "포스코DX가 인핸스에 20억 원을 투자했다. 육군 군수사령부와는 무관하다.",
    titleKo: "포스코DX, AI 스타트업 인핸스에 200억 원 투자",
    summaryKo: "포스코DX가 인핸스에 200억 원을 투자했다.",
    createdAt: "2026-10-31 16:00:00",
  },
  {
    id: 3,
    source: "tc",
    title: "Already English",
    content: "x",
    titleKo: "영어 있음",
    summaryKo: "영어가 이미 있다.",
    titleEn: "An article that already has English",
    summaryEn: "It already has an English summary written by the enrich step.",
    createdAt: "2026-11-02 00:00:00",
  },
  {
    id: 4,
    source: "tc",
    title: "Unpublished",
    content: "x",
    titleKo: null,
    summaryKo: null,
    createdAt: "2026-11-02 00:00:00",
  },
  {
    id: 5,
    source: "gh",
    title: "max-sixty/worktrunk",
    content: "Worktrunk is a CLI for Git worktree management · topics: agents, git",
    titleKo: "Worktrunk, Git 워크트리 관리 CLI",
    summaryKo: "Git 워크트리 관리 CLI 도구다.",
    createdAt: "2026-11-02 00:00:00",
  },
];

function seed(): DatabaseType {
  const db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  const src = db.prepare(
    "INSERT INTO sources (id, name, kind, url, format, region) VALUES (?, ?, 'rss', 'x', ?, ?)",
  );
  src.run("tc", "TechCrunch AI", "news", null);
  src.run("ait", "AI타임스", "news", "kr");
  src.run("gh", "GitHub Trending", "oss", null);
  const ins = db.prepare(
    `INSERT INTO articles (id, dedup_key, source_id, url, title_original, content_raw, published_at,
       title_ko, summary_ko, title_en, summary_en, category, importance, created_at)
     VALUES (@id, @key, @source, @url, @title, @content, '2026-10-01T00:00:00Z',
       @titleKo, @summaryKo, @titleEn, @summaryEn, 'industry', 3, @createdAt)`,
  );
  for (const r of SEED) {
    ins.run({
      ...r,
      key: `k${r.id}`,
      url: `https://x/${r.id}`,
      titleEn: r.titleEn ?? null,
      summaryEn: r.summaryEn ?? null,
    });
  }
  return db;
}

function message(
  text: string,
  stop_reason: Anthropic.Message["stop_reason"] = "end_turn",
): Anthropic.Message {
  return {
    content: [{ type: "text", text }],
    stop_reason,
    usage: { input_tokens: 10, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

const ok = (articles: unknown[]): LlmResult => ({
  message: message(JSON.stringify({ articles })),
  batch: true,
});

const GOOD_1 = {
  id: 1,
  title_en: "Anthropic reveals $900 billion AI spending commitments ahead of IPO",
  summary_en:
    "Anthropic disclosed $900 billion in AI spending commitments as it prepares for an initial public offering.",
};
const GOOD_2 = {
  id: 2,
  title_en: "POSCO DX invests KRW 2 billion in AI startup Enhans",
  summary_en:
    "POSCO DX invested KRW 2 billion in Enhans, a developer of an enterprise AI operating system, the company said.",
};

let db: DatabaseType;
beforeEach(() => {
  db = seed();
});
afterEach(() => {
  db.close();
});

const build = (rows: BackfillRow[], chunk = 20) =>
  buildRequests(rows, chunk, { system: "SYS", glossary: GLOSSARY });

describe("selectTargets", () => {
  it("게재됐고 영어가 없는 기사만 id 순으로, 지역·형식을 붙여 읽는다", () => {
    const sel = selectTargets(db);
    expect(sel.rows.map((r) => r.id)).toEqual([1, 2, 5]);
    expect(sel.alreadyEnglish).toBe(1);
    expect(sel.rows.map((r) => [r.region, r.format])).toEqual([
      [null, "news"],
      ["kr", "news"],
      [null, "oss"],
    ]);
  });

  it("--since 는 호 날짜(created_at 의 KST 날짜) 기준, --limit 는 앞에서 N건", () => {
    expect(kstDayStart("2026-11-01")).toBe("2026-10-31T15:00:00.000Z");
    expect(selectTargets(db, { since: "2026-11-01" }).rows.map((r) => r.id)).toEqual([2, 5]);
    expect(selectTargets(db, { since: "2026-11-02" }).rows.map((r) => r.id)).toEqual([5]);
    expect(selectTargets(db, { limit: 2 }).rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("--ids 는 그 기사만, 없음·미게재·영어 있음은 사유와 함께 건너뛴다", () => {
    const sel = selectTargets(db, { ids: [9, 4, 3, 2] });
    expect(sel.rows.map((r) => r.id)).toEqual([2]);
    expect(sel.skippedIds).toEqual([
      { id: 3, reason: "has-english" },
      { id: 4, reason: "unpublished" },
      { id: 9, reason: "not-found" },
    ]);
  });

  it("--overwrite 면 --ids 의 영어 있는 기사도 다시 만든다", () => {
    const sel = selectTargets(db, { ids: [3], overwrite: true });
    expect(sel.rows.map((r) => r.id)).toEqual([3]);
    expect(sel.rows[0].titleEn).toBe("An article that already has English");
  });

  it("sources.json 지역 맵이 DB 값보다 우선한다", () => {
    const regionOf = new Map([["tc", "kr" as const]]);
    expect(selectTargets(db, { regionOf }).rows.map((r) => r.region)).toEqual(["kr", "kr", null]);
  });

  it("영어·지역 컬럼이 없는 DB(영어판 이전)도 영어 없음으로 읽는다", () => {
    const old = new Database(":memory:");
    old.exec(`CREATE TABLE sources (id TEXT PRIMARY KEY, name TEXT, kind TEXT, url TEXT, format TEXT);
      CREATE TABLE articles (id INTEGER PRIMARY KEY, source_id TEXT, title_original TEXT, content_raw TEXT,
        title_ko TEXT, summary_ko TEXT, category TEXT, created_at TEXT);
      CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE article_tags (article_id INTEGER, tag_id INTEGER);
      INSERT INTO sources VALUES ('tc', 'TechCrunch AI', 'rss', 'x', 'news');
      INSERT INTO articles VALUES (1, 'tc', 'T', 'c', '제목', '요약', 'llm', '2026-10-01 00:00:00');`);
    const sel = selectTargets(old);
    expect(sel.rows.map((r) => [r.id, r.titleEn, r.region])).toEqual([[1, null, null]]);
    expect(englishCoverage(old)).toEqual({
      kr: { total: 0, withEnglish: 0 },
      other: { total: 1, withEnglish: 0 },
    });
    old.close();
  });
});

describe("buildRequests", () => {
  it("묶음마다 id·형식·출처·원문·참고 한국어를 싣고, 근거는 모델에 준 발췌 그대로다", () => {
    const rows = selectTargets(db).rows;
    rows[0] = { ...rows[0], contentRaw: "A".repeat(MAX_INPUT_CHARS + 500) };
    const chunks = build(rows, 2);
    expect(chunks.map((c) => c.ids)).toEqual([[1, 2], [5]]);
    expect(chunks.map((c) => c.request.id)).toEqual(["backfill-en-0", "backfill-en-1"]);
    const user = chunks[0].request.params.messages[0].content as string;
    expect(user).toContain("### id=1\n[형식] 뉴스\n[출처] TechCrunch AI\n[제목] Anthropic reveals");
    expect(user).toContain(
      "[게재 한국어 제목] 포스코DX, AI 스타트업 인핸스에 200억 원 투자 (참고용)",
    );
    expect(user).toContain("[게재 한국어 요약] 포스코DX가 인핸스에 200억 원을 투자했다. (참고용");
    // 근거 = 원문 제목 + MAX_INPUT_CHARS 로 자른 발췌 — 모델 입력에 그대로 있다.
    const ev = chunks[0].evidence.get(1)!;
    expect(ev.title).toBe(SEED[0].title);
    expect(ev.content).toBe("A".repeat(MAX_INPUT_CHARS));
    expect(user).toContain(`[본문]\n${ev.content}\n[게재 한국어 제목]`);
    expect(user).not.toContain("A".repeat(MAX_INPUT_CHARS + 1));
    expect(chunks[0].request.params.system).toBe("SYS");
    expect(chunks[0].request.params.max_tokens).toBe(200 + 2 * 300);
    // 저장소 토픽은 [토픽] 줄로(가공과 같은 articleFields).
    const repo = chunks[1].request.params.messages[0].content as string;
    expect(repo).toContain("[토픽] agents, git (분류·태그용 키워드");
  });

  it("용어집은 원문 제목·발췌에 키가 나온 항목만 `[용어집]` 블록으로 붙인다", () => {
    const rows = selectTargets(db).rows;
    const chunks = build(rows, 1);
    expect(chunks.map((c) => c.glossaryEntries)).toEqual([0, 3, 0]);
    const kr = chunks[1].request.params.messages[0].content as string;
    expect(kr).toContain(
      "\n\n### [용어집] title_en·summary_en 에 쓸 영문 표기\n- 포스코DX → POSCO DX",
    );
    expect(kr).toContain("- 육군 군수사령부 → Army Logistics Command");
    expect(chunks[0].request.params.messages[0].content).not.toContain("[용어집]");
    expect(glossaryStats(chunks)).toEqual({ requests: 3, withBlock: 1, entries: 3, maxEntries: 3 });
  });

  it("시스템 프롬프트에 영어 규칙·고정 표·few-shot 이 들어가고 $ 금액이 깨지지 않는다", () => {
    const system = buildSystemPrompt();
    expect(system).not.toContain("{{ENGLISH}}");
    expect(system).toContain("$900 billion");
    expect(system).toContain("### Name tables");
    expect(system).toContain("참고용");
    expect(system).toContain("### 예시 1");
    expect(system).toContain('"title_en":"Hanbit AI unveils');
  });
});

describe("비용 가드", () => {
  const chunks = () => build(selectTargets(db).rows);

  it("예상 비용이 상한을 넘으면 시작하지 않는다", () => {
    const est = estimateRequestsCost(chunks(), "claude-haiku-4-5", true);
    expect(est.requests).toBe(1);
    expect(est.measured).toBe(false);
    expect(est.usd).toBeGreaterThan(0);
    expect(() => assertWithinBudget(est, est.usd)).not.toThrow();
    expect(() => assertWithinBudget(est, est.usd / 2)).toThrow(/상한/);
  });

  it("count_tokens 측정값이 있으면 입력 토큰에 그 값을 쓴다", () => {
    const c = chunks();
    const est = estimateRequestsCost(
      c,
      "claude-haiku-4-5",
      true,
      new Map([[c[0].request.id, 1_000_000]]),
    );
    expect(est.measured).toBe(true);
    expect(est.inputTokens).toBe(1_000_000);
    // 배치 50%: 입력 $1/M → $0.5 + 출력분
    expect(est.usd).toBeGreaterThan(0.5);
  });
});

describe("mergeOutputs → checkOutputs", () => {
  const rowsAndChunks = (chunk = 20): [BackfillRow[], BackfillChunk[]] => {
    const rows = selectTargets(db).rows;
    return [rows, build(rows, chunk)];
  };

  it("통과는 저장, 한글·숫자 기각은 영어 없음, 빠진 기사는 missing", () => {
    const [rows, chunks] = rowsAndChunks();
    const results = new Map([
      [
        chunks[0].request.id,
        ok([
          GOOD_1,
          { ...GOOD_2, title_en: "포스코DX invests KRW 2 billion in AI startup Enhans" },
          { id: 99, title_en: "x", summary_en: "y" }, // 요청에 없던 id
          { id: "5", title_en: "bad", summary_en: "bad" }, // 형태 오류 — 이 항목만 버린다
        ]),
      ],
    ]);
    const merged = mergeOutputs(chunks, results);
    expect([...merged.outputs.keys()]).toEqual([1, 2]);
    expect(merged.invalidItems).toBe(2);
    expect(merged.missing.get(5)).toBe("출력에 항목 없음");

    const checked = checkOutputs(rows, chunks, merged);
    expect(checked.outcomes.map((o) => [o.id, o.status, o.reason])).toEqual([
      [1, "written", undefined],
      [2, "rejected", "hangul"],
      [5, "missing", "출력에 항목 없음"],
    ]);
    expect([...checked.english.keys()]).toEqual([1]);
    expect(tallyOutcomes(checked.outcomes)).toMatchObject({ written: 1, missing: 1 });
    expect(checked.notes[0]).toBe("영어 가공 1/2건");
  });

  it("영어 숫자는 모델에 준 원문으로 검사한다($900B 를 $90 billion 으로 쓰면 기각)", () => {
    const [rows, chunks] = rowsAndChunks();
    const wrong = {
      ...GOOD_1,
      title_en: "Anthropic reveals $90 billion AI spending commitments ahead of IPO",
    };
    const merged = mergeOutputs(chunks, new Map([[chunks[0].request.id, ok([wrong, GOOD_2])]]));
    const checked = checkOutputs(rows, chunks, merged);
    const o = checked.outcomes.find((x) => x.id === 1)!;
    expect(o.status).toBe("rejected");
    expect(o.reason).toBe("number");
    expect(o.detail?.join(" ")).toContain("90");
    expect(checked.outcomes.find((x) => x.id === 2)!.status).toBe("written");
  });

  it("한국어 숫자 경고를 집계하고, 고친 한국어를 덧씌우면 경고가 사라진다", () => {
    const [rows, chunks] = rowsAndChunks();
    const merged = mergeOutputs(chunks, new Map([[chunks[0].request.id, ok([GOOD_1, GOOD_2])]]));
    const before = checkOutputs(rows, chunks, merged).koreanWarnings.map((w) => w.id);
    expect(before).toEqual([1, 2]);
    expect(koreanWarningsOf(rows).map((w) => w.id)).toEqual([1, 2]);

    const plan = planKoFixes(db, [
      { id: 2, field: "title_ko", from: "200억 원", to: "20억 원" },
      { id: 2, field: "summary_ko", from: "200억 원", to: "20억 원" },
    ]);
    const fixed = overlayKoFixes(rows, plan);
    expect(fixed[1].titleKo).toBe("포스코DX, AI 스타트업 인핸스에 20억 원 투자");
    // 모델 입력도 고친 한국어를 본다.
    const fixedChunks = build(fixed);
    expect(fixedChunks[0].request.params.messages[0].content).toContain(
      "인핸스에 20억 원 투자 (참고용)",
    );
    expect(koreanWarningsOf(fixed).map((w) => w.id)).toEqual([1]);
  });

  it("요청이 통째로 실패하면(배치 시간 초과·max_tokens) 그 묶음 기사 전부 missing", () => {
    const [rows, chunks] = rowsAndChunks(2);
    const results = new Map<string, LlmResult>([
      [chunks[0].request.id, { message: null, error: "batch: no result", batch: true }],
      [chunks[1].request.id, { message: message("{", "max_tokens"), batch: true }],
    ]);
    const merged = mergeOutputs(chunks, results);
    expect(merged.failedRequests.map((f) => [f.id, f.error])).toEqual([
      ["backfill-en-0", "batch: no result"],
      ["backfill-en-1", "max_tokens"],
    ]);
    const checked = checkOutputs(rows, chunks, merged);
    expect(checked.outcomes.every((o) => o.status === "missing")).toBe(true);
    expect(checked.english.size).toBe(0);
  });
});

describe("applyBackfill", () => {
  it("영어·한국어 수정만 한 트랜잭션으로 쓰고 다른 컬럼과 FTS 는 맞게 둔다", () => {
    const plan = planKoFixes(db, [{ id: 2, field: "summary_ko", from: "200억 원", to: "20억 원" }]);
    const written = applyBackfill(db, {
      english: new Map([
        [1, { titleEn: GOOD_1.title_en, summaryEn: GOOD_1.summary_en }],
        [5, { titleEn: null, summaryEn: null }], // 기각분은 쓰지 않는다
      ]),
      koFixes: plan.updated,
    });
    expect(written).toEqual({ english: 1, korean: 1 });
    const rows = db
      .prepare(
        "SELECT id, title_ko, summary_ko, title_en, category, importance FROM articles ORDER BY id",
      )
      .all() as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({
      title_en: GOOD_1.title_en,
      category: "industry",
      importance: 3,
    });
    expect(rows[1]).toMatchObject({
      summary_ko: "포스코DX가 인핸스에 20억 원을 투자했다.",
      title_en: null,
    });
    expect(rows[1].title_ko).toBe(SEED[1].titleKo);
    expect(rows[4].title_en).toBeNull();
    // FTS(articles_au 트리거)가 고친 한국어를 색인한다.
    const hit = db
      .prepare("SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?")
      .all('"20억"') as { rowid: number }[];
    expect(hit.map((h) => h.rowid)).toContain(2);
    expect(englishCoverage(db)).toEqual({
      kr: { total: 1, withEnglish: 0 },
      other: { total: 3, withEnglish: 2 },
    });
  });
});

describe("한국어 숫자 수정(--ko-fixes)", () => {
  it("파일 형식을 검사한다", () => {
    const fix = { id: 1, field: "summary_ko", from: "900억 달러", to: "9,000억 달러", reason: "x" };
    expect(parseKoFixes({ version: 1, fixes: [fix] })).toEqual([fix]);
    expect(() => parseKoFixes({ version: 2, fixes: [] })).toThrow(/형식 오류/);
    expect(() => parseKoFixes({ version: 1, fixes: [{ ...fix, field: "title_en" }] })).toThrow(
      /fixes\.0\.field/,
    );
    expect(() => parseKoFixes({ version: 1, fixes: [{ ...fix, from: "" }] })).toThrow();
  });

  it("정확히 한 번 나오면 적용, 없으면 stale, 여러 번이면 ambiguous, 이미 적용·기사 없음을 가린다", () => {
    db.prepare("UPDATE articles SET summary_ko = ? WHERE id = 1").run(
      "900억 달러를 쓰고, 다시 900억 달러를 쓴다.",
    );
    const fixes: KoFix[] = [
      { id: 2, field: "title_ko", from: "200억 원", to: "20억 원" },
      { id: 1, field: "summary_ko", from: "900억 달러", to: "9,000억 달러" },
      { id: 1, field: "title_ko", from: "1조 달러", to: "x" },
      { id: 5, field: "summary_ko", from: "워크트리", to: "worktree" },
      { id: 5, field: "summary_ko", from: "관리 CLI", to: "관리용 CLI" }, // 앞 수정이 반영된 값에 이어서
      { id: 2, field: "summary_ko", from: "2,000억", to: "포스코DX" }, // to 가 이미 있음 → already
      { id: 4, field: "summary_ko", from: "x", to: "y" }, // 미게재
      { id: 99, field: "summary_ko", from: "x", to: "y" },
    ];
    const plan = planKoFixes(db, fixes);
    expect(plan.results.map((r) => [r.id, r.status, r.occurrences])).toEqual([
      [2, "applied", 1],
      [1, "ambiguous", 2],
      [1, "stale", 0],
      [5, "applied", 1],
      [5, "applied", 1],
      [2, "already", 0],
      [4, "missing-article", 0],
      [99, "missing-article", 0],
    ]);
    expect(plan.results[0]).toMatchObject({
      before: SEED[1].titleKo,
      after: "포스코DX, AI 스타트업 인핸스에 20억 원 투자",
    });
    expect(plan.updated.get(5)).toEqual({
      titleKo: SEED[4].titleKo,
      summaryKo: "Git worktree 관리용 CLI 도구다.",
    });
    expect([...plan.updated.keys()]).toEqual([2, 5]);
    // DB 는 쓰지 않는다.
    expect(
      (db.prepare("SELECT title_ko FROM articles WHERE id = 2").get() as { title_ko: string })
        .title_ko,
    ).toBe(SEED[1].titleKo);
  });

  it("치환은 함수형이라 `$` 가 패턴으로 해석되지 않는다", () => {
    const plan = planKoFixes(db, [
      { id: 1, field: "title_ko", from: "900억 달러", to: "$900B($&)" },
    ]);
    expect(plan.updated.get(1)?.titleKo).toBe("Anthropic, IPO 앞두고 AI 투자 $900B($&) 공약");
  });
});

describe("parseArgs", () => {
  it("기본은 dry-run, 옵션을 해석한다", () => {
    const a = parseArgs([
      "--apply",
      "--since",
      "2026-10-01",
      "--ids",
      "3, 1,2",
      "--overwrite",
      "--chunk",
      "15",
      "--max-cost",
      "0.4",
    ]);
    expect(a).toMatchObject({
      apply: true,
      since: "2026-10-01",
      ids: [3, 1, 2],
      overwrite: true,
      chunk: 15,
      maxCost: 0.4,
    });
    expect(parseArgs([])).toMatchObject({ apply: false, chunk: 20, maxCost: 1 });
  });

  it("잘못된 조합·값은 거부한다", () => {
    expect(() => parseArgs(["--overwrite"])).toThrow(/--ids/);
    expect(() => parseArgs(["--apply", "--dry-run"])).toThrow();
    expect(() => parseArgs(["--since", "2026-1-1"])).toThrow(/YYYY-MM-DD/);
    expect(() => parseArgs(["--ids", "1,x"])).toThrow();
    expect(() => parseArgs(["--limit", "0"])).toThrow();
    expect(() => parseArgs(["--bogus"])).toThrow(/알 수 없는/);
  });
});

describe("보고", () => {
  function report(): BackfillReport {
    const sel = selectTargets(db);
    const chunks = build(sel.rows);
    const merged = mergeOutputs(
      chunks,
      new Map([[chunks[0].request.id, ok([GOOD_1, { ...GOOD_2, title_en: "짧음" }])]]),
    );
    const checked = checkOutputs(sel.rows, chunks, merged);
    return {
      version: 1,
      mode: "apply",
      createdAt: "2026-11-04T00:00:00.000Z",
      db: "x",
      model: "claude-haiku-4-5",
      batch: true,
      options: { overwrite: false, chunk: 20, maxCostUsd: 1 },
      targets: targetStats(sel),
      glossary: glossaryStats(chunks),
      estimate: estimateRequestsCost(chunks, "claude-haiku-4-5", true),
      totals: { ...tallyOutcomes(checked.outcomes), invalidItems: 0, failedRequests: 0 },
      articles: checked.outcomes,
      koreanWarnings: checked.koreanWarnings,
      koFixes: planKoFixes(db, [{ id: 2, field: "title_ko", from: "200억 원", to: "20억 원" }])
        .results,
      coverage: englishCoverage(db),
      usage: { calls: 1, inputTokens: 100, outputTokens: 10, costUsd: 0.0012 },
      notes: checked.notes,
    };
  }

  it("터미널 보고: 대상·비용·결과·재시도 id", () => {
    const text = formatConsoleReport(report());
    expect(text).toContain("게재 기사 대상     3건");
    expect(text).toContain("KOREA 1 · 해외 2");
    expect(text).toContain("영어 저장          1/3건");
    expect(text).toContain("✗ #2 한글: title");
    expect(text).toContain("재시도: --ids 5");
    expect(text).toContain("$0.0012");
  });

  it("Markdown 요약: 머리 수치·지역 표·기각 사유·누락 재시도 명령", () => {
    const md = formatMarkdownSummary(report());
    expect(md).toMatch(/^## 영어 백필 결과\n\n> \*\*1\*\* \/ 3건 영어 저장/);
    expect(md).toContain("| `KOREA` 한국 매체 | 1 | 0 |");
    expect(md).toContain("| 한글 | 1 |");
    expect(md).toContain("npm run db:backfill-en -- --apply --ids 5");
    expect(md).toContain("#2 `title_ko` 적용: «200억 원» → «20억 원»");
    // 긴 목록은 접는다.
    const many = report();
    many.articles = Array.from({ length: 12 }, (_, i) => ({
      id: i + 100,
      source: "x",
      region: null,
      format: "news" as const,
      status: "missing" as const,
      reason: "batch: no result",
    }));
    expect(formatMarkdownSummary(many)).toContain("<details><summary><b>누락</b> (12건)</summary>");
  });

  it("확인 필요: 누락·건너뛴 한국어 수정은 머리에 띄우고 --apply 면 exit 2, 기각만이면 0", () => {
    const r = report();
    const attention = attentionOf(r);
    expect(attention).toHaveLength(1);
    expect(attention[0]).toContain("영어 누락 1건");
    expect(exitCodeOf(r)).toBe(2);
    expect(formatMarkdownSummary(r)).toContain("**확인 필요**\n\n- 영어 누락 1건");
    expect(formatConsoleReport(r)).toContain("확인 필요\n  ! 영어 누락 1건");

    // 기각(#2)만 남으면 정상 종료 — 검사가 의도대로 동작한 결과다.
    const onlyRejected = report();
    onlyRejected.totals = { ...onlyRejected.totals!, missing: 0 };
    expect(attentionOf(onlyRejected)).toEqual([]);
    expect(exitCodeOf(onlyRejected)).toBe(0);
    expect(formatMarkdownSummary(onlyRejected)).not.toContain("확인 필요");

    const stale = {
      ...onlyRejected,
      koFixes: planKoFixes(db, [{ id: 1, field: "title_ko", from: "없는 문구", to: "x" }]).results,
    };
    expect(attentionOf(stale)[0]).toContain("한국어 수정 1건 건너뜀(#1 건너뜀(원문 없음))");
    expect(exitCodeOf(stale)).toBe(2);
  });

  it("dry-run 은 확인할 것이 있어도 exit 0, 한국어 수정은 '적용 예정', 건수를 두 번 쓰지 않는다", () => {
    const r: BackfillReport = {
      ...report(),
      mode: "dry-run",
      totals: undefined,
      usage: undefined,
      articles: [],
      estimate: { requests: 1, inputTokens: 1, outputTokens: 1, usd: 2, measured: false },
    };
    expect(attentionOf(r)[0]).toContain("예상 비용 $2.0000 이 상한 $1 을 넘습니다");
    expect(exitCodeOf(r)).toBe(0);
    const md = formatMarkdownSummary(r);
    expect(md).toMatch(/^## 영어 백필 미리보기 \(dry-run\)/);
    expect(md).toContain("**한국어 수정 1건 — 적용 예정 1**");
    expect(md).toContain("#2 `title_ko` 적용 예정: «200억 원» → «20억 원»");
    const many = { ...r, koreanWarnings: [{ id: 9, numbers: ["3"] }] };
    expect(formatMarkdownSummary(many)).toContain(
      "<details><summary><b>한국어 숫자 경고 1건 (게재 그대로, 검토용)</b></summary>",
    );
  });

  it("호출 전 거부(aborted)는 exit 1, 제목·사유를 요약에 남긴다", () => {
    const r: BackfillReport = {
      ...report(),
      totals: undefined,
      usage: undefined,
      articles: [],
      aborted: "예상 비용 $2 이 상한 $1 을 넘습니다",
    };
    expect(exitCodeOf(r)).toBe(1);
    const md = formatMarkdownSummary(r);
    expect(md).toMatch(/^## 영어 백필 — 시작하지 않음/);
    expect(md).toContain("**확인 필요**\n\n- 예상 비용 $2 이 상한 $1 을 넘습니다");
    expect(md).toContain("적용 예정: «200억 원»");
  });
});
