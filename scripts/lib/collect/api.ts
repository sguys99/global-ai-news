/**
 * 집계 API 수집 어댑터. PRD §3.1.
 * Hacker News(Algolia) / GitHub(Search·Trending) / HuggingFace Daily Papers / HuggingFace 트렌딩 모델을
 * 각각 RawItem[] 으로 정규화한다. 모두 fetchRss 와 동일한
 * (source: SourceConfig) => Promise<RawItem[]> 계약을 따른다.
 *
 * 외부 응답 스키마 변동에 대비해 누락 필드는 방어적으로 스킵한다.
 */
import type { RawItem } from "../../../src/lib/types";
import { loadPaperFilter } from "./paperFilter";
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

// --- GitHub (Search API · Trending) ----------------------------------------

/**
 * kind "github" 는 source.url 로 엔드포인트를 고른다.
 * - `https://api.github.com/search/repositories?q=...` → 검색(fetchGithubSearch)
 * - `https://github.com/trending?since=daily` → 트렌딩 페이지(fetchGithubTrending)
 * 둘 다 같은 모양(stars·language, 트렌딩은 stars_today 추가)의 RawItem 을 낸다.
 */
export async function fetchGithub(source: SourceConfig): Promise<RawItem[]> {
  const url = new URL(source.url);
  if (url.hostname === "github.com" && url.pathname.startsWith("/trending")) {
    return fetchGithubTrending(source, url);
  }
  return fetchGithubSearch(source, url);
}

interface GithubRepo {
  html_url?: string;
  full_name?: string;
  description?: string | null;
  stargazers_count?: number;
  language?: string | null;
  topics?: string[];
  pushed_at?: string;
  created_at?: string;
}

/** 검색 기간 창: 최근 이 기간 안에 생성된 저장소만. 날짜가 매일 바뀌므로 설정이 아니라 코드가 붙인다. */
const GITHUB_WINDOW_DAYS = 7;

/** GitHub REST API 공통 헤더. GITHUB_PAT 가 있으면 인증해 rate limit 을 넓힌다(검색 10→30/분, 일반 60→5000/시간). */
function githubApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "daily-ai-brief",
  };
  if (process.env.GITHUB_PAT) {
    headers.Authorization = `Bearer ${process.env.GITHUB_PAT}`;
  }
  return headers;
}

/**
 * 설명 + 토픽 한 줄. 예: "An LLM tool · topics: llm, rag, mcp". 토픽은 선별·가공 LLM 과 키워드 필터의 단서가 된다.
 * 토픽은 GitHub 가 저장소당 20개로 제한하고 알파벳순이라 자르지 않는다(앞쪽만 남기면 뒤쪽 "llm" 등을 놓친다).
 */
function githubSummary(description: string | null | undefined, topics: string[] = []): string {
  const desc = stripHtml(description ?? "");
  const tags = topics.join(", ");
  return [desc, tags && `topics: ${tags}`].filter(Boolean).join(" · ").slice(0, MAX_CONTENT_CHARS);
}

/**
 * GitHub Search: source.url 의 q(예: `topic:ai-agents,mcp stars:>=10`)에 `created:>{7일 전}` 을 붙여 1회 호출한다.
 * 토픽 OR 는 `topic:a,b` 쉼표로 쓴다 — 검색 API 의 OR 연산자는 한정자(qualifier)에 쓸 수 없다(422).
 * sort·order·per_page 는 url 에 없으면 stars 내림차순·30건.
 */
async function fetchGithubSearch(source: SourceConfig, url: URL): Promise<RawItem[]> {
  const q = url.searchParams.get("q")?.trim();
  if (!q) throw new Error("GitHub 검색 쿼리 없음(sources.json url 에 q= 필요)");
  const since = new Date(Date.now() - GITHUB_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10); // YYYY-MM-DD
  url.searchParams.set("q", `${q} created:>${since}`);
  if (!url.searchParams.has("sort")) {
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
  }
  if (!url.searchParams.has("per_page")) url.searchParams.set("per_page", "30");

  const res = await fetch(url, { headers: githubApiHeaders() });
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
      contentRaw: githubSummary(repo.description, repo.topics) || undefined,
      publishedAt,
      engagement: {
        stars: repo.stargazers_count ?? 0,
        ...(repo.language ? { language: repo.language } : {}),
      },
    });
  }
  return items;
}

/** 트렌딩 페이지에서 읽은 저장소 한 건. */
export interface TrendingRepo {
  fullName: string; // owner/repo
  description?: string;
  language?: string;
  stars?: number;
  starsToday?: number;
}

