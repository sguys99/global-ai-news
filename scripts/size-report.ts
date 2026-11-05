/**
 * 배포 산출물 크기 보고 CLI (english-version-plan Phase 4-1). 분류·판정·출력은 scripts/lib/sizeReport.ts.
 * 실행: npm run size:report -- [outDir=out] [--ci] [--base <기준 outDir>] [--json]
 *
 *   (인자 없음)  out/ 을 걸어 분류별 크기, 기사·호 페이지 평균·p50·p90·최대, 가장 무거운 5쪽을 콘솔 표로 낸다.
 *                보관 지면(Phase 4-3, HTML 머리의 보관 표지)은 "보관 기사·보관 호"로 따로 센다(쪽마다 8KB·40KB 예산).
 *                종료 코드 0(디렉터리가 없을 때만 2) — 로컬에서 경량화 효과를 잴 때 쓴다.
 *   --ci         deploy.yml 의 "Check output size" 스텝이 쓴다: 콘솔 표 + `::warning::`/`::error::` 주석,
 *                $GITHUB_STEP_SUMMARY 에 Markdown 표를 붙인다. 전체 950MB 이상일 때만 종료 코드 1
 *                (700MB 이상·페이지 예산 초과는 경고만).
 *   --base <dir> 다른 산출물(예: 경량화 전 빌드)과 분류별·페이지 평균 증감을 덧붙인다.
 *   --json       보고서·판정을 JSON 으로만 출력한다(다른 도구·에이전트가 읽을 때).
 *
 * 예:
 *   npm run build && npm run size:report
 *   npm run size:report -- data/regress/out-worktree --base data/regress/out-p4-base
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import {
  assessSizeReport,
  buildSizeReport,
  ARCHIVE_SNIFF_BYTES,
  ciExitCode,
  isArchiveHtml,
  isPageHtmlPath,
  sizeAnnotations,
  sizeComparison,
  sizeConsole,
  sizeMarkdown,
  type FileEntry,
} from "./lib/sizeReport";

/** outDir 아래 모든 정규 파일(심볼릭 링크는 따라가지 않는다) — 경로는 `/` 구분 상대 경로. */
function walk(root: string): FileEntry[] {
  const files: FileEntry[] = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop() as string;
    for (const d of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) stack.push(childRel);
      else if (d.isFile()) {
        const abs = path.join(root, childRel);
        const entry: FileEntry = { path: childRel, bytes: statSync(abs).size };
        // 기사·호 HTML 은 머리를 읽어 보관 지면(Phase 4-3)인지 가린다 — 같은 경로라 경로로는 모른다.
        if (isPageHtmlPath(childRel) && isArchiveHtml(readHead(abs))) entry.archive = true;
        files.push(entry);
      }
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** 파일 앞 ARCHIVE_SNIFF_BYTES 바이트(보관 표지는 `<head>` 맨 앞쪽). */
function readHead(file: string): string {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(ARCHIVE_SNIFF_BYTES);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

function main(): number {
  const args = process.argv.slice(2);
  const ci = args.includes("--ci");
  const json = args.includes("--json");
  const baseIdx = args.indexOf("--base");
  const baseDir = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
  if (baseIdx >= 0 && (!baseDir || baseDir.startsWith("--"))) {
    console.error("사용법: size-report [outDir=out] [--ci] [--base <기준 outDir>] [--json]");
    return 2;
  }
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !(baseIdx >= 0 && i === baseIdx + 1),
  );
  const outDir = positional[0] ?? "out";

  for (const dir of [outDir, baseDir].filter(Boolean) as string[]) {
    if (!isDir(dir)) {
      const msg = `산출물 디렉터리가 없다: ${dir} — 먼저 npm run build`;
      console.error(ci ? `::error title=산출물 크기::${msg}` : msg);
      return 2;
    }
  }

  const report = buildSizeReport(walk(outDir));
  const assessment = assessSizeReport(report);

  if (json) {
    const base = baseDir ? buildSizeReport(walk(baseDir)) : undefined;
    console.log(JSON.stringify({ outDir, report, assessment, base }, null, 2));
    return ci ? ciExitCode(assessment) : 0;
  }

  console.log(sizeConsole(report, assessment, outDir));
  if (baseDir) {
    console.log("");
    console.log(sizeComparison(buildSizeReport(walk(baseDir)), report));
  }
  if (!ci) return 0;

  for (const a of sizeAnnotations(assessment)) console.log(a);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      appendFileSync(summary, `${sizeMarkdown(report, assessment)}\n`);
    } catch (err) {
      console.log(`::warning title=산출물 크기::요약 기록 실패 — ${(err as Error).message}`);
    }
  }
  return ciExitCode(assessment);
}

process.exitCode = main();
