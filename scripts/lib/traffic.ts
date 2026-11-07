/**
 * 방문 집계(GoatCounter) — `npm run kpi -- traffic` 용(english-version-plan Phase 8-1: /en/ 경로 방문 비율·국가 분포).
 * 출력은 scripts/lib/trafficReport.ts, CLI 는 scripts/kpi.ts `traffic()`.
 *
 * 두 가지 읽기 방식:
 *  - API 모드(GOATCOUNTER_API_TOKEN 있음): GoatCounter API v0(https://www.goatcounter.com/api.json, OpenAPI 2.0)
 *      GET /api/v0/stats/total            기간 방문 합계(total − total_events)
 *      GET /api/v0/stats/hits             경로별 방문(방문 많은 순, limit ≤ 100, 다음 쪽은 exclude_paths=<받은 path_id,…>)
 *      GET /api/v0/stats/locations        국가 분포(include_paths=<영어판 path_id,…> 로 영어판만)
 *      GET /api/v0/stats/toprefs          유입 경로(ref_scheme c = ?ref=·utm_source 캠페인 태그)
 *      GET /api/v0/stats/campaigns        utm_campaign 값
 *    인증은 `Authorization: Bearer <토큰>`(권한 "Read statistics"), 한도 초당 4회 — 요청 간격을 두고 429 면
 *    Retry-After·X-Rate-Limit-Reset 만큼 기다려 다시 보낸다. start/end 는 정시로 맞춘 UTC RFC3339.
 *  - 공개 카운터 모드(토큰 없음 — 자동 대체): 라이브 사이트맵(인덱스 → 조각)의 모든 주소마다
 *    GET <GOATCOUNTER_URL>/counter/<encodeURIComponent(경로)>.json?start=YYYY-MM-DD[&end=YYYY-MM-DD]
 *    → {"count":"1,234"}(천 단위 구분자 문자열, 방문 없는 경로는 404). TOTAL.json 이 사이트 합계다.
 *    국가·유입 경로는 토큰이 있어야 한다. 카운터 응답은 최대 4시간 캐시되고 날짜 경계는 GoatCounter 쪽 해석이라 근사치다.
 *
 * GoatCounter 2.x 의 수는 모두 "방문자"(경로마다 세션당 1회)다 — 페이지뷰는 따로 세지 않는다. 경로별 합은 경로마다
 * 센 방문의 합이라 사이트 합계(stats/total·TOTAL)와 같은 셈이다.
 *
 * 집계 경로는 실제 주소(basePath + 끝 슬래시, 쿼리 없음 — src/components/Analytics.tsx countPath)다.
 * 네트워크 함수는 fetch·sleep 을 주입받는다(테스트는 가짜 fetch, 네트워크 없음). 판정·합산은 순수 함수.
 */
import { isArchivedIssueDate } from "../../src/lib/archive";
import { kstDateKey } from "../../src/lib/labels";
import { GOATCOUNTER_URL } from "../../src/lib/site";

/** 사이트 주소(next.config.ts SITE_ORIGIN + BASE_PATH 와 같은 값) — 사이트맵을 받고 경로를 가른다. */
export const TRAFFIC_SITE_ORIGIN = "https://sguys99.github.io";
export const TRAFFIC_BASE_PATH = "/global-ai-news";
export const TRAFFIC_SITEMAP_URL = `${TRAFFIC_SITE_ORIGIN}${TRAFFIC_BASE_PATH}/sitemap.xml`;
export { GOATCOUNTER_URL };

