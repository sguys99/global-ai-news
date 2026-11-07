/**
 * LLM 가공(③단계). 선별(triage)을 통과한 기사만 한국어 제목·요약·카테고리·태그와 영어판 제목·요약(title_en·summary_en,
 * 영어판 Phase 1-2)을 만든다.
 *
 * 기사 CHUNK_SIZE 건을 한 요청에 묶는다. 기사 1건당 1호출이면 시스템 프롬프트(+few-shot·영어 규칙,
 * count_tokens 약 7.0k토큰)와 출력 스키마를 매번 다시 보내 입력의 대부분이 반복 지시문이 된다.
 * 영어 용어집은 시스템 프롬프트에 통째로 넣지 않고 묶음 입력에 나온 항목만 유저 메시지 끝 `[용어집]` 블록으로 붙인다
 * (lib/glossary.ts — 통째면 약 +3.2k토큰 × 4호출).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIES, FORMAT_LABELS, type Category, type Format } from "../../src/lib/labels";
import { PROMPTS_DIR } from "../../src/lib/paths";
import type { RawItem } from "../../src/lib/types";
import { approxTokens, outputFormatTokens } from "./cost";
import {
  checkEnglish,
  checkKoreanNumbers,
  englishCheckNotes,
  tallyEnglishChecks,
  type EnglishCheckResult,
  type EnglishCheckTally,
  type EnglishRejection,
} from "./englishCheck";
import { glossaryBlock, glossaryTables, readGlossary, selectGlossary } from "./glossary";
import type { LlmRequest } from "./llm";
import {
  enrichBatchParseSchema,
  enrichBatchSchema,
  type ArticleEnrichment,
  type RawArticleEnrichment,
  type RawEnrichBatch,
} from "./schema";
import { normalizeTags } from "./tags";

/** 한 요청에 묶는 기사 수. 한 요청이 실패해도 잃는 기사가 이 수를 넘지 않는다. */
export const CHUNK_SIZE = 10;
/** 기사 1건 본문 입력 상한(글자). 영어 숫자 검사의 근거도 이만큼 자른 발췌다(enrichEvidence). */
export const MAX_INPUT_CHARS = 2000;
/**
 * 기사 1건당 출력 토큰 상한(한국어 요약 2~3줄 + 영어 제목·요약 + JSON). 한국어만일 때 실측 평균 약 180토큰
 * (0-1), 영어가 약 +90토큰(0-3) → 약 270. 묶음 상한은 200 + 건수 × 이것(10건 5,700) — 넘으면 stop_reason
 * max_tokens 로 묶음 10건이 통째로 버려지므로 평균의 2배 넘게 둔다.
 */
const MAX_OUTPUT_TOKENS_PER_ARTICLE = 550;
/** 기사 1건당 출력 토큰 근사치(비용 가드 추정용). 실측 예상 약 270에 약 20% 여유. */
const EST_OUTPUT_TOKENS_PER_ARTICLE = 320;

/**
 * 가공 구조화 출력 형식. 모델에 보내는 JSON 스키마는 엄격한 계약(enrichBatchSchema — 설명 문구에 `{maxLength: 60}`·
 * `{maxItems: 5}`·분야 enum)이고, 파싱은 형태만 보는 enrichBatchParseSchema 로 한다 — 기사 1건의 제약 위반이 묶음
 * 10건을 버리지 않게. 제약은 resolveEnrichments → guardEnrichment 가 기사별로 적용한다.
 */
export const enrichFormat = {
  ...zodOutputFormat(enrichBatchSchema),
  parse: zodOutputFormat(enrichBatchParseSchema).parse,
};

/** 한국어 제목 길이 계약(프롬프트·스키마 설명의 60자). 이 이하는 그대로 게재한다. */
export const TITLE_KO_LIMIT = 60;
/**
 * 한국어 제목 허용 상한. 61~80자는 게재하고 notes 에 남긴다(목록·지면 제목은 line-clamp·말줄임, og 썸네일은 3줄 말줄임이라
 * 조금 긴 제목도 깨지지 않는다). 이를 넘으면 제목이 아니라 문장을 쓴 출력으로 보고 그 기사만 미가공(7일 재심사)으로 돌린다 —
 * 한국어 헤드라인을 낱말 중간에서 자르지 않는다. 게재 1,255건(2026-11-04) 최장 60자·99% 54자, 60자 근접(58자 이상)은 1건.
 */
