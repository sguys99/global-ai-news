// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { Category, Format } from "../../src/lib/labels";
import { parseRunNotes } from "../../scripts/lib/baseline";
import {
  alreadyReportedIds,
  alreadyReportedNote,
  buildTriagePool,
  buildTriageRequest,
  defaultPoolQuotas,
  estimateTriageTokens,
  loadReportedHeadlines,
  paperSpreadNote,
  PICK_QUOTAS,
  pickTargets,
  poolMixNotes,
  quotaOverflowNote,
  quotaShortfallNote,
  resolvePicks,
  triageFormat,
  triageLine,
  type Candidate,
  type PickedCategory,
  type PickedMix,
} from "../../scripts/lib/triage";

let seq = 0;
function cand(
  sourceId: string,
  p: {
    score?: number;
    publishedAt?: string;
    content?: string;
    format?: Format;
    physical?: boolean;
  } = {},
): Candidate {
  seq += 1;
  return {
    item: {
      sourceId,
      url: `https://x/${seq}`,
      title: `T${seq}`,
      contentRaw: p.content,
      publishedAt: p.publishedAt ?? "2026-10-06T00:00:00Z",
    },
    key: `k${seq}`,
    score: p.score ?? 0,
    sourceName: sourceId.toUpperCase(),
    format: p.format ?? "news",
    topic: p.physical ? "physical" : undefined,
  };
}

/** 소스 하나에 후보 n건. */
function many(n: number, sourceId: string, p: Parameters<typeof cand>[1] = {}) {
  return Array.from({ length: n }, () => cand(sourceId, p));
}

/** 뉴스 소스 count 개 × perSource 건 — 라운드로빈만으로는 비뉴스가 밀리는 풀. */
function newsSources(count: number, perSource: number) {
  return Array.from({ length: count }, (_, i) => many(perSource, `news${i}`)).flat();
}

const count = (pool: Candidate[], match: (c: Candidate) => boolean) => pool.filter(match).length;
const nonNews = (c: Candidate) => c.format !== "news";
const physical = (c: Candidate) => c.topic === "physical";

describe("buildTriagePool", () => {
  it("소스별 라운드로빈 — 기사가 많은 소스가 풀을 독식하지 않는다", () => {
    const a = [1, 2, 3, 4, 5].map((d) => cand("a", { publishedAt: `2026-10-0${d}T00:00:00Z` }));
    const b = [cand("b")];
    const c = [cand("c"), cand("c")];
    const pool = buildTriagePool([...a, ...b, ...c], 5);
    expect(pool.map((x) => x.item.sourceId)).toEqual(["a", "b", "c", "a", "c"]);
  });

  it("소스 안에서는 화제 점수 → 최신 순", () => {
    const old = cand("a", { score: 0, publishedAt: "2026-10-01T00:00:00Z" });
    const fresh = cand("a", { score: 0, publishedAt: "2026-10-05T00:00:00Z" });
    const hot = cand("a", { score: 80, publishedAt: "2026-09-30T00:00:00Z" });
    expect(buildTriagePool([old, fresh, hot], 3)).toEqual([hot, fresh, old]);
  });

  it("후보가 상한보다 적으면 전부", () => {
    expect(buildTriagePool([cand("a"), cand("b")], 150)).toHaveLength(2);
  });
});

