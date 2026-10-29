// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  categoryCounts,
  describeUsage,
  emptyUsage,
  formatCounts,
  importanceCounts,
  parseCollectArgs,
  pickRows,
  readSnapshot,
  snapshotPath,
  summarizePicks,
  usageSince,
  writeSnapshot,
  type EvalSnapshot,
} from "../../scripts/lib/evalRun";
import type { Candidate } from "../../scripts/lib/triage";
import type { ArticleEnrichment } from "../../scripts/lib/schema";

describe("parseCollectArgs", () => {
  it("인자가 없으면 실제 수집(쓰기) 모드", () => {
    expect(parseCollectArgs([])).toEqual({ dryRun: false, noSave: false });
  });

  it("--dry-run · --no-save 를 각각 읽는다", () => {
    expect(parseCollectArgs(["--dry-run"])).toMatchObject({ dryRun: true, noSave: false });
    expect(parseCollectArgs(["--no-save"])).toMatchObject({ dryRun: false, noSave: true });
  });

  it("--db 는 dry-run·no-save 와 함께일 때만 받고 절대 경로로 바꾼다", () => {
    expect(parseCollectArgs(["--no-save", "--db", "x/app.db"]).db).toBe(path.resolve("x/app.db"));
    expect(parseCollectArgs(["--db", "x/app.db", "--dry-run"]).db).toBe(path.resolve("x/app.db"));
  });

  it("실제 수집에서 --db 는 거부한다(다른 DB 로 쓰는 사고 방지)", () => {
    expect(() => parseCollectArgs(["--db", "x/app.db"])).toThrow(/--dry-run·--no-save 에서만/);
  });

  it("--db 값이 없거나 다음 옵션이면 오류", () => {
    expect(() => parseCollectArgs(["--no-save", "--db"])).toThrow(/경로가 필요/);
    expect(() => parseCollectArgs(["--db", "--no-save"])).toThrow(/경로가 필요/);
  });

  it("dry-run 과 no-save 는 함께 쓸 수 없다", () => {
    expect(() => parseCollectArgs(["--dry-run", "--no-save"])).toThrow(/함께 쓸 수 없/);
  });

  it("모르는 옵션(오타)은 실제 수집으로 흘러가지 않게 오류", () => {
    expect(() => parseCollectArgs(["--no-sav"])).toThrow(/알 수 없는 옵션/);
  });
});

describe("snapshotPath", () => {
  it("시각의 : · . 를 - 로 바꿔 data/eval 아래에 둔다", () => {
    expect(snapshotPath("2026-10-29T22:41:11.601Z", "/d")).toBe(
      path.join("/d", "run-2026-10-29T22-41-11-601Z.json"),
    );
  });
});

describe("usage · 비용", () => {
  it("usageSince 는 누적에서 앞 단계 몫을 뺀다", () => {
    const total = { calls: 5, inputTokens: 52_000, outputTokens: 7_000, costUsd: 0.087 };
    const triage = { calls: 1, inputTokens: 24_000, outputTokens: 600, costUsd: 0.027 };
    const enrich = usageSince(total, triage);
    expect(enrich).toMatchObject({ calls: 4, inputTokens: 28_000, outputTokens: 6_400 });
    expect(enrich.costUsd).toBeCloseTo(0.06, 10);
    expect(usageSince(triage, emptyUsage())).toEqual(triage);
  });

  it("describeUsage 는 실지불과 배치 환산(50%)을 함께 적는다", () => {
    // Haiku: 입력 1M·출력 0.2M → 표준 $1 + $1 = $2, 배치 $1
    const line = describeUsage(
      "선별",
      { calls: 1, inputTokens: 1_000_000, outputTokens: 200_000, costUsd: 2 },
      "claude-haiku-4-5",
      false,
    );
    expect(line).toBe(
      "선별: 1회, 입력 1,000,000·출력 200,000토큰, 실지불 $2.0000(direct), 배치 환산 $1.0000",
    );
  });
});

function cand(format: Candidate["format"], topic?: Candidate["topic"]): Candidate {
  return {
    item: { sourceId: "s", url: "https://x", title: "t", publishedAt: "2026-10-29T00:00:00Z" },
    key: "k",
    score: 0,
    sourceName: "S",
    format,
    topic,
  };
}

const enrichment = (category: ArticleEnrichment["category"]): ArticleEnrichment => ({
  title_ko: "제목",
  summary_ko: "요약",
  category,
  tags: [],
});

describe("summarizePicks · pickRows", () => {
  const pool = [
    cand("news"),
    cand("oss", "physical"),
    cand("paper"),
    cand("model"),
    cand("news", "physical"),
  ];
  const picks = [
    { index: 0, importance: 5, duplicates: [] },
    { index: 1, importance: 4, duplicates: [] },
    { index: 2, importance: 3, duplicates: [4] },
    { index: 3, importance: 3, duplicates: [] },
  ];

  it("형식·비뉴스·중요도를 세고, 분야는 가공된 선정만 센다", () => {
    const s = summarizePicks(
      pickRows(pool, picks, { 0: enrichment("physical"), 1: enrichment("oss") }),
    );
    expect(s.total).toBe(4);
    expect(s.byFormat).toEqual({ news: 1, oss: 1, model: 1, paper: 1 });
    expect(s.nonNews).toBe(3);
    expect(s.byCategory.physical).toBe(1);
    expect(s.byCategory.oss).toBe(1);
    expect(s.byCategory.llm).toBe(0);
    expect(s.importance).toEqual({ 1: 0, 2: 0, 3: 2, 4: 1, 5: 1 });
  });

  it("Physical AI 는 가공 분야 기준과 소스 topic 기준을 따로 센다", () => {
    const s = summarizePicks(pickRows(pool, picks, new Map([[0, enrichment("physical")]])));
    expect(s.physicalCategory).toBe(1); // 0번(일반 뉴스지만 분야 physical)
    expect(s.physicalTopic).toBe(1); // 1번(topic physical). 묶음(4번)은 세지 않는다
  });

  it("표기 헬퍼", () => {
    const s = summarizePicks(pickRows(pool, picks));
    expect(formatCounts(s)).toBe("뉴스 1, 오픈소스 1, 모델 1, 논문 1");
    expect(importanceCounts(s)).toBe("5:1 4:1 3:2 2:0 1:0");
    expect(categoryCounts(s)).toBe(
      "LLM 0, 에이전트 0, Physical AI 0, 오픈소스·도구 0, 연구·논문 0, 산업·정책 0",
    );
  });
});

describe("스냅숏 쓰기·읽기", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("없는 디렉터리를 만들어 쓰고 그대로 읽는다", () => {
    dir = mkdtempSync(path.join(tmpdir(), "eval-"));
    const file = snapshotPath("2026-10-29T22:41:11.601Z", path.join(dir, "eval"));
    const snap: EvalSnapshot = {
      createdAt: "2026-10-29T22:41:11.601Z",
      model: "claude-haiku-4-5",
      maxPicks: 35,
      poolSize: 180,
      useBatch: false,
      db: "/x/app.db",
      candidates: 1,
      pool: [cand("oss")],
      reported: [{ issueDate: "2026-10-30", title: "제목" }],
      triage: { picks: [{ id: 0, importance: 4, duplicates: [] }] },
      picks: [{ index: 0, importance: 4, duplicates: [] }],
      enrichments: { 0: enrichment("oss") },
      usage: { triage: emptyUsage(), enrich: emptyUsage() },
      notes: ["선별 풀: 후보 1건 중 1건"],
    };
    writeSnapshot(file, snap);
    expect(readSnapshot(file)).toEqual(snap);
  });
});
