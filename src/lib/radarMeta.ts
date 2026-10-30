/**
 * 1면 "오픈소스·논문 레이더" 카드의 형식별 메타 줄(contents-upgrade-plan Phase 6-2) — 순수 함수.
 * - 리포(oss): owner/repo · ★ 스타 · 오늘 +증가분 · 주 언어
 * - 모델(model): org/model · 파라미터 · 태스크(pipeline_tag) · ♥ likes · ↓ downloads
 * - 논문(paper): arXiv ID · ▲ upvotes(HF Daily Papers) · 인용(arXiv/Semantic Scholar)
 * - 뉴스: 메타 줄 없음([])
 *
 * 값은 articles.engagement_json(수집 시점 메트릭)과 기사 URL 에서 꺼낸다. 없는 값은 항목째 빠진다.
 * 숫자 표기는 Intl·toLocaleString 없이 직접 만든다 — 빌드(Node ICU)와 브라우저의 출력이 갈리지 않게.
 */
import type { ArticleCard, Engagement } from "@/lib/types";

/** 메타 항목 종류. 렌더 쪽이 React key·스타일(식별자 vs 수치) 분기에 쓴다. */
export type RadarMetaKey =
  | "repo"
  | "stars"
  | "starsToday"
  | "language"
  | "model"
  | "params"
  | "task"
  | "likes"
  | "downloads"
  | "arxiv"
  | "upvotes"
  | "citations"
  | "source";

/** 메타 줄 한 칸. */
export interface RadarMetaItem {
  key: RadarMetaKey;
  /** 장식 기호(★ ♥ ↓ ▲). 렌더 시 aria-hidden 으로 두고 label 을 읽힌다. 없으면 생략. */
  icon?: string;
  /** 값 앞의 낱말(스타 증가분 "오늘", 인용 수 "인용"). 값만 굵게 그리도록 따로 둔다. 없으면 생략. */
  prefix?: string;
  /** 기호·낱말을 뺀 값(예: "12.4k", "+1,203", "Python"). 수치 항목은 tabular-nums 로 그린다. */
  value: string;
  /** 화면 표기 = icon · prefix · value 를 빈칸으로 이은 것(예: "★ 7,406", "오늘 +1,190"). */
  text: string;
  /** 스크린리더·title 용 한국어 문구(예: "스타 12,400개"). */
  label: string;
  /** 수치 항목 여부(tabular-nums 적용 대상). 식별자·언어·태스크는 false. */
  numeric: boolean;
}

export type RadarMetaInput = Pick<ArticleCard, "format" | "url" | "engagement">;

// --- 숫자 표기 ---------------------------------------------------------------

/**
 * 표시할 양의 정수. 0·음수·NaN·비숫자는 undefined — 수집기는 모르는 값을 0 으로 채우므로
 * (GitHub Trending 스타 파싱 실패 `?? 0`, HF likes·downloads `?? 0`) 0 은 "없음"으로 본다.
 */
function toCount(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
}

/** 정수 천 단위 쉼표(로케일 무관). 1203 → "1,203". */
export function groupDigits(n: number): string {
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 단위 표 [나눗수, 접미사] 로 축약한다. 값이 100 미만이면 소수 1자리(".0"은 생략), 이상이면 정수.
 * 반올림으로 1000 이 되면 다음 단위로 올린다(999,950 → "1M"). 정수 연산 후 나눠 부동소수 오차를 피한다.
 */
function scaled(n: number, units: readonly (readonly [number, string])[]): string {
  for (let i = 0; i < units.length; i++) {
    const [div, suffix] = units[i];
    if (n < div && i < units.length - 1) continue;
    let v = n / div < 100 ? Math.round((n * 10) / div) / 10 : Math.round(n / div);
    if (v >= 1000 && i > 0) {
      // 다음(큰) 단위로 승격: 1000k → 1M
      const [bigDiv, bigSuffix] = units[i - 1];
      v = Math.round((n * 10) / bigDiv) / 10;
      return `${v}${bigSuffix}`;
    }
    return `${v}${suffix}`;
  }
  return String(n);
}

const COUNT_UNITS = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"],
] as const;

