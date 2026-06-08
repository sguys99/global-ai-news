/**
 * 집계 API 수집 어댑터. PRD §3.1.
 * Hacker News(Algolia) / GitHub Search / HuggingFace Daily Papers 를
 * 각각 RawItem[] 으로 정규화한다. 모두 fetchRss 와 동일한
 * (source: SourceConfig) => Promise<RawItem[]> 계약을 따른다.
 *
 * 외부 응답 스키마 변동에 대비해 누락 필드는 방어적으로 스킵한다.
 */
import type { RawItem } from "../../../src/lib/types";
import { stripHtml, type SourceConfig } from "./rss";

/** content_raw 저장 용량 상한 (rss.ts 와 동일 정책). */
const MAX_CONTENT_CHARS = 2000;

/** UTC 기준 ISO 문자열 유효성 검사 후 정규화. 실패 시 null. */
function toIso(input: string | number | undefined): string | null {
  if (input === undefined) return null;
  const d = typeof input === "number" ? new Date(input * 1000) : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// --- Hacker News (Algolia) -------------------------------------------------

interface HnHit {
  objectID: string;
  title?: string;
  url?: string | null;
  points?: number;
  num_comments?: number;
  created_at?: string;
}

/**
 * HN Algolia: 최근 24시간 내 points>50 인 story 상위 30건.
 * url 이 없는 Ask HN 류는 item 퍼머링크로 대체한다.
 */
export async function fetchHn(_source: SourceConfig): Promise<RawItem[]> {
  const since = Math.floor(Date.now() / 1000) - 24 * 3600;
  const url =
    `https://hn.algolia.com/api/v1/search?query=AI&tags=story` +
    `&numericFilters=points>50,created_at_i>${since}&hitsPerPage=30`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN HTTP ${res.status}`);
  const data = (await res.json()) as { hits?: HnHit[] };

  const items: RawItem[] = [];
  for (const hit of data.hits ?? []) {
    const title = hit.title;
    const publishedAt = toIso(hit.created_at);
    if (!title || !publishedAt) continue;
    const link = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;

    items.push({
      sourceId: _source.id,
      url: link,
      title,
      publishedAt,
      engagement: {
        points: hit.points ?? 0,
        num_comments: hit.num_comments ?? 0,
      },
    });
  }
  return items;
}

// --- GitHub Search ---------------------------------------------------------

interface GithubRepo {
  html_url?: string;
  full_name?: string;
  description?: string | null;
  stargazers_count?: number;
  pushed_at?: string;
  created_at?: string;
}

/**
 * GitHub Search: 최근 7일 내 생성된 topic:llm 저장소를 stars 내림차순으로.
 * GITHUB_PAT 가 있으면 인증 헤더로 rate limit(30/분)을 확보한다.
 */
export async function fetchGithub(source: SourceConfig): Promise<RawItem[]> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD
  const q = encodeURIComponent(`topic:llm created:>${since}`);
  const url =
    `https://api.github.com/search/repositories?q=${q}` + `&sort=stars&order=desc&per_page=30`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "daily-ai-brief",
  };
  if (process.env.GITHUB_PAT) {
    headers.Authorization = `Bearer ${process.env.GITHUB_PAT}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
  const data = (await res.json()) as { items?: GithubRepo[] };

  const items: RawItem[] = [];
  for (const repo of data.items ?? []) {
    const link = repo.html_url;
    const title = repo.full_name;
    const publishedAt = toIso(repo.pushed_at ?? repo.created_at);
    if (!link || !title || !publishedAt) continue;

    items.push({
      sourceId: source.id,
      url: link,
      title,
      contentRaw: stripHtml(repo.description ?? "").slice(0, MAX_CONTENT_CHARS) || undefined,
      publishedAt,
      engagement: { stars: repo.stargazers_count ?? 0 },
    });
  }
  return items;
}

// --- HuggingFace Daily Papers ----------------------------------------------

interface HfDailyPaper {
  publishedAt?: string;
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    upvotes?: number;
  };
}

/**
 * HuggingFace Daily Papers: 최신 논문 20건.
 * upvotes 는 reddit ups 와 동일 신호로 트렌딩에 반영한다.
 */
export async function fetchHf(source: SourceConfig): Promise<RawItem[]> {
  const res = await fetch("https://huggingface.co/api/daily_papers?limit=20");
  if (!res.ok) throw new Error(`HuggingFace HTTP ${res.status}`);
  const data = (await res.json()) as HfDailyPaper[];

  const items: RawItem[] = [];
  for (const entry of data ?? []) {
    const paper = entry.paper;
    const title = paper?.title;
    const id = paper?.id;
    const publishedAt = toIso(entry.publishedAt);
    if (!title || !id || !publishedAt) continue;

    items.push({
      sourceId: source.id,
      url: `https://huggingface.co/papers/${id}`,
      title,
      contentRaw: stripHtml(paper?.summary).slice(0, MAX_CONTENT_CHARS) || undefined,
      publishedAt,
      engagement: paper?.upvotes ? { ups: paper.upvotes } : undefined,
    });
  }
  return items;
}
