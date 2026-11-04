/**
 * HTML 회귀 비교의 순수 부품(english-version-plan Phase 3-1). CLI 는 scripts/html-regress.ts.
 *
 * - 정규화: 정적 export HTML 을 "보이는 것·SEO 에 쓰이는 것"만 남긴 줄 단위 텍스트로 바꾼다.
 *   빼는 것 = 빌드마다·구조 변경마다 달라지지만 화면에 안 보이는 것(아래 normalizeHtml 주석).
 * - 비교: Myers 줄 diff → unified 형식 hunk. 허용 목록(의도된 차이)은 차이를 보여 주되 실패로 세지 않는다.
 * - 페이지 목록(manifest): 기준선·후보가 같은 페이지를 보도록 경로를 고정한다(configs/html-regress-pages.json).
 *
 * DOM 파서는 이미 devDependency 인 jsdom 을 쓴다(타입 패키지가 없어 필요한 모양만 선언).
 */
import { createRequire } from "node:module";

// ── 파서 ────────────────────────────────────────────────────────────────

type JsdomCtor = new (html: string) => { window: { document: Document; close(): void } };
const nodeRequire = createRequire(import.meta.url);
let JSDOMClass: JsdomCtor | null = null;

function parseDocument(html: string): { document: Document; close(): void } {
  JSDOMClass ??= (nodeRequire("jsdom") as { JSDOM: JsdomCtor }).JSDOM;
  const dom = new JSDOMClass(html);
  return { document: dom.window.document, close: () => dom.window.close() };
}

// DOM 노드 종류(전역 Node 상수는 tsx 실행 환경에 없다).
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// ── 정규화 ──────────────────────────────────────────────────────────────

export interface NormalizeOptions {
  /**
   * 텍스트 모드(Phase 4 클래스 이름 변경용): class·style 속성을 빼고 구조·텍스트·나머지 속성만 비교한다.
   * 기본(false)은 class 까지 비교한다 — Phase 3 "한 글자도 안 바뀜" 확인용.
   */
  text?: boolean;
}

/** 줄바꿈 없이 붙여 쓰는 void 요소. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/** 공백을 그대로 보존해야 하는 요소. */
const PRE_TAGS = new Set(["pre", "textarea"]);

/** 빌드 산출물 참조라 해시만 다른 `<link rel>` — 통째로 뺀다(CSS·청크 분할은 화면이 아니라 번들 문제). */
const DROPPED_LINK_RELS = new Set(["preload", "modulepreload", "stylesheet", "prefetch"]);

/**
 * 시각에 따라 정적 HTML 에 들어갔다 빠지는 "발행 지연" 안내(IssueDelayNotice, 홈 전용)의 라벨.
 * 홈은 빌드 시각(Date.now)으로 initialDelayGap 을 계산해 넣으므로, 같은 커밋·같은 DB 라도
 * 08:00 KST(다음 날) 이후에 빌드하면 안내 줄이 생긴다 → 비교에서 뺀다. 문구는 src/lib/labels.ts issueDelayCopy.
 * 영어판(Phase 5)이 생기면 영어 라벨을 여기에 더한다.
 */
export const VOLATILE_STATUS_LABELS = ["발행 전", "발행 지연"] as const;

/** next/font 가 호출 위치마다 붙이는 해시 클래스(`__variable_1a2b3c`, `__className_1a2b3c`). */
const FONT_CLASS_RE = /^(__variable|__className)_[0-9a-f]+$/;

/** React useId 값(18 `:R1:` · 19.0~19.1 `«R1»` · 19.2 `_R_1_`) — 트리 위치가 바뀌면 값만 바뀐다. */
const USE_ID_RE = /«[^»]*»|:[Rr][0-9A-Za-z]*:|_[Rr]_[0-9A-Za-z]*_/g;

