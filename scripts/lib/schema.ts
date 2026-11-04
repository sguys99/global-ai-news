// SDK 의 zodOutputFormat 헬퍼가 zod v4 스키마를 받는다(zod 3.25+ 의 "zod/v4" 서브패스).
import { z } from "zod/v4";
import { CATEGORIES } from "../../src/lib/labels";

/**
 * 기사 분야(카테고리) 6종 키. articles.category 및 LLM 가공 출력 enum 으로 사용.
 * 키·순서·표시명·구 값 호환 맵의 단일 출처는 src/lib/labels.ts — 웹 레이어와 공유하려고 거기 두고 여기서 다시 내보낸다.
 */
export { CATEGORIES, LEGACY_CATEGORY_MAP, type Category } from "../../src/lib/labels";

/**
 * 기사 1건의 가공 결과(한국어 + 영어판 title_en·summary_en). 중요도는 선별 단계(triage)가 그날 후보 전체를 비교해
 * 상대 평가하므로 여기에는 없다.
 *
 * 영어 필드는 한국어 필드 뒤에 둔다 — 구조화 출력은 속성 순서대로 생성되므로 한국어 가공은 영어 필드가 생기기 전과
 * 같은 흐름으로 나오고, 영어는 english.md 규칙대로 원문에서 쓴다. 영어 필드에는 길이·한글 제약을 스키마로 걸지 않는다:
 * zod 검증이 실패하면 그 묶음(10건)의 한국어 가공까지 통째로 버려진다(parseStructured → null). 영어 길이·한글·숫자는
 * 코드 검사(Phase 1-3 englishCheck)가 기사별로 확인해 영어만 비운다(fail-closed, 한국어 게재 무영향).
 * 필드 자체는 필수다 — 구조화 출력이 늘 채우게 하고, 빈 문자열은 저장 단계에서 "영어 없음"으로 다룬다.
 */
export const articleEnrichmentSchema = z.object({
  title_ko: z.string().max(60).describe("한국어 제목 (간결, 낚시성 금지)"),
  summary_ko: z.string().describe("한국어 요약 2~3줄, 핵심 사실 중심"),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string()).min(1).max(5).describe("소문자 영문 또는 한글 키워드"),
  title_en: z
    .string()
    .describe("English headline from the original, sentence case, at most 100 characters"),
  summary_en: z
    .string()
    .describe("English summary from the original, 2-3 sentences (40-60 words), no Hangul"),
});

export type ArticleEnrichment = z.infer<typeof articleEnrichmentSchema>;

/**
 * 가공 1회 호출(기사 여러 건) 출력. id 는 요청에 실린 기사 번호.
 * 모델에 보이는 계약(제목 60자·태그 1~5개·분야 6키)이다 — 파싱에는 쓰지 않는다(아래 enrichBatchParseSchema).
 */
export const enrichBatchSchema = z.object({
  articles: z.array(articleEnrichmentSchema.extend({ id: z.number().int() })),
});

export type EnrichBatch = z.infer<typeof enrichBatchSchema>;

/**
 * 가공 출력의 파싱 스키마 — 형태(필드·타입·필수)만 본다. 모델에 보내는 JSON 스키마는 위 enrichBatchSchema 그대로다
 * (enrich.ts enrichFormat). SDK 변환은 문자열 길이(`maxLength`)·배열 상한(`maxItems`)·`enum` 을 제약 디코딩에 넣지 않고
 * 설명 문구(`{maxLength: 60}` 등)로만 옮긴 뒤 zod 로 검증하므로, 엄격한 스키마로 파싱하면 기사 1건의 61자 제목·잘못된
 * 분야 값이 그 묶음 10건을 통째로 버린다(parseStructured → null). 그래서 파싱은 느슨하게 하고, 제목 길이·분야·태그 수는
 * enrich.ts guardEnrichment 가 기사별로 확인해 그 기사만 미가공으로 돌리거나 고친다.
 */
export const enrichBatchParseSchema = z.object({
  articles: z.array(
    z.object({
      id: z.number().int(),
      title_ko: z.string(),
      summary_ko: z.string(),
      category: z.string(),
      tags: z.array(z.string()),
      title_en: z.string(),
      summary_en: z.string(),
    }),
  ),
});

export type RawEnrichBatch = z.infer<typeof enrichBatchParseSchema>;
export type RawArticleEnrichment = Omit<RawEnrichBatch["articles"][number], "id">;

/**
 * 세 줄 요약(brief)의 한 줄: 요약하는 선정의 후보 번호(id)와 한국어 한 줄(text).
 * 길이·한글 여부·말미 마침표는 스키마로 묶지 않는다 — zod 검증이 실패하면 선별 출력 전체가 버려져 회차가
 * 실패하므로, 거르는 일은 코드(scripts/lib/brief.ts cleanBriefText)가 줄 단위로 한다(fail-open).
 */
