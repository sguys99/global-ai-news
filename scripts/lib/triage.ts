/**
 * LLM 선별(triage). 하루치 후보 전체를 한 번의 호출로 비교해 가공할 기사(최대 N건)를 고르고,
 * 같은 사건을 다룬 기사를 묶고, 중요도(1~5)를 상대 평가한다.
 *
 * 본문 전체가 아닌 제목·출처·짧은 발췌만 보내 입력을 작게 유지한다(후보 1건 ≈ 60토큰).
 * 본문을 읽고 한국어로 쓰는 일은 선정된 기사에 한해 enrich.ts 가 한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Database as DatabaseType } from "better-sqlite3";
import {
  CATEGORY_LABELS,
  FORMAT_LABELS,
  FORMATS,
  type Category,
  type Format,
} from "../../src/lib/labels";
import { PROMPTS_DIR } from "../../src/lib/paths";
import type { RawItem } from "../../src/lib/types";
import { approxTokens, outputFormatTokens } from "./cost";
import type { LlmRequest } from "./llm";
import { triageSchema } from "./schema";

/** 수집·dedup 을 통과한 후보. articleId 가 있으면 가공에 실패해 재시도하는 기존 행이다. */
export interface Candidate {
  item: RawItem;
  key: string;
  score: number;
  sourceName: string;
  /** 소스 형식(sources.json `format`, 미지정 news). 선별 풀의 형식별 할당에 쓴다. */
  format: Format;
  /** 소스 주력 분야 힌트(sources.json `topic`). "physical" 이면 Physical AI 할당에 든다. */
  topic?: Category;
  articleId?: number;
}

/** 선별 풀 최소 할당(건). 후보가 그보다 적으면 있는 만큼만 담는다. */
export interface PoolQuotas {
  /** 비뉴스(오픈소스·모델·논문) 최소 건수. */
  minNonNews: number;
  /** Physical AI 소스(topic: physical) 최소 건수. 비뉴스이면서 physical 인 후보는 양쪽에 모두 센다. */
  minPhysical: number;
}

export interface Pick {
  /** 후보 풀 번호. */
  index: number;
  importance: number;
  /** 같은 사건을 다룬 다른 후보 번호. */
  duplicates: number[];
}

const TITLE_CHARS = 160;
const SNIPPET_CHARS = 120;
/** 선정 1건당 출력 토큰 근사치(id·importance·duplicates JSON). 비용 가드 추정용. */
const OUTPUT_TOKENS_PER_PICK = 25;

export const triageFormat = zodOutputFormat(triageSchema);

const SYSTEM_PROMPT = readFileSync(path.join(PROMPTS_DIR, "triage.system.md"), "utf-8");

/** 풀 대비 비뉴스·Physical AI 최소 비율. 풀 180건에서 40·20건(계획 3-5), 현재 150건에서 33·17건. */
const NON_NEWS_SHARE = 2 / 9;
const PHYSICAL_SHARE = 1 / 9;

/**
 * 풀 크기에 맞춘 기본 할당. 비율로 두어 TRIAGE_POOL_SIZE(150 → 180, Actions vars 조정)를 바꿔도
 * 뉴스 몫(2/3 이상)이 유지되고, 작은 풀(테스트·수동 override)에서도 풀을 넘지 않는다.
 */
export function defaultPoolQuotas(size: number): PoolQuotas {
  return {
    minNonNews: Math.round(size * NON_NEWS_SHARE),
    minPhysical: Math.round(size * PHYSICAL_SHARE),
  };
}

/** 큐 여러 개를 한 바퀴에 하나씩 번갈아 꺼낸 전체 순서. */
function roundRobin<T>(queues: T[][]): T[] {
  const out: T[] = [];
  for (let round = 0; ; round++) {
    let took = false;
    for (const queue of queues) {
      if (round < queue.length) {
        out.push(queue[round]);
        took = true;
      }
    }
    if (!took) return out;
  }
}

const isPhysical = (c: Candidate) => c.topic === "physical";

/** 비뉴스 형식(오픈소스·모델·논문). */
type NonNewsFormat = Exclude<Format, "news">;
const NON_NEWS_FORMATS = FORMATS.filter((f): f is NonNewsFormat => f !== "news");

