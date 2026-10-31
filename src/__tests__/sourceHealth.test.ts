// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getSourceHealth } from "@/lib/db";
import {
  SOURCE_HEALTH_RULES,
  assessSourceHealth,
  errorExcerpt,
  flaggedSources,
  parseSourceResults,
  runOutcome,
  type HealthRunInput,
  type HealthSourceInput,
} from "@/lib/sourceHealth";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");
const REAL_DB = path.join(process.cwd(), "data/app.db");
const SOURCES_JSON = path.join(process.cwd(), "configs/sources.json");

const src = (id: string, enabled = 1): HealthSourceInput => ({ id, name: `Name ${id}`, enabled });

/** 소스별 회차 결과(오래된 → 최신) → collect.ts 형식 notes 의 회차 목록. 2026-10-01 부터 하루 1회. */
function runsFrom(
  lines: Record<string, (string | null)[]>,
  extra = "선별 풀: 후보 10건 중 10건",
): HealthRunInput[] {
  const n = Math.max(...Object.values(lines).map((l) => l.length));
  return Array.from({ length: n }, (_, i) => {
    const parts = Object.entries(lines)
      .map(([id, l]) => (l[i] == null ? null : `${id}: ${l[i]}`))
      .filter((p): p is string => p !== null);
    return {
      id: i + 1,
      startedAt: new Date(Date.UTC(2026, 9, 1 + i, 21)).toISOString(),
      notes: [...parts, extra].join("; "),
    };
  });
}

const OK = "20건(신규 5)";
const STALE = "3건(신규 0)";
const EMPTY = "0건(신규 0)";
const FILTERED = "10건(신규 0, 키워드 제외 10)";
const FAIL = "실패 Status code 403";

function one(lines: (string | null)[], id = "a") {
  const r = assessSourceHealth([src(id)], runsFrom({ [id]: lines }));
  return r.sources[0];
}

describe("parseSourceResults", () => {
  it("성공·상한·키워드 제외·실패 줄을 읽고 소스 줄이 아닌 것은 건너뛴다", () => {
    const m = parseSourceResults(
      "a: 20건(신규 6); b: 50건(신규 40, 상한 10); c: 25건(신규 9, 상한 5, 키워드 제외 12); d: 실패 Status code 403; 선별 풀: 후보 126건 중 126건; 선정 28건(같은 사건으로 묶인 기사 8건); LLM batch 호출 4회, $0.0246",
    );
    expect([...m.keys()]).toEqual(["a", "b", "c", "d"]);
    expect(m.get("b")).toEqual({ fetched: 50, fresh: 40, dropped: 0, error: null });
    expect(m.get("c")).toEqual({ fetched: 25, fresh: 9, dropped: 12, error: null });
    expect(m.get("d")).toEqual({ fetched: null, fresh: 0, dropped: 0, error: "Status code 403" });
  });

  it("빈 notes·null 은 빈 맵", () => {
    expect(parseSourceResults(null).size).toBe(0);
    expect(parseSourceResults("MAX_PICKS_PER_RUN=0 — 수집·선별·가공 생략").size).toBe(0);
  });
});

describe("runOutcome", () => {
  it("실패 / 신규 / 0건 / 키워드 전부 제외 / 새 글 없음을 가른다", () => {
    const o = (line: string) => runOutcome(parseSourceResults(`a: ${line}`).get("a")!);
    expect(o(FAIL)).toBe("failed");
    expect(o(OK)).toBe("yield");
    expect(o("50건(신규 40, 상한 10)")).toBe("yield");
    expect(o(EMPTY)).toBe("empty");
    expect(o(FILTERED)).toBe("filtered");
    expect(o("10건(신규 0, 키워드 제외 4)")).toBe("stale"); // 남은 6건이 전부 이미 본 글
    expect(o(STALE)).toBe("stale");
  });
});