export const TITLE_KO_HARD_LIMIT = 80;
/** 태그 개수 계약(스키마 설명의 maxItems 5). 넘으면 정규화·중복 제거 뒤 앞 5개만 쓴다(tags.ts saveTags 와 같은 결과). */
export const TAGS_LIMIT = 5;

/** guardEnrichment 결과: 통과(필요하면 고친 값) 또는 그 기사만 미가공으로 돌리는 사유. */
export type EnrichGuardResult =
  | { ok: true; enrichment: ArticleEnrichment; titleOver: boolean; tagsTrimmed: boolean }
  | { ok: false; reason: "title" | "category" };

/**
 * 가공 결과 1건의 기사별 확인 — 스키마가 묶음 단위로 막던 제약의 단일 자리. 정상 출력(제목 60자 이하·분야 6키·태그 5개
 * 이하)은 값을 바꾸지 않고 그대로 통과한다.
 * - 제목: 60자 이하 그대로, 61~80자 게재(titleOver), 80자 초과 기각(reason title).
 * - 분야: 6개 키 중 하나여야 한다. 대소문자·앞뒤 공백만 맞춰 주고, 그 밖의 값은 기각(reason category).
 * - 태그: 5개를 넘으면 정규화 뒤 앞 5개(tagsTrimmed). 0개는 그대로(저장 시 태그 없음).
 */
export function guardEnrichment(raw: RawArticleEnrichment): EnrichGuardResult {
  if (raw.title_ko.length > TITLE_KO_HARD_LIMIT) return { ok: false, reason: "title" };
  const category = toCategory(raw.category);
  if (!category) return { ok: false, reason: "category" };
  const tagsTrimmed = raw.tags.length > TAGS_LIMIT;
  return {
    ok: true,
    enrichment: {
      ...raw,
      category,
      tags: tagsTrimmed ? normalizeTags(raw.tags, TAGS_LIMIT) : raw.tags,
    },
    titleOver: raw.title_ko.length > TITLE_KO_LIMIT,
    tagsTrimmed,
  };
}

function toCategory(value: string): Category | null {
  if ((CATEGORIES as readonly string[]).includes(value)) return value as Category;
  const folded = value.trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(folded) ? (folded as Category) : null;
}

/** 회차 전체(묶음 여러 개)의 기사별 확인 집계 — enrichGuardNotes 재료. */
export interface EnrichGuardTally {
  /** 61~80자로 게재한 제목 수와 그중 최장 길이. */
  titleOver: number;
  titleOverMax: number;
  /** 80자를 넘어 미가공으로 돌린 기사 수. */
  titleRejected: number;
  /** 분야 값이 6개 키가 아니어서 미가공으로 돌린 기사 수. */
  categoryRejected: number;
  /** 태그를 5개로 줄인 기사 수. */
  tagsTrimmed: number;
}

export const emptyEnrichGuardTally = (): EnrichGuardTally => ({
  titleOver: 0,
  titleOverMax: 0,
  titleRejected: 0,
  categoryRejected: 0,
  tagsTrimmed: 0,
});

/**
 * collection_runs.notes 줄(없으면 빈 배열, 항목 안에 `;` 없음). 기각된 기사는 `가공 실패·보류 N건`에도 함께 센다
 * (collect.ts — 선정 수 - 가공 수).
 */
export function enrichGuardNotes(t: EnrichGuardTally): string[] {
  const notes: string[] = [];
  if (t.titleRejected > 0) {
    notes.push(`한국어 제목 길이 초과 ${t.titleRejected}건(${TITLE_KO_HARD_LIMIT}자 초과, 재시도)`);
  }
  if (t.categoryRejected > 0) notes.push(`분야 값 오류 ${t.categoryRejected}건(재시도)`);
  if (t.titleOver > 0) {
    notes.push(
      `한국어 제목 ${TITLE_KO_LIMIT}자 초과 ${t.titleOver}건(게재, 최장 ${t.titleOverMax}자)`,
    );
  }
  if (t.tagsTrimmed > 0)
    notes.push(`태그 ${TAGS_LIMIT}개 초과 ${t.tagsTrimmed}건(앞 ${TAGS_LIMIT}개만)`);
  return notes;
}

