/**
 * 정적 export 후처리 CLI — npm `postbuild` 훅이 `npm run build`(next build) 직후 자동으로 돌린다.
 * 단계 목록·로직은 scripts/lib/postbuild.ts(POSTBUILD_STEPS). 실행: `tsx scripts/postbuild.ts [outDir=out]`.
 *
 * out/ 이 없거나 정적 export 가 아니면 종료 코드 1 로 크게 실패한다(배포가 멈춘다). 멱등 — 다시 돌리면 0건이다.
 */
import path from "node:path";
import { formatPostbuildSummary, runPostbuild } from "./lib/postbuild";

const outDir = path.resolve(process.argv[2] ?? "out");

try {
  console.log(formatPostbuildSummary(runPostbuild(outDir)));
} catch (err) {
  console.error(`postbuild 실패: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
