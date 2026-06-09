/**
 * arxiv 수집 어댑터(kind: "arxiv"). "유명한 논문만" 게이트 내장.
 *
 * 설계상 당일 신규 논문은 다루지 않는다 — 갓 올라온 논문은 인용수 0 + 외부 인덱스
 * 미등록이라 유명도를 판정할 수 없다(그 영역은 HuggingFace Daily Papers 가 담당).
 * 대신 제출일이 [now-windowDays, now-minAgeDays] 인 "신호가 쌓일 시간을 가진" 논문을
 * 윈도우로 수집해, 다음 OR 게이트를 통과한 것만 RawItem 으로 내보낸다:
 *
 *   ① 저자 소속 ∈ allowlist (빅랩/탑스쿨)         — 신선해도 통과
 *   ② Semantic Scholar 총 인용수 ≥ citationThreshold
 *   ③ Semantic Scholar 영향력 인용수 ≥ influentialThreshold
 *
 * 윈도우가 매일 슬라이드하고 collect.ts 의 dedup 이 재저장을 막으므로, 처음엔 임계
 * 미달이던 논문도 인용이 쌓이면 이후 실행에서 통과·저장된다(자기교정).
 *
 * source.url 에는 arxiv 카테고리를 넣는다(예: "cs.CL", "cs.AI").
 */
import type { RawItem } from "../../../src/lib/types";
import { loadPaperFilter } from "./paperFilter";
import { type SourceConfig } from "./rss";
import { fetchCitations, fetchInstitutions, matchesAllowlist } from "./scholar";

const ARXIV_API = "https://export.arxiv.org/api/query";
const MAX_CONTENT_CHARS = 2000; // rss.ts 와 동일 저장 정책

/** arxiv API 가 기대하는 UTC 타임스탬프 형식(YYYYMMDDHHMM). */
function ymdhm(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
  );
}

/** source.url 에서 카테고리 추출("cs.CL" 또는 전체 URL 모두 허용). */
export function parseCategory(raw: string): string {
  const m = raw.match(/([a-z-]+\.[A-Z]{2})/);
  if (!m) throw new Error(`invalid arxiv category: ${raw}`);
  return m[1];
}

/** arxiv Atom <entry> 한 건(파싱에 필요한 필드만). */
interface ArxivEntry {
  id: string; // 버전 제거된 arxiv ID (예: "2404.19756")
  title: string;
  summary: string;
  publishedAt: string; // ISO8601
}

/** <title>/<summary> 의 줄바꿈·연속 공백을 정리하고 기본 XML 엔티티를 복원. */
function cleanText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * arxiv Atom 응답을 파싱한다. 네임스페이스가 섞인 arxiv Atom 은 rss-parser 로
 * 다루기 까다로워, 필요한 4개 필드만 정규식으로 추출한다(형식이 안정적).
 */
export function parseArxivAtom(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  const blocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  for (const block of blocks) {
    const idUrl = block.match(/<id>([^<]+)<\/id>/)?.[1] ?? "";
    const idMatch = idUrl.match(/abs\/(\d{4}\.\d{4,5})/);
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const summary = block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
    const published = block.match(/<published>([^<]+)<\/published>/)?.[1];
    if (!idMatch || !title || !published) continue;

    const date = new Date(published);
    if (Number.isNaN(date.getTime())) continue;

    entries.push({
      id: idMatch[1],
      title: cleanText(title),
      summary: cleanText(summary ?? ""),
      publishedAt: date.toISOString(),
    });
  }
  return entries;
}

/** 카테고리 윈도우의 arxiv 논문을 가져온다. */
async function fetchWindow(
  category: string,
  windowDays: number,
  minAgeDays: number,
  maxResults: number,
): Promise<ArxivEntry[]> {
  const now = Date.now();
  const start = ymdhm(new Date(now - windowDays * 86_400_000));
  const end = ymdhm(new Date(now - minAgeDays * 86_400_000));
  const q = `cat:${category}+AND+submittedDate:[${start}+TO+${end}]`;
  const url =
    `${ARXIV_API}?search_query=${q}` +
    `&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${maxResults}`;

  const res = await fetch(url); // 301(http→https)은 fetch 가 자동 추종
  if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
  return parseArxivAtom(await res.text());
}

/**
 * arxiv 카테고리 한 곳을 수집해 게이트를 통과한 RawItem[] 만 반환한다.
 * engagement.citations / engagement.influential 에 인용 신호를 실어 트렌딩에 반영한다.
 */
export async function fetchArxiv(source: SourceConfig): Promise<RawItem[]> {
  const { arxiv } = loadPaperFilter();
  const category = parseCategory(source.url);

  const entries = await fetchWindow(category, arxiv.windowDays, arxiv.minAgeDays, arxiv.maxResults);
  if (entries.length === 0) return [];

  const ids = entries.map((e) => e.id);
  // 인용(주력)·소속(보조)을 병렬 보강. 한쪽 실패해도 다른 신호로 게이트 가능.
  const [citations, institutions] = await Promise.all([
    fetchCitations(ids),
    fetchInstitutions(ids),
  ]);

  const items: RawItem[] = [];
  for (const e of entries) {
    const cite = citations.get(e.id);
    const insts = institutions.get(e.id);

    const instMatch = matchesAllowlist(insts, arxiv.institutionAllowlist);
    const citePass = (cite?.citationCount ?? 0) >= arxiv.citationThreshold;
    const inflPass = (cite?.influentialCitationCount ?? 0) >= arxiv.influentialCitationThreshold;
    if (!instMatch && !citePass && !inflPass) continue; // 게이트 탈락 → 버림

    items.push({
      sourceId: source.id,
      url: `https://arxiv.org/abs/${e.id}`,
      title: e.title,
      contentRaw: e.summary.slice(0, MAX_CONTENT_CHARS) || undefined,
      publishedAt: e.publishedAt,
      engagement: cite
        ? {
            citations: cite.citationCount,
            influential: cite.influentialCitationCount,
          }
        : undefined,
    });
  }
  return items;
}