/** 속성값 안의 빌드 해시: `_next/static/<무엇이든>` 과 아이콘 등의 `?<16진 해시>` 캐시 버스터. */
function normalizeUrlish(value: string): string {
  return value
    .replace(/\/_next\/static\/[^\s"',)]+/g, "/_next/static/#")
    .replace(/\?[0-9a-f]{8,}(?=$|[\s"',)])/g, "?#");
}

function collapseWs(s: string): string {
  return s.replace(/[ \t\n\r\f]+/g, " ");
}

/** 텍스트 노드에 적용하는 시각 의존 치환(푸터 `© 2026` — 해가 바뀌면 같은 커밋도 달라진다). */
function normalizeVolatileText(s: string): string {
  return s.replace(/©(\s*)\d{4}/g, "©$1YYYY");
}

function isVolatileStatus(el: Element): boolean {
  if (el.getAttribute("role") !== "status") return false;
  const text = collapseWs(el.textContent ?? "").trim();
  return VOLATILE_STATUS_LABELS.some((label) => text.startsWith(label));
}

/** 빼는 요소인가 — 스크립트(RSC 페이로드·청크), 해시 link, 빈 hidden div, 발행 지연 안내. */
function isDropped(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "script") return el.getAttribute("type") !== "application/ld+json";
  if (tag === "link") {
    const rels = (el.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    return rels.some((r) => DROPPED_LINK_RELS.has(r));
  }
  // Next 메타데이터 경계(`<div hidden><!--$--><!--/$--></div>`) — 비어 있고 안 보인다. 레이아웃 단계가 바뀌면 위치만 옮겨 다닌다.
  if (
    tag === "div" &&
    el.hasAttribute("hidden") &&
    !el.children.length &&
    !el.textContent?.trim()
  ) {
    return true;
  }
  return isVolatileStatus(el);
}

function quoteAttr(v: string): string {
  return `"${v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;")}"`;
}

/** 페이지 안 useId 값을 처음 나온 순서대로 #id1, #id2… 로 바꾼다(같은 값끼리의 연결 — for/aria-* — 은 유지). */
class IdMapper {
  private readonly map = new Map<string, string>();
  apply(value: string): string {
    return value.replace(USE_ID_RE, (m) => {
      let v = this.map.get(m);
      if (!v) {
        v = `«#id${this.map.size + 1}»`;
        this.map.set(m, v);
      }
      return v;
    });
  }
}

function formatAttrs(el: Element, opts: NormalizeOptions, ids: IdMapper): string {
  const out: string[] = [];
  const attrs = [...el.attributes].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const a of attrs) {
    if (opts.text && (a.name === "class" || a.name === "style")) continue;
    let v = a.value;
    if (a.name === "class") {
      // 클래스 순서는 화면과 무관하다(cn()/twMerge 결과의 순서만 바뀌는 리팩터링을 차이로 보지 않는다).
      const tokens = [...new Set(v.split(/\s+/).filter(Boolean))]
        .map((t) => (FONT_CLASS_RE.test(t) ? t.replace(/_[0-9a-f]+$/, "_#") : t))
        .sort();
      v = tokens.join(" ");
    } else {
      v = normalizeUrlish(ids.apply(v));
    }
    out.push(v === "" && a.name !== "class" ? a.name : `${a.name}=${quoteAttr(v)}`);
  }
  return out.length ? " " + out.join(" ") : "";
}

/** JSON-LD 본문을 키 순서 그대로 2칸 들여 쓴 줄로 편다(파싱 실패 시 공백만 접는다). */
function formatJsonLd(raw: string): string[] {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2).split("\n");
  } catch {
    return [collapseWs(raw).trim()];
  }
}

/**
 * 자식 노드를 "의미 있는 조각"으로 모은다: 주석은 버리고(React 텍스트 경계 `<!-- -->`·Suspense 표지 `<!--$-->`),
 * 그 결과 이어 붙은 텍스트 노드는 하나로 합친다 — `{a}{b}` 가 템플릿 문자열로 바뀌어도 같게 보이도록.
 */
function childParts(node: Node): (Element | string)[] {
  const parts: (Element | string)[] = [];
  for (const child of node.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      const t = child.nodeValue ?? "";
      const last = parts.at(-1);
      if (typeof last === "string") parts[parts.length - 1] = last + t;
      else parts.push(t);
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element;
      if (!isDropped(el)) parts.push(el);
    }
  }
  return parts;
}

function serialize(
  el: Element,
  depth: number,
  lines: string[],
  opts: NormalizeOptions,
  ids: IdMapper,
): void {
  const tag = el.tagName.toLowerCase();
  const pad = "  ".repeat(depth);
  const open = `<${tag}${formatAttrs(el, opts, ids)}>`;
  if (VOID_TAGS.has(tag)) {
    lines.push(pad + open);
    return;
  }
  if (tag === "script") {
    // 남는 스크립트는 JSON-LD 뿐(isDropped).
    lines.push(pad + open);
    for (const l of formatJsonLd(el.textContent ?? "")) lines.push(pad + "  " + l);
    lines.push(`${pad}</${tag}>`);
    return;
  }
  const pre = PRE_TAGS.has(tag);
  // <template> 의 내용은 content 프래그먼트에 있다.
  const source: Node = tag === "template" ? (el as HTMLTemplateElement).content : el;
  const parts = childParts(source)
    .map((p) => (typeof p === "string" ? (pre ? p : normalizeVolatileText(collapseWs(p))) : p))
    .filter((p) => typeof p !== "string" || p !== "" || pre);
  // 텍스트 한 조각만 가진 요소는 한 줄로: <span class="x">"제목"</span>
  if (parts.length === 1 && typeof parts[0] === "string") {
    lines.push(`${pad}${open}${JSON.stringify(parts[0])}</${tag}>`);
    return;
  }
  if (!parts.length) {
    lines.push(`${pad}${open}</${tag}>`);
    return;
  }
  lines.push(pad + open);
  for (const p of parts) {
    if (typeof p === "string") lines.push(`${pad}  ${JSON.stringify(p)}`);
    else serialize(p, depth + 1, lines, opts, ids);
  }
  lines.push(`${pad}</${tag}>`);
}

/**
 * 정적 export HTML → 비교용 줄 텍스트.
 *
 * 남기는 것: `<html>`·`<body>` 속성(lang 포함), `<head>` 의 title·meta·canonical·alternate·아이콘 link,
 * JSON-LD(`application/ld+json` 스크립트 — 2칸 들여 쓴 JSON), 본문 마크업·속성·텍스트(class 포함, `--text` 면 class·style 제외).
 *
 * 빼거나 바꾸는 것(화면에 안 보이는데 빌드·구조 변경마다 달라지는 것):
 *  - 그 밖의 `<script>` 전부(RSC flight 데이터·청크 로더)
 *  - `<link rel=preload|modulepreload|stylesheet|prefetch>`(해시 파일명, 청크 분할)
 *  - 속성값의 `_next/static/…` 경로 → `/_next/static/#`, `?<16진 해시>` 캐시 버스터 → `?#`
 *  - next/font 해시 클래스 `__variable_xxxx` → `__variable_#`
 *  - React useId 값 → 페이지 안 등장 순서 `«#idN»`
 *  - 주석(React 텍스트 경계·Suspense 표지)과 빈 hidden div(Next 메타데이터 경계)
 *  - 공백: 연속 공백을 한 칸으로(앞뒤 공백 자체는 남긴다 — 인라인 요소 사이 띄어쓰기는 보인다), 공백뿐인 줄은 `" "`
 *  - 속성은 이름순, class 토큰은 정렬·중복 제거
 *  - 시각 의존: 발행 지연 안내 줄(VOLATILE_STATUS_LABELS), 텍스트의 `© 2026` → `© YYYY`
 */
export function normalizeHtml(html: string, opts: NormalizeOptions = {}): string {
  const { document, close } = parseDocument(html);
  try {
    const lines: string[] = [];
    const doctype = document.doctype;
    if (doctype) lines.push(`<!doctype ${doctype.name}>`);
    serialize(document.documentElement, 0, lines, opts, new IdMapper());
    return lines.join("\n") + "\n";
  } finally {
    close();
  }
}

/** XML(sitemap·RSS) → 태그마다 한 줄. 정적 산출물이라 해시는 없고, 공백만 맞춘다. */
export function normalizeXml(xml: string): string {
  return (
    xml
      .replace(/>\s*</g, ">\n<")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n") + "\n"
  );
}

// ── 줄 diff (Myers) ─────────────────────────────────────────────────────

export type DiffOp = { op: "=" | "-" | "+"; line: string };

/** 편집 거리 상한 — 이보다 많이 다르면 hunk 대신 개수만 보고한다(정규화가 잘못됐거나 전혀 다른 페이지). */
export const MAX_EDIT_DISTANCE = 4000;

/**
 * a → b 줄 편집 스크립트. 공통 앞뒤를 먼저 잘라 내고 가운데만 Myers O((N+M)D).
 * 편집 거리가 maxD 를 넘으면 null.
 */
export function diffLines(a: string[], b: string[], maxD = MAX_EDIT_DISTANCE): DiffOp[] | null {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: DiffOp[] = a.slice(0, start).map((line) => ({ op: "=", line }));
  const tail: DiffOp[] = a.slice(endA).map((line) => ({ op: "=", line }));
  const A = a.slice(start, endA);
  const B = b.slice(start, endB);
  const mid = myers(A, B, maxD);
  return mid ? [...head, ...mid, ...tail] : null;
}

function myers(a: string[], b: string[], maxD: number): DiffOp[] | null {
  const n = a.length;
  const m = b.length;
  if (!n) return b.map((line) => ({ op: "+", line }));
  if (!m) return a.map((line) => ({ op: "-", line }));
  const max = Math.min(n + m, maxD);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) return null;
  // 역추적
  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vv = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vv[offset + k - 1] < vv[offset + k + 1])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = vv[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ op: "=", line: a[x - 1] });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ op: "+", line: b[y - 1] });
      else ops.push({ op: "-", line: a[x - 1] });
    }
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