/**
 * 선별에 보낼 후보 풀. 소스별로 화제 점수 → 최신 순 정렬 후 라운드로빈으로 뽑아, 기사가 많은
 * 소스(국내 매체·GitHub 등)가 풀을 독식하지 않게 한다. RSS 는 화제 점수가 0 이라 점수만으로
 * 자르면 API 소스에 밀린다.
 *
 * 뉴스 소스가 훨씬 많아 라운드로빈만으로는 비뉴스·Physical AI 후보가 풀에서 밀리므로 최소 할당을 먼저 채운다.
 * ① 비뉴스 minNonNews 건: 형식(oss → model → paper) 라운드로빈 안에서 다시 소스 라운드로빈 — 논문만으로 차지 않는다.
 * ② Physical AI minPhysical 건: ①에서 이미 든 physical 비뉴스를 빼고 모자란 만큼 소스 라운드로빈.
 * ③ 나머지 자리는 전체 라운드로빈. 출력은 전체 라운드로빈 순서라 할당분이 선별 줄 앞쪽에 몰리지 않는다.
 * 두 할당의 합은 풀의 절반을 넘지 않게 줄인다(뉴스 몫 보장). 입력 순서가 같으면 결과도 같다.
 */
export function buildTriagePool(
  candidates: Candidate[],
  size: number,
  quotas: PoolQuotas = defaultPoolQuotas(size),
): Candidate[] {
  const bySource = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const group = bySource.get(c.item.sourceId) ?? [];
    group.push(c);
    bySource.set(c.item.sourceId, group);
  }
  const queues = [...bySource.values()].map((group) =>
    [...group].sort(
      (a, b) => b.score - a.score || b.item.publishedAt.localeCompare(a.item.publishedAt),
    ),
  );
  const order = roundRobin(queues);

  // 할당 합이 풀 절반을 넘으면 비율대로 줄인다. 각 할당은 풀 크기도 넘지 않는다.
  const half = Math.floor(size / 2);
  const total = quotas.minNonNews + quotas.minPhysical;
  const scale = total > half ? half / total : 1;
  const minNonNews = Math.floor(quotas.minNonNews * scale);
  const minPhysical = Math.floor(quotas.minPhysical * scale);

  const taken = new Set<Candidate>();
  const take = (ordered: Candidate[], n: number) => {
    for (const c of ordered) {
      if (n <= 0 || taken.size >= size) return;
      if (taken.has(c)) continue;
      taken.add(c);
      n -= 1;
    }
  };

  // ① 형식은 소스 속성이라 소스 큐 하나는 형식이 하나다 — 큐 첫 항목으로 가른다.
  const nonNews = NON_NEWS_FORMATS.map((f) => roundRobin(queues.filter((q) => q[0].format === f)));
  take(roundRobin(nonNews), minNonNews);
  // ②
  const physicalTaken = [...taken].filter(isPhysical).length;
  take(roundRobin(queues.filter((q) => isPhysical(q[0]))), minPhysical - physicalTaken);
  // ③
  take(order, size - taken.size);

  return order.filter((c) => taken.has(c));
}

/** 조건에 맞는 후보 → 풀(→ 게재) 수. */
function mixCounts(groups: Candidate[][], match: (c: Candidate) => boolean): string {
  return groups.map((g) => g.filter(match).length).join("→");
}

/**
 * 회차 notes 용 구성 요약. `published` 를 주면 게재 수까지 센다(dry-run 은 생략).
 * 예: `형식별 후보→풀→게재: 뉴스 210→104→25, 오픈소스 14→14→2, 모델 6→6→1, 논문 33→33→2`,
 *     `Physical AI 후보→풀→게재: 41→22→3`
 */
