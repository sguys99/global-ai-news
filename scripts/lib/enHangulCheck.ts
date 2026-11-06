/**
 * 영어 페이지 한글 누출 검사 — english-version-plan Phase 5-4. 파일 읽기·출력·종료 코드는 scripts/en-hangul-check.ts.
 *
 * 영어판 산출물(`out/en/**` HTML·RSC `.txt`, `out/{search,feed}-index/en/**` JSON)에 한글이 있으면 위반이다.
 * 허용은 **`lang="ko"` 요소 안뿐**이다(DESIGN.md §9 "영어판 — 영어 타이포그래피": 영어 페이지 안의 한국어는 요소 단위
 * `lang="ko"`). 지금 그런 요소는 둘이다 — 한국 매체 원제 줄(`<span class="ar-orig-t" lang="ko">`, 보관 지면도 같은 모양)과
 * 언어 전환 링크(`<a lang="ko" hreflang="ko" aria-label="한국어로 읽기" title="한국어로 읽기">한국어</a>`).
 * 허용 판정은 "가장 가까운 `lang` 이 ko" 다 — `lang="ko"` 안에 `lang="en"` 이 다시 오면 그 안은 다시 위반이다.
 * 요소 자신의 속성(aria-label·title)도 그 요소의 언어를 따른다.
 *
 * 어디를 어떻게 보나:
 *  - HTML 마크업: 태그를 스택으로 읽어 텍스트·속성 값마다 가장 가까운 `lang` 을 본다. 주석·`<style>`·일반 인라인
 *    스크립트·JSON-LD(`application/ld+json`)의 한글은 늘 위반(영어 JSON-LD 는 Phase 6, 지금 영어 페이지에는 없다).
 *  - RSC 페이로드(`index.txt`, HTML 인라인 `self.__next_f.push([1,"…"])` 를 이어 붙인 것): React Flight 행을 JSON 으로
 *    읽고 트리를 걷는다. 호스트 요소 `["$","span",key,{…,"lang":"ko","children":…}]` 의 props 안 문자열만 허용한다 —
 *    서버 컴포넌트가 그린 원제 줄(ArticleView `ar-orig-t`)은 렌더 트리째 RSC 에 실리므로 이 모양으로 반드시 나온다.
 *    다른 행을 가리키는 참조(`"$5"`·`"$L5"`·`"$@5"`)는 참조한 자리의 언어를 물려준다(긴 문자열은 `T` 텍스트 행으로 빠진다).
 *    클라이언트 컴포넌트에 넘긴 값(매체 표·카드 배열 등)은 `lang` 이 없으니 한글이 있으면 위반이다.
 *    JSON 으로 못 읽는 행은 행 전체를 평문으로 본다(한글이 있으면 위반 — 보수적).
 *  - 색인 JSON(조각·manifest): 허용 없음. 키·값 어디든 한글이면 위반.
 *
 * 순수 함수만 둔다(문자열 → 결과). 한글 판정은 labels.ts `hasHangul` 과 같은 범위(자모·호환 자모·음절).
 */

const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힯]/;

export function containsHangul(text: string): boolean {
  return HANGUL_RE.test(text);
}

/** 위반 한 건. `where` 는 자리 종류(text·attr:<이름>·comment·style·script·json-ld·rsc·json·plain), `context` 는 요소·경로. */
export interface Violation {
  where: string;
  context: string;
  snippet: string;
}

/** 허용된 한글 한 건 — 요약에 "어떤 `lang="ko"` 요소가 몇 번" 으로 보여 새 허용 자리가 생기면 눈에 띄게 한다. */
export interface Allowed {
  /** 허용한 요소 모양(예: `span.ar-orig-t`, `a[hreflang=ko]`, `rsc span.ar-orig-t`). */
  element: string;
  snippet: string;
}

export interface ScanResult {
  violations: Violation[];
  allowed: Allowed[];
}

const SNIPPET_RADIUS = 40;

