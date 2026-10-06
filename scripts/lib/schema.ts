// SDK 의 zodOutputFormat 헬퍼가 zod v4 스키마를 받는다(zod 3.25+ 의 "zod/v4" 서브패스).
import { z } from "zod/v4";

/**
 * 기사 카테고리 (6종, 고정). PRD §5.
 * articles.category 및 LLM 가공 출력 enum 으로 사용.
 */
export const CATEGORIES = [
  "Language Models",
  "Agents",
  "Dev Tools",
  "MLOps",
  "연구·논문",
  "산업·정책",
] as const;

export type Category = (typeof CATEGORIES)[number];

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
 * 선별(triage) 출력. id·duplicates 는 후보 목록의 번호.
 * picks 는 중요도 내림차순, duplicates 는 같은 사건을 다룬 다른 후보.
 */
export const triageSchema = z.object({
  picks: z.array(
    z.object({
      id: z.number().int(),
      importance: z.number().int().min(1).max(5),
      duplicates: z.array(z.number().int()),
    }),
  ),
});

export type Triage = z.infer<typeof triageSchema>;