/**
 * 본문 끝의 GitHub 토픽(`설명 · topics: a, b, c` — collect/api.ts githubSummary). 토픽은 소문자·숫자·하이픈 슬러그를
 * 쉼표로 이은 것이라 그 모양일 때만 떼어 낸다(설명 안의 "topics:" 같은 문구는 건드리지 않는다).
 */
const TRAILING_TOPICS =
  /(?:^|\s*·\s*)topics:\s*([a-z0-9][a-z0-9-]*(?:,\s*[a-z0-9][a-z0-9-]*)*)\s*$/;

export interface FewShotExample {
  input: { format: Format; source: string; title: string; content: string };
  output: ArticleEnrichment;
}

/** 시스템 프롬프트에서 분야 정의(categories.md)가 들어갈 자리. */
const CATEGORIES_PLACEHOLDER = "{{CATEGORIES}}";
/** 시스템 프롬프트에서 영어 작성 규칙(english.md + 용어집 고정 표)이 들어갈 자리. */
const ENGLISH_PLACEHOLDER = "{{ENGLISH}}";

/**
 * 분야 정의 블록(6개 키·포함 범위·경계 규칙). 가공과 재분류(scripts/reclassify.ts)가 같은 기준으로
 * 분류하도록 configs/prompts/categories.md 한 파일에서 읽는다.
 */
export function readCategoryGuide(): string {
  return readFileSync(path.join(PROMPTS_DIR, "categories.md"), "utf-8").trim();
}

/**
 * 영어 작성 규칙 블록: configs/prompts/english.md + 용어집의 고정 표(성씨·계급 — 키로 고르지 않고 늘 싣는다).
 * 용어집의 나머지 항목은 묶음마다 걸러 유저 메시지 `[용어집]` 블록으로 간다(english.md "Names" 줄이 그 자리를 가리킨다).
 * 가공과 영어 백필(Phase 2)이 같은 규칙으로 쓰도록 한 곳에서 조립한다.
 */
export function readEnglishGuide(): string {
  const rules = readFileSync(path.join(PROMPTS_DIR, "english.md"), "utf-8").trim();
  const tables = glossaryTables(GLOSSARY);
  return tables ? `${rules}\n\n### Name tables\n\n${tables}` : rules;
}

/** 프롬프트 파일은 모듈 로드 시 1회만 읽는다. */
const GLOSSARY = readGlossary();
const SYSTEM_PROMPT = buildSystemPrompt();

function buildSystemPrompt(): string {
  const system = readFileSync(path.join(PROMPTS_DIR, "enrich.system.md"), "utf-8")
    // 치환 함수로 넣는다 — 문자열 치환은 `$&`·`$'` 같은 패턴을 해석하는데 영어 규칙에는 `$` 금액이 많다.
    .replace(CATEGORIES_PLACEHOLDER, () => readCategoryGuide())
    .replace(ENGLISH_PLACEHOLDER, () => readEnglishGuide());
  const examples = readFewShot()
    .map((ex, i) => {
      const input = articleFields(
        ex.input.format,
        ex.input.source,
        ex.input.title,
        ex.input.content,
      );
      return `### 예시 ${i + 1}\n입력:\n${input}\n출력:\n${JSON.stringify(ex.output)}`;
    })
    .join("\n\n");

  return `${system}\n\n## 예시 (기사 1건 기준)\n\n${examples}`;
}

/** few-shot 예시(형식별 요약 가이드의 본보기). 시스템 프롬프트 조립과 테스트가 같이 쓴다. */
export function readFewShot(): FewShotExample[] {
  return JSON.parse(
    readFileSync(path.join(PROMPTS_DIR, "enrich.fewshot.json"), "utf-8"),
  ) as FewShotExample[];
}

/** 본문 → 설명과 토픽. 토픽이 없으면 topics 는 null. */
export function splitTopics(content: string): { body: string; topics: string | null } {
  const m = TRAILING_TOPICS.exec(content);
  if (!m) return { body: content, topics: null };
  return { body: content.slice(0, m.index).trim(), topics: m[1].split(/,\s*/).join(", ") };
}