describe("buildTriagePool — 최소 할당", () => {
  it("기본 할당은 풀 180건에서 40·20건, 150건에서 33·17건", () => {
    expect(defaultPoolQuotas(180)).toEqual({ minNonNews: 40, minPhysical: 20 });
    expect(defaultPoolQuotas(150)).toEqual({ minNonNews: 33, minPhysical: 17 });
  });

  it("후보가 있으면 비뉴스·Physical AI 할당을 채운다 — 라운드로빈만으로는 못 채우는 경우", () => {
    // 뉴스 40개 소스 × 10건이면 라운드로빈 앞 150건 중 비뉴스 소스 2개 몫은 4건씩이다.
    const candidates = [
      ...newsSources(40, 10),
      ...many(40, "papers", { format: "paper" }),
      ...many(40, "robots", { physical: true }),
    ];
    const pool = buildTriagePool(candidates, 150);
    expect(pool).toHaveLength(150);
    expect(count(pool, nonNews)).toBeGreaterThanOrEqual(33);
    expect(count(pool, physical)).toBeGreaterThanOrEqual(17);
    // 뉴스 몫은 그대로 남는다.
    expect(count(pool, (c) => c.format === "news")).toBeGreaterThanOrEqual(150 - 33 - 17);
  });

  it("할당보다 후보가 적으면 있는 만큼 전부", () => {
    const papers = many(5, "papers", { format: "paper" });
    const robots = many(3, "robots", { physical: true });
    const pool = buildTriagePool([...newsSources(40, 10), ...papers, ...robots], 150);
    for (const c of [...papers, ...robots]) expect(pool).toContain(c);
  });

  it("비뉴스이면서 physical 인 후보는 두 할당에 모두 센다", () => {
    const candidates = [
      ...newsSources(40, 10),
      ...many(20, "arxiv_ro", { format: "paper", physical: true }),
      ...many(20, "robots", { physical: true }),
    ];
    const pool = buildTriagePool(candidates, 150, { minNonNews: 20, minPhysical: 20 });
    // ① 비뉴스 20건이 모두 physical 이라 ②는 더 채우지 않는다 — Physical AI 할당이 없을 때와 같은 풀.
    expect(count(pool, (c) => c.item.sourceId === "arxiv_ro")).toBe(20);
    expect(pool).toEqual(buildTriagePool(candidates, 150, { minNonNews: 20, minPhysical: 0 }));
    expect(count(pool, (c) => c.item.sourceId === "robots")).toBeLessThan(20);
  });

  it("비뉴스 할당은 형식별로 고르게 — 논문만으로 차지 않는다", () => {
    const candidates = [
      ...newsSources(40, 10),
      ...many(30, "hf_papers", { format: "paper", score: 50 }),
      ...many(30, "arxiv", { format: "paper" }),
      ...many(30, "takara", { format: "paper" }),
      ...many(2, "hf_models", { format: "model" }),
      ...many(10, "gh_a", { format: "oss" }),
      ...many(10, "gh_b", { format: "oss" }),
    ];
    const pool = buildTriagePool(candidates, 150, { minNonNews: 30, minPhysical: 0 });
    const of = (f: Format) => count(pool, (c) => c.format === f);
    expect(of("model")).toBe(2);
    // 남는 몫은 oss·paper 가 나눈다(형식 라운드로빈 14·14, 라운드로빈 몫 4건씩은 그 안에 든다).
    expect(of("oss")).toBe(14);
    expect(of("paper")).toBe(14);
    // 형식 안에서는 소스 라운드로빈 — 한 소스가 몫을 독식하지 않는다.
    expect(count(pool, (c) => c.item.sourceId === "gh_a")).toBe(7);
    expect(count(pool, (c) => c.item.sourceId === "gh_b")).toBe(7);
  });

  it("작은 풀: 할당은 풀 절반을 넘지 않고 뉴스 자리가 남는다", () => {
    const candidates = [
      ...newsSources(5, 5),
      ...many(10, "papers", { format: "paper" }),
      ...many(10, "robots", { physical: true }),
    ];
    // 기본 할당(4 → 1·0)
    const tiny = buildTriagePool(candidates, 4);
    expect(tiny).toHaveLength(4);
    expect(count(tiny, (c) => c.format === "news")).toBeGreaterThanOrEqual(2);
    // 풀보다 큰 할당도 절반(5)으로 비율 축소 — 뉴스가 최소 5건 남는다.
    const capped = buildTriagePool(candidates, 10, { minNonNews: 40, minPhysical: 20 });
    expect(capped).toHaveLength(10);
    expect(count(capped, (c) => c.format === "news" && !physical(c))).toBeGreaterThanOrEqual(5);
  });

  it("할당이 이미 채워지면 기존 라운드로빈과 같고, 할당분도 라운드로빈 순서로 섞인다", () => {
    const candidates = [
      ...many(3, "a"),
      ...many(3, "papers", { format: "paper" }),
      ...many(3, "b"),
    ];
    expect(buildTriagePool(candidates, 6, { minNonNews: 2, minPhysical: 0 })).toEqual(
      buildTriagePool(candidates, 6, { minNonNews: 0, minPhysical: 0 }),
    );
    const pool = buildTriagePool(
      [...newsSources(3, 5), ...many(5, "papers", { format: "paper" })],
      8,
      {
        minNonNews: 4,
        minPhysical: 0,
      },
    );
    // 할당분이 앞에 몰리지 않는다(선별 줄 번호 위치 편향 방지).
    expect(pool.map((c) => c.format).slice(0, 4)).toEqual(["news", "news", "news", "paper"]);
  });

  it("결정적이다 — 같은 입력이면 같은 풀", () => {
    const candidates = [
      ...newsSources(30, 6),
      ...many(20, "papers", { format: "paper" }),
      ...many(8, "gh", { format: "oss", physical: true }),
      ...many(15, "robots", { physical: true }),
    ];
    const first = buildTriagePool(candidates, 60);
    expect(buildTriagePool(candidates, 60)).toEqual(first);
    expect(buildTriagePool([...candidates], 60).map((c) => c.key)).toEqual(first.map((c) => c.key));
  });
});