describe("assessSourceHealth — 판정 규칙", () => {
  it("연속 실패 2회 → 오류, 마지막 오류 사유와 마지막 신규를 남긴다", () => {
    const s = one([OK, OK, FAIL, FAIL]);
    expect(s.level).toBe("error");
    expect(s.failStreak).toBe(2);
    expect(s.reason).toBe("2회 연속 수집 실패");
    expect(s.lastError?.message).toBe("Status code 403");
    expect(s.lastYield).toEqual({ at: "2026-10-02T21:00:00.000Z", fresh: 5 });
  });

  it("최근 1회만 실패 → 주의(다음 회차도 실패하면 오류)", () => {
    const s = one([OK, OK, FAIL]);
    expect(s.level).toBe("watch");
    expect(s.failStreak).toBe(1);
  });

  it("실패 뒤 회복하면 정상 — 지난 실패는 lastError 로만 남는다", () => {
    const s = one([FAIL, FAIL, OK]);
    expect(s.level).toBe("ok");
    expect(s.failStreak).toBe(0);
    expect(s.lastError?.at).toBe("2026-10-02T21:00:00.000Z");
  });

  it("0건 3회 연속 → 경고, 2회는 정상", () => {
    expect(one([OK, EMPTY, EMPTY]).level).toBe("ok");
    const s = one([OK, EMPTY, EMPTY, EMPTY]);
    expect(s.level).toBe("warn");
    expect(s.dryCause).toBe("empty");
    expect(s.reason).toBe("3회 연속 0건 — 피드가 빈 목록을 돌려준다");
  });

  it("키워드 필터로 전부 제외 3회 → 경고(원인 filtered)", () => {
    const s = one([FILTERED, FILTERED, FILTERED]);
    expect(s.level).toBe("warn");
    expect(s.dryCause).toBe("filtered");
  });

  it("새 글만 없는(stale) 구간은 7회부터 경고 — 갱신이 드문 블로그 보호", () => {
    expect(one([OK, ...Array(SOURCE_HEALTH_RULES.staleStreak - 1).fill(STALE)]).level).toBe("ok");
    const s = one([OK, ...Array(SOURCE_HEALTH_RULES.staleStreak).fill(STALE)]);
    expect(s.level).toBe("warn");
    expect(s.reason).toBe("7회 연속 새 글 없음 — 피드는 응답한다");
  });

  it("stale 에 0건·실패가 섞이면 3회 기준, 사유에 구성을 적는다", () => {
    const s = one([OK, STALE, EMPTY, STALE]);
    expect(s.level).toBe("warn");
    expect(s.dryCause).toBe("mixed");
    expect(s.dryBreakdown).toEqual({ stale: 2, empty: 1 });
    expect(s.reason).toBe("3회 연속 신규 0건 — 새 글 없음 2 · 0건 1");
  });

  it("실패 1회 + 이전 무수확 2회 = 무수확 3회 → 경고가 주의보다 앞선다", () => {
    const s = one([OK, EMPTY, EMPTY, FAIL]);
    expect(s.level).toBe("warn");
    expect(s.failStreak).toBe(1);
  });

  it("회차에 줄이 없는 소스(신규 추가)는 기록 없음 — 회차 칸은 null", () => {
    const r = assessSourceHealth([src("a"), src("new")], runsFrom({ a: [OK, OK] }));
    const s = r.sources.find((x) => x.id === "new")!;
    expect(s.level).toBe("unknown");
    expect(s.strip).toEqual([null, null]);
  });

  it("중간 회차에 줄이 빠지면 그 회차는 건너뛰고 연속을 잇는다(띠에는 빈 칸)", () => {
    const r = assessSourceHealth(
      [src("a"), src("b")],
      runsFrom({ a: [OK, FAIL, null, FAIL], b: [OK, OK, OK, OK] }),
    );
    const s = r.sources.find((x) => x.id === "a")!;
    expect(s.level).toBe("error");
    expect(s.runsSeen).toBe(3);
    expect(s.failStreak).toBe(2);
    expect(s.strip).toEqual(["yield", "failed", null, "failed"]);
  });

  it("비활성 소스는 판정하지 않고 개수만 센다", () => {
    const r = assessSourceHealth(
      [src("a"), src("off", 0)],
      runsFrom({ a: [OK], off: [FAIL, FAIL] }),
    );
    expect(r.sources.map((s) => s.id)).toEqual(["a"]);
    expect(r.disabled).toBe(1);
  });

  it("심각도 → 연속 횟수 순으로 정렬하고 수준별 개수를 센다", () => {
    const r = assessSourceHealth(
      [src("fine"), src("dry"), src("fail3"), src("fail2"), src("once")],
      runsFrom({
        fine: [OK, OK, OK],
        dry: [EMPTY, EMPTY, EMPTY],
        fail3: [FAIL, FAIL, FAIL],
        fail2: [OK, FAIL, FAIL],
        once: [OK, OK, FAIL],
      }),
    );
    expect(r.sources.map((s) => `${s.id}:${s.level}`)).toEqual([
      "fail3:error",
      "fail2:error",
      "dry:warn",
      "once:watch",
      "fine:ok",
    ]);
    expect(r.counts).toEqual({ error: 2, warn: 1, watch: 1, unknown: 0, ok: 1 });
    expect(flaggedSources(r).map((s) => s.id)).toEqual(["fail3", "fail2", "dry", "once"]);
  });

  it("창(windowRuns) 밖까지 이어진 연속은 'N+회'로 적는다", () => {
    const runs = runsFrom({ a: Array(6).fill(FAIL) });
    const r = assessSourceHealth([src("a")], runs, { windowRuns: 4, stripRuns: 3 });
    expect(r.runs).toBe(4);
    expect(r.sources[0].reason).toBe("4+회 연속 수집 실패");
    expect(r.sources[0].strip).toHaveLength(3);
    expect(r.stripRunAt).toEqual(runs.slice(3).map((x) => x.startedAt));
  });

  it("소스 줄이 없는 회차(수집 전 종료)는 창에서 뺀다", () => {
    const runs = [
      ...runsFrom({ a: [OK, FAIL] }),
      {
        id: 99,
        startedAt: "2026-10-09T21:00:00.000Z",
        notes: "MAX_PICKS_PER_RUN=0 — 수집·선별·가공 생략",
      },
    ];
    const r = assessSourceHealth([src("a")], runs);
    expect(r.runs).toBe(2);
    expect(r.sources[0].level).toBe("watch");
  });

  it("회차가 없으면 전부 기록 없음", () => {
    const r = assessSourceHealth([src("a")], []);
    expect(r.runs).toBe(0);
    expect(r.latestRunAt).toBeNull();
    expect(r.sources[0].level).toBe("unknown");
  });
});

