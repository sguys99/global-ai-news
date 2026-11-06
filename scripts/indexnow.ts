/**
 * IndexNow 알림 CLI (english-version-plan Phase 6-3, 선택 — 출시 전까지 꺼 둔다). 규칙·본문은 scripts/lib/indexNow.ts.
 * 실행: npm run indexnow -- [outDir=out] [--dry-run] [--emit <파일>] [--ci]
 *
 *   (인자 없음)  data/app.db 의 최신 호(getLatestEditionRef)에서 알릴 페이지(두 언어 홈·호·기사)를 고르고, outDir 에 실제로
 *                있는 것만 https://api.indexnow.org/indexnow 로 POST 한다. 200·202 면 종료 코드 0, 그 밖은 1(던지지 않는다).
 *   --dry-run    보낼 URL 목록과 요청 본문만 출력한다(네트워크 없음).
 *   --emit 파일  요청 본문을 한 줄 JSON 으로 파일에 쓴다(네트워크 없음) — deploy.yml 의 build 잡이 쓰고, 배포가 끝난 뒤
 *                deploy 잡이 같은 본문을 curl 로 보낸다(배포 전에 알리면 검색엔진이 아직 없는 페이지를 받는다).
 *   --ci         문제를 `::warning::` 으로 낸다(배포는 막지 않는다 — 스텝이 continue-on-error).
 *
 * 사이트 주소는 outDir/index.html 의 canonical(빌드가 쓴 배포 주소)에서, 키 파일은 outDir/<키>.txt 가 키와 같아야 한다.
 *
 * 예:
 *   npm run indexnow -- data/regress/out-p6-a --dry-run
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hasEnglish } from "../src/lib/articleText";
import { getIssueArticles, getLatestEditionRef } from "../src/lib/db";
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  buildIndexNowPayload,
  buildIndexNowUrls,
  indexNowKeyFile,
  indexNowOutcome,
  latestIssuePaths,
} from "./lib/indexNow";
import { siteUrlFromHome } from "./lib/seoCheck";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ci = args.includes("--ci");
  const emitIdx = args.indexOf("--emit");
  const emitFile = emitIdx >= 0 ? args[emitIdx + 1] : undefined;
  const outDir =
    args.find((a, i) => !a.startsWith("--") && !(emitIdx >= 0 && i === emitIdx + 1)) ?? "out";
  const problem = (msg: string) => {
    console.log(ci ? `::warning title=IndexNow::${msg}` : `✗ ${msg}`);
    return 1;
  };

  const home = path.join(outDir, "index.html");
  if (!existsSync(home)) return problem(`${home} 가 없다 — 먼저 npm run build`);
  const siteUrl = siteUrlFromHome(readFileSync(home, "utf8"));
  if (!siteUrl) return problem(`${home} 에서 canonical(사이트 주소)을 찾지 못했다`);

  const keyFile = path.join(outDir, indexNowKeyFile());
  if (!existsSync(keyFile) || readFileSync(keyFile, "utf8").trim() !== INDEXNOW_KEY) {
    const msg = `키 파일 ${keyFile} 가 없거나 키와 다르다 — public/${indexNowKeyFile()} 확인`;
    // 보내면 403 이라 멈춘다. --dry-run 은 목록 확인용이라 알리고 계속한다(키 파일 전에 만든 산출물).
    if (!dryRun) return problem(msg);
    problem(msg);
  }

  const ref = getLatestEditionRef();
  if (!ref) return problem("최신 호가 없다(data/app.db)");
  const articles = getIssueArticles(ref.date).map((a) => ({ id: a.id, english: hasEnglish(a) }));
  const { urls, missing } = buildIndexNowUrls(
    latestIssuePaths({ date: ref.date, articles }),
    siteUrl,
    (rel) => existsSync(path.join(outDir, rel)),
  );
  for (const p of missing) problem(`산출물에 없는 페이지라 뺀다: ${p}`);

  let payload;
  try {
    payload = buildIndexNowPayload(urls, siteUrl);
  } catch (err) {
    return problem((err as Error).message);
  }
  const english = urls.filter((u) => u.startsWith(`${siteUrl}/en/`)).length;
  console.log(
    `IndexNow — 최신 호 ${ref.date}(제${ref.issueNo}호) · URL ${urls.length}개(ko ${urls.length - english} · en ${english})` +
      ` · keyLocation ${payload.keyLocation}`,
  );

  if (emitFile) {
    writeFileSync(emitFile, JSON.stringify(payload));
    console.log(`요청 본문을 ${emitFile} 에 썼다(전송 안 함).`);
    return 0;
  }
  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    console.log("--dry-run: 전송하지 않았다.");
    return 0;
  }

  let status = 0;
  let body = "";
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    status = res.status;
    body = (await res.text()).slice(0, 300);
  } catch (err) {
    body = (err as Error).message;
  }
  const outcome = indexNowOutcome(status);
  const line = `IndexNow 응답 ${status || "-"} ${outcome.meaning}${body ? ` — ${body.replace(/\s+/g, " ")}` : ""}`;
  if (outcome.ok) {
    console.log(line);
    return 0;
  }
  return problem(line);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.log(`::warning title=IndexNow::예상하지 못한 오류 — ${(err as Error).message}`);
    process.exitCode = 1;
  },
);