export interface DiffStats {
  added: number;
  removed: number;
}

export function diffStats(ops: readonly DiffOp[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const o of ops) {
    if (o.op === "+") added++;
    else if (o.op === "-") removed++;
  }
  return { added, removed };
}

/** 편집 스크립트 → unified diff 본문(`@@ -a,b +c,d @@` hunk). 차이가 없으면 빈 문자열. */
export function unifiedDiff(
  ops: readonly DiffOp[],
  { context = 3, labelA = "base", labelB = "cand" } = {},
): string {
  if (!ops.some((o) => o.op !== "=")) return "";
  const out: string[] = [`--- ${labelA}`, `+++ ${labelB}`];
  // 각 op 의 a·b 줄 번호(1부터)
  const posA: number[] = [];
  const posB: number[] = [];
  let ia = 1;
  let ib = 1;
  for (const o of ops) {
    posA.push(ia);
    posB.push(ib);
    if (o.op !== "+") ia++;
    if (o.op !== "-") ib++;
  }
  let i = 0;
  while (i < ops.length) {
    if (ops[i].op === "=") {
      i++;
      continue;
    }
    const from = Math.max(0, i - context);
    let end = i;
    // 다음 변경이 context*2 안이면 같은 hunk 로 잇는다.
    for (;;) {
      while (end < ops.length && ops[end].op !== "=") end++;
      let next = end;
      while (next < ops.length && ops[next].op === "=") next++;
      if (next < ops.length && next - end <= context * 2) end = next;
      else break;
    }
    const to = Math.min(ops.length, end + context);
    const slice = ops.slice(from, to);
    const lenA = slice.filter((o) => o.op !== "+").length;
    const lenB = slice.filter((o) => o.op !== "-").length;
    const startA = lenA ? posA[from] : posA[from] - 1;
    const startB = lenB ? posB[from] : posB[from] - 1;
    out.push(`@@ -${startA},${lenA} +${startB},${lenB} @@`);
    for (const o of slice) out.push((o.op === "=" ? " " : o.op) + o.line);
    i = to;
  }
  return out.join("\n") + "\n";
}

