// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRunWarnings } from "../../scripts/lib/baseline";
import { ensureSchema } from "../../scripts/lib/initDb";
import type { LlmResult } from "../../scripts/lib/llm";
import {
  confirmFollowups,
  followUpNote,
  followUpRejectNote,
  hasTopicWord,
  interpretRepeatResult,
  MIN_FOLLOWUP_EVIDENCE,
  prepareFollowUpLink,
  repeatEvidence,
  type RepeatInput,
} from "../../scripts/lib/repeatCheck";
import type { ReportedHeadline } from "../../scripts/lib/triage";
import { FOLLOW_UP_THREAD_LIMIT, getFollowUpThread } from "@/lib/db";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

const ok = (output: unknown): LlmResult => ({
  message: {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [{ type: "text", text: JSON.stringify(output), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 30 },
  } as unknown as Anthropic.Message,
  batch: true,
});

// 이미 보도함(id = 이전 보도 articles.id). R1 은 진짜 후속 보도의 짝, R2 는 같은 회사의 다른 소식(실제 10-29 회차 오탐).
const reported: ReportedHeadline[] = [
  {
    id: 1201,
    issueDate: "2026-10-28",
    title: "미스트랄, 라지 4 발표…가중치는 내달 공개",
    summary: "미스트랄 AI가 차세대 모델 라지 4를 발표했다. 가중치는 다음 달 공개한다.",
  },
  {
    id: 1211,
    issueDate: "2026-10-30",
    title: "Anthropic, Claude로 계약서 검토·법률 조사 자동화 도구 출시",
    summary: "앤트로픽이 법률 업무용 도구를 내놨다.",
  },
  // 옛 스냅숏처럼 id 가 없는 행.
  { issueDate: "2026-10-29", title: "미스트랄, 라지 4 벤치마크 공개" },
];

const inputs: RepeatInput[] = [
  {
    id: 7,
    title: "미스트랄 라지 4 가중치 정식 공개",
    summary: "미스트랄 AI가 라지 4의 가중치를 공개했다. 기업이 직접 내려받아 쓸 수 있다.",
  },
  {
    id: 9,
    title: "앤트로픽, Claude Enterprise에 AI 성과 측정 도구 출시",
    summary: "앤트로픽이 기업 고객용 성과 측정 기능을 추가했다.",
  },
];

describe("confirmFollowups — R번호 → 이전 보도 id, 코드 확인", () => {
  it("기준은 재보도와 같은 2", () => {
    expect(MIN_FOLLOWUP_EVIDENCE).toBe(2);
  });

  it("주체 + 제품이 겹치는 후속 보도는 잇고(R번호 → 그 기사 id), 회사만 겹치는 판정은 기각한다", () => {
    expect(repeatEvidence(inputs[0], reported[0]).score).toBeGreaterThanOrEqual(2);
    expect(repeatEvidence(inputs[1], reported[1]).score).toBe(1); // anthropic 하나뿐

    const { links, rejected } = confirmFollowups(
      [
        { id: 7, reported: 1, event: "미스트랄 라지 4 가중치 공개" },
        { id: 9, reported: 2, event: "앤트로픽 Claude 도구 출시" },
      ],
      inputs,
      reported,
    );
    expect(links).toEqual([
      { id: 7, reported: 1, event: "미스트랄 라지 4 가중치 공개", articleId: 1201 },
    ]);
    expect(rejected).toEqual([
      { id: 9, reported: 2, event: "앤트로픽 Claude 도구 출시", shared: ["anthropic"] },
    ]);
  });

  it("회사 + 버전 번호만 겹치면(같은 제품군의 다른 출시) 2점이어도 잇지 않는다 — 제품·대상 낱말이 하나는 있어야", () => {
    expect(hasTopicWord(["nvidia", "3.5"])).toBe(false);
    expect(hasTopicWord(["15%", "1,000"])).toBe(false);
    expect(hasTopicWord(["mistral", "large"])).toBe(true);
    expect(hasTopicWord(["k3.1"])).toBe(true);

    // 실제 10-25 → 10-30 기사 쌍(요약 첫 문장은 줄임).
    const nemotronEarlier: ReportedHeadline = {
      id: 1082,
      issueDate: "2026-10-25",
      title: "NVIDIA, 로봇용 소형 언어모델 Nemotron 3.5 출시",
    };
    const nemotronToday: RepeatInput = {
      id: 11,
      title: "엔비디아, 40개 언어 지원 음성 모델 Nemotron 3.5 공개",
      summary: "엔비디아가 다국어 음성 모델을 내놨다.",
    };
    expect(repeatEvidence(nemotronToday, nemotronEarlier)).toEqual({
      shared: expect.arrayContaining(["nvidia", "3.5"]),
      score: 2,
    });
    const { links, rejected } = confirmFollowups(
      [{ id: 11, reported: 1, event: "엔비디아 Nemotron 3.5" }],
      [nemotronToday],
      [nemotronEarlier],
    );
    expect(links).toEqual([]);
    expect(rejected.map((m) => m.id)).toEqual([11]);
  });

  it("이전 보도 id 를 모르면(옛 스냅숏) 잇지 않는다 — 기각으로도 세지 않는다", () => {
    const { links, rejected } = confirmFollowups(
      [{ id: 7, reported: 3, event: "미스트랄 라지 4" }],
      inputs,
      reported,
    );
    expect(repeatEvidence(inputs[0], reported[2]).score).toBeGreaterThanOrEqual(2);
    expect(links).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it("짝의 기사·R번호를 찾지 못하면 기각(실패에 열린 쪽 — 링크 없이 싣는다)", () => {
    const { links, rejected } = confirmFollowups(
      [
        { id: 99, reported: 1 },
        { id: 7, reported: 9 },
      ],
      inputs,
      reported,
    );
    expect(links).toEqual([]);
    expect(rejected.map((m) => m.id)).toEqual([99, 7]);
  });
});

describe("interpretRepeatResult — 후속 보도 연결", () => {
  it("후속 판정은 모두 followups(싣는다), 확인을 통과한 것만 links, 기각은 followRejectNote", () => {
    const out = interpretRepeatResult(
      ok({
        repeats: [],
        followups: [
          { id: 7, reported: 1, event: "미스트랄 라지 4 가중치 공개" },
          { id: 9, reported: 2, event: "앤트로픽 Claude 도구 출시" },
        ],
      }),
      inputs,
      reported,
    );
    expect(out.status).toBe("ok");
    expect(out.followups.map((m) => m.id)).toEqual([7, 9]);
    expect(out.links.map((l) => [l.id, l.articleId])).toEqual([[7, 1201]]);
    expect(out.followRejected.map((m) => m.id)).toEqual([9]);
    expect(out.note).toBe("재보도 제외 0건(후속 보도 유지 2건)");
    expect(out.followRejectNote).toBe("후속 판정 기각 1건(내용어 겹침 부족)");
  });

  it("repeats·followups 양쪽에 적힌 기사는 후속 보도로 남고, 확인을 통과하면 잇는다", () => {
    const out = interpretRepeatResult(
      ok({
        repeats: [{ id: 7, reported: 1, event: "라지 4" }],
        followups: [{ id: 7, reported: 1, event: "라지 4" }],
      }),
      inputs,
      reported,
    );
    expect(out.repeats).toEqual([]);
    expect(out.links.map((l) => l.id)).toEqual([7]);
  });

  it("검사 실패면 링크도 없다", () => {
    const out = interpretRepeatResult(undefined, inputs, reported);
    expect(out.status).toBe("failed");
    expect(out.links).toEqual([]);
    expect(out.followRejected).toEqual([]);
    expect(out.followRejectNote).toBeNull();
  });
});

describe("notes", () => {
  it("`후속 보도 연결 N건`·`후속 판정 기각 M건` — 0 이면 null", () => {
    expect(followUpNote(0)).toBeNull();
    expect(followUpNote(2)).toBe("후속 보도 연결 2건");
    expect(followUpRejectNote([])).toBeNull();
  });

  it("kpi baseline 의 재보도 notes 파싱과 겹치지 않는다", () => {
    const w = parseRunWarnings(
      "재보도 제외 1건(후속 보도 유지 2건); 후속 판정 기각 1건(내용어 겹침 부족); 후속 보도 연결 1건",
    );
    expect(w.repeatDropped).toBe(1);
    expect(w.repeatFollowups).toBe(2);
    expect(w.repeatRejected).toBe(0);
    expect(w.repeatCheckFailed).toBeNull();
  });
});

let db: DatabaseType;
let seq = 0;

/** 기사 1건 시드 → id. created_at 은 SQLite datetime 형식(UTC). */
function article(
  createdAt: string,
  p: { published?: boolean; followUpOf?: number | null; title?: string } = {},
): number {
  seq += 1;
  return Number(
    db
      .prepare(
        `INSERT INTO articles (dedup_key, source_id, url, title_original, published_at,
                              title_ko, summary_ko, created_at, follow_up_of)
         VALUES (?, 'hn', ?, ?, '2026-10-01T00:00:00Z', ?, ?, ?, ?)`,
      )
      .run(
        `k${seq}`,
        `https://x/${seq}`,
        `T${seq}`,
        p.title ?? `기사${seq}`,
        p.published === false ? null : "요약",
        createdAt,
        p.followUpOf ?? null,
      ).lastInsertRowid,
  );
}

const followUpOf = (id: number) =>
  db.prepare("SELECT follow_up_of FROM articles WHERE id = ?").pluck().get(id);

beforeEach(() => {
  seq = 0;
  db = new Database(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  db.prepare(
    "INSERT INTO sources (id, name, kind, url, enabled) VALUES ('hn','Hacker News','hn','https://hn',1)",
  ).run();
});

describe("prepareFollowUpLink — 저장 가드(실패에 열림)", () => {
  it("공개 기사 → 공개 이전 보도만 잇는다. 자기 자신·비공개 이전 보도·비공개 행·키 불일치는 0", () => {
    const prev = article("2026-10-28 21:00:00");
    const hidden = article("2026-10-28 21:00:00", { published: false });
    const today = article("2026-10-30 21:00:00");
    const unpublished = article("2026-10-30 21:00:00", { published: false });
    const onError = vi.fn();
    const link = prepareFollowUpLink(db, onError)!;

    expect(link(today, "k3", today)).toBe(0); // 자기 자신
    expect(link(today, "k3", hidden)).toBe(0); // 비공개 이전 보도
    expect(link(today, "k3", 999)).toBe(0); // 없는 이전 보도
    expect(link(unpublished, "k4", prev)).toBe(0); // 비공개(가공 실패) 행
    expect(link(today, "k-other", prev)).toBe(0); // INSERT OR IGNORE 가 무시돼 id 가 엇갈린 경우
    expect(followUpOf(today)).toBeNull();

    expect(link(today, "k3", prev)).toBe(1);
    expect(followUpOf(today)).toBe(prev);
    expect(onError).not.toHaveBeenCalled();
  });

  it("컬럼이 없으면(마이그레이션 전) null + onError — 저장 트랜잭션을 깨지 않는다", () => {
    const old = new Database(":memory:");
    old.exec(`CREATE TABLE articles (id INTEGER PRIMARY KEY, dedup_key TEXT, summary_ko TEXT)`);
    const onError = vi.fn();
    expect(prepareFollowUpLink(old, onError)).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
    old.close();
  });
});

describe("ensureSchema — follow_up_of 마이그레이션", () => {
  it("기존 articles 에 컬럼과 역방향 인덱스를 추가한다(멱등)", () => {
    const old = new Database(":memory:");
    old.exec(`CREATE TABLE articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, dedup_key TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL, url TEXT NOT NULL, title_original TEXT NOT NULL,
      content_raw TEXT, published_at TEXT NOT NULL, engagement_json TEXT,
      trending_score INTEGER NOT NULL DEFAULT 0, title_ko TEXT, summary_ko TEXT,
      category TEXT, importance INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    ensureSchema(old);
    ensureSchema(old);
    const cols = (old.prepare("PRAGMA table_info(articles)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toContain("follow_up_of");
    expect(
      old
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'articles'")
        .pluck()
        .all(),
    ).toContain("articles_follow_up_of");
    old.close();
  });
});

describe("getFollowUpThread — 상세 사건 타임라인", () => {
  const ids = (id: number) => getFollowUpThread(id, undefined, db).map((e) => [e.id, e.relation]);

  it("연결이 없으면 빈 배열", () => {
    const a = article("2026-10-28 21:00:00");
    expect(getFollowUpThread(a, undefined, db)).toEqual([]);
  });

  it("이전 보도만 / 후속 보도만 — 호 날짜 순, 보고 있는 기사도 한 줄", () => {
    const prev = article("2026-10-28 21:00:00", { title: "발표" });
    const next = article("2026-10-30 21:00:00", { followUpOf: prev, title: "출시" });
    expect(getFollowUpThread(next, undefined, db)).toEqual([
      {
        id: prev,
        titleKo: "발표",
        titleOriginal: "T1",
        sourceName: "Hacker News",
        issuedAt: "2026-10-28T21:00:00Z",
        relation: "earlier",
      },
      {
        id: next,
        titleKo: "출시",
        titleOriginal: "T2",
        sourceName: "Hacker News",
        issuedAt: "2026-10-30T21:00:00Z",
        relation: "current",
      },
    ]);
    expect(ids(prev)).toEqual([
      [prev, "current"],
      [next, "later"],
    ]);
  });

  it("사슬(A ← B ← C)과 같은 이전 보도의 다른 후속(A ← D)까지 — 어느 기사에서 봐도 같은 흐름", () => {
    const a = article("2026-10-26 21:00:00");
    const b = article("2026-10-27 21:00:00", { followUpOf: a });
    const c = article("2026-10-29 21:00:00", { followUpOf: b });
    const d = article("2026-10-28 21:00:00", { followUpOf: a });
    expect(ids(b)).toEqual([
      [a, "earlier"],
      [b, "current"],
      [d, "later"],
      [c, "later"],
    ]);
    expect(ids(c).map(([id]) => id)).toEqual([a, b, d, c]);
  });

  it("비공개 기사는 건너뛰고 그 너머로 가지 않는다. 비공개 기사 자체는 빈 배열", () => {
    const a = article("2026-10-26 21:00:00");
    const hidden = article("2026-10-27 21:00:00", { followUpOf: a, published: false });
    const c = article("2026-10-28 21:00:00", { followUpOf: hidden });
    expect(getFollowUpThread(c, undefined, db)).toEqual([]);
    expect(getFollowUpThread(hidden, undefined, db)).toEqual([]);
    expect(ids(a)).toEqual([]);
  });

  it("자기 자신·순환 연결이어도 끝난다(방문 집합)", () => {
    const a = article("2026-10-26 21:00:00");
    const b = article("2026-10-27 21:00:00", { followUpOf: a });
    db.prepare("UPDATE articles SET follow_up_of = ? WHERE id = ?").run(b, a); // a ↔ b
    const self = article("2026-10-28 21:00:00");
    db.prepare("UPDATE articles SET follow_up_of = id WHERE id = ?").run(self);
    expect(ids(a)).toEqual([
      [a, "current"],
      [b, "later"],
    ]);
    expect(getFollowUpThread(self, undefined, db)).toEqual([]);
  });

  it("최대 FOLLOW_UP_THREAD_LIMIT 건 — 가까운 연결부터 담는다", () => {
    const root = article("2026-10-20 21:00:00");
    let prev = root;
    const chain = [root];
    for (let i = 1; i <= FOLLOW_UP_THREAD_LIMIT + 2; i++) {
      prev = article(`2026-10-${20 + i} 21:00:00`, { followUpOf: prev });
      chain.push(prev);
    }
    const mid = chain[4];
    const got = getFollowUpThread(mid, undefined, db).map((e) => e.id);
    expect(got).toHaveLength(FOLLOW_UP_THREAD_LIMIT);
    expect(got).toContain(mid);
    // 가장 먼 끝(첫 기사·마지막 기사) 중 적어도 하나는 빠진다 — 이웃이 먼저다.
    expect(got.includes(chain[0]) && got.includes(chain.at(-1)!)).toBe(false);
    expect(got).toContain(chain[3]);
    expect(got).toContain(chain[5]);
  });

  it("follow_up_of 컬럼이 없는 옛 DB 에서도 깨지지 않는다(빈 배열)", () => {
    const old = new Database(":memory:");
    old.exec(`CREATE TABLE articles (id INTEGER PRIMARY KEY, summary_ko TEXT)`);
    expect(getFollowUpThread(1, undefined, old)).toEqual([]);
    old.close();
  });
});
