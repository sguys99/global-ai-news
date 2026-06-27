import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// GitHub Pages 프로젝트 페이지 서브경로. 커스텀 도메인 전환 시 제거(Post-MVP).
const BASE_PATH = "/global-ai-news";

// 클린 컷오버: Vercel/standalone 폐기 → 정적 export를 빌드 기본값으로.
// `npm run build`(= PHASE_PRODUCTION_BUILD)는 곧 정적 export(`out/`).
//
// 단, `output:'export'`는 빌드뿐 아니라 `next dev`까지 정적 제약(force-dynamic
// 라우트·searchParams 페이지 금지)을 강제한다. 무조건 적용하면 로컬 운영 도구인
// admin/api/middleware가 dev에서도 깨진다 → 빌드 phase로 감지해 프로덕션 빌드에만
// export 설정을 적용한다(WORK-PLAN-github-pages §Phase0: "빌드 phase 감지" 채택).
// `npm run dev`는 분기 밖이라 standalone 시절과 동일하게 동작(admin/api 잔존).
const nextConfig = (phase: string): NextConfig => {
  if (phase !== PHASE_PRODUCTION_BUILD) {
    // 개발 서버: export 미적용. basePath도 두지 않아 기존 로컬 경로 그대로 사용.
    return {};
  }

  return {
    // better-sqlite3는 빌드타임 readonly 조회 전용이라 런타임 번들에 포함되지
    // 않으므로 serverExternalPackages 없이도 정상.
    output: "export",
    basePath: BASE_PATH,
    assetPrefix: `${BASE_PATH}/`,
    // 클라이언트 수동 fetch(검색 인덱스)가 basePath를 명시할 수 있게 노출(next.config 단일 출처).
    // dev 분기에선 미설정 → process.env.NEXT_PUBLIC_BASE_PATH 가 undefined → "".
    env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
    // 정적 호스팅엔 이미지 최적화 서버가 없다(현재 next/image 사용처 0건).
    images: { unoptimized: true },
    // 디렉토리형 산출(`out/article/<id>/index.html`)로 서브경로 서빙 안정화.
    trailingSlash: true,
  };
};

export default nextConfig;