describe("poolMixNotes", () => {
  it("형식별·Physical AI 후보→풀→게재 수", () => {
    const n1 = cand("n");
    const n2 = cand("n");
    const g = cand("gh", { format: "oss", physical: true });
    const p = cand("arxiv", { format: "paper" });
    const r = cand("robots", { physical: true });
    expect(poolMixNotes([n1, n2, g, p, r], [n1, g, p, r], [g, r])).toEqual([
      "형식별 후보→풀→게재: 뉴스 3→2→1, 오픈소스 1→1→1, 모델 0→0→0, 논문 1→1→0",
      "Physical AI 후보→풀→게재: 2→2→2",
    ]);
  });

  it("게재를 넘기지 않으면(dry-run) 후보→풀만", () => {
    expect(poolMixNotes([cand("n")], [])).toEqual([
      "형식별 후보→풀: 뉴스 1→0, 오픈소스 0→0, 모델 0→0, 논문 0→0",
      "Physical AI 후보→풀: 0→0",
    ]);
  });
});

describe("triageLine / buildTriageRequest", () => {
  it("번호 | 형식 | 매체 | 날짜 | 화제 | 제목 | 발췌 한 줄, 발췌는 공백 정리·절단", () => {
    const c = cand("hn", { score: 42, content: `first\n\nsecond ${"x".repeat(300)}` });
    const line = triageLine(c, 7);
    expect(
      line.startsWith(`7 | 뉴스 | HN | 10-06 | 화제 42 | ${c.item.title} | first second`),
    ).toBe(true);
    expect(line).not.toContain("\n");
    expect(line.length).toBeLessThan(250);
  });

  it("형식 열은 표시명(뉴스·오픈소스·모델·논문)", () => {
    const formats: Format[] = ["news", "oss", "model", "paper"];
    expect(formats.map((f) => triageLine(cand("s", { format: f }), 0).split(" | ")[1])).toEqual([
      "뉴스",
      "오픈소스",
      "모델",
      "논문",
    ]);
  });

  it("화제·발췌가 없으면 '-'", () => {
    expect(triageLine(cand("a"), 0)).toMatch(/^0 \| 뉴스 \| A \| 10-06 \| - \| T\d+ \| -$/);
  });

  it("최대 선정 수를 유저 메시지에 싣고 구조화 출력을 요청한다", () => {
    const req = buildTriageRequest([cand("a"), cand("b")], 30, "claude-haiku-4-5");
    expect(req.params.messages[0].content).toContain("후보 2건 중 최대 30건");
    expect(req.params.output_config?.format?.type).toBe("json_schema");
  });

  it("유저 메시지 순서: 지시 → 오늘 구성·할당 → 이미 보도함 → 후보 줄 → 출력 전 확인(마지막)", () => {
    const pool = [cand("a"), cand("gh", { format: "oss" })];
    const content = buildTriageRequest(pool, 35, "m", {
      reported: [{ issueDate: "2026-10-29", title: "앤트로픽, 새 모델 공개" }],
    }).params.messages[0].content as string;
    const at = (s: string) => content.indexOf(s);
    expect(at("## 오늘 후보 구성")).toBeGreaterThan(at("최대 35건"));
    expect(at("## 오늘 할당")).toBeGreaterThan(at("## 오늘 후보 구성"));
    expect(at("## 이미 보도함")).toBeGreaterThan(at("## 오늘 할당"));
    expect(at("## 오늘 후보\n")).toBeGreaterThan(at("## 이미 보도함"));
    expect(content).toContain(`${triageLine(pool[1], 1)}\n\n## 출력 전 확인\n`);
  });
});