// ── 페이지 목록(manifest) ───────────────────────────────────────────────

export type PageKind = "html" | "xml";

export interface ManifestPage {
  /** out/ 기준 상대 경로(예: `index.html`, `article/1234/index.html`, `404.html`). */
  path: string;
  kind: PageKind;
  /** 고른 이유(사람이 읽는 설명). */
  why: string;
}

export interface Manifest {
  version: 1;
  /** 목록을 고른 시점의 기준(재현용 기록 — 비교에는 쓰지 않는다). */
  selectedFrom: { outDir: string; db: string; dbSha256: string; at: string };
  pages: ManifestPage[];
}

export function parseManifest(raw: string): Manifest {
  const m = JSON.parse(raw) as Manifest;
  if (m.version !== 1 || !Array.isArray(m.pages))
    throw new Error("manifest 형식이 아니다(version 1, pages[])");
  for (const p of m.pages) {
    if (typeof p.path !== "string" || (p.kind !== "html" && p.kind !== "xml")) {
      throw new Error(`manifest 페이지 항목이 잘못됐다: ${JSON.stringify(p)}`);
    }
  }
  return m;
}

// ── 대표 기사 고르기 ────────────────────────────────────────────────────

/** 고르기용 기사 행(공개 기사만). date = 호 날짜(KST). */
export interface ArticleRow {
  id: number;
  date: string;
  format: string;
  region: string | null;
  hasRelated: boolean;
  /** 이전 보도가 있다(follow_up_of) 또는 후속 보도가 이 기사를 가리킨다. */
  inThread: boolean;
  /** 최근 기사용 공유 썸네일(og/article/<id>.png)이 산출물에 있다. */
  hasOgImage: boolean;
}