export function poolMixNotes(
  candidates: Candidate[],
  pool: Candidate[],
  published?: Candidate[],
): string[] {
  const groups = published ? [candidates, pool, published] : [candidates, pool];
  const stages = published ? "후보→풀→게재" : "후보→풀";
  const formats = FORMATS.map(
    (f) => `${FORMAT_LABELS[f]} ${mixCounts(groups, (c) => c.format === f)}`,
  ).join(", ");
  return [
    `형식별 ${stages}: ${formats}`,
    `Physical AI ${stages}: ${mixCounts(groups, isPhysical)}`,
  ];
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 후보 1건 → 한 줄. `번호 | 형식 | 매체 | 게시일 | 화제 | 제목 | 발췌` (형식은 FORMAT_LABELS 표시명) */
export function triageLine(c: Candidate, index: number): string {
  const date = c.item.publishedAt.slice(5, 10);
  const snippet = oneLine(c.item.contentRaw ?? "", SNIPPET_CHARS);
  return [
    index,
    FORMAT_LABELS[c.format],
    c.sourceName,
    date,
    c.score > 0 ? `화제 ${c.score}` : "-",
    oneLine(c.item.title, TITLE_CHARS),
    snippet || "-",
  ].join(" | ");
}

/**
 * 선별(게재) 최소 할당 — 후보가 있을 때의 목표치(계획 4-1). 숫자의 단일 출처는 여기이고, 프롬프트에는
 * 그날 풀 구성에 맞춰 줄인 목표(pickTargets)를 유저 메시지로 넣는다. 강제로 채우지는 않고 미달이면 notes 에 경고한다.
 */
export const PICK_QUOTAS = {
  /** 비뉴스(오픈소스·모델·논문) 합계. */
  nonNews: 8,
  /** 비뉴스 각 형식. */
  perFormat: 1,
  /** Physical AI(로봇·물리 세계 주제 — 매체 무관). */
  physical: 3,
  /**
   * Physical AI 상한 = ceil(최대 선정 × 이 비율) — 35건이면 9건. 분야 6개를 고르게 나누면 약 6건인데,
   * Physical AI 는 할당까지 두는 중점 분야라 그 1.5배까지 허용한다. 4-3 검증에서 상한 없이 35건 중
   * 15건(논문 10건 중 8건이 로봇)이 Physical AI 로 쏠렸다.
   */
  physicalMaxShare: 1 / 4,
} as const;

/** 오늘 풀에 맞춘 할당 목표. 하한은 min(할당, 풀에 있는 후보 수, 최대 선정 수). */
export interface PickTargets {
  nonNews: number;
  formats: Record<NonNewsFormat, number>;
  physical: number;
  /** Physical AI 상한(하한보다 작지 않다). */
  physicalMax: number;
}

/**
 * 풀 구성 → 오늘 할당 목표. 후보가 할당보다 적으면 있는 만큼으로 줄여, LLM 이 "후보가 있을 때"를
 * 따로 판단하지 않게 하고 미달 경고도 같은 값으로 검사한다.
 * Physical AI 의 "있는 후보"는 Physical AI 소스(topic: physical) 수로 센다 — 일반 매체의 로봇 기사는
 * 선별 전에는 알 수 없어 하한으로만 쓴다(풀에는 보통 이 소스가 할당 이상 들어 있다).
 */
export function pickTargets(pool: Candidate[], maxPicks: number): PickTargets {
  const target = (quota: number, match: (c: Candidate) => boolean) =>
    Math.min(quota, pool.filter(match).length, maxPicks);
  const formats = Object.fromEntries(
    NON_NEWS_FORMATS.map((f) => [f, target(PICK_QUOTAS.perFormat, (c) => c.format === f)]),
  ) as Record<NonNewsFormat, number>;
  const physical = target(PICK_QUOTAS.physical, isPhysical);
  return {
    nonNews: target(PICK_QUOTAS.nonNews, (c) => c.format !== "news"),
    formats,
    physical,
    physicalMax: Math.max(physical, Math.ceil(maxPicks * PICK_QUOTAS.physicalMaxShare)),
  };
}

/** 할당 줄에 적을 비뉴스 형식별 목표. 예: `오픈소스 1건·모델 1건·논문 1건` (목표 0 인 형식은 뺀다) */
function formatTargets(targets: PickTargets): string {
  return NON_NEWS_FORMATS.filter((f) => targets.formats[f] > 0)
    .map((f) => `${FORMAT_LABELS[f]} ${targets.formats[f]}건`)
    .join("·");
}

/**
 * Physical AI 할당 문구. 예: `3건 이상 9건 이하`. 상한이 풀 크기 이상이면 의미가 없어 뺀다.
 * 하한·상한 모두 없으면 null.
 */
function physicalRange(targets: PickTargets, poolSize: number): string | null {
  const parts: string[] = [];
  if (targets.physical > 0) parts.push(`${targets.physical}건 이상`);
  if (targets.physicalMax < poolSize) parts.push(`${targets.physicalMax}건 이하`);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** 유저 메시지의 오늘 풀 구성·할당 블록. 목표가 0 인 항목(후보 없음)은 싣지 않는다. */
function quotaBlock(pool: Candidate[], targets: PickTargets): string {
  const composition = FORMATS.map(
    (f) => `${FORMAT_LABELS[f]} ${pool.filter((c) => c.format === f).length}건`,
  ).join(", ");
  const physicalSources = pool.filter(isPhysical).length;

  const rules: string[] = [];
  if (targets.nonNews > 0) {
    const each = formatTargets(targets);
    rules.push(
      `- 비뉴스(오픈소스·모델·논문) ${targets.nonNews}건 이상${each ? `, 그중 ${each} 이상` : ""}`,
    );
  }
  const physical = physicalRange(targets, pool.length);
  if (physical) rules.push(`- Physical AI ${physical}`);

  return [
    "## 오늘 후보 구성",
    `형식: ${composition} / Physical AI 전문 매체 ${physicalSources}건(일반 매체의 로봇 기사는 따로 셈하지 않음)`,
    "",
    "## 오늘 할당",
    rules.length > 0 ? rules.join("\n") : "- 오늘은 할당이 없습니다.",
  ].join("\n");
}

/** "이미 보도함" 한 줄의 재료 — 최근 호에 실린 기사. */
export interface ReportedHeadline {
  /** 호 날짜(KST 'YYYY-MM-DD'). */
  issueDate: string;
  /** 게재 제목(title_ko). */
  title: string;
  /** 게재 요약 첫 문장 — 재보도 검사만 쓴다(attachReportedSummaries). 선별은 토큰을 아끼려고 제목만 싣는다. */
  summary?: string;
}

/** "이미 보도함"에 넣을 최근 호 수(호당 약 30건 → 약 90줄). */
export const REPORTED_ISSUES = 3;

/**
 * 최근 `issues` 개 호의 게재 제목(공개 기사 = summary_ko IS NOT NULL). 호 날짜는 created_at(UTC)의
 * KST 날짜로, src/lib/db.ts(getEditionRefs)·baseline 과 같은 기준이다. 호 안에서는 중요도 순.
 * 읽기만 하므로 dry-run 의 readonly DB 에서도 돈다. 06:00 회차 기준으로는 오늘 호가 아직 없어 직전 3개 호가 된다.
 */
export function loadReportedHeadlines(
  db: DatabaseType,
  issues = REPORTED_ISSUES,
): ReportedHeadline[] {
  return db
    .prepare(
      `WITH recent AS (
         SELECT DISTINCT date(created_at, '+9 hours') AS d FROM articles
          WHERE summary_ko IS NOT NULL ORDER BY d DESC LIMIT ?
       )
       SELECT date(a.created_at, '+9 hours') AS issueDate, a.title_ko AS title FROM articles a
        WHERE a.summary_ko IS NOT NULL AND a.title_ko IS NOT NULL
          AND date(a.created_at, '+9 hours') IN (SELECT d FROM recent)
        ORDER BY issueDate DESC, a.importance DESC, a.id`,
    )
    .all(issues) as ReportedHeadline[];
}

/** 유저 메시지의 "이미 보도함" 블록. 한 줄 = `MM-DD 제목`. 없으면 빈 문자열. */
function reportedBlock(reported: ReportedHeadline[]): string {
  if (reported.length === 0) return "";
  const lines = reported.map((r) => `${r.issueDate.slice(5)} ${oneLine(r.title, TITLE_CHARS)}`);
  return [
    `## 이미 보도함 (최근 호 게재 제목 ${reported.length}건 — 같은 사건인 후보는 already_reported 에 적고 고르지 않음)`,
    ...lines,
  ].join("\n");
}

/**
 * 후보 줄 뒤에 붙이는 "출력 전 확인". 긴 후보 목록을 읽고 나면 앞쪽 할당·이미 보도함 지시가 흐려지므로
 * (4-3 검증: 이미 보도함 5건 재선정, 모델 0/1) 같은 pickTargets 로 몇 줄만 다시 짚는다.
 */
function checklistBlock(pool: Candidate[], targets: PickTargets, hasReported: boolean): string {
  const items: string[] = [];
  if (hasReported) {
    items.push(
      "already_reported: 이미 보도함과 같은 사건(새 전개 없음)인 후보 번호를 모두 적었다. 이 번호는 picks·duplicates 에 없다.",
    );
  }
  if (targets.nonNews > 0) {
    const each = formatTargets(targets);
    items.push(
      `할당: 비뉴스 ${targets.nonNews}건 이상${each ? ` — ${each} 이상(이 형식이 0건이면 안 됨)` : ""}.`,
    );
  }
  const physical = physicalRange(targets, pool.length);
  if (physical) items.push(`Physical AI(로봇·물리 세계가 주제, 매체 무관) ${physical}.`);
  if (targets.formats.paper > 0) {
    items.push("논문: 한 분야(예: 로봇)가 논문 선정의 절반을 넘지 않는다.");
  }
  if (targets.formats.model > 0) {
    items.push(
      "모델의 HuggingFace 페이지와 그 모델을 다룬 뉴스는 같은 사건이다 — 하나만 id, 나머지는 duplicates.",
    );
  }
  if (items.length === 0) return "";
  return ["## 출력 전 확인", ...items.map((t, i) => `${i + 1}. ${t}`)].join("\n");
}

export interface TriageRequestOptions {
  /** 최근 호에 이미 실린 제목 — 이틀에 걸친 같은 사건 중복을 막는다. */
  reported?: ReportedHeadline[];
}

/**
 * 선별 요청. 유저 메시지 = 지시 한 줄 → 오늘 풀 구성·할당 → 이미 보도함 → 후보 줄 → 출력 전 확인.
 * 할당 숫자는 코드(PICK_QUOTAS)에서 오늘 풀에 맞춰 넣으므로 프롬프트와 어긋나지 않는다.
 */
export function buildTriageRequest(
  pool: Candidate[],
  maxPicks: number,
  model: string,
  { reported = [] }: TriageRequestOptions = {},
): LlmRequest {
  const lines = pool.map(triageLine).join("\n");
  const targets = pickTargets(pool, maxPicks);
  const blocks = [
    `오늘 후보 ${pool.length}건 중 최대 ${maxPicks}건을 고르세요.`,
    quotaBlock(pool, targets),
    reportedBlock(reported),
    `## 오늘 후보\n${lines}`,
    checklistBlock(pool, targets, reported.length > 0),
  ].filter(Boolean);
  return {
    id: "triage",
    params: {
      model,
      // 선정 1건 ≈ 25토큰(OUTPUT_TOKENS_PER_PICK)이라 35건이어도 1,000토큰 안팎 — 넉넉히 잡는다.
      max_tokens: 1000 + maxPicks * 60,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: blocks.join("\n\n") }],
      output_config: { format: triageFormat },
    },
  };
}