describe("buildTriageRequest — 이미 보도함 주입", () => {
  it("최근 호 제목을 `MM-DD 제목` 한 줄씩 넣는다", () => {
    const content = buildTriageRequest([cand("a")], 35, "m", {
      reported: [
        { issueDate: "2026-10-29", title: "Kimi K3.1 Pro, 클로드에 근접" },
        { issueDate: "2026-10-28", title: "엔비디아,\n로봇용 Nemotron 공개" },
      ],
    }).params.messages[0].content;
    expect(content).toContain(
      "## 이미 보도함 (최근 호 게재 제목 2건 — 같은 사건인 후보는 already_reported 에 적고 고르지 않음)\n" +
        "10-29 Kimi K3.1 Pro, 클로드에 근접\n10-28 엔비디아, 로봇용 Nemotron 공개",
    );
  });

  it("없으면 블록을 생략한다", () => {
    const pool = [cand("a")];
    const content = buildTriageRequest(pool, 35, "m").params.messages[0].content;
    expect(content).not.toContain("이미 보도함");
    expect(buildTriageRequest(pool, 35, "m", { reported: [] }).params.messages[0].content).toBe(
      content,
    );
  });

  it("토큰 추정치에 주입분이 반영된다", () => {
    const pool = [cand("a")];
    const reported = Array.from({ length: 90 }, (_, i) => ({
      issueDate: "2026-10-29",
      title: `보도 제목 ${i} ${"가".repeat(25)}`,
    }));
    const base = estimateTriageTokens(buildTriageRequest(pool, 35, "m"), 35);
    const withReported = estimateTriageTokens(buildTriageRequest(pool, 35, "m", { reported }), 35);
    expect(withReported.input - base.input).toBeGreaterThan(90 * 15);
    expect(withReported.output).toBe(base.output);
  });
});