/** "1,234" → 1234. 숫자가 아니면 undefined. */
function parseCount(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * github.com/trending HTML → 저장소 목록. 저장소마다 `<article class="Box-row">` 블록 하나다.
 * 이름(h2 링크)·설명(p)·언어(itemprop=programmingLanguage)·누적 스타(/stargazers 링크)·"N stars today" 를 읽는다.
 * 이름이 없는 블록은 건너뛴다. 나머지 필드는 없을 수 있다(설명·언어가 빈 저장소).
 */
export function parseGithubTrending(html: string): TrendingRepo[] {
  const repos: TrendingRepo[] = [];
  for (const block of html.split('<article class="Box-row">').slice(1)) {
    const fullName = block.match(/<h2[^>]*>\s*<a[^>]*href="\/([^"/]+\/[^"/]+)"/)?.[1];
    if (!fullName) continue;
    const description = stripHtml(block.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/)?.[1]);
    repos.push({
      fullName,
      description: description || undefined,
      language: block.match(/itemprop="programmingLanguage">([^<]+)</)?.[1].trim(),
      stars: parseCount(block.match(/\/stargazers"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1]),
      starsToday: parseCount(block.match(/([\d,]+) stars? today/)?.[1]),
    });
  }
  return repos;
}

/**
 * 저장소 토픽 조회(REST /repos/{owner}/{repo}). 트렌딩 페이지에는 토픽이 없는데, 설명만으로는
 * AI 저장소를 놓친다(예: "DeepTutor: Lifelong Personalized Tutoring" — 토픽은 ai-agents·rag).
 * 실패하면 빈 배열 — 토픽은 보조 정보라 저장소를 버리지 않는다.
 */
async function fetchRepoTopics(fullName: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: githubApiHeaders(),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return [];
    }
    const repo = (await res.json()) as GithubRepo;
    return repo.topics ?? [];
  } catch {
    return [];
  }
}

/**
 * GitHub Trending(일간): github.com/trending 페이지를 1회 읽고, 저장소별 토픽을 REST 로 보탠다(하루 25건 안팎).
 * RSS 미러(mshibanami)는 README 를 싣지만 스타·언어·오늘 증가분이 없어 화제 지수와 레이더 메타 줄을 채울 수 없다.
 * 페이지에는 게시 시각이 없으므로 publishedAt 은 수집 시각이다(이미 본 저장소는 dedup 이 거른다).
 * 저장소 블록을 하나도 못 읽으면 마크업 변경으로 보고 실패시킨다 — 0건으로 조용히 넘어가지 않게.
 */