/** 선별 요청의 비용 가드용 토큰 추정치(입력에는 구조화 출력 스키마 몫도 든다). */
export function estimateTriageTokens(req: LlmRequest, maxPicks: number) {
  const user = req.params.messages.map((m) => m.content).join("");
  return {
    input: approxTokens(SYSTEM_PROMPT + user) + outputFormatTokens(triageFormat),
    output: maxPicks * OUTPUT_TOKENS_PER_PICK,
  };
}

/**
 * resolvePicks 입력. already_reported 는 선택 — 개편 전 선별(triage-compare 의 옛 스키마)과
 * 이 필드가 생기기 전 스냅숏도 그대로 받는다.
 */
export interface TriageOutput {
  already_reported?: number[];
  picks: { id: number; importance: number; duplicates: number[] }[];
}

/** already_reported 중 풀 범위 안의 번호(중복 제거). */
export function alreadyReportedIds(triage: TriageOutput, poolSize: number): Set<number> {
  return new Set(
    (triage.already_reported ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < poolSize),
  );
}

/**
 * 모델 출력 → 검증된 선정 목록. 범위 밖·중복 번호는 버리고(한 후보는 한 번만 — 선정이든
 * 묶음이든), 중요도 높은 순으로 maxPicks 건까지만 남긴다.
 * already_reported 번호는 프롬프트 지시와 달리 선정·묶음에 들어 있어도 코드가 뺀다. 뺀 번호는 "쓴" 것으로 치지
 * 않으므로 그냥 미선정으로 남는다(→ seen_items). 그 번호를 대표로 고른 선정은 통째로 빠지고, 그 묶음 번호도 쓰지 않는다.
 */