describe("loadReportedHeadlines", () => {
  const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

  it("최근 3개 호(KST created_at 날짜)의 공개 기사 제목, 최신 호 → 중요도 순", () => {
    const db = new Database(":memory:");
    db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    db.prepare(
      "INSERT INTO sources (id, name, kind, url) VALUES ('s', 'S', 'rss', 'https://s')",
    ).run();
    let n = 0;
    const ins = (createdAt: string, title: string | null, importance = 3, published = true) =>
      db
        .prepare(
          `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at, created_at,
             title_ko, summary_ko, importance) VALUES (?, 's', ?, 'o', '2026-10-01T00:00:00Z', ?, ?, ?, ?)`,
        )
        .run(`k${++n}`, `https://s/${n}`, createdAt, title, published ? "요약" : null, importance);

    ins("2026-10-25 21:00:00", "10-26 호 A", 2); // 21:00 UTC = 10-26 06:00 KST
    ins("2026-10-25 21:00:00", "10-26 호 B", 5);
    ins("2026-10-24 21:00:00", "10-25 호");
    ins("2026-10-23 15:30:00", "10-24 호(00:30 KST)"); // 15:30 UTC = 10-24 00:30 KST
    ins("2026-10-22 21:00:00", "10-23 호 — 4번째라 빠짐");
    ins("2026-10-25 22:00:00", "미가공", 3, false); // summary_ko 없음 — 호도 제목도 세지 않는다

    expect(loadReportedHeadlines(db)).toEqual([
      { issueDate: "2026-10-26", title: "10-26 호 B" },
      { issueDate: "2026-10-26", title: "10-26 호 A" },
      { issueDate: "2026-10-25", title: "10-25 호" },
      { issueDate: "2026-10-24", title: "10-24 호(00:30 KST)" },
    ]);
    expect(loadReportedHeadlines(db, 1)).toHaveLength(2);
    db.close();
  });

  it("기사가 없으면 빈 목록", () => {
    const db = new Database(":memory:");
    db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    expect(loadReportedHeadlines(db)).toEqual([]);
    db.close();
  });
});

describe("pickTargets / 오늘 할당 블록", () => {
  /** 뉴스 n건 + 형식별 후보 수. */
  const poolOf = (news: number, p: Partial<Record<Format, number>> & { physical?: number }) => [
    ...many(news, "n"),
    ...many(p.oss ?? 0, "gh", { format: "oss" }),
    ...many(p.model ?? 0, "hf", { format: "model" }),
    ...many(p.paper ?? 0, "arxiv", { format: "paper" }),
    ...many(p.physical ?? 0, "robots", { physical: true }),
  ];

  it("후보가 충분하면 PICK_QUOTAS 그대로", () => {
    expect(pickTargets(poolOf(100, { oss: 10, model: 5, paper: 20, physical: 30 }), 35)).toEqual({
      nonNews: PICK_QUOTAS.nonNews,
      formats: { oss: 1, model: 1, paper: 1 },
      physical: PICK_QUOTAS.physical,
      physicalMax: 9, // ceil(35 / 4)
    });
  });

  it("후보가 모자라면 있는 만큼으로 줄인다(min(할당, 후보))", () => {
    expect(pickTargets(poolOf(100, { oss: 3, paper: 2, physical: 1 }), 35)).toEqual({
      nonNews: 5,
      formats: { oss: 1, model: 0, paper: 1 },
      physical: 1,
      physicalMax: 9,
    });
  });

  it("최대 선정 수도 넘지 않는다", () => {
    expect(pickTargets(poolOf(10, { oss: 10, physical: 10 }), 2)).toMatchObject({
      nonNews: 2,
      physical: 2,
      physicalMax: 2, // ceil(2 / 4) = 1 이지만 하한보다 작을 수 없다
    });
  });

  it("Physical AI 상한은 최대 선정 수의 1/4(올림)", () => {
    const pool = poolOf(100, { physical: 30 });
    expect(pickTargets(pool, 30).physicalMax).toBe(8);
    expect(pickTargets(pool, 35).physicalMax).toBe(9);
    expect(pickTargets(pool, 40).physicalMax).toBe(10);
  });

  it("유저 메시지에 오늘 구성과 줄인 할당을 싣고, 후보 없는 형식은 할당에서 뺀다", () => {
    const pool = poolOf(100, { oss: 10, paper: 20, physical: 2 });
    const content = buildTriageRequest(pool, 35, "m").params.messages[0].content;
    expect(content).toContain(
      "형식: 뉴스 102건, 오픈소스 10건, 모델 0건, 논문 20건 / Physical AI 전문 매체 2건",
    );
    expect(content).toContain(
      "## 오늘 할당\n- 비뉴스(오픈소스·모델·논문) 8건 이상, 그중 오픈소스 1건·논문 1건 이상\n" +
        "- Physical AI 2건 이상 9건 이하\n",
    );
  });

  it("Physical AI 후보가 없어도 상한은 싣는다(일반 매체 로봇 기사)", () => {
    const content = buildTriageRequest(poolOf(40, {}), 35, "m").params.messages[0].content;
    expect(content).toContain("## 오늘 할당\n- Physical AI 9건 이하\n");
  });

  it("할당할 후보가 하나도 없고 상한도 풀보다 크면 '할당 없음'", () => {
    const content = buildTriageRequest(poolOf(5, {}), 35, "m").params.messages[0].content;
    expect(content).toContain("## 오늘 할당\n- 오늘은 할당이 없습니다.");
  });
});