/**
 * 기사 1건의 입력 필드. 실제 입력과 few-shot 이 같은 모양이어야 하므로 한 곳에서 만든다.
 * [형식]은 형식별 요약 가이드를 고르는 단서다 — 분야(category)는 형식이 아니라 주제로 정한다.
 * 저장소 토픽은 [본문]에서 떼어 [토픽] 줄로 둔다. 본문에 섞여 있으면 모델이 토픽(mcp·computer-use 등)을 기능·연동의
 * 근거로 읽어 "~를 지원한다"고 지어냈다(4-3 검증) — 따로 두고 분류·태그용이라고 못 박는다.
 */
export function articleFields(
  format: Format,
  source: string,
  title: string,
  content: string,
): string {
  const { body, topics } = splitTopics(content);
  const topicLine = topics ? `\n[토픽] ${topics} (분류·태그용 키워드 — 기능·지원 근거 아님)` : "";
  return (
    `[형식] ${FORMAT_LABELS[format]}\n[출처] ${source}\n[제목] ${title}${topicLine}\n` +
    `[본문]\n${body || "(본문 없음)"}`
  );
}

/** 가공할 기사 1건. id 는 요청 안에서 결과를 매칭하는 번호(후보 풀 번호). */
export interface EnrichInput {
  id: number;
  item: RawItem;
  sourceName: string;
  /** 소스 형식(sources.json `format`). 형식별 요약 가이드 선택용. */
  format: Format;
}

/** 모델에 주는 본문 발췌: 원문 본문을 MAX_INPUT_CHARS 로 자른 것(토픽 꼬리 포함 — [토픽] 줄로 나뉘어 실린다). */
export function inputExcerpt(item: RawItem): string {
  return (item.contentRaw ?? "").slice(0, MAX_INPUT_CHARS);
}

/**
 * 영어 숫자 검사(Phase 1-3 englishCheck `ArticleEvidence`)의 근거: 원문 제목 + 모델에 준 발췌 그대로.
 * 한국어 요약은 넣지 않는다 — 같은 호출의 출력이라 같은 단위 오류를 공유한다(0-3).
 */
export function enrichEvidence(item: RawItem): { title: string; content: string } {
  return { title: item.title, content: inputExcerpt(item) };
}

function articleBlock({ id, item, sourceName, format }: EnrichInput): string {
  const content = inputExcerpt(item);
  return `### id=${id}\n${articleFields(format, sourceName, item.title, content || "(본문 없음)")}`;
}

/** 가공 요청 1건과 그 요청에 실린 기사 id. */
export interface EnrichChunk {
  request: LlmRequest;
  ids: number[];
  /** 유저 메시지 `[용어집]` 블록에 실린 항목 수(0 이면 블록 없음). */
  glossaryEntries: number;
}

/** 선정 기사 → CHUNK_SIZE 건씩 묶은 요청들. 입력 순서(중요도 순)를 유지한다. */
export function buildEnrichRequests(inputs: EnrichInput[], model: string): EnrichChunk[] {
  const chunks: EnrichChunk[] = [];
  for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
    const chunk = inputs.slice(i, i + CHUNK_SIZE);
    const blocks = chunk.map(articleBlock).join("\n\n");
    // 용어집은 이 묶음 입력(원문 제목·발췌)에 키가 나온 항목만 — 출처 줄의 매체명은 대조에서 뺀다.
    const glossary = selectGlossary(
      GLOSSARY,
      chunk.map((c) => `${c.item.title}\n${inputExcerpt(c.item)}`).join("\n"),
    );
    const block = glossaryBlock(glossary);
    const request: LlmRequest = {
      id: `enrich-${i / CHUNK_SIZE}`,
      params: {
        model,
        max_tokens: 200 + chunk.length * MAX_OUTPUT_TOKENS_PER_ARTICLE,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              `기사 ${chunk.length}건을 각각 가공하세요. articles 배열에 기사마다 하나씩, 입력의 id 를 그대로 담으세요.\n\n` +
              blocks +
              // 기사 블록과 같은 `###` 머리로 따로 세운다 — 마지막 기사의 [본문]에 이어 읽히지 않게.
              (block ? `\n\n### ${block}` : ""),
          },
        ],
        output_config: { format: enrichFormat },
      },
    };
    chunks.push({ request, ids: chunk.map((c) => c.id), glossaryEntries: glossary.length });
  }
  return chunks;
}

