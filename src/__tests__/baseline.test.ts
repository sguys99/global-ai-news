// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  computeBaseline,
  findDuplicatePairs,
  isPhysicalAi,
  parseRunNotes,
  provisionalFormat,
  titleTokens,
  type BaselineArticle,
  type BaselineSource,
} from "../../scripts/lib/baseline";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

describe("provisionalFormat — 소스 → 형식 임시 매핑(계획서 §2-2)", () => {
  it("GitHub → oss, HF 모델 → model, 논문 소스 → paper, 나머지 → news", () => {
    expect(provisionalFormat("github_llm", "github")).toBe("oss");
    expect(provisionalFormat("github_trending", "rss")).toBe("oss");
    expect(provisionalFormat("hf_models_trending", "hf_models")).toBe("model");
    expect(provisionalFormat("hf_daily_papers", "hf")).toBe("paper");
    expect(provisionalFormat("arxiv_cs_cl", "arxiv")).toBe("paper");
    expect(provisionalFormat("takara_tldr", "rss")).toBe("paper");
    expect(provisionalFormat("hf_blog", "rss")).toBe("news");
    expect(provisionalFormat("aitimes", "rss")).toBe("news");
  });
});

describe("isPhysicalAi — 키워드 판정", () => {
  it("로봇·휴머노이드·자율주행·VLA·피지컬 AI 를 잡는다", () => {
    expect(isPhysicalAi(["Figure ships humanoid to BMW"])).toBe(true);
    expect(isPhysicalAi(["New VLA model for manipulation"])).toBe(true);
    expect(isPhysicalAi(["Waymo expands robotaxi service"])).toBe(true);
    expect(isPhysicalAi(["현대차, 자율주행 확대"])).toBe(true);
    expect(isPhysicalAi(["피지컬 AI 칩 공동개발"])).toBe(true);
    expect(isPhysicalAi(["산업용 로봇팔 출시"])).toBe(true);
  });

  it("robots.txt·robust 같은 오탐은 제외, 빈 값은 false", () => {
    expect(isPhysicalAi(["Google updates robots.txt parser"])).toBe(false);
    expect(isPhysicalAi(["A robust LLM benchmark"])).toBe(false);
    expect(isPhysicalAi([null, undefined, ""])).toBe(false);
  });
});

describe("parseRunNotes — collect.ts notes 파싱", () => {
  it("소스별 수집·신규·상한·실패와 선별 풀·선정 수를 읽는다", () => {
    const n = parseRunNotes(
      "techcrunch_ai: 20건(신규 6); aitimes: 50건(신규 35, 상한 15); industrial_ai: 실패 Status code 403; " +
        "선별 풀: 후보 126건 중 126건; 선정 28건(같은 사건으로 묶인 기사 8건); LLM batch 호출 4회, $0.0272",
    );
    expect(n.sources.techcrunch_ai).toEqual({ fetched: 20, fresh: 6, cap: null, error: null });
    expect(n.sources.aitimes).toEqual({ fetched: 50, fresh: 35, cap: 15, error: null });
    expect(n.sources.industrial_ai).toEqual({
      fetched: null,
      fresh: 0,
      cap: null,
      error: "Status code 403",
    });
    expect(n.poolCandidates).toBe(126);
    expect(n.poolSize).toBe(126);
    expect(n.picks).toBe(28);
    expect(n.grouped).toBe(8);
  });

  it("빈 notes 는 빈 결과", () => {
    expect(parseRunNotes(null)).toEqual({
      sources: {},
      poolCandidates: null,
      poolSize: null,
      picks: null,
      grouped: null,
    });
  });
});

describe("findDuplicatePairs — 인접 호 같은 사건 후보(휴리스틱)", () => {
  const art = (
    id: number,
    issueDate: string,
    titleOriginal: string,
    titleKo = "",
    extra: Partial<BaselineArticle> = {},
  ): BaselineArticle => ({
    id,
    sourceId: "s",
    issueDate,
    format: "news",
    category: "agent",
    titleKo,
    titleOriginal,
    summaryKo: "",
    url: `https://x/${id}`,
    tags: [],
    relatedUrls: [],
    physicalAi: false,
    physicalAiStrict: false,
    ...extra,
  });

  it("제목 토큰 정규화: 소문자·기호 제거·불용어 제거·한글 조사 절단·버전 유지", () => {
    expect([...titleTokens("Moonshot Releases Kimi K3.1 Pro: the MoE model")]).toEqual([
      "moonshot",
      "kimi",
      "k3.1",
      "pro",
      "moe",
      "model",
    ]);
    expect(titleTokens("캔바가 이미지를 공개").has("캔바")).toBe(true);
  });

  it("Jaccard ≥ 0.5, 희귀 토큰 3개 공유, URL 공유를 각각 잡고 무관한 쌍은 뺀다", () => {
    const prev = [
      art(1, "2026-10-24", "Mistral releases Voxtral 3 voice agent"),
      art(2, "2026-10-24", "Chinese model Kimi K3.1 Pro is closing in on Claude"),
      art(3, "2026-10-24", "Formic raises funding", "", { url: "https://shared/a" }),
      art(4, "2026-10-24", "Totally unrelated chip export story"),
    ];
    const next = [
      art(11, "2026-10-25", "Mistral releases Voxtral 3 voice model family"),
      art(12, "2026-10-25", "Moonshot ships Kimi K3.1 Pro MoE with 1M context"),
      art(13, "2026-10-25", "Robotics startup expands", "", {
        relatedUrls: ["https://shared/a/"],
      }),
      art(14, "2026-10-25", "Open-source agent framework hits 10k stars"),
    ];
    const pairs = findDuplicatePairs(prev, next);
    expect(pairs.map((p) => [p.prev.id, p.next.id])).toEqual([
      [1, 11],
      [2, 12],
      [3, 13],
    ]);
    expect(pairs[0].similarity).toBeGreaterThanOrEqual(0.5);
    expect(pairs[1].sharedRare).toEqual(expect.arrayContaining(["kimi", "k3.1", "pro"]));
    expect(pairs[2].sharedUrl).toBe(true);
  });
});