export function resolvePicks(triage: TriageOutput, poolSize: number, maxPicks: number): Pick[] {
  const reported = alreadyReportedIds(triage, poolSize);
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < poolSize && !reported.has(i);
  const ordered = [...triage.picks].sort((a, b) => b.importance - a.importance);

  const used = new Set<number>();
  const picks: Pick[] = [];
  for (const p of ordered) {
    if (picks.length >= maxPicks) break;
    if (!valid(p.id) || used.has(p.id)) continue;
    used.add(p.id);
    const duplicates: number[] = [];
    for (const d of p.duplicates) {
      if (!valid(d) || used.has(d)) continue;
      used.add(d);
      duplicates.push(d);
    }
    picks.push({ index: p.id, importance: p.importance, duplicates });
  }
  return picks;
}

/**
 * notes 용 이미 보도함 제외 요약. 예: `이미 보도함 제외 4건(선정했다 뺀 1건)`. 0건이면 null.
 * kpi baseline 의 notes 파싱(`선정 N건`·`후보 N건 중`)과 겹치지 않는 문구다.
 */
export function alreadyReportedNote(triage: TriageOutput, poolSize: number): string | null {
  const reported = alreadyReportedIds(triage, poolSize);
  if (reported.size === 0) return null;
  const dropped = new Set(triage.picks.map((p) => p.id).filter((i) => reported.has(i))).size;
  return `이미 보도함 제외 ${reported.size}건${dropped > 0 ? `(선정했다 뺀 ${dropped}건)` : ""}`;
}