describe("출력 전 확인", () => {
  const pool = [
    ...many(30, "n"),
    ...many(2, "gh", { format: "oss" }),
    ...many(2, "hf", { format: "model" }),
    ...many(4, "arxiv", { format: "paper" }),
    ...many(5, "robots", { physical: true }),
  ];
  const reported = [{ issueDate: "2026-10-29", title: "보도 제목" }];

  it("후보 줄 뒤(메시지 끝)에 같은 할당 숫자로 붙는다", () => {
    const content = buildTriageRequest(pool, 35, "m", { reported }).params.messages[0]
      .content as string;
    const check = content.slice(content.indexOf("## 출력 전 확인"));
    expect(content.indexOf("## 출력 전 확인")).toBeGreaterThan(content.indexOf("## 오늘 후보\n"));
    expect(check).toBe(
      [
        "## 출력 전 확인",
        "1. already_reported: 이미 보도함과 같은 사건(새 전개 없음)인 후보 번호를 모두 적었다. 이 번호는 picks·duplicates 에 없다.",
        "2. 할당: 비뉴스 8건 이상 — 오픈소스 1건·모델 1건·논문 1건 이상(이 형식이 0건이면 안 됨).",
        "3. Physical AI(로봇·물리 세계가 주제, 매체 무관) 3건 이상 9건 이하.",
        "4. 논문: 한 분야(예: 로봇)가 논문 선정의 절반을 넘지 않는다.",
        "5. 모델의 HuggingFace 페이지와 그 모델을 다룬 뉴스는 같은 사건이다 — 하나만 id, 나머지는 duplicates.",
      ].join("\n"),
    );
  });

  it("이미 보도함이 없으면 그 항목을, 후보 없는 형식이면 그 형식 항목을 뺀다", () => {
    const newsOnly = [...many(30, "n"), ...many(3, "gh", { format: "oss" })];
    const content = buildTriageRequest(newsOnly, 35, "m").params.messages[0].content as string;
    const check = content.slice(content.indexOf("## 출력 전 확인"));
    expect(check).not.toContain("already_reported");
    expect(check).not.toContain("논문:");
    expect(check).not.toContain("HuggingFace");
    expect(check).toContain("1. 할당: 비뉴스 3건 이상 — 오픈소스 1건 이상");
  });
});