describe("errorExcerpt", () => {
  it("한 줄로 접고 길면 자른다", () => {
    expect(errorExcerpt("fetch\n  failed")).toBe("fetch failed");
    expect(errorExcerpt("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
  });
});

describe("getSourceHealth (DB)", () => {
  it("collection_runs 를 최신순으로 읽어 판정한다", () => {
    const db = new Database(":memory:");
    db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    const insert = db.prepare(
      `INSERT INTO collection_runs (started_at, items_collected, items_new, llm_calls, input_tokens,
         output_tokens, est_cost_usd, status, notes) VALUES (?, 0, 0, 0, 0, 0, 0, 'partial', ?)`,
    );
    for (const r of runsFrom({ a: [OK, FAIL, FAIL], b: [OK, OK, OK] }))
      insert.run(r.startedAt, r.notes);
    const report = getSourceHealth([src("a"), src("b")], db);
    expect(report.runs).toBe(3);
    expect(report.sources.map((s) => `${s.id}:${s.level}`)).toEqual(["a:error", "b:ok"]);
  });
});

// 실제 data/app.db(읽기 전용) — notes 형식이 바뀌어 소스 줄을 못 읽게 되면 여기서 걸린다.
describe.skipIf(!existsSync(REAL_DB))("실제 data/app.db", () => {
  it("모든 회차의 소스 줄을 빠짐없이 읽고, 활성 소스마다 판정을 낸다", () => {
    const db = new Database(REAL_DB, { readonly: true, fileMustExist: true });
    try {
      const sources = JSON.parse(readFileSync(SOURCES_JSON, "utf-8")) as HealthSourceInput[];
      const report = getSourceHealth(sources, db);
      expect(report.runs).toBeGreaterThan(0);
      expect(report.sources).toHaveLength(sources.filter((s) => s.enabled).length);
      expect(report.disabled).toBe(sources.filter((s) => !s.enabled).length);

      const rows = db
        .prepare(`SELECT notes FROM collection_runs ORDER BY started_at DESC LIMIT ?`)
        .all(SOURCE_HEALTH_RULES.windowRuns) as { notes: string | null }[];
      // 알려진 소스 id(sources.json + sources 테이블)로 시작하는 조각은 전부 소스 결과 줄로 읽혀야 한다.
      // (예전 회차의 `capped: …`·`backfill: …` 같은 줄은 소스 id 가 아니라 대상이 아니다. 지금은 없는
      // reddit_* 같은 옛 소스 줄도 읽히지만 sources.json 에 없어 판정에는 나오지 않는다.)
      const known = new Set([
        ...sources.map((s) => s.id),
        ...(db.prepare(`SELECT id FROM sources`).all() as { id: string }[]).map((s) => s.id),
      ]);
      for (const { notes } of rows) {
        const ids = (notes ?? "")
          .split("; ")
          .map((p) => /^([a-z0-9_]+): /.exec(p)?.[1])
          .filter((id): id is string => id !== undefined && known.has(id));
        expect([...parseSourceResults(notes).keys()]).toEqual(expect.arrayContaining(ids));
      }
    } finally {
      db.close();
    }
  });
});
