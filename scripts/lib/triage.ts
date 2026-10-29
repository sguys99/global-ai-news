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
import { FORMAT_LABELS, FORMATS, type Category, type Format } from "../../src/lib/labels";
import { PROMPTS_DIR } from "../../src/lib/paths";
import type { RawItem } from "../../src/lib/types";
import { approxTokens } from "./cost";
import type { LlmRequest } from "./llm";
import { triageSchema, type Triage } from "./schema";

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
  const nonNews = FORMATS.filter((f) => f !== "news").map((f) =>
    roundRobin(queues.filter((q) => q[0].format === f)),
  );
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

/** 후보 1건 → 한 줄. `번호 | 매체 | 게시일 | 화제 | 제목 | 발췌` */
export function triageLine(c: Candidate, index: number): string {
  const date = c.item.publishedAt.slice(5, 10);
  const snippet = oneLine(c.item.contentRaw ?? "", SNIPPET_CHARS);
  return [
    index,
    c.sourceName,
    date,
    c.score > 0 ? `화제 ${c.score}` : "-",
    oneLine(c.item.title, TITLE_CHARS),
    snippet || "-",
  ].join(" | ");
}

export function buildTriageRequest(pool: Candidate[], maxPicks: number, model: string): LlmRequest {
  const lines = pool.map(triageLine).join("\n");
  return {
    id: "triage",
    params: {
      model,
      max_tokens: 1000 + maxPicks * 60,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `오늘 후보 ${pool.length}건 중 최대 ${maxPicks}건을 고르세요.\n\n${lines}`,
        },
      ],
      output_config: { format: triageFormat },
    },
  };
}

/** 선별 요청의 비용 가드용 토큰 추정치. */
export function estimateTriageTokens(req: LlmRequest, maxPicks: number) {
  const user = req.params.messages.map((m) => m.content).join("");
  return {
    input: approxTokens(SYSTEM_PROMPT + user),
    output: maxPicks * OUTPUT_TOKENS_PER_PICK,
  };
}

/**
 * 모델 출력 → 검증된 선정 목록. 범위 밖·중복 번호는 버리고(한 후보는 한 번만 — 선정이든
 * 묶음이든), 중요도 높은 순으로 maxPicks 건까지만 남긴다.
 */
export function resolvePicks(triage: Triage, poolSize: number, maxPicks: number): Pick[] {
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < poolSize;
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