describe("quotaShortfallNote", () => {
  const full = {
    nonNews: 8,
    formats: { oss: 1, model: 1, paper: 1 },
    physical: 3,
    physicalMax: 9,
  };
  const picked = (counts: Partial<Record<Format, number>>, physical = 0): PickedMix[] => {
    const out: PickedMix[] = [];
    for (const [f, n] of Object.entries(counts) as [Format, number][]) {
      for (let i = 0; i < n; i++) out.push({ format: f, physical: false });
    }
    for (let i = 0; i < physical && i < out.length; i++) out[i].physical = true;
    return out;
  };

  it("할당을 채우면 null", () => {
    expect(
      quotaShortfallNote(picked({ news: 27, oss: 3, model: 2, paper: 3 }, 3), full),
    ).toBeNull();
  });

  it("미달 항목만 `할당 미달: 항목 게재/목표` 로 남긴다", () => {
    expect(quotaShortfallNote(picked({ news: 30, oss: 3, paper: 2 }, 2), full)).toBe(
      "할당 미달: 비뉴스 5/8, 모델 0/1, Physical AI 2/3",
    );
  });

  it("후보가 없어 줄어든 목표는 경고하지 않는다", () => {
    const targets = {
      nonNews: 2,
      formats: { oss: 1, model: 0, paper: 1 },
      physical: 0,
      physicalMax: 9,
    };
    expect(quotaShortfallNote(picked({ news: 33, oss: 1, paper: 1 }), targets)).toBeNull();
  });

  it("Physical AI 는 형식과 무관하게 센다(뉴스의 로봇 기사도 포함)", () => {
    const mix: PickedMix[] = [
      { format: "news", physical: true },
      { format: "news", physical: true },
      { format: "paper", physical: true },
    ];
    expect(
      quotaShortfallNote(mix, {
        nonNews: 1,
        formats: { oss: 0, model: 0, paper: 1 },
        physical: 3,
        physicalMax: 9,
      }),
    ).toBeNull();
  });

  it("quotaOverflowNote: Physical AI 가 상한을 넘을 때만 `할당 초과: Physical AI 게재/상한`", () => {
    expect(quotaOverflowNote(picked({ news: 20, paper: 15 }, 9), full)).toBeNull();
    expect(quotaOverflowNote(picked({ news: 20, paper: 15 }, 15), full)).toBe(
      "할당 초과: Physical AI 15/9",
    );
  });

  it("notes 에 섞여도 kpi baseline 파싱에 영향이 없다", () => {
    const note = quotaShortfallNote(picked({ news: 30 }), full)!;
    const over = quotaOverflowNote(picked({ news: 30 }, 12), full)!;
    const reportedNote = alreadyReportedNote(
      { already_reported: [1, 2], picks: [{ id: 1, importance: 3, duplicates: [] }] },
      10,
    )!;
    const notes = `aitimes: 10건(신규 8, 상한 3); 선별 풀: 후보 200건 중 180건; 이미 보도함: 최근 3개 호 제목 84건; 선정 33건(같은 사건으로 묶인 기사 5건); ${reportedNote}; ${note}; ${over}`;
    expect(parseRunNotes(notes)).toEqual({
      sources: { aitimes: { fetched: 10, fresh: 8, cap: 3, error: null } },
      poolCandidates: 200,
      poolSize: 180,
      picks: 33,
      grouped: 5,
    });
  });
});

describe("resolvePicks", () => {
  it("범위 밖·중복 번호를 버리고, 한 후보는 선정이든 묶음이든 한 번만", () => {
    const picks = resolvePicks(
      {
        picks: [
          { id: 0, importance: 5, duplicates: [1, 1, 9, 0] },
          { id: 1, importance: 4, duplicates: [] }, // 이미 0 에 묶임
          { id: 2, importance: 3, duplicates: [1, 3] },
          { id: 2, importance: 3, duplicates: [] }, // 같은 번호 재선정
        ],
      },
      5,
      30,
    );
    expect(picks).toEqual([
      { index: 0, importance: 5, duplicates: [1] },
      { index: 2, importance: 3, duplicates: [3] },
    ]);
  });

  it("중요도 높은 순으로 maxPicks 건까지만", () => {
    const picks = resolvePicks(
      {
        picks: [
          { id: 0, importance: 2, duplicates: [] },
          { id: 1, importance: 5, duplicates: [] },
          { id: 2, importance: 4, duplicates: [] },
        ],
      },
      3,
      2,
    );
    expect(picks.map((p) => p.index)).toEqual([1, 2]);
  });

  it("triageFormat.parse 는 중요도 범위를 검증한다", () => {
    expect(() =>
      triageFormat.parse(
        JSON.stringify({ already_reported: [], picks: [{ id: 0, importance: 9, duplicates: [] }] }),
      ),
    ).toThrow();
  });

  it("already_reported 는 picks 보다 앞 필드다(구조화 출력이 먼저 채운다)", () => {
    const schema = triageFormat.schema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(schema.properties)).toEqual(["already_reported", "picks"]);
    expect(schema.required).toContain("already_reported");
  });
});