/** 첫 한글 둘레 ±40자(줄바꿈은 공백으로). */
export function snippetAround(text: string): string {
  const m = HANGUL_RE.exec(text);
  const at = m ? m.index : 0;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`.replace(
    /\s+/g,
    " ",
  );
}

/** `lang` 값이 한국어인지(`ko`, `ko-KR` …). */
export function isKoLang(lang: string | undefined | null): boolean {
  return typeof lang === "string" && /^ko(-|$)/i.test(lang.trim());
}

/** 숫자 문자 참조(&#xAC00; &#44032;)만 푼다 — 한글을 엔티티로 숨겨도 걸리게. 이름 엔티티는 한글과 무관하다. */
function decodeNumericEntities(text: string): string {
  return text.replace(/&#(x[0-9a-f]+|\d+);/gi, (whole, n: string) => {
    const code = n[0] === "x" || n[0] === "X" ? parseInt(n.slice(1), 16) : parseInt(n, 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

// ── HTML ───────────────────────────────────────────────────────────────────

const VOID_ELEMENTS = new Set([
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

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(src: string): [string, string][] {
  const out: [string, string][] = [];
  ATTR_RE.lastIndex = 0;
  for (let m = ATTR_RE.exec(src); m; m = ATTR_RE.exec(src)) {
    out.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? ""]);
  }
  return out;
}

/** 허용 요소 모양 이름: `태그.첫클래스` 또는 `태그[hreflang=…]`. */
function elementShape(tag: string, attrs: [string, string][]): string {
  const get = (n: string) => attrs.find(([k]) => k === n)?.[1];
  const cls = get("class")?.trim().split(/\s+/)[0];
  if (cls) return `${tag}.${cls}`;
  const hreflang = get("hreflang");
  return hreflang ? `${tag}[hreflang=${hreflang}]` : tag;
}

interface Frame {
  tag: string;
  ko: boolean;
  shape: string;
}

/**
 * HTML 한 장. 인라인 RSC(`self.__next_f.push([1,…])`)는 이어 붙여 `scanRsc` 로 따로 본다(결과에 합친다).
 */
export function scanHtml(html: string): ScanResult {
  const violations: Violation[] = [];
  const allowed: Allowed[] = [];
  const stack: Frame[] = [];
  const rscChunks: string[] = [];
  const top = () => stack[stack.length - 1];
  const inKo = () => top()?.ko ?? false;
  const path = () =>
    stack
      .slice(-3)
      .map((f) => f.shape)
      .join(" > ") || "(document)";

  const check = (raw: string, where: string, ko: boolean, shape: string, context: string) => {
    const text = decodeNumericEntities(raw);
    if (!containsHangul(text)) return;
    if (ko) allowed.push({ element: shape, snippet: snippetAround(text) });
    else violations.push({ where, context, snippet: snippetAround(text) });
  };

  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i) check(html.slice(i, textEnd), "text", inKo(), top()?.shape ?? "", path());
    if (lt < 0) break;
    i = lt;

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      const stop = end < 0 ? n : end + 3;
      check(html.slice(i, stop), "comment", false, "", path());
      i = stop;
      continue;
    }
    if (html.startsWith("<!", i) || html.startsWith("<?", i)) {
      const end = html.indexOf(">", i);
      const stop = end < 0 ? n : end + 1;
      check(html.slice(i, stop), "doctype", false, "", path());
      i = stop;
      continue;
    }
    const close = /^<\/([a-zA-Z][\w:-]*)\s*>/.exec(html.slice(i, i + 64));
    if (close) {
      const tag = close[1].toLowerCase();
      const idx = stack.map((f) => f.tag).lastIndexOf(tag);
      if (idx >= 0) stack.length = idx; // 짝 없는 닫는 태그는 무시, 안 닫힌 자식은 함께 닫는다
      i += close[0].length;
      continue;
    }
    const open = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(i, i + 64));
    if (!open) {
      // `<` 뒤에 태그 이름이 없다 — 텍스트로 본다.
      check("<", "text", inKo(), top()?.shape ?? "", path());
      i += 1;
      continue;
    }
    const tag = open[1].toLowerCase();
    // 속성 안의 `>` 는 따옴표 안에서만 나온다 — 따옴표를 건너뛰며 태그 끝을 찾는다.
    let j = i + open[0].length;
    let quote = "";
    for (; j < n; j++) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const attrSrc = html.slice(i + open[0].length, j);
    const selfClosing = /\/\s*$/.test(attrSrc);
    const attrs = parseAttrs(attrSrc);
    const lang = attrs.find(([k]) => k === "lang")?.[1];
    const ko = lang !== undefined ? isKoLang(lang) : inKo();
    const shape = elementShape(tag, attrs);
    const context = [path(), shape].filter((s) => s && s !== "(document)").join(" > ");
    for (const [name, value] of attrs) check(value, `attr:${name}`, ko, shape, context);
    i = j + 1;

    if (tag === "script" || tag === "style") {
      const endRe = new RegExp(`</${tag}\\s*>`, "i");
      const rest = html.slice(i);
      const m = endRe.exec(rest);
      const body = m ? rest.slice(0, m.index) : rest;
      i += m ? m.index + m[0].length : rest.length;
      if (tag === "style") {
        check(body, "style", false, shape, context);
        continue;
      }
      const type = attrs.find(([k]) => k === "type")?.[1]?.toLowerCase() ?? "";
      if (type === "application/ld+json") {
        check(body, "json-ld", false, shape, context);
        continue;
      }
      const push = /^\s*self\.__next_f\.push\(([\s\S]*)\)\s*;?\s*$/.exec(body);
      if (push) {
        try {
          const arr = JSON.parse(push[1]) as unknown;
          if (Array.isArray(arr) && arr[0] === 1 && typeof arr[1] === "string") {
            rscChunks.push(arr[1]);
            continue;
          }
          if (Array.isArray(arr) && arr[0] !== 1) continue; // [0] 시작 표지·[2] 폼 상태 등
        } catch {
          // 아래 평문 검사로 떨어진다
        }
      }
      check(body, "script", false, shape, context);
      continue;
    }
    if (!selfClosing && !VOID_ELEMENTS.has(tag)) stack.push({ tag, ko, shape });
  }

  if (rscChunks.length > 0) {
    const rsc = scanRsc(rscChunks.join(""));
    for (const v of rsc.violations) violations.push({ ...v, where: `inline-${v.where}` });
    allowed.push(...rsc.allowed);
  }
  return { violations, allowed };
}

// ── RSC(React Flight) ─────────────────────────────────────────────────────

export interface RscRow {
  id: string;
  /** 행 표지(`I` 모듈·`HL` 힌트·`T` 텍스트·`E` 오류 …), 일반 모델 행은 빈 문자열. */
  tag: string;
  body: string;
}

/** UTF-8 `bytes` 바이트에 해당하는 끝 인덱스(`start` 부터). */
function utf8End(s: string, start: number, bytes: number): number {
  let i = start;
  let used = 0;
  while (i < s.length && used < bytes) {
    const cp = s.codePointAt(i) as number;
    used += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    i += cp > 0xffff ? 2 : 1;
  }
  return i;
}

/** Flight 스트림 → 행. `T<hex 바이트 길이>,` 텍스트 행은 줄바꿈 없이 길이만큼이다. */
export function parseRscRows(payload: string): RscRow[] {
  const rows: RscRow[] = [];
  let i = 0;
  while (i < payload.length) {
    const nlAt = (from: number) => {
      const nl = payload.indexOf("\n", from);
      return nl < 0 ? payload.length : nl;
    };
    const colon = payload.indexOf(":", i);
    const lineEnd = nlAt(i);
    if (colon < 0 || colon > lineEnd || !/^[0-9a-f]*$/.test(payload.slice(i, colon))) {
      const body = payload.slice(i, lineEnd);
      if (body.trim()) rows.push({ id: "", tag: "?", body });
      i = lineEnd + 1;
      continue;
    }
    const id = payload.slice(i, colon);
    const tag = /^[A-Z]*/.exec(payload.slice(colon + 1, colon + 4))![0];
    const start = colon + 1 + tag.length;
    if (tag === "T") {
      const comma = payload.indexOf(",", start);
      const len = parseInt(payload.slice(start, comma), 16);
      if (comma > 0 && Number.isFinite(len)) {
        const end = utf8End(payload, comma + 1, len);
        rows.push({ id, tag, body: payload.slice(comma + 1, end) });
        i = end;
        continue;
      }
    }
    rows.push({ id, tag, body: payload.slice(start, nlAt(start)) });
    i = nlAt(start) + 1;
  }
  return rows;
}

const REF_RE = /^\$[L@]?([0-9a-f]+)$/;

/**
 * Flight 값 걷기. `ko` 는 지금 자리의 언어(가장 가까운 호스트 요소 `lang`). 호스트 요소(`["$","span",…]`, 타입이
 * `$`로 시작하지 않는 문자열)의 props 에 `lang` 이 있으면 그 props 아래 전부가 그 언어다.
 */
function walkFlight(
  value: unknown,
  ko: boolean,
  shape: string,
  path: string,
  onString: (s: string, ko: boolean, shape: string, path: string) => void,
  onRef: (id: string, ko: boolean, shape: string) => void,
): void {
  if (typeof value === "string") {
    const ref = REF_RE.exec(value);
    if (ref) onRef(ref[1], ko, shape);
    else onString(value, ko, shape, path);
    return;
  }
  if (Array.isArray(value)) {
    const isElement =
      value[0] === "$" && value.length >= 4 && typeof value[1] === "string" && isObject(value[3]);
    if (isElement) {
      const type = value[1] as string;
      const props = value[3] as Record<string, unknown>;
      const host = !type.startsWith("$");
      let childKo = ko;
      let childShape = shape;
      if (host) {
        const cls =
          typeof props.className === "string" ? props.className.trim().split(/\s+/)[0] : "";
        const elShape = `rsc ${type}${cls ? `.${cls}` : ""}`;
        if (typeof props.lang === "string") {
          childKo = isKoLang(props.lang);
          childShape = elShape;
        }
        path = `${path} > ${type}${cls ? `.${cls}` : ""}`;
      } else {
        path = `${path} > <${type}>`;
      }
      for (const [k, v] of Object.entries(props)) {
        walkFlight(v, childKo, childShape, `${path}.${k}`, onString, onRef);
      }
      return;
    }
    value.forEach((v, idx) => walkFlight(v, ko, shape, `${path}[${idx}]`, onString, onRef));
    return;
  }
  if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      onString(k, ko, shape, `${path}{key}`);
      walkFlight(v, ko, shape, `${path}.${k}`, onString, onRef);
    }
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** RSC 페이로드 한 벌(`index.txt` 또는 인라인 조각을 이은 것). */
export function scanRsc(payload: string): ScanResult {
  const violations: Violation[] = [];
  const allowed: Allowed[] = [];
  const rows = parseRscRows(payload);
  const byId = new Map<string, { row: RscRow; index: number; value: unknown; parsed: boolean }>();
  const parsedRows = rows.map((row, index) => {
    let value: unknown = row.body;
    let parsed = row.tag === "T";
    if (!parsed) {
      try {
        value = JSON.parse(row.body);
        parsed = true;
      } catch {
        parsed = false;
      }
    }
    const entry = { row, index, value, parsed };
    if (row.id) byId.set(row.id, entry);
    return entry;
  });

  // 참조된 행은 참조한 자리의 언어로 다시 걷는다. 아무도 참조하지 않은 행은 영어(ko=false)에서 시작한다.
  const referenced = new Set<string>();
  for (const e of parsedRows) {
    if (!e.parsed || e.row.tag === "T") continue;
    walkFlight(
      e.value,
      false,
      "",
      "",
      () => {},
      (id) => referenced.add(id),
    );
  }
  const seen = new Set<string>();
  const visitedRows = new Set<number>();
  const queue: { entry: (typeof parsedRows)[number]; ko: boolean; shape: string }[] = [];
  for (const e of parsedRows) {
    if (!e.row.id || !referenced.has(e.row.id)) queue.push({ entry: e, ko: false, shape: "" });
  }
  const visit = (entry: (typeof parsedRows)[number], ko: boolean, shape: string) => {
    const key = `${entry.index}|${ko}`;
    if (seen.has(key)) return;
    seen.add(key);
    visitedRows.add(entry.index);
    const rowLabel = `row ${entry.row.id || "-"}${entry.row.tag ? ` ${entry.row.tag}` : ""}`;
    const onString = (s: string, sKo: boolean, sShape: string, path: string) => {
      if (!containsHangul(s)) return;
      if (sKo) allowed.push({ element: sShape, snippet: snippetAround(s) });
      else
        violations.push({ where: "rsc", context: `${rowLabel}${path}`, snippet: snippetAround(s) });
    };
    if (entry.row.tag === "T") {
      onString(entry.row.body, ko, shape, "");
      return;
    }
    if (!entry.parsed) {
      onString(entry.row.body, false, "", " (unparsed)");
      return;
    }
    walkFlight(entry.value, ko, shape, "", onString, (id, rKo, rShape) => {
      const target = byId.get(id);
      if (target) queue.push({ entry: target, ko: rKo, shape: rShape });
    });
  };
  for (let q = 0; q < queue.length; q++) visit(queue[q].entry, queue[q].ko, queue[q].shape);
  // 순환만 있어 시작점이 없는 행도 한 번은 본다.
  for (const e of parsedRows) {
    if (!visitedRows.has(e.index)) visit(e, false, "");
  }
  return { violations, allowed };
}

// ── JSON(색인) ───────────────────────────────────────────────────────────

/** 색인 조각·manifest — 허용 없음. 못 읽으면 평문. */
export function scanJson(text: string): ScanResult {
  const violations: Violation[] = [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return scanPlain(text, "plain");
  }
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      if (containsHangul(v))
        violations.push({ where: "json", context: path || "$", snippet: snippetAround(v) });
    } else if (Array.isArray(v)) v.forEach((x, idx) => walk(x, `${path}[${idx}]`));
    else if (isObject(v))
      for (const [k, x] of Object.entries(v)) {
        if (containsHangul(k))
          violations.push({ where: "json", context: `${path}{key}`, snippet: snippetAround(k) });
        walk(x, `${path}.${k}`);
      }
  };
  walk(value, "$");
  return { violations, allowed: [] };
}

/** 그 밖의 텍스트 — 한글 한 덩어리마다 위반. */
export function scanPlain(text: string, where = "plain"): ScanResult {
  const violations: Violation[] = [];
  const re = /[ᄀ-ᇿ㄰-㆏가-힯]+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    violations.push({
      where,
      context: `offset ${m.index}`,
      snippet: snippetAround(text.slice(Math.max(0, m.index - 40), m.index + 40)),
    });
  }
  return { violations, allowed: [] };
}

// ── 파일·산출물 ─────────────────────────────────────────────────────────

/** 검사 대상 경로인지(out/ 기준 `/` 상대 경로): `en/**` 의 html·txt·json·xml, `{search,feed}-index/en/**`. */
export function isScanTarget(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/");
  const inEn = p.startsWith("en/");
  const inIndex = /^(search|feed)-index\/en\//.test(p);
  if (!inEn && !inIndex) return false;
  return /\.(html|txt|json|xml)$/i.test(p);
}

/** 파일 한 개 — 확장자로 검사기를 고른다. */
export function scanFile(relPath: string, content: string): ScanResult {
  if (/\.html$/i.test(relPath)) return scanHtml(content);
  if (/\.txt$/i.test(relPath)) return scanRsc(content);
  if (/\.json$/i.test(relPath)) return scanJson(content);
  return scanPlain(content);
}

export interface FileViolation extends Violation {
  file: string;
}

export interface HangulReport {
  filesScanned: number;
  filesWithViolations: number;
  violations: FileViolation[];
  /** 허용한 `lang="ko"` 요소 모양별 건수(요약용). */
  allowedByElement: Record<string, number>;
}

export function buildHangulReport(
  files: Iterable<{ path: string; content: string }>,
): HangulReport {
  let filesScanned = 0;
  const violatingFiles = new Set<string>();
  const violations: FileViolation[] = [];
  const allowedByElement: Record<string, number> = {};
  for (const f of files) {
    filesScanned++;
    const r = scanFile(f.path, f.content);
    for (const v of r.violations) {
      violations.push({ file: f.path, ...v });
      violatingFiles.add(f.path);
    }
    for (const a of r.allowed) allowedByElement[a.element] = (allowedByElement[a.element] ?? 0) + 1;
  }
  return { filesScanned, filesWithViolations: violatingFiles.size, violations, allowedByElement };
}

/** 같은 조각(snippet)끼리 묶은 위반 — 수천 쪽에 같은 매체명이 새는 경우 한 줄로. */
export function groupViolations(
  violations: readonly FileViolation[],
): { snippet: string; where: string; count: number; files: string[] }[] {
  const groups = new Map<
    string,
    { snippet: string; where: string; count: number; files: string[] }
  >();
  for (const v of violations) {
    const key = `${v.where}\u0000${v.snippet}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (g.files[g.files.length - 1] !== v.file) g.files.push(v.file);
    } else groups.set(key, { snippet: v.snippet, where: v.where, count: 1, files: [v.file] });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** 콘솔 요약. 위반은 묶음 상위 `limit` 개(파일 예시 3개씩). */
export function hangulConsole(report: HangulReport, outDir: string, limit = 30): string {
  const lines = [
    `영어판 한글 검사 — ${outDir}`,
    `  검사 파일 ${report.filesScanned.toLocaleString("en-US")}개 · 위반 파일 ${report.filesWithViolations.toLocaleString("en-US")}개 · 위반 ${report.violations.length.toLocaleString("en-US")}건`,
  ];
  const allowed = Object.entries(report.allowedByElement).sort((a, b) => b[1] - a[1]);
  if (allowed.length > 0) {
    lines.push(`  허용(lang="ko" 요소): ${allowed.map(([el, n]) => `${el} ×${n}`).join(", ")}`);
  }
  const groups = groupViolations(report.violations);
  for (const g of groups.slice(0, limit)) {
    const ex =
      g.files.slice(0, 3).join(", ") + (g.files.length > 3 ? ` 외 ${g.files.length - 3}개` : "");
    lines.push(`  ✗ [${g.where}] ×${g.count} "${g.snippet}" — ${ex}`);
  }
  if (groups.length > limit) lines.push(`  … 묶음 ${groups.length - limit}개 더`);
  if (report.filesScanned === 0) lines.push("  ✗ 검사할 영어 파일이 없다(out/en/ 이 비었나?)");
  return lines.join("\n");
}

/** `--ci`: 위반 묶음마다 `::error::`(상위 `limit` 개). */
export function hangulAnnotations(report: HangulReport, limit = 20): string[] {
  const out: string[] = [];
  if (report.filesScanned === 0) {
    out.push("::error title=영어판 한글 검사::검사할 영어 파일이 없다 — out/en/ 을 확인");
    return out;
  }
  for (const g of groupViolations(report.violations).slice(0, limit)) {
    const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    out.push(
      `::error file=out/${g.files[0]},title=영어판 한글 누출::${esc(`[${g.where}] ×${g.count} (${g.files.length}개 파일) "${g.snippet}"`)}`,
    );
  }
  return out;
}

/** 위반이 있거나 검사 파일이 0개면 1. */
export function hangulExitCode(report: HangulReport): number {
  return report.violations.length > 0 || report.filesScanned === 0 ? 1 : 0;
}