/** 가공 요청 1건의 비용 가드용 토큰 추정치(입력에는 구조화 출력 스키마 몫도 든다). */
export function estimateEnrichTokens({ request, ids }: EnrichChunk) {
  const user = request.params.messages.map((m) => m.content).join("");
  return {
    input: approxTokens(SYSTEM_PROMPT + user) + outputFormatTokens(enrichFormat),
    output: ids.length * EST_OUTPUT_TOKENS_PER_ARTICLE,
  };
}

/**
 * 모델 출력(묶음 1개) → id 별 가공 결과. 요청에 없던 id 는 버리고, id 당 첫 결과만 guardEnrichment 로 확인한다 —
 * 기각된 기사는 결과에 없다(미가공 저장 → 다음 실행에서 재심사). tally 를 넘기면 묶음마다 누적한다.
 */
export function resolveEnrichments(
  batch: RawEnrichBatch,
  requestedIds: Iterable<number>,
  tally: EnrichGuardTally = emptyEnrichGuardTally(),
): Map<number, ArticleEnrichment> {
  const wanted = new Set(requestedIds);
  const seen = new Set<number>();
  const out = new Map<number, ArticleEnrichment>();
  for (const { id, ...raw } of batch.articles) {
    if (!wanted.has(id) || seen.has(id)) continue;
    seen.add(id);
    const result = guardEnrichment(raw);
    if (!result.ok) {
      if (result.reason === "title") tally.titleRejected += 1;
      else tally.categoryRejected += 1;
      continue;
    }
    if (result.titleOver) {
      tally.titleOver += 1;
      tally.titleOverMax = Math.max(tally.titleOverMax, result.enrichment.title_ko.length);
    }
    if (result.tagsTrimmed) tally.tagsTrimmed += 1;
    out.set(id, result.enrichment);
  }
  return out;
}

/** 저장할 영어 필드(articles.title_en·summary_en). null = 영어 없음 — 한국어 게재에는 영향이 없다. */
export interface EnglishFields {
  titleEn: string | null;
  summaryEn: string | null;
}

/** resolveEnglish 입력 1건: 게재되는 가공 기사와 그 영어의 근거. */
export interface EnglishCandidate {
  /** 풀 번호(Pick.index). */
  id: number;
  enrichment: ArticleEnrichment;
  /** 원문 제목 + 모델에 준 발췌(enrichEvidence). 영어 숫자 검사의 근거. */
  evidence: { title: string; content: string };
}

/** 기사 1건의 검사 결과(no-save 스냅숏·콘솔용). */
export interface EnglishArticleCheck {
  /** 영어 품질 검사(한글 → 길이 → 숫자). 기각이면 그 기사의 영어는 null 로 저장된다. */
  english: EnglishCheckResult;
  /** 한국어 title_ko·summary_ko 에서 근거에 없는 숫자·금액(경고 전용, 빈 배열 = 경고 없음). */
  koreanNumbers: string[];
}

/** resolveEnglish 결과. */
export interface EnglishResolution {
  /** 풀 번호 → 저장할 영어 필드. 입력한 기사마다 하나씩 있다(기각·검사 실패면 둘 다 null). */
  fields: Map<number, EnglishFields>;
  /** 풀 번호 → 기사별 검사 결과. 검사가 실패한 회차(status failed)면 비어 있다. */
  checks: Map<number, EnglishArticleCheck>;
  /** 회차 집계(notes 재료). 검사가 실패한 회차면 null. */
  tally: EnglishCheckTally | null;
  /**
   * 기각된 기사(입력 순서) — 사유·근거와 기각돼 저장하지 않는 영어 원출력. collect.ts 가 저장 뒤 articles.id 로
   * 기각 상세 notes 줄·로그 줄을 만든다(englishRejectNote·englishRejectLogLine). 검사가 실패한 회차면 비어 있다.
   */
  rejected: EnglishRejection[];
  /** status ok 면 영어 검사가 끝난 것, failed 면 예외로 전부 영어 없이 저장한다(한국어 게재는 그대로). */
  status: "ok" | "failed";
  /**
   * collection_runs.notes 에 넣을 줄(`영어 가공 N/M건`·`영어 기각 K건(…)`·`한국어 숫자 불일치 N건(…)` /
   * `영어 검사 실패(영어 비움): …`·`한국어 숫자 검사 실패: …`). notes 구분자 `;`는 들지 않는다.
   */
  notes: string[];
}