/** 할당 검사용 선정 1건 요약. */
export interface PickedMix {
  format: Format;
  /** Physical AI 여부 — 가공된 기사는 분야(category === "physical"), 미가공은 소스 topic 으로 판정한다. */
  physical: boolean;
}

/**
 * 할당 미달 경고(notes 용). 목표는 pickTargets 와 같은 값(풀에 후보가 있는 만큼)이라, 후보가 없어
 * 못 채운 항목은 경고하지 않는다. 다 채웠으면 null.
 * 예: `할당 미달: 비뉴스 5/8, 모델 0/1, Physical AI 2/3`
 */
export function quotaShortfallNote(picked: PickedMix[], targets: PickTargets): string | null {
  const short: string[] = [];
  const check = (label: string, got: number, target: number) => {
    if (got < target) short.push(`${label} ${got}/${target}`);
  };
  check("비뉴스", picked.filter((p) => p.format !== "news").length, targets.nonNews);
  for (const f of NON_NEWS_FORMATS) {
    check(FORMAT_LABELS[f], picked.filter((p) => p.format === f).length, targets.formats[f]);
  }
  check("Physical AI", picked.filter((p) => p.physical).length, targets.physical);
  return short.length > 0 ? `할당 미달: ${short.join(", ")}` : null;
}

/**
 * 할당 초과 경고(notes 용) — 지금은 Physical AI 상한뿐이다. 강제로 덜어 내지 않는다. 넘지 않았으면 null.
 * 예: `할당 초과: Physical AI 15/9`
 */
export function quotaOverflowNote(picked: PickedMix[], targets: PickTargets): string | null {
  const physical = picked.filter((p) => p.physical).length;
  return physical > targets.physicalMax
    ? `할당 초과: Physical AI ${physical}/${targets.physicalMax}`
    : null;
}

/** 논문 분야 쏠림 검사용 선정 1건 — category 는 가공 분야(미가공이면 없음). */
export interface PickedCategory {
  format: Format;
  category?: Category;
}

/** 쏠림 경고를 내는 논문 최소 건수 — 이보다 적으면 한 분야가 절반을 넘는 것이 자연스럽다. */
const PAPER_SPREAD_MIN = 4;

/**
 * 논문 분야 쏠림 경고(notes 용). 가공된 논문 선정이 PAPER_SPREAD_MIN 건 이상이고 한 분야가 그 절반을 넘으면 남긴다.
 * 선별 "출력 전 확인"의 "논문: 한 분야가 절반을 넘지 않는다"를 코드로 확인한다(4-3 검증: 논문 10건 중 로봇 8건).
 * 강제로 덜어 내지 않는다. 예: `논문 분야 쏠림: Physical AI 5/8`
 */
export function paperSpreadNote(picked: PickedCategory[]): string | null {
  const papers = picked.filter((p) => p.format === "paper" && p.category !== undefined);
  if (papers.length < PAPER_SPREAD_MIN) return null;
  const counts = new Map<Category, number>();
  for (const p of papers) counts.set(p.category!, (counts.get(p.category!) ?? 0) + 1);
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return n * 2 > papers.length
    ? `논문 분야 쏠림: ${CATEGORY_LABELS[top]} ${n}/${papers.length}`
    : null;
}
