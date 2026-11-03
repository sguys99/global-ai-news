import type { MetadataRoute } from "next";
import { getEditionRefs, getSitemapArticles } from "@/lib/db";
import { buildSitemap } from "@/lib/seo";

/** 사이트맵 — 정적 export 가 빌드타임 1회 생성 → out/sitemap.xml. Search Console·서치어드바이저에 제출한다. */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(getEditionRefs(), getSitemapArticles());
}
