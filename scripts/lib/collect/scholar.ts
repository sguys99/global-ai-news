/**
 * 논문 외부 신호 보강(인용수·저자 소속). arxiv 어댑터의 "유명한 것만" 게이트용.
 *
 * - 인용수: Semantic Scholar Graph API. arxiv ID(`ARXIV:<id>`)를 네이티브로 해석하므로
 *   DOI 추정 없이 안정적. 키 없으면 rate limit(429)이 잦아 SEMANTIC_SCHOLAR_API_KEY 권장.
 * - 소속: OpenAlex. arxiv DOI(10.48550/arxiv.<id>) 매칭은 best-effort(출판 DOI로 흡수된
 *   논문은 누락될 수 있음) — 누락 시 인용수 게이트가 대신 판정한다.
 *
 * 모든 외부 호출은 청크 단위로 끊고, 실패한 청크는 건너뛴 채(부분 보강) 계속 진행한다.
 * → 한 외부 API 장애가 수집 전체를 막지 않는다(collect.ts 소스별 격리와 동일 철학).
 */

/** 단일 논문 인용 신호. */
export interface CitationInfo {
  citationCount: number;
  influentialCitationCount: number;
}

/** 비동기 슬립(rate limit 완화용). */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 배열을 size 크기 청크로 나눈다. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// --- Semantic Scholar (인용수) ---------------------------------------------

const S2_BATCH = "https://api.semanticscholar.org/graph/v1/paper/batch";
const S2_FIELDS = "citationCount,influentialCitationCount";
const S2_CHUNK = 100; // batch 상한 500 이지만 보수적으로

/**
 * arxiv ID 목록 → 인용 신호 맵(id→CitationInfo). 못 찾은 논문은 맵에 없음(=신호 미상).
 * 429/네트워크 오류는 최대 3회 백오프 후 해당 청크 포기(부분 결과 반환).
 */
export async function fetchCitations(
  arxivIds: string[],
): Promise<Map<string, CitationInfo>> {
  const out = new Map<string, CitationInfo>();
  if (arxivIds.length === 0) return out;

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  for (const ids of chunk(arxivIds, S2_CHUNK)) {
    const body = JSON.stringify({ ids: ids.map((id) => `ARXIV:${id}`) });
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const res = await fetch(`${S2_BATCH}?fields=${S2_FIELDS}`, {
          method: "POST",
          headers,
          body,
        });
        if (res.status === 429) {
          await sleep(attempt * 2000); // 2s, 4s, 6s
          continue;
        }
        if (!res.ok) throw new Error(`S2 HTTP ${res.status}`);

        // 응답은 입력 순서와 정렬되며, 못 찾은 논문은 null.
        const data = (await res.json()) as (CitationInfo | null)[];
        data.forEach((paper, i) => {
          if (paper) {
            out.set(ids[i], {
              citationCount: paper.citationCount ?? 0,
              influentialCitationCount: paper.influentialCitationCount ?? 0,
            });
          }
        });
        ok = true;
      } catch (err) {
        console.warn(`[scholar] S2 chunk attempt ${attempt}: ${(err as Error).message}`);
        await sleep(attempt * 1000);
      }
    }
    if (!ok) console.warn(`[scholar] S2 chunk 포기 (${ids.length}건 인용 미상)`);
    if (!apiKey) await sleep(1200); // 무키 공용 풀 보호
  }
  return out;
}

// --- OpenAlex (저자 소속) ---------------------------------------------------

const OA_WORKS = "https://api.openalex.org/works";
const OA_CHUNK = 40; // filter OR(|) 상한 고려

/** OpenAlex work 한 건(필요 필드만). */
interface OpenAlexWork {
  ids?: { doi?: string };
  doi?: string;
  authorships?: { institutions?: { display_name?: string }[] }[];
}

/** DOI 문자열에서 arxiv ID 추출. 예: .../10.48550/arxiv.2404.19756 → 2404.19756 */
function arxivIdFromDoi(doi: string | undefined): string | null {
  if (!doi) return null;
  const m = doi.match(/arxiv\.(\d{4}\.\d{4,5})/i);
  return m ? m[1] : null;
}

/**
 * arxiv ID 목록 → 저자 소속 맵(id→소속명[]). arxiv DOI 로 매칭되는 논문만 포함(best-effort).
 * 네트워크 오류는 해당 청크만 건너뛴다.
 */
export async function fetchInstitutions(
  arxivIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (arxivIds.length === 0) return out;

  const mailto = process.env.OPENALEX_MAILTO ?? "daily-ai-brief@example.com";

  for (const ids of chunk(arxivIds, OA_CHUNK)) {
    const dois = ids.map((id) => `10.48550/arxiv.${id}`).join("|");
    const url =
      `${OA_WORKS}?filter=doi:${dois}` +
      `&per_page=${OA_CHUNK}&mailto=${encodeURIComponent(mailto)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
      const data = (await res.json()) as { results?: OpenAlexWork[] };

      for (const work of data.results ?? []) {
        const id = arxivIdFromDoi(work.ids?.doi ?? work.doi);
        if (!id) continue;
        const names = (work.authorships ?? [])
          .flatMap((a) => a.institutions ?? [])
          .map((i) => i.display_name)
          .filter((n): n is string => Boolean(n));
        if (names.length) out.set(id, Array.from(new Set(names)));
      }
    } catch (err) {
      console.warn(`[scholar] OpenAlex chunk 건너뜀: ${(err as Error).message}`);
    }
  }
  return out;
}

// --- 소속 화이트리스트 매칭 ---------------------------------------------------

/** OpenAlex 소속명을 비교용으로 정규화: 소문자화 + 끝의 "(국가)" 접미사 제거. */
function normInstitution(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}

/**
 * 소속 목록 중 하나라도 allowlist 와 일치하면 true.
 * - 다단어 토큰("stanford university")은 부분 포함 매칭(국가/약칭 변형 흡수).
 * - 단일어 토큰("google", "meta")은 오탐 방지를 위해 완전 일치만.
 */
export function matchesAllowlist(
  institutions: string[] | undefined,
  allowlist: string[],
): boolean {
  if (!institutions?.length || !allowlist.length) return false;
  const tokens = allowlist.map((a) => a.toLowerCase().trim());
  return institutions.some((raw) => {
    const inst = normInstitution(raw);
    return tokens.some((tok) =>
      tok.includes(" ") ? inst.includes(tok) : inst === tok,
    );
  });
}