describe("이미 보도함 제외 (already_reported)", () => {
  it("표시된 번호는 선정에서 통째로 빠지고, 묶음에도 들지 않는다", () => {
    const picks = resolvePicks(
      {
        already_reported: [0, 3, 99],
        picks: [
          { id: 0, importance: 5, duplicates: [1] }, // 이미 보도함 — 선정째 빠진다
          { id: 2, importance: 4, duplicates: [3, 4] }, // 3 은 이미 보도함 — 묶음에서 빠진다
          { id: 1, importance: 3, duplicates: [] }, // 0 의 묶음이 쓰이지 않았으므로 고를 수 있다
        ],
      },
      5,
      30,
    );
    expect(picks).toEqual([
      { index: 2, importance: 4, duplicates: [4] },
      { index: 1, importance: 3, duplicates: [] },
    ]);
  });

  it("빠진 자리는 다음 후보가 채운다(maxPicks 는 남은 선정 기준)", () => {
    const picks = resolvePicks(
      {
        already_reported: [0],
        picks: [
          { id: 0, importance: 5, duplicates: [] },
          { id: 1, importance: 4, duplicates: [] },
          { id: 2, importance: 3, duplicates: [] },
        ],
      },
      3,
      2,
    );
    expect(picks.map((p) => p.index)).toEqual([1, 2]);
  });

  it("필드가 없으면(개편 전 출력·옛 스냅숏) 예전과 같다", () => {
    const triage = { picks: [{ id: 0, importance: 3, duplicates: [1] }] };
    expect(resolvePicks(triage, 2, 30)).toEqual([{ index: 0, importance: 3, duplicates: [1] }]);
    expect(alreadyReportedIds(triage, 2).size).toBe(0);
    expect(alreadyReportedNote(triage, 2)).toBeNull();
  });

  it("notes: 풀 안 번호만 중복 없이 세고, 선정했다 뺀 수를 덧붙인다", () => {
    const triage = {
      already_reported: [1, 1, 2, 50, -1],
      picks: [
        { id: 1, importance: 3, duplicates: [] },
        { id: 3, importance: 3, duplicates: [] },
      ],
    };
    expect([...alreadyReportedIds(triage, 10)]).toEqual([1, 2]);
    expect(alreadyReportedNote(triage, 10)).toBe("이미 보도함 제외 2건(선정했다 뺀 1건)");
    expect(alreadyReportedNote({ already_reported: [2], picks: [] }, 10)).toBe(
      "이미 보도함 제외 1건",
    );
  });
});

describe("paperSpreadNote", () => {
  const papers = (cats: (Category | undefined)[]): PickedCategory[] =>
    cats.map((category) => ({ format: "paper", category }));

  it("가공된 논문 4건 이상에서 한 분야가 절반을 넘을 때만 `논문 분야 쏠림: 분야 n/전체`", () => {
    expect(
      paperSpreadNote([
        ...papers([
          "physical",
          "physical",
          "physical",
          "physical",
          "physical",
          "research",
          "llm",
          "agent",
        ]),
        { format: "news", category: "physical" },
      ]),
    ).toBe("논문 분야 쏠림: Physical AI 5/8");
    // 딱 절반은 넘지 않은 것.
    expect(paperSpreadNote(papers(["physical", "physical", "research", "llm"]))).toBeNull();
    // 3건뿐이면 검사하지 않는다.
    expect(paperSpreadNote(papers(["physical", "physical", "physical"]))).toBeNull();
    // 미가공 논문은 세지 않는다(분모에서도 뺀다).
    expect(
      paperSpreadNote(
        papers(["research", "research", "research", "physical", undefined, undefined]),
      ),
    ).toBe("논문 분야 쏠림: 연구·논문 3/4");
  });

  it("notes 에 섞여도 kpi baseline 파싱에 영향이 없다", () => {
    const note = paperSpreadNote(papers(["physical", "physical", "physical", "llm"]))!;
    expect(parseRunNotes(`선정 30건; ${note}`).picks).toBe(30);
  });
});