/**
 * 개수 축약: 999 → "999", 1,000 → "1k", 1,234 → "1.2k", 12,400 → "12.4k", 124,000 → "124k",
 * 999,950 → "1M", 1,234,567 → "1.2M". 1000 미만은 그대로. 음수·비숫자는 "0".
 */
export function compactCount(n: number): string {
  const v = toCount(n) ?? 0;
  if (v < 1000) return String(v);
  return scaled(v, COUNT_UNITS);
}

const PARAM_UNITS = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
] as const;

/**
 * 파라미터 수 축약(모델 카드 관례): 8.03e9 → "8B", 1.54e9 → "1.5B", 70.6e9 → "71B", 3.5e8 → "350M".
 * 10 미만은 소수 1자리(".0" 생략), 이상은 정수. 1M 미만은 표기하지 않는다(undefined) — 수집기 formatParams 와 같은 규칙.
 */
export function formatParamCount(n: number | undefined): string | undefined {
  const v = toCount(n);
  if (v === undefined || v < 1e6) return undefined;
  for (let i = 0; i < PARAM_UNITS.length; i++) {
    const [div, suffix] = PARAM_UNITS[i];
    if (v < div) continue;
    let r = v / div < 10 ? Math.round((v * 10) / div) / 10 : Math.round(v / div);
    if (r >= 1000 && i > 0) {
      const [bigDiv, bigSuffix] = PARAM_UNITS[i - 1];
      r = Math.round((v * 10) / bigDiv) / 10;
      return `${r}${bigSuffix}`;
    }
    return `${r}${suffix}`;
  }
  return undefined;
}

/**
 * 레이더 메타 줄의 개수 표기(시안 결정 ⑨): 1만 미만은 쉼표 정수("7,406"), 이상은 축약("12.4k", "1.2M").
 * 작은 수까지 "7.4k"로 줄이면 자릿수 정보가 사라지고, 한 줄 폭은 1만 미만에서 충분하다.
 */
export function displayCount(n: number): string {
  const v = toCount(n) ?? 0;
  return v < 10_000 ? groupDigits(v) : compactCount(v);
}

/** 파라미터 수의 한국어 읽기(스크린리더용): 8.03e9 → "약 80억", 3.5e8 → "약 3.5억", 5e7 → "약 5,000만". */
function koreanApprox(n: number): string {
  const [div, unit] = n >= 1e12 ? [1e12, "조"] : n >= 1e8 ? [1e8, "억"] : [1e4, "만"];
  const v = n / div < 10 ? Math.round((n * 10) / div) / 10 : Math.round(n / div);
  return `약 ${v >= 1000 ? groupDigits(v) : v}${unit}`;
}

/** 증가분: 1만 미만은 쉼표 정수("+1,203"), 이상은 축약("+12.4k"). */
function formatDelta(n: number): string {
  return `+${displayCount(n)}`;
}

// --- URL 파싱 ----------------------------------------------------------------

/** URL → 경로 세그먼트(빈 칸 제거). 파싱 실패·호스트 불일치면 undefined. */
function pathSegments(url: string, hosts: readonly string[]): string[] | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!hosts.includes(host)) return undefined;
  return parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

/** github.com 최상위 경로 중 저장소 소유자가 아닌 것(트렌딩·토픽 페이지 등). */
const GITHUB_RESERVED = new Set([
  "trending",
  "topics",
  "collections",
  "orgs",
  "search",
  "features",
  "sponsors",
  "marketplace",
  "explore",
  "settings",
  "apps",
]);

/** GitHub 저장소 URL → "owner/repo". `.git`·끝 슬래시·쿼리·/tree/main 같은 하위 경로는 무시한다. */
export function parseGithubRepo(url: string): string | undefined {
  const segs = pathSegments(url, ["github.com"]);
  if (!segs || segs.length < 2) return undefined;
  const [owner, rawRepo] = segs;
  const repo = rawRepo.replace(/\.git$/i, "");
  if (!owner || !repo || GITHUB_RESERVED.has(owner.toLowerCase())) return undefined;
  return `${owner}/${repo}`;
}