export interface ArticlePick {
  id: number;
  why: string;
}

/**
 * 대표 기사 5~6건을 결정적으로 고른다(같은 DB·같은 산출물이면 같은 결과, 조건마다 id 가 가장 큰 기사).
 *  1. 사건 타임라인(이전/후속 보도) + 가능하면 다른 매체 묶음까지 가진 뉴스
 *  2. 다른 매체 묶음(related)을 가진 해외 뉴스
 *  3. 한국 매체 뉴스 — 공유 썸네일 창(최근 기사) 밖의 것을 골라 og:image 기본값 경로도 덮는다
 *  4. 오픈소스(REPO)  5. 논문(PAPER)  6. 모델(MODEL) — 있으면
 * 조건에 맞는 기사가 없으면 그 칸은 비운다.
 */
export function pickArticles(rows: readonly ArticleRow[]): ArticlePick[] {
  const sorted = [...rows].sort((a, b) => b.id - a.id);
  const chosen = new Set<number>();
  const picks: ArticlePick[] = [];
  const take = (pred: (r: ArticleRow) => boolean, why: (r: ArticleRow) => string) => {
    const r = sorted.find((x) => !chosen.has(x.id) && pred(x));
    if (!r) return;
    chosen.add(r.id);
    picks.push({ id: r.id, why: why(r) });
  };
  const isNews = (r: ArticleRow) => r.format === "news";
  const og = (r: ArticleRow) => (r.hasOgImage ? "og 기사 썸네일" : "og 기본 썸네일");
  take(
    (r) => isNews(r) && r.inThread && r.hasRelated,
    (r) => `뉴스·사건 타임라인+다른 매체 묶음 (${r.date}, ${og(r)})`,
  );
  if (!picks.length) {
    take(
      (r) => isNews(r) && r.inThread,
      (r) => `뉴스·사건 타임라인 (${r.date}, ${og(r)})`,
    );
  }
  take(
    (r) => isNews(r) && r.hasRelated && r.region !== "kr",
    (r) => `해외 뉴스·다른 매체 묶음 (${r.date}, ${og(r)})`,
  );
  const korean = (r: ArticleRow) => isNews(r) && r.region === "kr";
  const before = picks.length;
  take(
    (r) => korean(r) && !r.hasOgImage,
    (r) => `한국 매체 뉴스 (${r.date}, ${og(r)})`,
  );
  if (picks.length === before) take(korean, (r) => `한국 매체 뉴스 (${r.date}, ${og(r)})`);
  take(
    (r) => r.format === "oss",
    (r) => `오픈소스(REPO) (${r.date}, ${og(r)})`,
  );
  take(
    (r) => r.format === "paper",
    (r) => `논문(PAPER) (${r.date}, ${og(r)})`,
  );
  take(
    (r) => r.format === "model",
    (r) => `모델(MODEL) (${r.date}, ${og(r)})`,
  );
  return picks;
}

