/**
 * 정적 export 후처리 CLI — npm `postbuild` 훅이 `npm run build`(next build) 직후 자동으로 돌린다.
 * 단계 목록·로직은 scripts/lib/postbuild.ts(POSTBUILD_STEPS). 실행: `tsx scripts/postbuild.ts [outDir=out]`.
 *
 * out/ 이 없거나 정적 export 가 아니면 종료 코드 1 로 크게 실패한다(배포가 멈춘다). 멱등 — 다시 돌리면 RSC 삭제는 0건,
 * 보관 지면은 같은 내용을 다시 쓴다(바뀜 0).
 */
import path from "node:path";
import { readBuildAssets } from "./lib/archiveAssets";

const outDir = path.resolve(process.argv[2] ?? "out");

async function main() {
  // 보관 지면 렌더러(src/lib/site.ts)는 basePath·사이트 주소를 모듈 상수(NEXT_PUBLIC_*)로 읽는다 — next build 밖이라
  // 비어 있으므로 같은 빌드의 out/index.html 에서 읽어 채운 뒤 후처리 모듈을 불러온다(정적 import 는 이보다 먼저 평가된다).
  const site = readBuildAssets(outDir);
  process.env.NEXT_PUBLIC_BASE_PATH = site.basePath;
  process.env.NEXT_PUBLIC_SITE_URL = site.siteUrl;
  const { formatPostbuildSummary, runPostbuild } = await import("./lib/postbuild");
  console.log(formatPostbuildSummary(runPostbuild(outDir)));
}

main().catch((err: unknown) => {
  console.error(`postbuild 실패: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
