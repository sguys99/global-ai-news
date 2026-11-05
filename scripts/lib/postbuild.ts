/**
 * 정적 export 후처리(`npm run build` 직후 npm `postbuild` 훅 → scripts/postbuild.ts) — 순수 로직·단계 목록.
 *
 * 단계는 **순서 있는 목록**(`POSTBUILD_STEPS`)이다: ① 기사 RSC(.txt) 삭제(Phase 4-1) ② 보관 지면 쓰기(Phase 4-3 —
 * 90일 지난 기사·호의 가벼운 정적 HTML, scripts/lib/archive.ts). 단계마다 지운·쓴 파일 수와 바이트를 돌려준다.
 * 모든 단계는 멱등이어야 한다 — 같은 out/ 에 두 번 돌려도 결과가 같고, 두 번째는 0건이다.
 *
 * deploy.yml·Dockerfile·html-regress(Docker 빌드)는 모두 `npm run build` 를 거치므로 이 후처리를 함께 탄다.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { archiveStep } from "./archive";

/** 한 단계의 결과 — 지운(또는 쓴) 파일 수와 줄어든 바이트(`bytes`)·늘어난 바이트(`addedBytes`, 쓰는 단계). */
export interface StepResult {
  files: number;
  bytes: number;
  addedBytes?: number;
  /** 요약 줄에 덧붙일 짧은 설명(예: 보관 지면 "기사 317·호 3"). */
  detail?: string;
}

export interface PostbuildStep {
  /** 요약 줄에 쓰는 짧은 이름. */
  name: string;
  run(outDir: string): StepResult;
}

/** 언어판 경로 접두어(out/ 기준). 한국어는 접두어 없음, 영어판은 `en/`(src/lib/i18n.ts localePath 와 같은 배치). */
export const LOCALE_DIRS = ["", "en"] as const;

/** 기사 id 디렉터리 이름 — `article/<숫자>/`. */
const ARTICLE_ID_RE = /^\d+$/;

/**
 * 기사 페이지의 RSC 페이로드 파일(`[en/]article/<id>/index.txt`) — out/ 기준 상대 경로, 정렬.
 * Next 15.5 정적 export 는 기사마다 이 파일 하나만 낸다(`index.html` 에는 같은 RSC 가 인라인으로 들어 있다).
 */
export function articleRscFiles(outDir: string): string[] {
  const found: string[] = [];
  for (const locale of LOCALE_DIRS) {
    const articleDir = path.join(outDir, locale, "article");
    if (!existsSync(articleDir)) continue;
    for (const d of readdirSync(articleDir, { withFileTypes: true })) {
      if (!d.isDirectory() || !ARTICLE_ID_RE.test(d.name)) continue;
      const rel = path.posix.join(locale, "article", d.name, "index.txt");
      if (existsSync(path.join(outDir, rel))) found.push(rel);
    }
  }
  return found.sort();
}

/**
 * 기사 RSC(`index.txt`)를 지운다(Phase 4-1 페이지 무게, 분석 순위 9 — 기사 1쪽 약 −24KB).
 * 기사로 가는 링크는 모두 ArticleLink(일반 `<a>`)라 이 파일을 미리 받거나 이동에 쓰지 않는다 — 기사 HTML 을 전체 로드한다.
 * 기사 페이지 안의 다른 링크(홈·호·검색)는 `next/link` 그대로이고 그쪽 `.txt` 는 남는다.
 */
export function removeArticleRsc(outDir: string): StepResult {
  let bytes = 0;
  const files = articleRscFiles(outDir);
  for (const rel of files) {
    const abs = path.join(outDir, rel);
    bytes += statSync(abs).size;
    rmSync(abs);
  }
  return { files: files.length, bytes };
}

/** 후처리 단계 — 순서대로 돈다. */
export const POSTBUILD_STEPS: readonly PostbuildStep[] = [
  { name: "기사 RSC(.txt) 삭제", run: removeArticleRsc },
  { name: "보관 지면", run: archiveStep },
];

export interface PostbuildReport {
  outDir: string;
  steps: (StepResult & { name: string })[];
}

/** out/ 이 정적 export 산출물인지 확인한다 — 없거나 비었으면 크게 실패한다(빌드가 깨졌는데 후처리만 "0건"으로 지나가지 않게). */
export function assertExportDir(outDir: string): void {
  if (!existsSync(outDir) || !statSync(outDir).isDirectory()) {
    throw new Error(
      `정적 export 산출물이 없다: ${outDir} — next build(output:'export')가 먼저 돌아야 한다`,
    );
  }
  if (!existsSync(path.join(outDir, "index.html"))) {
    throw new Error(`${outDir} 에 index.html 이 없다 — 정적 export 산출물이 아니다`);
  }
}

export function runPostbuild(
  outDir: string,
  steps: readonly PostbuildStep[] = POSTBUILD_STEPS,
): PostbuildReport {
  assertExportDir(outDir);
  return { outDir, steps: steps.map((s) => ({ name: s.name, ...s.run(outDir) })) };
}

/** 한 줄 요약: `postbuild: 기사 RSC(.txt) 삭제 1,277개 −31.29 MB · 보관 지면 320개 +2.31 MB(기사 317·호 3) (합계 …)`. */
export function formatPostbuildSummary(report: PostbuildReport): string {
  const mb = (b: number) => `${(b / 1_000_000).toFixed(2)} MB`;
  const n = (x: number) => x.toLocaleString("en-US");
  const total = report.steps.reduce(
    (acc, s) => ({
      files: acc.files + s.files,
      bytes: acc.bytes + s.bytes,
      added: acc.added + (s.addedBytes ?? 0),
    }),
    { files: 0, bytes: 0, added: 0 },
  );
  const sizes = (removed: number, added: number) =>
    added > 0 ? `${removed > 0 ? `−${mb(removed)} ` : ""}+${mb(added)}` : `−${mb(removed)}`;
  const parts = report.steps.map(
    (s) =>
      `${s.name} ${n(s.files)}개 ${sizes(s.bytes, s.addedBytes ?? 0)}${s.detail ? `(${s.detail})` : ""}`,
  );
  return `postbuild: ${parts.join(" · ")} (합계 ${n(total.files)}개 ${sizes(total.bytes, total.added)})`;
}
