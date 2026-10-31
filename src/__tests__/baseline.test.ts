// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  computeBaseline,
  findDuplicatePairs,
  isPhysicalAi,
  parseBaselineArgs,
  parseRunNotes,
  parseRunWarnings,
  provisionalFormat,
  titleTokens,
  type BaselineArticle,
  type BaselineSource,
} from "../../scripts/lib/baseline";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

describe("provisionalFormat — sources.format 없는 예전 DB 의 폴백(계획서 §2-2 규칙)", () => {
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

  it("키워드 사전 필터 제외 수가 붙은 소스도 읽는다", () => {
    const n = parseRunNotes(
      "github_trending: 14건(신규 6, 상한 5, 키워드 제외 5); hf_models: 25건(신규 4, 키워드 제외 1)",
    );
    expect(n.sources.github_trending).toEqual({ fetched: 14, fresh: 6, cap: 5, error: null });
    expect(n.sources.hf_models).toEqual({ fetched: 25, fresh: 4, cap: null, error: null });
  });

  it("형식별·Physical AI 구성 notes(Phase 3-5)는 소스·풀 파싱을 흐리지 않는다", () => {
    const n = parseRunNotes(
      "hf_models: 25건(신규 4); 선별 풀: 후보 263건 중 150건; 선정 30건(같은 사건으로 묶인 기사 5건); " +
        "형식별 후보→풀→게재: 뉴스 210→104→25, 오픈소스 14→14→2, 모델 6→6→1, 논문 33→26→2; " +
        "Physical AI 후보→풀→게재: 41→22→3; LLM batch 호출 4회, $0.0272",
    );
    expect(Object.keys(n.sources)).toEqual(["hf_models"]);
    expect(n.poolCandidates).toBe(263);
    expect(n.poolSize).toBe(150);
    expect(n.picks).toBe(30);
    expect(n.grouped).toBe(5);
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

describe("parseRunWarnings — notes 의 재보도·할당·쏠림 경고(Phase 7)", () => {
  it("재보도 제외·할당 미달·초과·논문 쏠림·소스 topic Physical AI 를 읽고 다른 줄은 건너뛴다", () => {
    const w = parseRunWarnings(
      "aitimes: 10건(신규 8); 선별 풀: 후보 263건 중 180건; 이미 보도함: 최근 3개 호 제목 84건; " +
        "선정 35건(같은 사건으로 묶인 기사 6건); 이미 보도함 제외 4건(선정했다 뺀 1건); " +
        "재보도 제외 3건(후속 보도 유지 2건); 재보도 판정 기각 4건(내용어 겹침 부족); " +
        "할당 미달: 비뉴스 5/8, 모델 0/1; 할당 초과: Physical AI 15/9; " +
        "논문 분야 쏠림: Physical AI 5/8; 형식별 후보→풀→게재: 뉴스 210→104→25, 오픈소스 14→14→2, 모델 6→6→1, 논문 33→26→2; " +
        "Physical AI 후보→풀→게재: 41→22→3; LLM batch 호출 6회, $0.0432",
    );
    expect(w).toEqual({
      repeatDropped: 3,
      repeatFollowups: 2,
      repeatRejected: 4,
      repeatCheckFailed: null,
      quotaShortfall: "비뉴스 5/8, 모델 0/1",
      quotaOverflow: "Physical AI 15/9",
      paperSpread: "Physical AI 5/8",
      physicalTopic: { candidates: 41, pool: 22, published: 3 },
    });
  });

  it("후속 보도 없는 재보도 제외·검사 실패/생략·dry-run 형식(게재 없음)", () => {
    expect(parseRunWarnings("재보도 제외 2건").repeatDropped).toBe(2);
    expect(parseRunWarnings("재보도 제외 2건").repeatFollowups).toBe(0);
    // 모델 판정을 모두 기각하면 `재보도 제외` 줄 없이 기각 줄만 남는다 — 제외 건수(null)와 섞이지 않는다.
    const onlyRejected = parseRunWarnings("재보도 판정 기각 5건(내용어 겹침 부족)");
    expect([onlyRejected.repeatDropped, onlyRejected.repeatRejected]).toEqual([null, 5]);
    expect(onlyRejected.repeatCheckFailed).toBeNull();
    expect(parseRunWarnings("재보도 검사 실패(전부 게재): 응답 검증 실패").repeatCheckFailed).toBe(
      "응답 검증 실패",
    );
    expect(
      parseRunWarnings("재보도 검사 생략: 비용 한도 초과 예상($0.0123)").repeatCheckFailed,
    ).toBe("비용 한도 초과 예상($0.0123)");
    expect(parseRunWarnings("Physical AI 후보→풀: 41→22").physicalTopic).toEqual({
      candidates: 41,
      pool: 22,
      published: null,
    });
  });

  it("예전 notes·빈 notes 는 경고 없음", () => {
    const none = {
      repeatDropped: null,
      repeatFollowups: 0,
      repeatRejected: 0,
      repeatCheckFailed: null,
      quotaShortfall: null,
      quotaOverflow: null,
      paperSpread: null,
      physicalTopic: null,
    };
    expect(parseRunWarnings(null)).toEqual(none);
    expect(
      parseRunWarnings("aitimes: 10건(신규 8); industrial_ai: 실패 Status code 403; 선정 28건"),
    ).toEqual(none);
  });
});

describe("parseBaselineArgs — kpi baseline 인자", () => {
  it("기본값·days·--front·--since(공백/= 꼴)", () => {
    expect(parseBaselineArgs([])).toEqual({ days: 14 });
    expect(parseBaselineArgs(["7", "--front", "legacy"])).toEqual({ days: 7, front: "legacy" });
    expect(parseBaselineArgs(["--front=issue", "--since=2026-11-01"])).toEqual({
      days: 14,
      front: "issue",
      since: "2026-11-01",
    });
    expect(parseBaselineArgs(["--since", "2026-11-01", "30"])).toEqual({
      days: 30,
      since: "2026-11-01",
    });
  });

  it("잘못된 값은 예외", () => {
    expect(() => parseBaselineArgs(["--front", "old"])).toThrow(/--front/);
    expect(() => parseBaselineArgs(["--since", "11/01"])).toThrow(/--since/);
    expect(() => parseBaselineArgs(["--since"])).toThrow(/값이 없습니다/);
    expect(() => parseBaselineArgs(["0"])).toThrow(/알 수 없는 인자/);
    expect(() => parseBaselineArgs(["--days", "3"])).toThrow(/알 수 없는 인자/);
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
  /** sources.format(configs/sources.json 의 format). 생략 = news. */
  const FORMAT: Record<string, string> = { github_llm: "oss", hf_daily_papers: "paper" };

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
    const ins = db.prepare(
      "INSERT INTO sources (id, name, kind, url, enabled, format) VALUES (?,?,?,?,?,?)",
    );
    for (const s of SOURCES) {
      ins.run(s.id, s.name, s.kind, `https://${s.id}`, s.enabled, FORMAT[s.id] ?? "news");
    }

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

  it("기본(issue): 호마다 그 호 기사만으로 1면을 구성 — 오늘 호 비율 100%, 슬롯·비뉴스·Physical AI 지표", () => {
    const r = computeBaseline(db, 14, SOURCES);
    expect(r.front).toBe("issue");
    const [d24, d25] = r.issues;
    // 10/24: 리드 #2(중요도 5·화제 10) · 서브 #1 · 레이더 #3(oss)
    expect(d24.front).toEqual({ today: 3, size: 3 });
    expect(d24.frontSlots).toEqual({ lead: 1, seconds: 1, briefs: 0, radar: 1 });
    // 10/25: 리드 #4 · 서브 #6·#7 · 레이더 #5(논문) — 어제 기사는 섞이지 않는다
    expect(d25.front).toEqual({ today: 4, size: 4 });
    expect(d25.frontSlots).toEqual({ lead: 1, seconds: 2, briefs: 0, radar: 1 });
    expect(d25.staleFront).toEqual([]);
    expect(d25.trending).toEqual({ today: 1, size: 1 });
    expect(r.totals.front).toEqual({ today: 7, size: 7 });
    expect(r.totals.trending).toEqual({ today: 2, size: 2 });

    expect([d24.nonNews, d25.nonNews]).toEqual([1, 1]);
    // 키워드: #1(제목 로봇)·#5(태그 humanoid) — 둘 다 1면(서브·레이더)에 있다. 가공 분야 physical 은 아직 없다.
    expect([d24.physicalAi, d25.physicalAi]).toEqual([1, 1]);
    expect([d24.physicalCategory, d25.physicalCategory]).toEqual([0, 0]);
    expect([d24.physicalTopic, d25.physicalTopic]).toEqual([null, null]); // 예전 notes 엔 topic 줄이 없다
    expect(d24.frontPhysical).toEqual({ category: 0, keyword: 1 });
    expect(r.totals.frontPhysicalIssues).toEqual({ category: 0, keyword: 2 });
    expect(r.totals.perIssue.frontSize).toEqual({ n: 2, avg: 3.5, min: 3, max: 4 });
    expect(r.totals.perIssue.radar).toEqual({ n: 2, avg: 1, min: 1, max: 1 });
    expect(r.totals.perIssue.nonNews).toEqual({ n: 2, avg: 1, min: 1, max: 1 });
    expect(r.totals.perIssue.physicalTopic.n).toBe(0);

    // 가공 분야는 category 로 센다 — #1 을 physical 로 바꾸면 그 호·1면 모두 따라간다.
    db.prepare("UPDATE articles SET category = 'physical' WHERE id = 1").run();
    const p = computeBaseline(db, 14, SOURCES);
    expect(p.issues[0].physicalCategory).toBe(1);
    expect(p.issues[0].frontPhysical).toEqual({ category: 1, keyword: 1 });
    expect(p.totals.frontPhysicalIssues).toEqual({ category: 1, keyword: 2 });
    expect(p.totals.perIssue.physicalCategory).toEqual({ n: 2, avg: 0.5, min: 0, max: 1 });
  });

  it("회차 notes 경고·소스 topic Physical AI 를 호·합계에 싣는다", () => {
    run(
      "2026-10-24T21:30:00Z",
      0.01,
      "선정 30건(같은 사건으로 묶인 기사 5건); 재보도 제외 3건(후속 보도 유지 1건); 재보도 판정 기각 2건(내용어 겹침 부족); " +
        "할당 미달: 비뉴스 5/8; 논문 분야 쏠림: Physical AI 5/8; Physical AI 후보→풀→게재: 41→22→3",
      "success",
    );
    const r = computeBaseline(db, 14, SOURCES);
    expect(r.issues.map((i) => i.physicalTopic)).toEqual([null, 3]);
    expect(r.totals.perIssue.physicalTopic).toEqual({ n: 1, avg: 3, min: 3, max: 3 });
    expect(r.totals.warnings).toEqual({
      repeatRuns: 1,
      repeatDropped: 3,
      repeatFollowups: 1,
      repeatRejected: 2,
      repeatCheckFailed: 0,
      quotaShortfall: 1,
      quotaOverflow: 0,
      paperSpread: 1,
    });
    expect(r.runs.at(-1)?.warnings.quotaShortfall).toBe("비뉴스 5/8");
  });

  it("--since: 그 날짜 이후 호만(창보다 이르면 창 그대로)", () => {
    const r = computeBaseline(db, 14, SOURCES, { since: "2026-10-25" });
    expect([r.since, r.from, r.to]).toEqual(["2026-10-25", "2026-10-25", "2026-10-25"]);
    expect(r.issues.map((i) => i.date)).toEqual(["2026-10-25"]);
    expect(r.totals.published).toBe(4);
    expect(r.totals.cost.runs).toBe(1);
    expect(r.duplicates).toEqual([]);

    const wide = computeBaseline(db, 14, SOURCES, { since: "2026-01-01" });
    expect(wide.from).toBe("2026-10-12");
    expect(wide.issues).toHaveLength(2);

    const none = computeBaseline(db, 14, SOURCES, { since: "2026-11-01" });
    expect(none.issues).toEqual([]);
    expect(none.totals.perIssue.frontSize.n).toBe(0);
  });

  it("legacy: 1면 본문(리드·서브·브리핑·레이더)·지금 화제를 누적 입력으로 재구성해 그날 호 비율을 센다", () => {
    const r = computeBaseline(db, 14, SOURCES, { front: "legacy" });
    expect(r.front).toBe("legacy");
    const [d24, d25] = r.issues;
    // 10/24: 기사 3건뿐 → 리드·서브(뉴스 2) + 레이더(oss 1) 모두 그날 호
    expect(d24.front).toEqual({ today: 3, size: 3 });
    expect(d24.trending).toEqual({ today: 1, size: 1 });
    // 10/25: 중요도 5인 어제 기사 2건이 리드(#2, 화제 지수로 동점 해소)·서브를 차지하고,
    // 어제 저장소(#3)가 레이더에 남는다 → 본문 7건 중 4건
    expect(d25.front).toEqual({ today: 4, size: 7 });
    expect(d25.staleFront.map((s) => [s.id, s.issueDate])).toEqual([
      [2, "2026-10-24"],
      [1, "2026-10-24"],
      [3, "2026-10-24"],
    ]);
    expect(d25.trending).toEqual({ today: 1, size: 2 });
    expect(r.totals.front).toEqual({ today: 7, size: 10 });
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

  it("형식은 sources.format 을 따르고(소급), 컬럼이 없는 예전 DB 는 소스 규칙으로 판정한다", () => {
    // DB 값이 규칙보다 우선 — aitimes 를 model 로 바꾸면 지난 호 기사·후보·소스 수확이 모두 따라간다.
    db.prepare("UPDATE sources SET format = 'model' WHERE id = 'aitimes'").run();
    const r = computeBaseline(db, 14, SOURCES);
    expect(r.totals.formats).toEqual({ news: 0, oss: 1, model: 5, paper: 1 });
    expect(r.totals.candidatesByFormat).toEqual({ news: 0, oss: 5, model: 3, paper: 2 });
    expect(r.sources.find((s) => s.id === "aitimes")?.format).toBe("model");

    // Phase 2 이전 DB(컬럼 없음) → provisionalFormat 폴백. 같은 결과(뉴스 5·오픈소스 1·논문 1)로 기준선과 비교된다.
    db.exec("ALTER TABLE sources DROP COLUMN format");
    const legacy = computeBaseline(db, 14, SOURCES);
    expect(legacy.totals.formats).toEqual({ news: 5, oss: 1, model: 0, paper: 1 });
    expect(legacy.totals.candidatesByFormat).toEqual({ news: 3, oss: 5, model: 0, paper: 2 });
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