/** huggingface.co 최상위 경로 중 모델 소유자가 아닌 것. */
const HF_RESERVED = new Set([
  "papers",
  "datasets",
  "spaces",
  "models",
  "blog",
  "docs",
  "collections",
  "organizations",
  "settings",
  "api",
  "learn",
  "posts",
  "tasks",
]);

/** HuggingFace 모델 URL(huggingface.co/<org>/<model>) → "org/model". 논문·데이터셋·스페이스 URL 은 undefined. */
export function parseHfModelId(url: string): string | undefined {
  const segs = pathSegments(url, ["huggingface.co", "hf.co"]);
  if (!segs || segs.length < 2) return undefined;
  const [org, model] = segs;
  if (HF_RESERVED.has(org.toLowerCase())) return undefined;
  return `${org}/${model}`;
}

/** 신형 arXiv ID(YYMM.NNNN[N]) + 선택 버전. */
const ARXIV_NEW_ID = /^(\d{4}\.\d{4,5})(v\d+)?(\.pdf)?$/i;

/**
 * 논문 URL → arXiv ID(버전 제외, 예: "2609.21967"). 지원하는 모양:
 * - arxiv.org/abs/<id>[vN], arxiv.org/pdf/<id>[vN][.pdf], arxiv.org/html/<id>[vN]
 * - huggingface.co/papers/<id> (HF Daily Papers)
 * - tldr.takara.ai/p/<id> (Takara TLDR)
 * 구형 ID(cs/0101001 등)와 그 밖의 URL 은 undefined.
 */
export function parseArxivId(url: string): string | undefined {
  const candidates: [string[], string][] = [
    [["arxiv.org", "export.arxiv.org"], "abs|pdf|html"],
    [["huggingface.co", "hf.co"], "papers"],
    [["tldr.takara.ai", "papers.takara.ai"], "p"],
  ];
  for (const [hosts, prefixes] of candidates) {
    const segs = pathSegments(url, hosts);
    if (!segs || segs.length < 2) continue;
    if (!prefixes.split("|").includes(segs[0].toLowerCase())) continue;
    return segs[1].match(ARXIV_NEW_ID)?.[1];
  }
  return undefined;
}

// --- 메타 줄 -----------------------------------------------------------------

function item(
  key: RadarMetaKey,
  value: string,
  label: string,
  numeric: boolean,
  icon?: string,
  prefix?: string,
): RadarMetaItem {
  return {
    key,
    ...(icon ? { icon } : {}),
    ...(prefix ? { prefix } : {}),
    value,
    text: [icon, prefix, value].filter(Boolean).join(" "),
    label,
    numeric,
  };
}

