/**
 * 집계 API 수집 어댑터. PRD §3.1.
 * Hacker News(Algolia) / GitHub Search / HuggingFace Daily Papers / HuggingFace 트렌딩 모델을
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
