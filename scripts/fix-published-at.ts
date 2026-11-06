/**
 * 한국 매체 발행 시각(articles.published_at) 9시간 오차 보정 — 일회성.
 * 실행: npm run db:fix-published-at -- [--dry-run | --apply] [옵션]
 *
 * AI타임스·로봇신문(ndsoft CMS) RSS 의 pubDate 는 시간대 표기가 없는 KST("2026-11-06 09:00:00")인데,
 * rss-parser 가 실행 환경 시간대로 읽어 UTC 러너(GitHub Actions)에서 수집한 기사는 9시간 미래로
 * 저장됐다(수집기는 scripts/lib/collect/rss.ts parseFeedDate 로 고침). 로컬(KST)에서 돌린 초기 회차의
 * 기사는 맞게 저장돼 있어 "소스 + 날짜 규칙"만으로는 어느 행이 틀렸는지 알 수 없다. 그래서 기사 페이지의
 * `article:published_time`(시간대 포함)을 정답으로 삼되, 시간대 해석은 프로세스 단위라 같은 수집 회차
 * (created_at 의 시)의 행은 모두 같이 틀리거나 같이 맞다 — 회차마다 표본 몇 건만 확인한다(AI타임스는
 * 짧은 시간에 수백 건을 받으면 403 으로 막는다).
 *
 * 1. 대상 소스(기본 aitimes·irobotnews)의 기사를 모두 읽는다(미가공 재심사 행 포함).
 * 2. 회차마다 표본 --per-run 건의 페이지를 받아 저장값과 비교한다(실패하면 다음 행으로).
 *    - 페이지 = 저장값 − 9시간 → 보정(fix)
 *    - 페이지 = 저장값          → 이미 맞음(ok)
 *    - 그 밖                    → 불일치(mismatch)
 * 3. 회차 판정: 확인한 표본이 모두 fix 면 그 회차 전체를 −9시간, 모두 ok 면 전체 그대로. 섞였거나 확인한
 *    표본이 없으면 확인한 행만 제 판정을 따르고 나머지는 미확인(unverified)으로 두고 보고만 한다.
 *    보정 뒤 다시 돌리면 표본이 "이미 맞음"이라 아무것도 바꾸지 않는다(멱등).
 * 4. --apply 는 DB 를 <db>.bak-YYYYMMDD(KST)로 백업한 뒤 한 트랜잭션으로 UPDATE 한다.
 *
 * 옵션
 *   --dry-run          (기본) 소스별 집계·예시만 출력하고 DB 는 쓰지 않는다.
 *   --apply            백업 후 DB 에 쓴다.
 *   --sources a,b      대상 소스 id(기본 aitimes,irobotnews).
 *   --per-run N        회차당 확인할 표본 수(기본 2).
 *   --db PATH          대상 DB(기본 data/app.db).
 *   --concurrency N    동시 페이지 요청 수(기본 2).
 */
import path from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { DB_PATH } from "../src/lib/paths";
import { backupPath } from "./reclassify";

/** 시간대 없는 pubDate 를 내는 피드(2026-11 확인: ndsoft CMS). */
export const DEFAULT_SOURCES = ["aitimes", "irobotnews"];
/** 오차 크기: KST 를 UTC 로 읽은 만큼. */
export const KST_OFFSET_MS = 9 * 3600 * 1000;
/** 페이지 시각과 비교할 때 허용 오차(초 단위 반올림·표기 차이). */
const MATCH_TOLERANCE_MS = 60 * 1000;
/** 표본 페이지가 실패할 때 회차당 더 시도하는 행 수. */
const EXTRA_ATTEMPTS = 2;
const PAGE_TIMEOUT_MS = 20_000;
const PAGE_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; AI-Daybook/1.0)" };

export interface FixRow {
  id: number;
  source_id: string;
  url: string;
  published_at: string;
  created_at: string;
}

export type Verdict = "fix" | "ok" | "mismatch" | "unverified";

export interface FixDecision {
  row: FixRow;
  verdict: Verdict;
  /** 바꿀 값(fix) 또는 페이지의 발행 시각(ISO UTC). 모르면 null. */
  nextIso: string | null;
  /** 페이지로 직접 확인한 행인가(아니면 회차 판정을 따른 것). */
  checked: boolean;
  /** 표본 페이지 실패 사유. */
  error?: string;
}

