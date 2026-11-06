/**
 * 배포 전 SEO 정합성 검사 CLI (english-version-plan Phase 6-3). 판정 규칙·출력은 scripts/lib/seoCheck.ts.
 * 실행: npm run seo:check -- [outDir=out] [--ci] [--json] [--site-url <주소>]
 *
 *   (인자 없음)  out/ 의 모든 페이지(index.html, 404 제외 — 보관 지면 포함)의 canonical·og:url·lang·og:locale·hreflang 상호 참조·
 *                공유 이미지·RSS 링크·JSON-LD 와 사이트맵 인덱스·조각, RSS 피드를 검사한다.
 *                오류가 있거나 페이지가 0쪽이면 종료 코드 1(경고만이면 0), 디렉터리·홈이 없으면 2.
 *   --ci         deploy.yml 의 "Check SEO" 스텝이 쓴다: 묶음마다 `::error::`/`::warning::` 주석과 $GITHUB_STEP_SUMMARY 한 단락.
 *   --json       보고서를 JSON 으로만 출력한다(묶음 포함).
 *   --site-url   사이트 주소(basePath 포함). 기본은 out/index.html 의 canonical.
 *
 * 예:
 *   npm run seo:check -- data/regress/out-p6-a
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  buildSeoReport,
  groupIssues,
  isPageFile,
  parsePage,
  seoAnnotations,
  seoConsole,
  seoExitCode,
  seoSummary,
  siteUrlFromHome,
  type PageHead,
} from "./lib/seoCheck";

/** outDir 아래 모든 파일(심볼릭 링크는 따라가지 않는다) — `/` 구분 상대 경로. */
function listFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop() as string;
    for (const d of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) stack.push(childRel);
      else if (d.isFile()) out.push(childRel);
    }
  }
  return out.sort();
}

function main(): number {
  const args = process.argv.slice(2);
  const ci = args.includes("--ci");
  const json = args.includes("--json");
  const siteIdx = args.indexOf("--site-url");
  const siteArg = siteIdx >= 0 ? args[siteIdx + 1] : undefined;
  const outDir =
    args.find((a, i) => !a.startsWith("--") && !(siteIdx >= 0 && i === siteIdx + 1)) ?? "out";
  const fail = (msg: string) => {
    console.error(ci ? `::error title=SEO 검사::${msg}` : msg);
    return 2;
  };

  if (!existsSync(outDir) || !statSync(outDir).isDirectory()) {
    return fail(`산출물 디렉터리가 없다: ${outDir} — 먼저 npm run build`);
  }
  const homeFile = path.join(outDir, "index.html");
  if (!existsSync(homeFile)) return fail(`${homeFile} 가 없다 — 정적 export 산출물이 아니다`);
  const siteUrl = (siteArg ?? siteUrlFromHome(readFileSync(homeFile, "utf8")) ?? "").replace(
    /\/+$/,
    "",
  );
  if (!siteUrl) return fail(`${homeFile} 에서 canonical(사이트 주소)을 찾지 못했다`);

  const started = Date.now();
  const all = listFiles(outDir);
  const files = new Set(all);
  const pages: PageHead[] = [];
  const xml = new Map<string, string>();
  for (const rel of all) {
    if (isPageFile(rel)) {
      pages.push(parsePage(rel, readFileSync(path.join(outDir, rel), "utf8"), siteUrl));
    } else if (rel.endsWith(".xml")) {
      xml.set(rel, readFileSync(path.join(outDir, rel), "utf8"));
    }
  }
  const report = buildSeoReport({ siteUrl, pages, files, xml });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (json) {
    console.log(JSON.stringify({ outDir, ...report, groups: groupIssues(report.issues) }, null, 2));
    return seoExitCode(report);
  }
  console.log(`${seoConsole(report, outDir)}\n  (${seconds}초)`);
  if (!ci) return seoExitCode(report);

  for (const a of seoAnnotations(report)) console.log(a);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      appendFileSync(summary, seoSummary(report));
    } catch (err) {
      console.log(`::warning title=SEO 검사::요약 기록 실패 — ${(err as Error).message}`);
    }
  }
  return seoExitCode(report);
}

process.exitCode = main();
