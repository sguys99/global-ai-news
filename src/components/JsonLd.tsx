import { jsonLdHtml } from "@/lib/seo";

/** 구조화 데이터(JSON-LD) 스크립트 — 검색엔진 전용, 화면에 그리지 않는다. */
export function JsonLd({ data }: { data: object }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />
  );
}
