// SDK 의 zodOutputFormat 헬퍼가 zod v4 스키마를 받는다(zod 3.25+ 의 "zod/v4" 서브패스).
import { z } from "zod/v4";
import { CATEGORIES } from "../../src/lib/labels";

/**
 * 기사 분야(카테고리) 6종 키. articles.category 및 LLM 가공 출력 enum 으로 사용.
 * 키·순서·표시명·구 값 호환 맵의 단일 출처는 src/lib/labels.ts — 웹 레이어와 공유하려고 거기 두고 여기서 다시 내보낸다.
 */
export { CATEGORIES, LEGACY_CATEGORY_MAP, type Category } from "../../src/lib/labels";

/**
 * 기사 1건의 한국어 가공 결과. 중요도는 선별 단계(triage)가 그날 후보 전체를 비교해
 * 상대 평가하므로 여기에는 없다.
 */
export const articleEnrichmentSchema = z.object({
  title_ko: z.string().max(60).describe("한국어 제목 (간결, 낚시성 금지)"),
  summary_ko: z.string().describe("한국어 요약 2~3줄, 핵심 사실 중심"),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string()).min(1).max(5).describe("소문자 영문 또는 한글 키워드"),
});

export type ArticleEnrichment = z.infer<typeof articleEnrichmentSchema>;

/** 가공 1회 호출(기사 여러 건) 출력. id 는 요청에 실린 기사 번호. */
export const enrichBatchSchema = z.object({
  articles: z.array(articleEnrichmentSchema.extend({ id: z.number().int() })),
});

export type EnrichBatch = z.infer<typeof enrichBatchSchema>;

/**
 * 선별(triage) 출력. 모든 번호는 후보 목록의 번호.
 * already_reported 는 "이미 보도함"과 같은 사건(새 전개 없음)인 후보 — picks 보다 앞에 두어 구조화 출력이
 * 먼저 채우게 한다(고르기 전에 걸러 내는 단계). 코드(resolvePicks)가 이 번호를 선정·묶음에서 뺀다.
 * picks 는 중요도 내림차순, duplicates 는 같은 사건을 다룬 다른 후보.
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
});

export type Triage = z.infer<typeof triageSchema>;

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
