import { defaultImage } from "@/lib/ogImage";

/** 기본 공유 썸네일(상세·검색). 정적 export 가 빌드타임 1회 생성 → out/og/default.png. */
export const dynamic = "force-static";

export function GET() {
  return defaultImage();
}
