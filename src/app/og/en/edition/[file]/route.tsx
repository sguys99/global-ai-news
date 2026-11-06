import { getEditionRefs, getIssueArticles } from "@/lib/db";
import { buildEdition } from "@/lib/edition";
import { editionImage } from "@/lib/ogImage";
import { hasEditionThumbnail } from "@/lib/site";
import { localeArticles, localeEditionRefs } from "@/views/data";

/**
 * 영어 호 공유 썸네일(그날 영어판 1면) → out/og/en/edition/<YYYY-MM-DD>.png (english-version-plan 6-2).
 * 만드는 호 = 영어 기사가 1건 이상 실린 호(`localeEditionRefs("en")` — 영어 호 고정 링크와 같은 기준) 중 한국어판과
 * **같은 창**(hasEditionThumbnail, 기준 = DB 최신 호 날짜 — 영어 최신 호가 아니다). 영어 호 메타도 같은 판정으로 이 경로
 * 또는 영어 기본 썸네일을 쓴다. 1면은 영어 호 지면과 같은 입력(`buildEdition(localeArticles("en", …))`)으로 편집한다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

const fileOf = (date: string) => `${date}.png`;

export function generateStaticParams() {
  const latest = getEditionRefs().at(-1)?.date ?? null;
  return localeEditionRefs("en")
    .filter((ref) => hasEditionThumbnail(ref.date, latest))
    .map((ref) => ({ file: fileOf(ref.date) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const ref = localeEditionRefs("en").find((r) => fileOf(r.date) === file);
  if (!ref) return new Response(null, { status: 404 });
  return editionImage(buildEdition(localeArticles("en", getIssueArticles(ref.date))), ref, "en");
}
