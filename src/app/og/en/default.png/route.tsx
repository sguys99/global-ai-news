import { defaultImage } from "@/lib/ogImage";

/** 영어 기본 공유 썸네일(영어 상세·검색, 창 밖 호·기사). 빌드타임 1회 생성 → out/og/en/default.png. */
export const dynamic = "force-static";

export function GET() {
  return defaultImage("en");
}