async function fetchGithubTrending(source: SourceConfig, url: URL): Promise<RawItem[]> {
  const res = await fetch(url, { headers: { "User-Agent": "daily-ai-brief" } });
  if (!res.ok) throw new Error(`GitHub Trending HTTP ${res.status}`);
  const repos = parseGithubTrending(await res.text());
  if (repos.length === 0) throw new Error("GitHub Trending 파싱 0건(마크업 변경 의심)");
  const topics = await Promise.all(repos.map((r) => fetchRepoTopics(r.fullName)));

  const publishedAt = new Date().toISOString();
  return repos.map((r, i) => ({
    sourceId: source.id,
    url: `https://github.com/${r.fullName}`,
    title: r.fullName,
    contentRaw: githubSummary(r.description, topics[i]) || undefined,
    publishedAt,
    engagement: {
      stars: r.stars ?? 0,
      ...(r.starsToday !== undefined ? { stars_today: r.starsToday } : {}),
      ...(r.language ? { language: r.language } : {}),
    },
  }));
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
 * upvotes 는 reddit ups 와 동일 신호로 트렌딩에 반영하고,
 * configs/paper-filter.json 의 hf.minUpvotes 미만 논문은 "유명한 것만" 필터로 제외한다.
 */
export async function fetchHf(source: SourceConfig): Promise<RawItem[]> {
  const { hf } = loadPaperFilter();
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
    if ((paper?.upvotes ?? 0) < hf.minUpvotes) continue; // upvote 임계값 미달 제외

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

// --- HuggingFace 트렌딩 모델 -------------------------------------------------

/** 모델 목록 API 응답 한 건(expand[] 로 요청한 필드만, 모두 누락 가능). */
interface HfModel {
  id?: string;
  createdAt?: string;
  likes?: number;
  downloads?: number; // 최근 30일 다운로드
  trendingScore?: number;
  pipeline_tag?: string | null;
  library_name?: string | null;
  tags?: string[];
  safetensors?: { total?: number };
  gguf?: { total?: number };
}

/** 생성 후 이 기간이 지난 모델은 "새 모델"이 아니므로 제외한다(오래된 스테디셀러가 트렌딩에 머무는 경우). */
const HF_MODEL_MAX_AGE_DAYS = 30;

/**
 * expand[] 는 기본 필드 세트를 대체하므로 쓰는 필드를 모두 나열한다.
 * cardData 는 설명문이 없고(라이선스·base_model 은 tags 에도 있다) 응답만 키워 받지 않는다.
 */
const HF_MODEL_FIELDS = [
  "createdAt",
  "likes",
  "downloads",
  "trendingScore",
  "pipeline_tag",
  "library_name",
  "tags",
  "safetensors", // 파라미터 수(total)
  "gguf", // safetensors 가 없는 GGUF 전용 리포의 파라미터 수
];

/** 파라미터 수 → "8B" / "1.7B" / "860M". 1M 미만은 표기하지 않는다. */
export function formatParams(n: number | undefined): string | undefined {
  if (!n || n < 1e6) return undefined;
  const [div, unit] = n >= 1e12 ? [1e12, "T"] : n >= 1e9 ? [1e9, "B"] : [1e6, "M"];
  const v = n / div;
  return `${v < 10 ? Math.round(v * 10) / 10 : Math.round(v)}${unit}`;
}

/** tags 에서 "접두어:값" 값 하나를 꺼낸다(예: license:mit → mit). */
function tagValue(tags: string[], prefix: string): string | undefined {
  const tag = tags.find((t) => t.startsWith(`${prefix}:`));
  return tag?.slice(prefix.length + 1);
}

/**
 * 목록 API 에는 모델 설명이 없으므로, 메타데이터로 사실만 담은 한 줄을 만들어 선별·가공 입력으로 쓴다.
 * 예: "text-generation · transformers · 8B · apache-2.0 · base: Qwen/Qwen3-8B (finetune)"
 * 파생 모델(양자화·파인튜닝)은 원본을 밝혀 LLM 이 같은 모델의 재업로드를 가려낼 수 있게 한다.
 */
function hfModelSummary(m: HfModel, params: number | undefined): string {
  const tags = m.tags ?? [];
  const license = tagValue(tags, "license");
  // "base_model:<관계>:<원본>" 태그(관계 = quantized|finetune|adapter|merge). 원본만 있는 태그는 관계를 알 수 없어 건너뛴다.
  const baseTag = tags.find((t) => /^base_model:[a-z_]+:/.test(t));
  const [, relation, base] = baseTag?.match(/^base_model:([a-z_]+):(.+)$/) ?? [];
  return [
    m.pipeline_tag,
    m.library_name,
    formatParams(params),
    license && license !== "other" ? license : undefined, // "other" 는 정보가 없어 생략
    base ? `base: ${base} (${relation})` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * HuggingFace 트렌딩 모델: source.url(목록 API, 예: ?sort=trendingScore&limit=30)을 1회 호출한다.
 * 생성 30일 이내 모델만 남긴다. 이미 본 모델은 collect.ts 의 dedup(articles·seen_items 30일)이 거른다.
 * publishedAt 은 createdAt 만 쓴다 — lastModified 는 커밋마다 바뀌어 오래된 모델을 새것처럼 보이게 하므로
 * createdAt 이 없으면 신선도를 판정할 수 없어 제외한다.
 * likes 는 트렌딩 신호, downloads·trendingScore 는 참고 신호로 engagement 에 싣고,
 * pipeline_tag·params 는 Phase 6 레이더 메타 줄용 표시 정보로 함께 저장한다(나중에 소급 수집할 수 없다).
 */
export async function fetchHfModels(source: SourceConfig): Promise<RawItem[]> {
  const url = new URL(source.url);
  for (const f of HF_MODEL_FIELDS) url.searchParams.append("expand[]", f);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HuggingFace models HTTP ${res.status}`);
  const data = (await res.json()) as HfModel[];

  const since = Date.now() - HF_MODEL_MAX_AGE_DAYS * 86_400_000;
  const items: RawItem[] = [];
  for (const m of data ?? []) {
    const id = m.id?.trim();
    const publishedAt = toIso(m.createdAt);
    if (!id || !publishedAt) continue;
    if (new Date(publishedAt).getTime() < since) continue; // 생성 30일 초과 제외

    const params = m.safetensors?.total ?? m.gguf?.total;
    items.push({
      sourceId: source.id,
      url: `https://huggingface.co/${id}`,
      title: id,
      contentRaw: hfModelSummary(m, params) || undefined,
      publishedAt,
      engagement: {
        likes: m.likes ?? 0,
        downloads: m.downloads ?? 0,
        hf_trending: m.trendingScore ?? 0,
        ...(m.pipeline_tag ? { pipeline_tag: m.pipeline_tag } : {}),
        ...(params ? { params } : {}),
      },
    });
  }
  return items;
}
