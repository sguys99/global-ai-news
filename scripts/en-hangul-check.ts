/**
 * 영어판 한글 누출 검사 CLI (english-version-plan Phase 5-4). 판정·허용 규칙·출력은 scripts/lib/enHangulCheck.ts.
 * 실행: npm run en:hangul-check -- [outDir=out] [--ci] [--json]
 *
 *   (인자 없음)  out/en/** 의 HTML·RSC(.txt)와 out/{search,feed}-index/en/** JSON 을 읽어 한글을 찾는다.
 *                허용은 `lang="ko"` 요소 안뿐(한국 매체 원제 줄·`한국어` 전환 링크) — 콘솔에 허용 요소별 건수를 함께 낸다.
 *                위반이 있거나 검사 파일이 0개면 종료 코드 1, 디렉터리가 없으면 2.
 *   --ci         deploy.yml 의 "Check English pages for Hangul" 스텝이 쓴다: 위반 묶음마다 `::error::` 주석과
 *                $GITHUB_STEP_SUMMARY 한 줄 요약.
 *   --json       보고서를 JSON 으로만 출력한다.
 *
 * 예:
 *   npm run build && npm run en:hangul-check
 *   npm run en:hangul-check -- data/regress/out-p5-verify
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  buildHangulReport,
  groupViolations,
  hangulAnnotations,
  hangulConsole,
  hangulExitCode,
  isScanTarget,
} from "./lib/enHangulCheck";

/** outDir 아래 검사 대상 파일(심볼릭 링크는 따라가지 않는다) — `/` 구분 상대 경로. */
function* targets(root: string): Generator<{ path: string; content: string }> {
  const stack = ["en", "search-index/en", "feed-index/en"].filter((d) =>
    existsSync(path.join(root, d)),
  );
  while (stack.length) {
    const rel = stack.pop() as string;
    for (const d of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const childRel = `${rel}/${d.name}`;
      if (d.isDirectory()) stack.push(childRel);
      else if (d.isFile() && isScanTarget(childRel)) {
        yield { path: childRel, content: readFileSync(path.join(root, childRel), "utf8") };
      }
    }
  }
}

function main(): number {
  const args = process.argv.slice(2);
  const ci = args.includes("--ci");
  const json = args.includes("--json");
  const outDir = args.find((a) => !a.startsWith("--")) ?? "out";

  if (!existsSync(outDir) || !statSync(outDir).isDirectory()) {
    const msg = `산출물 디렉터리가 없다: ${outDir} — 먼저 npm run build`;
    console.error(ci ? `::error title=영어판 한글 검사::${msg}` : msg);
    return 2;
  }

  const report = buildHangulReport(targets(outDir));
  if (json) {
    console.log(
      JSON.stringify({ outDir, ...report, groups: groupViolations(report.violations) }, null, 2),
    );
    return hangulExitCode(report);
  }
  console.log(hangulConsole(report, outDir));
  if (!ci) return hangulExitCode(report);

  for (const a of hangulAnnotations(report)) console.log(a);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const line =
      report.violations.length === 0
        ? `### 영어판 한글 검사\n\n검사 ${report.filesScanned.toLocaleString("en-US")}개 파일 — 위반 없음\n`
        : `### 영어판 한글 검사\n\n검사 ${report.filesScanned.toLocaleString("en-US")}개 파일 — **위반 ${report.violations.length.toLocaleString("en-US")}건(${report.filesWithViolations}개 파일)**\n`;
    try {
      appendFileSync(summary, line);
    } catch (err) {
      console.log(`::warning title=영어판 한글 검사::요약 기록 실패 — ${(err as Error).message}`);
    }
  }
  return hangulExitCode(report);
}

process.exitCode = main();
