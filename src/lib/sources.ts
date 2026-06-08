/**
 * 소스 정의(configs/sources.json) read/write 추상화 (Phase 5).
 *
 * - 읽기: 항상 로컬 파일.
 * - 쓰기: GITHUB_PAT/GITHUB_REPO 가 있으면 GitHub Contents API 로 커밋(프로덕션),
 *         없으면 로컬 파일 직접 쓰기(dev 폴백 — Vercel 등 읽기전용 FS 에서는 동작 안 함).
 *
 * Node 런타임(라우트 핸들러) 전용.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CONFIGS_DIR } from "@/lib/paths";
import type { SourceConfig, SourceKind } from "@/lib/types";
import { commitFile, hasGithubConfig } from "@/lib/github";

const SOURCES_REL = "sources.json";
const SOURCES_PATH = path.join(CONFIGS_DIR, SOURCES_REL);
/** GitHub 커밋 시 repo 루트 기준 경로. */
const SOURCES_REPO_PATH = "configs/sources.json";

const SOURCE_KINDS: SourceKind[] = ["rss", "web", "hn", "github", "hf", "reddit"];

/** 소스 1건 검증 스키마. url 은 kind 에 따라 다르게 검증한다(reddit 은 r/... 형식). */
export const sourceSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9_]+$/, "id 는 소문자/숫자/밑줄만 사용합니다."),
    name: z.string().min(1),
    kind: z.enum(SOURCE_KINDS as [SourceKind, ...SourceKind[]]),
    url: z.string().min(1),
    enabled: z.union([z.literal(0), z.literal(1)]),
  })
  .superRefine((s, ctx) => {
    if (s.kind === "reddit") {
      if (!/^r\/[A-Za-z0-9_]+$/.test(s.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "reddit 소스의 url 은 r/SubredditName 형식이어야 합니다.",
        });
      }
    } else if (!/^https?:\/\/.+/.test(s.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "url 은 http(s):// 로 시작하는 절대 URL 이어야 합니다.",
      });
    }
  });

export type ValidatedSource = z.infer<typeof sourceSchema>;

/** 현재 소스 목록을 로컬 파일에서 읽는다. */
export async function readSources(): Promise<SourceConfig[]> {
  const raw = await fs.readFile(SOURCES_PATH, "utf-8");
  return JSON.parse(raw) as SourceConfig[];
}

/**
 * 소스 목록을 저장한다. GitHub 설정이 있으면 커밋, 없으면 로컬 파일에 쓴다.
 * @returns 저장 경로("github" | "local")
 */
export async function writeSources(
  sources: SourceConfig[],
  message: string,
): Promise<"github" | "local"> {
  const content = JSON.stringify(sources, null, 2) + "\n";
  if (hasGithubConfig()) {
    await commitFile(SOURCES_REPO_PATH, content, message);
    return "github";
  }
  await fs.writeFile(SOURCES_PATH, content, "utf-8");
  return "local";
}