/** KST 날짜 문자열의 요일(0 = 일요일). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// ── 비교 ────────────────────────────────────────────────────────────────

export type PageStatus = "same" | "diff" | "allowed" | "missing";

export interface PageResult {
  path: string;
  status: PageStatus;
  /** 차이가 있을 때 unified diff(편집 거리 초과면 안내 한 줄). */
  diff: string;
  stats: DiffStats;
  /** 한쪽에 파일이 없을 때 어느 쪽인지. */
  missing?: ("base" | "cand")[];
}

export function normalizePage(kind: PageKind, raw: string, opts: NormalizeOptions = {}): string {
  return kind === "xml" ? normalizeXml(raw) : normalizeHtml(raw, opts);
}

/** 정규화를 마친 두 텍스트를 비교한다. allowed = 허용 목록에 든 페이지. */
export function comparePage(
  path: string,
  base: string | null,
  cand: string | null,
  { allowed = false, context = 3 }: { allowed?: boolean; context?: number } = {},
): PageResult {
  if (base === null || cand === null) {
    const missing: ("base" | "cand")[] = [];
    if (base === null) missing.push("base");
    if (cand === null) missing.push("cand");
    return {
      path,
      status: allowed ? "allowed" : "missing",
      diff: `(${missing.join("·")} 에 파일 없음)\n`,
      stats: { added: 0, removed: 0 },
      missing,
    };
  }
  if (base === cand) return { path, status: "same", diff: "", stats: { added: 0, removed: 0 } };
  const a = base.split("\n");
  const b = cand.split("\n");
  const ops = diffLines(a, b);
  const status: PageStatus = allowed ? "allowed" : "diff";
  if (!ops) {
    return {
      path,
      status,
      diff: `(차이가 너무 많다 — 편집 거리 > ${MAX_EDIT_DISTANCE}줄, base ${a.length}줄 · cand ${b.length}줄)\n`,
      stats: { added: b.length, removed: a.length },
    };
  }
  return {
    path,
    status,
    diff: unifiedDiff(ops, { context, labelA: `base/${path}`, labelB: `cand/${path}` }),
    stats: diffStats(ops),
  };
}

/** 허용 목록 파일(한 줄에 경로 하나, `#` 이후 주석) → 경로 목록. */
export function parseAllowList(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean);
}

/** 허용 패턴: 정확한 경로 또는 끝이 `*` 인 접두어(예: `article/*`). */
export function isAllowed(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => (p.endsWith("*") ? path.startsWith(p.slice(0, -1)) : p === path));
}