/** notes 한 줄에 싣는 예외 메시지 — notes 구분자 `;`·줄바꿈을 지우고 길이를 묶는다. */
function noteMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/[;\s]+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * 게재되는 가공 기사 → 저장할 영어 필드(풀 번호별) + 검사 결과. 저장(collect.ts persist)과 no-save 스냅숏은 이 결과의
 * fields 만 읽는다 — 영어 품질 검사(Phase 1-3, lib/englishCheck.ts)의 단일 자리다.
 *
 * - 영어: 기사마다 evidence(원문 제목 + 모델에 준 발췌)로 checkEnglish 를 돌려, 기각하면 그 기사의 영어만 null 로 둔다
 *   (fail-closed — 제목·요약을 한 쌍으로 다룬다. 빈 필드는 길이 기각). 통과하면 앞뒤 공백만 다듬어 저장한다.
 * - 한국어: 같은 근거로 checkKoreanNumbers 를 돌려 notes 에 경고만 남긴다(게재·저장값은 바꾸지 않는다).
 * - 실패: 이 함수는 throw 하지 않는다. 영어 검사가 예외를 내면 전부 영어 없이(null) 두고 `영어 검사 실패(영어 비움): …`
 *   를 notes 에 남긴다 — 한국어 게재는 그대로다. 한국어 숫자 검사의 예외는 영어에 영향을 주지 않는다(경고 생략).
 *
 * M(검사한 기사 수)은 입력 건수다 — collect.ts 는 같은 사건 합치기 뒤 최종 게재분(가공을 마친 선정, 재심사 행 포함,
 * 재보도·합쳐진 기사 제외)만 넘긴다.
 */
export function resolveEnglish(candidates: Iterable<EnglishCandidate>): EnglishResolution {
  const list = [...candidates];
  const empty = (): EnglishFields => ({ titleEn: null, summaryEn: null });
  const fields = new Map<number, EnglishFields>(list.map((c) => [c.id, empty()]));
  const checks = new Map<number, EnglishArticleCheck>();
  try {
    const english = new Map<number, EnglishCheckResult>();
    const rejected: EnglishRejection[] = [];
    for (const { id, enrichment, evidence } of list) {
      const output = { titleEn: enrichment.title_en, summaryEn: enrichment.summary_en };
      const result = checkEnglish(output, evidence);
      english.set(id, result);
      if (result.ok) {
        fields.set(id, {
          titleEn: enrichment.title_en.trim(),
          summaryEn: enrichment.summary_en.trim(),
        });
      } else {
        rejected.push({
          id,
          reason: result.reason,
          detail: result.detail,
          titleEn: enrichment.title_en ?? "",
          summaryEn: enrichment.summary_en ?? "",
        });
      }
    }
    const notes: string[] = [];
    const korean = new Map<number, string[]>();
    try {
      for (const { id, enrichment: e, evidence } of list) {
        korean.set(
          id,
          checkKoreanNumbers({ titleKo: e.title_ko, summaryKo: e.summary_ko }, evidence),
        );
      }
    } catch (err) {
      korean.clear();
      notes.push(`한국어 숫자 검사 실패: ${noteMessage(err)}`);
    }
    for (const [id, result] of english) {
      checks.set(id, { english: result, koreanNumbers: korean.get(id) ?? [] });
    }
    const tally = tallyEnglishChecks([...english.values()], [...korean.values()]);
    return {
      fields,
      checks,
      tally,
      rejected,
      status: "ok",
      notes: [...englishCheckNotes(tally), ...notes],
    };
  } catch (err) {
    for (const c of list) fields.set(c.id, empty());
    return {
      fields,
      checks: new Map(),
      tally: null,
      rejected: [],
      status: "failed",
      notes: [`영어 검사 실패(영어 비움): ${noteMessage(err)}`],
    };
  }
}