const briefLineSchema = z.object({
  id: z.number().int(),
  text: z.string().describe("한국어 한 줄, 40자 안팎, 마침표 없음"),
});

/**
 * 선별(triage) 출력. 모든 번호는 후보 목록의 번호.
 * already_reported 는 "이미 보도함"과 같은 사건(새 전개 없음)인 후보 — picks 보다 앞에 두어 구조화 출력이
 * 먼저 채우게 한다(고르기 전에 걸러 내는 단계). 코드(resolvePicks)가 이 번호를 선정·묶음에서 뺀다.
 * picks 는 중요도 내림차순, duplicates 는 같은 사건을 다룬 다른 후보.
 * brief 는 picks 뒤 — 고른 다음에 그 선정 중에서 이번 호 핵심을 한 줄씩 쓴다(Phase 8 세 줄 요약).
 */
export const triageSchema = z.object({
  already_reported: z
    .array(z.number().int())
    .describe(
      "이미 보도함과 같은 사건이고 새로운 전개가 없는 후보 번호. 이 번호는 picks·duplicates 에 넣지 않는다.",
    ),
  picks: z.array(
    z.object({
      id: z.number().int(),
      importance: z.number().int().min(1).max(5),
      duplicates: z.array(z.number().int()),
    }),
  ),
  brief: z
    .array(briefLineSchema)
    .describe(
      "이번 호 핵심을 중요한 순서로 5줄. id 는 그 줄이 요약하는 picks 의 id, 서로 다른 사건, text 는 한국어 한 줄.",
    ),
});

export type Triage = z.infer<typeof triageSchema>;

/**
 * 선별 출력의 파싱 스키마 — 형태(필드·타입·필수)만 본다. 모델에 보내는 JSON 스키마는 위 triageSchema 그대로다
 * (triage.ts triageFormat). SDK 변환은 정수 범위(중요도 `{minimum: 1, maximum: 5}`, 번호의 안전 정수 범위)를 설명
 * 문구로만 옮기고 zod 로 검증하므로, 엄격한 스키마로 파싱하면 중요도 하나가 0·6이어도 선별 출력 전체가 버려져
 * 회차가 실패한다(parseStructured → null). 그래서 숫자는 number 로만 받고, 중요도 보정·번호 검증은 triage.ts
 * resolvePicks(+ triageCorrectionNote)가 값 하나씩 한다.
 */
export const triageParseSchema = z.object({
  already_reported: z.array(z.number()),
  picks: z.array(
    z.object({
      id: z.number(),
      importance: z.number(),
      duplicates: z.array(z.number()),
    }),
  ),
  brief: z.array(z.object({ id: z.number(), text: z.string() })),
});

export type RawTriage = z.infer<typeof triageParseSchema>;

/**
 * 재보도 검사의 짝 1건: 오늘 기사 번호(id), 이미 보도함 번호(reported — R 없이 정수), 두 기사의 공통 사건(event).
 * event 는 판정 근거를 한 구절로 적게 해 주제만 비슷한 기사를 짝짓지 않게 한다(4-3 검증: 없을 때 오탐 3/6). 코드는 출력·기록에만 쓴다.
 */
const repeatPairSchema = z.object({
  id: z.number().int(),
  reported: z.number().int(),
  event: z.string().describe("두 기사가 함께 다루는 사건: 주체 + 대상·행위, 20자 안팎"),
});

/**
 * 재보도 검사(repeatCheck.ts) 출력. 가공을 마친 오늘 기사를 최근 호 게재 제목과 한국어끼리 대조한다.
 * repeats = 같은 사건이고 새 전개가 없음(게재 제외), followups = 같은 사건이지만 새 사실이 있는 후속 보도(그대로 게재).
 * followups 는 "같은 사건이면 다 빼라"로 기울지 않게 판정을 둘로 가르는 자리다 — 코드는 세기만 한다.
 */
export const repeatCheckSchema = z.object({
  repeats: z
    .array(repeatPairSchema)
    .describe("이미 보도함과 같은 사건이고 새 전개가 없는 기사. 없으면 빈 배열."),
  followups: z
    .array(repeatPairSchema)
    .describe("이미 보도함과 같은 사건이지만 새 사실이 있는 후속 보도. 없으면 빈 배열."),
});

export type RepeatCheck = z.infer<typeof repeatCheckSchema>;

/**
 * 재보도 검사 출력의 파싱 스키마 — triageParseSchema 와 같은 이유로 번호를 number 로만 받는다(안전 정수 범위 밖
 * 번호 하나가 판정 전체를 버리지 않게). 범위·정수 확인은 repeatCheck.ts resolveRepeats 가 짝마다 한다.
 */
const repeatPairParseSchema = z.object({ id: z.number(), reported: z.number(), event: z.string() });

export const repeatCheckParseSchema = z.object({
  repeats: z.array(repeatPairParseSchema),
  followups: z.array(repeatPairParseSchema),
});