/** 비어 있지 않은 문자열만. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function repoMeta(url: string, e: Engagement): RadarMetaItem[] {
  const out: RadarMetaItem[] = [];
  const repo = parseGithubRepo(url);
  if (repo) out.push(item("repo", repo, `저장소 ${repo}`, false));
  const stars = toCount(e.stars);
  if (stars) {
    out.push(item("stars", displayCount(stars), `스타 ${groupDigits(stars)}개`, true, "★"));
  }
  const today = toCount(e.stars_today);
  if (today) {
    out.push(
      item(
        "starsToday",
        formatDelta(today),
        `오늘 스타 ${groupDigits(today)}개 증가`,
        true,
        undefined,
        "오늘",
      ),
    );
  }
  const language = str(e.language);
  if (language) out.push(item("language", language, `주 언어 ${language}`, false));
  return out;
}

function modelMeta(url: string, e: Engagement): RadarMetaItem[] {
  const out: RadarMetaItem[] = [];
  const id = parseHfModelId(url);
  if (id) out.push(item("model", id, `모델 ${id}`, false));
  const params = toCount(e.params);
  const paramText = formatParamCount(params);
  if (params && paramText) {
    out.push(item("params", paramText, `파라미터 ${koreanApprox(params)} 개`, true));
  }
  const task = str(e.pipeline_tag);
  if (task) out.push(item("task", task, `태스크 ${task}`, false));
  const likes = toCount(e.likes);
  if (likes) {
    out.push(item("likes", displayCount(likes), `좋아요 ${groupDigits(likes)}개`, true, "♥"));
  }
  const downloads = toCount(e.downloads);
  if (downloads) {
    out.push(
      item(
        "downloads",
        displayCount(downloads),
        `최근 30일 다운로드 ${groupDigits(downloads)}회`,
        true,
        "↓",
      ),
    );
  }
  return out;
}

function paperMeta(url: string, e: Engagement): RadarMetaItem[] {
  const out: RadarMetaItem[] = [];
  const id = parseArxivId(url);
  if (id) out.push(item("arxiv", `arXiv ${id}`, `arXiv ${id}`, false));
  const ups = toCount(e.ups);
  if (ups) out.push(item("upvotes", displayCount(ups), `추천 ${groupDigits(ups)}개`, true, "▲"));
  const citations = toCount(e.citations);
  if (citations) {
    out.push(
      item(
        "citations",
        displayCount(citations),
        `인용 ${groupDigits(citations)}회`,
        true,
        undefined,
        "인용",
      ),
    );
  }
  return out;
}

/**
 * 레이더 카드 메타 줄 — 형식별로 순서가 정해진 표시 항목 목록. 뉴스·알 수 없는 형식은 [].
 * 식별자(owner/repo·org/model·arXiv ID)는 URL 에서 읽혀야 맨 앞에 붙는다.
 * 수치가 0 이거나 숫자가 아니면 그 칸은 뺀다(수집기가 모르는 값을 0 으로 채우기 때문 — toCount 참고).
 *
 * @example
 * radarMeta({ format: "oss", url: "https://github.com/vllm-project/vllm",
 *   engagement: { stars: 48836, stars_today: 1203, language: "Python" } }).map((m) => m.text)
 * // → ["vllm-project/vllm", "★ 48.8k", "오늘 +1,203", "Python"]
 */
export function radarMeta(article: RadarMetaInput): RadarMetaItem[] {
  const e: Engagement = article.engagement ?? {};
  switch (article.format) {
    case "oss":
      return repoMeta(article.url, e);
    case "model":
      return modelMeta(article.url, e);
    case "paper":
      return paperMeta(article.url, e);
    default:
      return [];
  }
}

/** 식별자 항목(owner/repo · org/model · arXiv ID) — 카드에서 수치 줄 위에 따로 한 줄로 놓는다. */
const ID_KEYS: ReadonlySet<RadarMetaKey> = new Set(["repo", "model", "arxiv"]);

/** 레이더 카드 메타 블록: 식별자 한 줄(id) + 수치·속성 줄(stats). */
export interface RadarMetaBlock {
  id?: RadarMetaItem;
  stats: RadarMetaItem[];
}

/**
 * 카드 렌더용 메타 블록(시안 결정 ⑧·⑩). 값이 없는 조각만 빠지고, 수치가 하나도 없으면 식별자 한 줄만,
 * 식별자도 수치도 없으면 매체명을 식별자 자리에 둔다(뉴스가 아닌 한 메타 블록은 늘 한 줄 이상).
 */
export function radarMetaBlock(
  article: RadarMetaInput & { source: { name: string } },
  sourceName: string = article.source.name,
): RadarMetaBlock {
  const items = radarMeta(article);
  const id = items.find((m) => ID_KEYS.has(m.key));
  const stats = items.filter((m) => !ID_KEYS.has(m.key));
  if (!id && stats.length === 0) {
    return { id: item("source", sourceName, `출처 ${sourceName}`, false), stats };
  }
  return id ? { id, stats } : { stats };
}