/** 기사 페이지 → 받은 HTML. 테스트는 가짜를 주입한다. */
export type PageFetcher = (url: string) => Promise<string>;

// ── 순수 로직 ────────────────────────────────────────────────────────────

/** HTML 의 `<meta property="article:published_time" content="…">` → ISO UTC. 시간대 없는 값·없음은 null. */
export function extractPublishedTime(html: string): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/(?:property|name)\s*=\s*["']article:published_time["']/i.test(tag)) continue;
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim();
    // 시간대가 없으면 같은 문제를 되풀이하므로 정답으로 쓰지 않는다.
    if (!content || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(content)) return null;
    const date = new Date(content);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/** 저장값과 페이지 값 비교. */
export function judge(storedIso: string, pageIso: string): Exclude<Verdict, "unverified"> {
  const diff = Date.parse(storedIso) - Date.parse(pageIso);
  if (Math.abs(diff) <= MATCH_TOLERANCE_MS) return "ok";
  if (Math.abs(diff - KST_OFFSET_MS) <= MATCH_TOLERANCE_MS) return "fix";
  return "mismatch";
}

/** 저장값 − 9시간. */
export const shiftKst = (iso: string) => new Date(Date.parse(iso) - KST_OFFSET_MS).toISOString();

/** 수집 회차 키(created_at 의 시까지) — 같은 회차는 한 프로세스라 시간대 해석이 같다. */
export const runKey = (row: FixRow) => row.created_at.slice(0, 13);

export function selectRows(db: DatabaseType, sources: string[]): FixRow[] {
  const stmt = db.prepare<[string], FixRow>(
    "SELECT id, source_id, url, published_at, created_at FROM articles WHERE source_id = ? ORDER BY id",
  );
  return sources.flatMap((s) => stmt.all(s));
}

/** 동시 요청 수를 제한해 순서대로 결과를 모은다. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** 한 회차: 표본을 확인하고 회차 판정을 전체 행에 편다. */
async function planRun(
  rows: FixRow[],
  fetchPage: PageFetcher,
  perRun: number,
): Promise<FixDecision[]> {
  const checked = new Map<number, FixDecision>();
  let lastError: string | undefined;
  for (const row of rows.slice(0, perRun + EXTRA_ATTEMPTS)) {
    if (checked.size >= perRun) break;
    try {
      const pageIso = extractPublishedTime(await fetchPage(row.url));
      if (!pageIso) {
        lastError = "발행 시각 메타 없음";
        continue;
      }
      const verdict = judge(row.published_at, pageIso);
      checked.set(row.id, { row, verdict, nextIso: pageIso, checked: true });
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  const verdicts = [...checked.values()].map((d) => d.verdict);
  const runVerdict =
    verdicts.length && verdicts.every((v) => v === "fix")
      ? "fix"
      : verdicts.length && verdicts.every((v) => v === "ok")
        ? "ok"
        : null;
  return rows.map((row): FixDecision => {
    const own = checked.get(row.id);
    if (own) return own;
    if (runVerdict === "fix")
      return { row, verdict: "fix", nextIso: shiftKst(row.published_at), checked: false };
    if (runVerdict === "ok") return { row, verdict: "ok", nextIso: null, checked: false };
    return {
      row,
      verdict: "unverified",
      nextIso: null,
      checked: false,
      error: verdicts.length ? "회차 표본 판정이 섞임" : lastError,
    };
  });
}

export async function planFix(
  rows: FixRow[],
  fetchPage: PageFetcher,
  { perRun = 2, concurrency = 2 }: { perRun?: number; concurrency?: number } = {},
): Promise<FixDecision[]> {
  const runs = new Map<string, FixRow[]>();
  for (const row of rows) {
    const list = runs.get(runKey(row)) ?? [];
    list.push(row);
    runs.set(runKey(row), list);
  }
  const planned = await mapLimit([...runs.values()], concurrency, (list) =>
    planRun(list, fetchPage, perRun),
  );
  const byId = new Map(planned.flat().map((d) => [d.row.id, d]));
  return rows.map((row) => byId.get(row.id)!);
}

/** 보정 대상만 한 트랜잭션으로 쓴다(저장값이 그사이 바뀐 행은 건너뜀). 쓴 행 수. */
export function applyFix(db: DatabaseType, decisions: FixDecision[]): number {
  const update = db.prepare(
    "UPDATE articles SET published_at = ? WHERE id = ? AND published_at = ?",
  );
  return db.transaction(() => {
    let n = 0;
    for (const d of decisions) {
      if (d.verdict !== "fix" || !d.nextIso) continue;
      n += update.run(d.nextIso, d.row.id, d.row.published_at).changes;
    }
    return n;
  })();
}

export function formatReport(decisions: FixDecision[], examples = 3): string {
  const bySource = new Map<string, FixDecision[]>();
  for (const d of decisions) {
    const list = bySource.get(d.row.source_id) ?? [];
    list.push(d);
    bySource.set(d.row.source_id, list);
  }
  const lines: string[] = [];
  for (const [source, list] of bySource) {
    const count = (v: Verdict) => list.filter((d) => d.verdict === v).length;
    lines.push(
      `${source}: 대상 ${list.length}건 · 보정 ${count("fix")} · 이미 맞음 ${count("ok")}` +
        ` · 불일치 ${count("mismatch")} · 미확인 ${count("unverified")}` +
        ` (페이지 확인 ${list.filter((d) => d.checked).length}건)`,
    );
    for (const v of ["fix", "mismatch", "unverified"] as const) {
      for (const d of list.filter((x) => x.verdict === v).slice(0, examples)) {
        lines.push(
          `  [${v}${d.checked ? "·확인" : ""}] id=${d.row.id} 저장 ${d.row.published_at}` +
            ` → ${d.nextIso ?? "-"} (수집 ${d.row.created_at})${d.error ? ` — ${d.error}` : ""}`,
        );
      }
    }
  }
  return lines.join("\n");
}

// ── CLI ─────────────────────────────────────────────────────────────────

export interface CliArgs {
  apply: boolean;
  sources: string[];
  perRun: number;
  db: string;
  concurrency: number;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    apply: false,
    sources: DEFAULT_SOURCES,
    perRun: 2,
    db: DB_PATH,
    concurrency: 2,
  };
  let dryRun = false;
  const positiveInt = (flag: string, v: string | undefined) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} 는 양의 정수여야 합니다: ${v}`);
    return n;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} 에 값이 필요합니다`);
      return v;
    };
    switch (flag) {
      case "--apply":
        args.apply = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--sources":
        args.sources = value()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--per-run":
        args.perRun = positiveInt(flag, value());
        break;
      case "--concurrency":
        args.concurrency = positiveInt(flag, value());
        break;
      case "--db":
        args.db = path.resolve(value());
        break;
      default:
        throw new Error(`알 수 없는 옵션: ${flag}`);
    }
  }
  if (args.apply && dryRun) throw new Error("--apply 와 --dry-run 은 함께 쓸 수 없습니다");
  if (!args.sources.length) throw new Error("--sources 가 비었습니다");
  return args;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: PAGE_HEADERS,
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Status code ${res.status}`);
  }
  return res.text();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[fix-published-at] ${args.apply ? "APPLY" : "DRY-RUN"} db=${args.db}` +
      ` sources=${args.sources.join(",")} per-run=${args.perRun}`,
  );
  const db = new Database(args.db, { fileMustExist: true, readonly: !args.apply });
  try {
    const rows = selectRows(db, args.sources);
    const decisions = await planFix(rows, fetchPage, {
      perRun: args.perRun,
      concurrency: args.concurrency,
    });
    console.log(`\n${formatReport(decisions)}\n`);

    const toFix = decisions.filter((d) => d.verdict === "fix").length;
    if (!args.apply) {
      console.log("[fix-published-at] dry-run — DB 는 바꾸지 않았습니다. 반영하려면 --apply");
      return;
    }
    if (toFix === 0) {
      console.log("[fix-published-at] 바꿀 행이 없습니다.");
      return;
    }
    const backup = backupPath(args.db);
    await db.backup(backup);
    console.log(`[fix-published-at] 백업 ${backup}`);
    console.log(`[fix-published-at] ${applyFix(db, decisions)}건 UPDATE`);
  } finally {
    db.close();
  }
}

// tsx 로 직접 실행될 때만 동작한다.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit())
    .catch((err) => {
      console.error(`[fix-published-at] ${(err as Error).message}`);
      process.exit(1);
    });
}