/** 언어판: basePath 아래 /en/ 은 영어, 나머지 basePath 아래는 한국어, 그 밖(다른 사이트·옛 경로)은 따로. */
export type TrafficLang = "ko" | "en" | "outside";
export const PAGE_KINDS = ["home", "edition", "article", "archive", "search", "other"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/** 보관 판정 재료 — DB 보관 계획(getArchivePlan)에서. 없으면 호만 날짜로 가르고 기사는 전부 "기사"다. */
export interface ArchiveInfo {
  latestEditionDate: string | null;
  /** null 이면 기사 보관 여부를 모른다(DB 없음). */
  archivedArticleIds: ReadonlySet<number> | null;
}

export interface PathCount {
  path: string;
  count: number;
  title?: string;
  pathId?: number;
}

export interface StatRow {
  /** 국가 코드(locations)·유입 id 등. */
  id?: string;
  name: string;
  count: number;
  /** toprefs: h 리퍼러 헤더 · g 묶음(Google 등) · c 캠페인(?ref=·utm_source) · o 기타. */
  refScheme?: string;
}

export interface TrafficWindow {
  /** API 용 UTC 시각(정시). end 는 배타. */
  start: Date;
  end: Date;
  /** KST 날짜 표기(포함 범위) — 보고서·공개 카운터 start/end. */
  startDate: string;
  endDate: string;
  /** 지금까지 포함(--since)인지 — 아니면 어제까지 꽉 찬 날만. */
  untilNow: boolean;
  days: number;
}

export interface TrafficData {
  mode: "api" | "public";
  window: TrafficWindow;
  /** 사이트 합계(이벤트 제외). 못 받았으면 null. */
  total: number | null;
  /** 방문이 있는 경로(이벤트 제외). */
  paths: PathCount[];
  /** API: 경로 목록을 쪽 상한에서 끊었는지 · 공개: 실패한 카운터가 있는지. */
  pathsIncomplete: boolean;
  /** 공개 모드: 조회한 주소 수. */
  checked?: number;
  /** null = 이 모드에서 볼 수 없음(토큰 필요). */
  countries: StatRow[] | null;
  countriesEn: StatRow[] | null;
  referrers: StatRow[] | null;
  campaigns: StatRow[] | null;
  notes: string[];
}

// ── 인자 ─────────────────────────────────────────────────────────────────

export interface TrafficArgs {
  days: number;
  since: string | null;
  ci: boolean;
  json: boolean;
  /** 토큰이 있어도 공개 카운터로 읽는다(비교·점검용). */
  forcePublic: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `traffic [days=14] [--since YYYY-MM-DD] [--ci] [--json] [--public]` (traffic 뒤 인자). 잘못된 값은 던진다. */
export function parseTrafficArgs(argv: readonly string[]): TrafficArgs {
  const args: TrafficArgs = { days: 14, since: null, ci: false, json: false, forcePublic: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ci") args.ci = true;
    else if (a === "--json") args.json = true;
    else if (a === "--public") args.forcePublic = true;
    else if (a === "--since") {
      const v = argv[++i];
      if (!v || !DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
        throw new Error(`--since 는 YYYY-MM-DD 여야 한다: ${v ?? "(없음)"}`);
      }
      args.since = v;
    } else if (/^\d+$/.test(a)) {
      const n = Number(a);
      if (n < 1 || n > 366) throw new Error(`기간(일)은 1~366: ${a}`);
      args.days = n;
    } else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return args;
}

// ── 기간 ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
/** 'YYYY-MM-DD' ± n일. */
export const addDays = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** KST 날짜의 0시(UTC 시각) — KST 는 정시 오프셋이라 늘 정시다. */
const kstMidnight = (key: string) => new Date(Date.parse(`${key}T00:00:00+09:00`));

/**
 * 집계 기간. 기본은 어제까지 꽉 찬 KST N일([오늘−N, 오늘)) — 주간 실행(월요일 아침, 7일)이 지난주 월~일과 정확히 맞는다.
 * `since` 가 있으면 그 날 0시(KST)부터 지금(다음 정시)까지 — 배포 뒤 관찰용, 오늘 방문도 든다.
 */
export function trafficWindow({
  days,
  since,
  now = new Date(),
}: {
  days: number;
  since?: string | null;
  now?: Date;
}): TrafficWindow {
  const today = kstDateKey(now);
  if (since) {
    const end = new Date(Math.ceil(now.getTime() / HOUR_MS) * HOUR_MS);
    const span =
      Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / DAY_MS) +
      1;
    return {
      start: kstMidnight(since),
      end,
      startDate: since,
      endDate: today,
      untilNow: true,
      days: Math.max(span, 1),
    };
  }
  const startDate = addDays(today, -days);
  return {
    start: kstMidnight(startDate),
    end: kstMidnight(today),
    startDate,
    endDate: addDays(today, -1),
    untilNow: false,
    days,
  };
}

/** GoatCounter API 시각 표기(대시보드 클라이언트와 같은 `2006-01-02T15:04:05Z`). */
export const apiTime = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

// ── 경로 판정 ─────────────────────────────────────────────────────────────

export interface PathClass {
  lang: TrafficLang;
  kind: PageKind;
}

/**
 * 집계 경로 → 언어판·페이지 종류. 쿼리·해시는 떼고 끝 슬래시는 있든 없든 같다.
 * 보관 지면은 같은 주소의 호·기사라 경로로는 모른다 → 호는 날짜를 `archive.latestEditionDate` 와, 기사는 id 를 보관 목록과 맞춘다.
 */
export function classifyPath(rawPath: string, archive?: ArchiveInfo | null): PathClass {
  const path = rawPath.split(/[?#]/)[0];
  if (path !== TRAFFIC_BASE_PATH && !path.startsWith(`${TRAFFIC_BASE_PATH}/`)) {
    return { lang: "outside", kind: "other" };
  }
  let rest = path.slice(TRAFFIC_BASE_PATH.length) || "/";
  let lang: TrafficLang = "ko";
  if (rest === "/en" || rest.startsWith("/en/")) {
    lang = "en";
    rest = rest.slice(3) || "/";
  }
  if (!rest.endsWith("/")) rest += "/";
  if (rest === "/" || rest === "/index.html/") return { lang, kind: "home" };
  if (rest === "/search/") return { lang, kind: "search" };
  const edition = /^\/edition\/(\d{4}-\d{2}-\d{2})\/$/.exec(rest);
  if (edition) {
    const archived = isArchivedIssueDate(edition[1], archive?.latestEditionDate ?? null);
    return { lang, kind: archived ? "archive" : "edition" };
  }
  const article = /^\/article\/(\d+)\/$/.exec(rest);
  if (article) {
    const archived = archive?.archivedArticleIds?.has(Number(article[1])) ?? false;
    return { lang, kind: archived ? "archive" : "article" };
  }
  return { lang, kind: "other" };
}

// ── 합산 ─────────────────────────────────────────────────────────────────

type ByKind = Record<PageKind, number>;
const emptyKinds = (): ByKind => Object.fromEntries(PAGE_KINDS.map((k) => [k, 0])) as ByKind;

export interface TrafficSummary {
  /** 사이트 합계(없으면 경로 합). */
  total: number;
  /** 받은 경로 방문 합. */
  pathSum: number;
  byLang: Record<TrafficLang, number>;
  byKind: Record<"ko" | "en", ByKind>;
  /** 합계 − 경로 합: API 는 상한 밖 경로, 공개 모드는 사이트맵에 없는 경로(basePath 밖 포함). 합계를 모르면 null. */
  unlisted: number | null;
  /** 영어판 / (한국어판 + 영어판). 둘 다 0 이면 null. */
  enShare: number | null;
  topPages: Record<"ko" | "en", PathCount[]>;
}

export function summarizeTraffic(
  paths: readonly PathCount[],
  total: number | null,
  archive?: ArchiveInfo | null,
  topN = 10,
): TrafficSummary {
  const byLang: Record<TrafficLang, number> = { ko: 0, en: 0, outside: 0 };
  const byKind = { ko: emptyKinds(), en: emptyKinds() };
  const top: Record<"ko" | "en", PathCount[]> = { ko: [], en: [] };
  let pathSum = 0;
  for (const p of paths) {
    if (p.count <= 0) continue;
    const { lang, kind } = classifyPath(p.path, archive);
    pathSum += p.count;
    byLang[lang] += p.count;
    if (lang !== "outside") {
      byKind[lang][kind] += p.count;
      top[lang].push(p);
    }
  }
  const sortTop = (list: PathCount[]) =>
    [...list].sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)).slice(0, topN);
  const langSum = byLang.ko + byLang.en;
  return {
    total: total ?? pathSum,
    pathSum,
    byLang,
    byKind,
    unlisted: total === null ? null : Math.max(total - pathSum, 0),
    enShare: langSum ? byLang.en / langSum : null,
    topPages: { ko: sortTop(top.ko), en: sortTop(top.en) },
  };
}

/** 같은 이름(국가 등)끼리 더해 많은 순 — 영어판 국가를 path_id 묶음별로 받아 합칠 때. */
export function mergeStats(groups: readonly (readonly StatRow[])[]): StatRow[] {
  const map = new Map<string, StatRow>();
  for (const rows of groups) {
    for (const r of rows) {
      const key = r.id || r.name;
      const prev = map.get(key);
      if (prev) prev.count += r.count;
      else map.set(key, { ...r });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** 유입 채널(공유 태그 `?ref=hn` 등과 리퍼러 도메인) — 보고서에서 눈에 띄게. 모르면 null. */
const CHANNELS: [RegExp, string][] = [
  [/^hn$|hacker ?news|news\.ycombinator\.com/i, "Hacker News"],
  [/reddit/i, "Reddit"],
  [/^x$|^x\.com|\bt\.co\b|twitter/i, "X"],
  [/linkedin|lnkd\.in/i, "LinkedIn"],
  [/threads/i, "Threads"],
  [/facebook|^fb$/i, "Facebook"],
  [/kakao/i, "카카오"],
  [/naver/i, "네이버"],
  [/daum/i, "다음"],
  [/google/i, "Google"],
  [/bing/i, "Bing"],
  [/duckduckgo/i, "DuckDuckGo"],
  [/github/i, "GitHub"],
  [/feed|rss|feedly|inoreader/i, "RSS"],
];

export function referrerChannel(name: string): string | null {
  const n = name.trim();
  for (const [re, label] of CHANNELS) if (re.test(n)) return label;
  return null;
}

// ── 네트워크 공용 ─────────────────────────────────────────────────────────

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 429 응답의 대기 시간(ms) — Retry-After(초) → X-Rate-Limit-Reset(초) → 1초. 최대 30초. */
export function retryDelayMs(res: Response): number {
  for (const h of ["retry-after", "x-rate-limit-reset"]) {
    const v = Number(res.headers.get(h));
    if (Number.isFinite(v) && v > 0) return Math.min(v * 1000, 30_000);
  }
  return 1000;
}

const MAX_RETRIES = 5;

async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  fetchFn: FetchLike,
  sleep: Sleep,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url, init);
    if (res.status !== 429 || attempt >= MAX_RETRIES) return res;
    await sleep(retryDelayMs(res));
  }
}

const excerpt = (text: string, n = 160) => text.replace(/\s+/g, " ").trim().slice(0, n);

// ── API 모드 ─────────────────────────────────────────────────────────────

export interface ApiOptions {
  token: string;
  baseUrl?: string;
  fetch?: FetchLike;
  sleep?: Sleep;
  /** 요청 간격(ms) — 한도 초당 4회. */
  minIntervalMs?: number;
}

/** stats/hits 쪽 상한(쪽당 100 경로). 넘으면 방문 적은 경로가 빠진다 — 합계와의 차는 "목록 밖"으로 보인다. */
export const MAX_HIT_PAGES = 10;
const HITS_LIMIT = 100;
/** include_paths 묶음 크기(주소 길이). */
const INCLUDE_CHUNK = 100;

type Query = Record<string, string | number | boolean | undefined>;

export function createApiClient(opts: ApiOptions) {
  const base = `${(opts.baseUrl ?? GOATCOUNTER_URL).replace(/\/$/, "")}/api/v0`;
  const fetchFn = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? realSleep;
  const interval = opts.minIntervalMs ?? 260;
  let last = 0;
  return async function get<T>(path: string, query: Query = {}): Promise<T> {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    const url = `${base}${path}${qs ? `?${qs}` : ""}`;
    const wait = last + interval - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetchWithRetry(
      url,
      { headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" } },
      fetchFn,
      sleep,
    );
    const body = await res.text();
    if (!res.ok) {
      const hint =
        res.status === 401
          ? " — 토큰이 없거나 틀림"
          : res.status === 403
            ? ' — 토큰에 "Read statistics" 권한 없음'
            : res.status === 404
              ? " — 계정 이메일 인증 전이면 API 가 404 를 준다(GoatCounter → API 탭 Resend email)"
              : "";
      throw new Error(`GoatCounter API ${path} ${res.status}${hint}: ${excerpt(body)}`);
    }
    return JSON.parse(body) as T;
  };
}

type ApiGet = ReturnType<typeof createApiClient>;

interface ApiHit {
  path: string;
  path_id?: number;
  count?: number;
  event?: boolean;
  title?: string;
}
interface ApiStat {
  id?: string;
  name?: string;
  count?: number;
  ref_scheme?: string;
}

const toStat = (s: ApiStat): StatRow => ({
  id: s.id || undefined,
  name: s.name || s.id || "(알 수 없음)",
  count: s.count ?? 0,
  refScheme: s.ref_scheme || undefined,
});

async function listStats(get: ApiGet, page: string, range: Query, limit: number, include?: string) {
  const res = await get<{ stats?: ApiStat[]; more?: boolean }>(`/stats/${page}`, {
    ...range,
    limit,
    include_paths: include,
  });
  return (res.stats ?? []).map(toStat);
}

export async function fetchApiTraffic(
  window: TrafficWindow,
  opts: ApiOptions,
): Promise<TrafficData> {
  const get = createApiClient(opts);
  const range: Query = { start: apiTime(window.start), end: apiTime(window.end) };
  const notes: string[] = [];

  const totalRes = await get<{ total?: number; total_events?: number }>("/stats/total", range);
  const total = Math.max((totalRes.total ?? 0) - (totalRes.total_events ?? 0), 0);

  // 경로별 방문 — 방문 많은 순, 다음 쪽은 받은 path_id 를 빼고 다시 묻는다(GoatCounter 대시보드와 같은 방식).
  const paths: PathCount[] = [];
  const seen: number[] = [];
  let more = true;
  let pages = 0;
  while (more && pages < MAX_HIT_PAGES) {
    const res = await get<{ hits?: ApiHit[]; more?: boolean }>("/stats/hits", {
      ...range,
      limit: HITS_LIMIT,
      exclude_paths: seen.length ? seen.join(",") : undefined,
    });
    pages++;
    const hits = res.hits ?? [];
    for (const h of hits) {
      if (typeof h.path_id === "number") seen.push(h.path_id);
      if (h.event) continue;
      paths.push({
        path: h.path,
        count: h.count ?? 0,
        title: h.title || undefined,
        pathId: h.path_id,
      });
    }
    more = Boolean(res.more) && hits.length > 0;
  }
  if (more)
    notes.push(
      `경로 목록을 ${MAX_HIT_PAGES * HITS_LIMIT}개에서 끊었다 — 나머지는 "목록 밖"에 든다.`,
    );

  const countries = await listStats(get, "locations", range, 100);
  const enIds = paths
    .filter((p) => p.pathId !== undefined && classifyPath(p.path).lang === "en")
    .map((p) => p.pathId as number);
  const enGroups: StatRow[][] = [];
  for (let i = 0; i < enIds.length; i += INCLUDE_CHUNK) {
    enGroups.push(
      await listStats(get, "locations", range, 100, enIds.slice(i, i + INCLUDE_CHUNK).join(",")),
    );
  }
  const referrers = await listStats(get, "toprefs", range, 30);
  const campaigns = await listStats(get, "campaigns", range, 20);

  return {
    mode: "api",
    window,
    total,
    paths,
    pathsIncomplete: more,
    countries,
    countriesEn: mergeStats(enGroups),
    referrers,
    campaigns,
    notes,
  };
}

// ── 공개 카운터 모드 ───────────────────────────────────────────────────────

const locs = (xml: string) =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

/** 라이브 사이트맵 인덱스 → 조각 → 페이지 경로(중복 없음, 사이트맵 순). */
export async function sitemapPaths(
  sitemapUrl: string = TRAFFIC_SITEMAP_URL,
  fetchFn: FetchLike = fetch,
): Promise<string[]> {
  const read = async (url: string) => {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`사이트맵 ${url} ${res.status}`);
    return res.text();
  };
  const index = await read(sitemapUrl);
  const children = /<sitemapindex[\s>]/.test(index) ? locs(index) : [];
  const xmls = children.length ? await Promise.all(children.map(read)) : [index];
  const out = new Set<string>();
  for (const xml of xmls) for (const u of locs(xml)) out.add(new URL(u).pathname);
  return [...out];
}

/** 카운터 count 문자열("1,234"·"1 234"·"1.234") → 수. */
export const parseCount = (v: unknown) => Number(String(v ?? "0").replace(/[^\d]/g, "")) || 0;

export interface PublicOptions {
  fetch?: FetchLike;
  sleep?: Sleep;
  counterBase?: string;
  sitemapUrl?: string;
  concurrency?: number;
  /** 미리 받은 경로(테스트·재사용) — 없으면 사이트맵에서. */
  paths?: string[];
}

export function counterUrl(path: string, window: TrafficWindow, base = GOATCOUNTER_URL): string {
  const name = path === "TOTAL" ? "TOTAL" : encodeURIComponent(path);
  const qs = `start=${window.startDate}${window.untilNow ? "" : `&end=${window.endDate}`}`;
  return `${base.replace(/\/$/, "")}/counter/${name}.json?${qs}`;
}

export async function fetchPublicTraffic(
  window: TrafficWindow,
  opts: PublicOptions = {},
): Promise<TrafficData> {
  const fetchFn = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? realSleep;
  const base = opts.counterBase ?? GOATCOUNTER_URL;
  const list = opts.paths ?? (await sitemapPaths(opts.sitemapUrl, fetchFn));
  const failures: string[] = [];

  /** 방문 수(없는 경로 404 → 0). 실패면 null. */
  const counter = async (path: string): Promise<number | null> => {
    try {
      const res = await fetchWithRetry(counterUrl(path, window, base), undefined, fetchFn, sleep);
      const body = await res.text();
      if (res.status === 404) return 0;
      if (!res.ok) throw new Error(`${res.status} ${excerpt(body, 80)}`);
      return parseCount((JSON.parse(body) as { count?: unknown }).count);
    } catch (err) {
      failures.push(`${path}: ${(err as Error).message}`);
      return null;
    }
  };

  const totalRaw = await counter("TOTAL");
  const paths: PathCount[] = [];
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const path = list[next++];
      const count = await counter(path);
      if (count) paths.push({ path, count });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 6) }, worker));

  const notes = [
    "공개 카운터 모드(GOATCOUNTER_API_TOKEN 없음) — 사이트맵 주소마다 카운터를 읽었다. 국가·유입 경로는 토큰이 있어야 한다.",
    "카운터는 날짜 단위(GoatCounter 쪽 날짜 해석)이고 응답이 최대 4시간 캐시된다 — 근사치.",
  ];
  if (failures.length) {
    notes.push(
      `카운터 실패 ${failures.length}건(합에서 빠짐): ${failures.slice(0, 3).join(" · ")}${failures.length > 3 ? " …" : ""}`,
    );
  }
  return {
    mode: "public",
    window,
    total: totalRaw,
    paths,
    pathsIncomplete: failures.length > 0,
    checked: list.length,
    countries: null,
    countriesEn: null,
    referrers: null,
    campaigns: null,
    notes,
  };
}