describe("computeBaseline — 실제 스키마 in-memory DB", () => {
  let db: DatabaseType;
  let seq = 0;

  const SOURCES: BaselineSource[] = [
    { id: "aitimes", name: "AI타임스", kind: "rss", enabled: 1 },
    { id: "github_llm", name: "GitHub", kind: "github", enabled: 1 },
    { id: "hf_daily_papers", name: "HF Papers", kind: "hf", enabled: 1 },
    { id: "dead_src", name: "Dead", kind: "rss", enabled: 1 },
    { id: "off_src", name: "Off", kind: "rss", enabled: 0 },
  ];

  function article(o: {
    source: string;
    createdAt: string;
    titleOriginal: string;
    importance: number;
    trending?: number;
    category?: string;
    summary?: string | null;
    tag?: string;
  }): number {
    seq += 1;
    const id = Number(
      db
        .prepare(
          `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at,
                                 trending_score, title_ko, summary_ko, category, importance, created_at)
           VALUES (?, ?, ?, ?, '2026-10-24T12:00:00Z', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `k${seq}`,
          o.source,
          `https://x/${seq}`,
          o.titleOriginal,
          o.trending ?? 0,
          `기사${seq}`,
          o.summary === undefined ? "요약" : o.summary,
          o.category ?? "agent",
          o.importance,
          o.createdAt,
        ).lastInsertRowid,
    );
    if (o.tag) {
      db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(o.tag);
      db.prepare(
        "INSERT INTO article_tags (article_id, tag_id) SELECT ?, id FROM tags WHERE name = ?",
      ).run(id, o.tag);
    }
    return id;
  }

  function run(startedAt: string, cost: number, notes: string, status = "partial") {
    db.prepare(
      `INSERT INTO collection_runs (started_at, est_cost_usd, llm_calls, input_tokens, output_tokens, status, notes)
       VALUES (?, ?, 4, 1000, 200, ?, ?)`,
    ).run(startedAt, cost, status, notes);
  }

  beforeEach(() => {
    seq = 0;
    db = new Database(":memory:");
    db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    const ins = db.prepare("INSERT INTO sources (id, name, kind, url, enabled) VALUES (?,?,?,?,?)");
    for (const s of SOURCES) ins.run(s.id, s.name, s.kind, `https://${s.id}`, s.enabled);

    // 10/24 KST 호 (06:00 KST = 전날 21:00 UTC)
    run(
      "2026-10-23T21:00:00Z",
      0.02,
      "aitimes: 10건(신규 8, 상한 3); github_llm: 5건(신규 5); dead_src: 실패 Status code 403",
    );
    article({
      source: "aitimes",
      createdAt: "2026-10-23 21:05:00",
      titleOriginal: "산업용 로봇 기업 상장",
      importance: 5,
      category: "산업·정책",
    }); // 1
    article({
      source: "aitimes",
      createdAt: "2026-10-23 21:05:00",
      titleOriginal: "Kimi K3.1 Pro closes in on Claude",
      importance: 5,
      trending: 10,
      category: "Language Models",
    }); // 2
    article({
      source: "github_llm",
      createdAt: "2026-10-23 21:05:00",
      titleOriginal: "acme/agent-kit",
      importance: 2,
      category: "Dev Tools",
    }); // 3

    // 10/25 KST 호
    run("2026-10-24T21:00:00Z", 0.03, "hf_daily_papers: 7건(신규 2); dead_src: 0건(신규 0)");
    article({
      source: "aitimes",
      createdAt: "2026-10-24 21:05:00",
      titleOriginal: "Moonshot releases Kimi K3.1 Pro MoE model",
      importance: 4,
      category: "Language Models",
    }); // 4
    article({
      source: "hf_daily_papers",
      createdAt: "2026-10-24 21:05:00",
      titleOriginal: "Scaling laws for policy learning",
      importance: 3,
      category: "연구·논문",
      tag: "humanoid",
    }); // 5
    article({
      source: "aitimes",
      createdAt: "2026-10-24 21:05:00",
      titleOriginal: "HN favourite: new editor",
      importance: 3,
      trending: 50,
    }); // 6
    article({
      source: "aitimes",
      createdAt: "2026-10-24 21:05:00",
      titleOriginal: "Search crawler update",
      importance: 3,
      summary: "robots.txt 처리 방식을 바꿨다",
    }); // 7
    // 가공 실패(요약 없음) — 공개 조건 밖이라 어디에도 세지 않는다
    article({
      source: "aitimes",
      createdAt: "2026-10-24 21:05:00",
      titleOriginal: "Robot unpublished",
      importance: 5,
      summary: null,
    });
  });

  it("최신 호 기준 14일 창: 형식·분야·Physical AI·비용·후보 형식 합계 (구 분야 값은 새 키로 센다)", () => {
    const r = computeBaseline(db, 14, SOURCES);
    expect([r.from, r.to]).toEqual(["2026-10-12", "2026-10-25"]);
    expect(r.issues.map((i) => i.date)).toEqual(["2026-10-24", "2026-10-25"]);
    expect(r.totals.published).toBe(7);
    expect(r.totals.formats).toEqual({ news: 5, oss: 1, model: 0, paper: 1 });
    // 시드는 구 값(산업·정책·Language Models·Dev Tools·연구·논문)과 새 키(agent)가 섞여 있다.
    expect(r.totals.categories).toEqual({
      industry: 1,
      llm: 2,
      oss: 1,
      research: 1,
      agent: 2,
    });
    // 제목 "로봇"(#1) + 태그 humanoid(#5). robots.txt(#7)·미공개 Robot 은 제외.
    expect(r.totals.physicalAi).toBe(2);
    expect(r.totals.physicalAiByCategory).toEqual({ industry: 1, research: 1 });
    expect(r.totals.cost.runs).toBe(2);
    expect(r.totals.cost.total).toBeCloseTo(0.05, 10);
    expect(r.totals.cost.avg).toBeCloseTo(0.025, 10);
    expect([r.totals.cost.min, r.totals.cost.max]).toEqual([0.02, 0.03]);
    expect(r.totals.llmCalls).toBe(8);
    // 상한 적용: aitimes min(8,3)=3, github_llm 5, hf_daily_papers 2
    expect(r.totals.candidatesByFormat).toEqual({ news: 3, oss: 5, model: 0, paper: 2 });
  });

  it("1면(리드+서브)·지금 화제를 /edition/[date] 과 같게 재구성해 그날 호 비율을 센다", () => {
    const r = computeBaseline(db, 14, SOURCES);
    const [d24, d25] = r.issues;
    // 10/24: 기사 3건뿐 → 1면 3건 모두 그날 호
    expect(d24.front).toEqual({ today: 3, size: 3 });
    expect(d24.trending).toEqual({ today: 1, size: 1 });
    // 10/25: 중요도 5인 어제 기사 2건이 리드(#2, 화제 지수로 동점 해소)·서브를 차지 → 2/4
    expect(d25.front).toEqual({ today: 2, size: 4 });
    expect(d25.staleFront.map((s) => [s.id, s.issueDate])).toEqual([
      [2, "2026-10-24"],
      [1, "2026-10-24"],
    ]);
    expect(d25.trending).toEqual({ today: 1, size: 2 });
    expect(r.totals.front).toEqual({ today: 5, size: 7 });
    expect(r.totals.trending).toEqual({ today: 2, size: 3 });
  });

  it("창을 1일로 줄이면 최신 호만, 이틀 연속 중복 후보와 0건 소스를 낸다", () => {
    const one = computeBaseline(db, 1, SOURCES);
    expect(one.issues.map((i) => i.date)).toEqual(["2026-10-25"]);
    expect(one.totals.published).toBe(4);
    expect(one.duplicates).toEqual([]); // 인접 호가 창 안에 없음

    const r = computeBaseline(db, 14, SOURCES);
    expect(r.duplicates.map((d) => [d.prev.id, d.next.id])).toEqual([[2, 4]]);
    // 활성 소스 중 게재 0 — 비활성(off_src)은 제외
    expect(r.zeroYield.map((s) => [s.id, s.failures, s.lastError])).toEqual([
      ["dead_src", 1, "Status code 403"],
    ]);
  });

  it("호가 없으면 빈 리포트", () => {
    const empty = new Database(":memory:");
    empty.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    const r = computeBaseline(empty, 14, SOURCES);
    expect(r.to).toBe("");
    expect(r.issues).toEqual([]);
    expect(r.totals.cost.avg).toBe(0);
  });
});
