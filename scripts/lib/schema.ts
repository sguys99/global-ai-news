import { z } from "zod";

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
 * LLM(generateObject) 출력 스키마. 신규 기사 1건당 1호출로 채운다. PRD §5.
 */
export const articleEnrichmentSchema = z.object({
  title_ko: z.string().max(60).describe("한국어 제목 (간결, 낚시성 금지)"),
  summary_ko: z.string().describe("한국어 요약 2~3줄, 핵심 사실 중심"),
  category: z.enum(CATEGORIES),
  tags: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("소문자 영문 또는 한글 키워드"),
  importance: z.number().int().min(1).max(5).describe("보조 중요도 1~5"),
});

export type ArticleEnrichment = z.infer<typeof articleEnrichmentSchema>;
