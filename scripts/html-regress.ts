/**
 * HTML 회귀 비교 CLI (english-version-plan Phase 3-1 — Phase 3-4·4·7 에서 다시 쓴다).
 * 실행: npm run regress:html -- <하위 명령> …   (= tsx scripts/html-regress.ts)
 *
 * 구조를 바꿔도(라우트 그룹 이동·뷰 추출·문구 사전) 한국어 정적 페이지가 "보이는 것·SEO" 기준으로
 * 한 글자도 안 바뀌었는지 확인한다. 정규화·diff·고르기 규칙은 scripts/lib/htmlRegress.ts.
 *
 *   build <git-ref|WORKTREE> <dest> [--db data/app.db] [--tmp <dir>] [--no-cache]
 *     Docker(Dockerfile — CI 와 같은 Node 22 정적 export)로 빌드해 out/ 내용을 <dest> 에 꺼낸다.
 *     같은 커밋·같은 DB 를 다시 빌드하면 Docker 레이어 캐시가 그대로 맞아 next build 가 돌지 않는다 —
 *     빌드 결정성을 확인할 때는 --no-cache(apt·npm ci 부터 다시, 수 분).
 *     git-ref: 임시 git worktree 를 그 커밋으로 만들고 --db(기본 현재 작업 트리 data/app.db)를 덮어써서 빌드한 뒤
 *     worktree 를 지운다 — 기준선과 후보가 같은 DB 를 쓰게 한다. WORKTREE: 현재 작업 트리를 그대로 빌드한다
 *     (커밋 안 한 변경 포함, DB 도 작업 트리의 것). <dest>/.regress-build.json 에 커밋·DB 해시를 남긴다.
 *     이미지 daybook-regress:<라벨> 은 남겨 둔다 — 스크린숏 비교가 필요하면
 *     `docker run --rm -p 8080:8080 daybook-regress:<라벨>` → http://localhost:8080/global-ai-news/
 *   select <outDir> [--manifest configs/html-regress-pages.json] [--db data/app.db] [--force]
 *     대표 페이지(홈·호 2개·기사 5~6건·검색·404 + sitemap·RSS)를 DB·산출물에서 결정적으로 골라 manifest 로 쓴다.
 *     better-sqlite3 를 쓰므로 로컬에서는 Node 24 PATH 로 실행한다(다른 하위 명령은 DB 를 열지 않는다).
 *   snapshot <outDir> <snapDir> [--manifest …]
 *     manifest 의 페이지 원본만 <snapDir> 에 같은 상대 경로로 복사한다(+ manifest.json·.regress-build.json).
 *     정규화는 비교 때 하므로 규칙을 고쳐도 스냅숏을 다시 뜰 필요가 없다.
 *   compare <baseDir> <candDir> [--manifest …] [--allow <경로[,경로]>]… [--allow-file <파일>]
 *           [--text] [--context 3] [--max-lines 300] [--keep <dir>]
 *     두 디렉터리(out 이든 스냅숏이든)의 같은 페이지를 정규화해 unified diff 를 출력한다.
 *     manifest 기본값: --manifest > <baseDir>/manifest.json > configs/html-regress-pages.json.
 *     --allow·--allow-file: 의도된 차이(예: Phase 3 의 global-not-found 404 → `--allow 404.html`, 접두어는 `article/*`).
 *       허용 페이지의 차이도 출력하지만 실패로 세지 않는다.
 *     --text: class·style 속성을 빼고 구조·텍스트만 비교(Phase 4 클래스 이름 변경용).
 *     --keep: 정규화 결과를 <dir>/{base,cand}/<경로>.txt 로 남긴다(외부 diff 도구용).
 *     종료 코드: 0 = 허용 밖 차이 없음, 1 = 차이·누락 있음, 2 = 사용법·입력 오류.
 *
 * 예 (기준선 → 후보 → 비교):
 *   npm run regress:html -- build 66198d3 data/regress/out-66198d3
 *   npm run regress:html -- snapshot data/regress/out-66198d3 data/regress/baseline
 *   npm run regress:html -- build WORKTREE data/regress/out-worktree
 *   npm run regress:html -- compare data/regress/baseline data/regress/out-worktree --allow 404.html
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIGS_DIR, DB_PATH, REGRESS_MANIFEST_PATH, REPO_ROOT } from "../src/lib/paths";
import {
  comparePage,
  isAllowed,
  normalizePage,
  parseAllowList,
  parseManifest,
  pickArticles,
  weekdayOf,
  type ArticleRow,
  type Manifest,
  type ManifestPage,
  type PageResult,
} from "./lib/htmlRegress";

const BUILD_INFO = ".regress-build.json";
const IMAGE_REPO = "daybook-regress";
/** nginx 런너 이미지 안에서 정적 산출물이 놓이는 곳(Dockerfile runner 단계). */
const IMAGE_OUT_DIR = "/usr/share/nginx/html/global-ai-news";

class UsageError extends Error {}

// ── 인자 ────────────────────────────────────────────────────────────────

interface Parsed {
  positional: string[];
  flags: Map<string, string[]>;
}

const BOOLEAN_FLAGS = new Set(["--force", "--text", "--no-cache"]);

function parseArgs(argv: readonly string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const [name, inline] = a.split("=", 2) as [string, string | undefined];
    let value: string;
    if (BOOLEAN_FLAGS.has(name)) value = "1";
    else if (inline !== undefined) value = inline;
    else {
      const next = argv[++i];
      if (next === undefined) throw new UsageError(`${name} 에 값이 없다`);
      value = next;
    }
    flags.set(name, [...(flags.get(name) ?? []), value]);
  }
  return { positional, flags };
}

const flag = (p: Parsed, name: string): string | undefined => p.flags.get(name)?.at(-1);

function intFlag(p: Parsed, name: string, fallback: number): number {
  const v = flag(p, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new UsageError(`${name} 는 0 이상 정수여야 한다: ${v}`);
  return n;
}

// ── 공용 ────────────────────────────────────────────────────────────────

function run(cmd: string, args: string[], opts: { cwd?: string; logFd?: number } = {}): string {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    stdio:
      opts.logFd === undefined ? ["ignore", "pipe", "pipe"] : ["ignore", opts.logFd, opts.logFd],
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const tail = opts.logFd === undefined ? `\n${r.stderr ?? ""}` : "";
    throw new Error(`${cmd} ${args.join(" ")} 실패(exit ${r.status})${tail}`);
  }
  return (r.stdout ?? "").trim();
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function dirSize(dir: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) {
      bytes += statSync(path.join(e.parentPath, e.name)).size;
      files++;
    }
  }
  return { bytes, files };
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)}MB`;

interface BuildInfo {
  ref: string;
  commit: string;
  /** WORKTREE 빌드일 때 커밋 안 한 변경 파일 수. */
  uncommitted?: number;
  db: string;
  dbSha256: string;
  image: string;
  builtAt: string;
  buildSeconds: number;
  out: { bytes: number; files: number };
}

function readBuildInfo(dir: string): BuildInfo | null {
  const f = path.join(dir, BUILD_INFO);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf-8")) as BuildInfo) : null;
}

function loadManifest(file: string): Manifest {
  if (!existsSync(file)) throw new UsageError(`manifest 가 없다: ${file} (먼저 select)`);
  return parseManifest(readFileSync(file, "utf-8"));
}

// ── build ───────────────────────────────────────────────────────────────

function cmdBuild(p: Parsed): void {
  const [ref, destArg] = p.positional;
  if (!ref || !destArg) throw new UsageError("build <git-ref|WORKTREE> <dest>");
  const dest = path.resolve(destArg);
  if (existsSync(dest) && readdirSync(dest).length) {
    throw new UsageError(`${dest} 가 비어 있지 않다 — 지우고 다시 실행한다`);
  }
  const isWorktree = ref === "WORKTREE";
  const db = path.resolve(flag(p, "--db") ?? DB_PATH);
  if (!existsSync(db)) throw new UsageError(`DB 가 없다: ${db}`);

  const commit = run("git", ["rev-parse", "--verify", `${isWorktree ? "HEAD" : ref}^{commit}`]);
  const label = isWorktree ? "worktree" : commit.slice(0, 7);
  const image = `${IMAGE_REPO}:${label}`;
  mkdirSync(path.dirname(dest), { recursive: true });
  const logFile = `${dest}.build.log`;

  let context = REPO_ROOT;
  let tmpRoot: string | null = null;
  let worktree: string | null = null;
  let uncommitted: number | undefined;
  if (isWorktree) {
    if (path.resolve(db) !== path.resolve(DB_PATH)) {
      throw new UsageError(
        "WORKTREE 빌드는 작업 트리 data/app.db 를 그대로 쓴다(--db 는 git-ref 빌드 전용)",
      );
    }
    uncommitted = run("git", ["status", "--porcelain"]).split("\n").filter(Boolean).length;
  } else {
    tmpRoot = mkdtempSync(path.join(flag(p, "--tmp") ?? os.tmpdir(), `${IMAGE_REPO}-${label}-`));
    worktree = path.join(tmpRoot, "src");
    console.log(`임시 worktree: ${worktree} (${commit})`);
    run("git", ["worktree", "add", "--detach", worktree, commit]);
    // 두 빌드가 같은 DB 를 쓰게 한다 — 커밋 시점 DB 가 아니라 지정한 DB(기본: 현재 작업 트리).
    copyFileSync(db, path.join(worktree, "data", "app.db"));
    context = worktree;
  }

  const started = Date.now();
  const container = `${IMAGE_REPO}-${label}-${process.pid}`;
  try {
    console.log(`docker build → ${image} (로그 ${logFile})`);
    const fd = openSync(logFile, "w");
    try {
      // 같은 컨텍스트면 Docker 가 레이어 캐시를 그대로 쓴다(next build 가 안 돈다) — 결정성 확인은 --no-cache.
      const cache = flag(p, "--no-cache") ? ["--no-cache"] : [];
      run("docker", ["build", "--progress=plain", ...cache, "-t", image, context], { logFd: fd });
    } finally {
      closeSync(fd);
    }
    run("docker", ["create", "--name", container, image]);
    try {
      // docker cp: dest 가 없으면 원본 디렉터리 "내용"이 dest 로 복사된다.
      if (existsSync(dest)) rmSync(dest, { recursive: true });
      run("docker", ["cp", `${container}:${IMAGE_OUT_DIR}`, dest]);
    } finally {
      run("docker", ["rm", container]);
    }
  } finally {
    if (worktree) {
      run("git", ["worktree", "remove", "--force", worktree]);
      if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  const info: BuildInfo = {
    ref,
    commit,
    ...(uncommitted !== undefined ? { uncommitted } : {}),
    db,
    dbSha256: sha256File(db),
    image,
    builtAt: new Date().toISOString(),
    buildSeconds: Math.round((Date.now() - started) / 1000),
    out: dirSize(dest),
  };
  writeFileSync(path.join(dest, BUILD_INFO), JSON.stringify(info, null, 2) + "\n");
  console.log(
    `완료: ${dest} — ${info.out.files}개 파일 ${mb(info.out.bytes)}, ${info.buildSeconds}s` +
      (uncommitted ? ` (커밋 안 한 변경 ${uncommitted}개 포함)` : ""),
  );
}

// ── select ──────────────────────────────────────────────────────────────

async function cmdSelect(p: Parsed): Promise<void> {
  const [outArg] = p.positional;
  if (!outArg) throw new UsageError("select <outDir>");
  const outDir = path.resolve(outArg);
  const manifestPath = path.resolve(flag(p, "--manifest") ?? REGRESS_MANIFEST_PATH);
  if (existsSync(manifestPath) && !flag(p, "--force")) {
    throw new UsageError(`${manifestPath} 가 이미 있다 — 다시 고르려면 --force`);
  }
  const db = path.resolve(flag(p, "--db") ?? DB_PATH);
  // better-sqlite3 는 select 에서만 연다(다른 하위 명령은 Node 버전과 무관하게 돌게).
  const { default: Database } = await import("better-sqlite3");
  const conn = new Database(db, { readonly: true, fileMustExist: true });
  const exists = (rel: string) => existsSync(path.join(outDir, rel));
  const editionFile = (date: string) => `edition/${date}/index.html`;

  try {
    const dates = (
      conn
        .prepare(
          `SELECT date(created_at, '+9 hours') AS d FROM articles
            WHERE summary_ko IS NOT NULL GROUP BY d ORDER BY d`,
        )
        .all() as { d: string }[]
    )
      .map((r) => r.d)
      .filter((d) => exists(editionFile(d)));
    const latest = dates.at(-1);
    if (!latest) throw new Error(`${outDir} 에 호 페이지가 없다`);
    // 지난 호: 최신 호 이전의 가장 최근 일요일 중 주간 레이더 밴드(#weekly)가 실린 호 → 없으면 일주일 전쯤 호.
    const sundays = dates
      .filter((d) => d < latest && weekdayOf(d) === 0)
      .filter((d) =>
        readFileSync(path.join(outDir, editionFile(d)), "utf-8").includes('id="weekly"'),
      );
    const older = sundays.at(-1) ?? dates.at(-8) ?? dates[0];

    // 한국 매체(region)·형식은 configs/sources.json 이 원본이다 — 커밋된 DB 의 sources 행은 빌드 prebuild(initDb --existing)
    // 가 동기화하기 전 값이라 비어 있을 수 있다(2026-11-04: region 전부 NULL). 산출물은 동기화 뒤 값으로 그려진다.
    const sourceConfig = new Map(
      (
        JSON.parse(readFileSync(path.join(CONFIGS_DIR, "sources.json"), "utf-8")) as {
          id: string;
          region?: string;
          format?: string;
        }[]
      ).map((s) => [s.id, s]),
    );
    const rows = (
      conn
        .prepare(
          `SELECT a.id, a.source_id AS sourceId, date(a.created_at, '+9 hours') AS date, s.format, s.region,
                  (a.related_json IS NOT NULL AND a.related_json NOT IN ('', '[]')) AS hasRelated,
                  (a.follow_up_of IS NOT NULL OR EXISTS (
                     SELECT 1 FROM articles c WHERE c.follow_up_of = a.id AND c.summary_ko IS NOT NULL)) AS inThread
             FROM articles a JOIN sources s ON s.id = a.source_id
            WHERE a.summary_ko IS NOT NULL`,
        )
        .all() as (Omit<ArticleRow, "hasRelated" | "inThread" | "hasOgImage"> & {
        sourceId: string;
        hasRelated: number;
        inThread: number;
      })[]
    )
      .filter((r) => exists(`article/${r.id}/index.html`))
      .map(
        ({ sourceId, ...r }): ArticleRow => ({
          ...r,
          format: sourceConfig.get(sourceId)?.format ?? r.format,
          region: sourceConfig.get(sourceId)?.region ?? r.region,
          hasRelated: !!r.hasRelated,
          inThread: !!r.inThread,
          hasOgImage: exists(`og/article/${r.id}.png`),
        }),
      );
    const picks = pickArticles(rows);

    const pages: ManifestPage[] = [
      { path: "index.html", kind: "html", why: `홈 — 최신 호 ${latest} 지면 + 색인` },
      { path: editionFile(latest), kind: "html", why: `최신 호 고정 링크 (${latest})` },
      {
        path: editionFile(older),
        kind: "html",
        why: sundays.length ? `지난 호 — 일요일, 주간 레이더 (${older})` : `지난 호 (${older})`,
      },
      ...picks.map(
        (a): ManifestPage => ({ path: `article/${a.id}/index.html`, kind: "html", why: a.why }),
      ),
      { path: "search/index.html", kind: "html", why: "검색 셸" },
      {
        path: "404.html",
        kind: "html",
        why: "404 — Phase 3 global-not-found 로 의도적으로 바뀐다(허용 목록)",
      },
      { path: "sitemap.xml", kind: "xml", why: "사이트맵(SEO)" },
      { path: "feed.xml", kind: "xml", why: "RSS" },
    ];
    const missing = pages.filter((pg) => !exists(pg.path));
    if (missing.length)
      throw new Error(`산출물에 없는 페이지: ${missing.map((m) => m.path).join(", ")}`);

    const manifest: Manifest = {
      version: 1,
      selectedFrom: {
        outDir: path.relative(REPO_ROOT, outDir) || outDir,
        db: path.relative(REPO_ROOT, db) || db,
        dbSha256: sha256File(db),
        at: new Date().toISOString(),
      },
      pages,
    };
    mkdirSync(path.dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${manifestPath} — ${pages.length}페이지`);
    for (const pg of pages) console.log(`  ${pg.path.padEnd(32)} ${pg.why}`);
  } finally {
    conn.close();
  }
}

// ── snapshot ────────────────────────────────────────────────────────────

function cmdSnapshot(p: Parsed): void {
  const [outArg, snapArg] = p.positional;
  if (!outArg || !snapArg) throw new UsageError("snapshot <outDir> <snapDir>");
  const outDir = path.resolve(outArg);
  const snapDir = path.resolve(snapArg);
  if (existsSync(snapDir) && readdirSync(snapDir).length) {
    throw new UsageError(`${snapDir} 가 비어 있지 않다 — 지우고 다시 실행한다`);
  }
  const manifestPath = path.resolve(flag(p, "--manifest") ?? REGRESS_MANIFEST_PATH);
  const manifest = loadManifest(manifestPath);
  let bytes = 0;
  for (const pg of manifest.pages) {
    const from = path.join(outDir, pg.path);
    if (!existsSync(from)) throw new Error(`산출물에 없다: ${from}`);
    const to = path.join(snapDir, pg.path);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    bytes += statSync(to).size;
  }
  writeFileSync(path.join(snapDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  if (existsSync(path.join(outDir, BUILD_INFO))) {
    copyFileSync(path.join(outDir, BUILD_INFO), path.join(snapDir, BUILD_INFO));
  }
  console.log(
    `${snapDir} — ${manifest.pages.length}페이지 ${mb(bytes)} (manifest ${manifestPath})`,
  );
}

// ── compare ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PageResult["status"], string> = {
  same: "같음",
  diff: "차이",
  allowed: "허용",
  missing: "누락",
};

function cmdCompare(p: Parsed): number {
  const [baseArg, candArg] = p.positional;
  if (!baseArg || !candArg) throw new UsageError("compare <baseDir> <candDir>");
  const baseDir = path.resolve(baseArg);
  const candDir = path.resolve(candArg);
  for (const d of [baseDir, candDir])
    if (!existsSync(d)) throw new UsageError(`없는 디렉터리: ${d}`);
  const manifestPath = path.resolve(
    flag(p, "--manifest") ??
      (existsSync(path.join(baseDir, "manifest.json"))
        ? path.join(baseDir, "manifest.json")
        : REGRESS_MANIFEST_PATH),
  );
  const manifest = loadManifest(manifestPath);
  const allow = [
    ...(p.flags.get("--allow") ?? []).flatMap((v) => v.split(",").map((s) => s.trim())),
    ...(p.flags.get("--allow-file") ?? []).flatMap((f) => parseAllowList(readFileSync(f, "utf-8"))),
  ].filter(Boolean);
  const text = !!flag(p, "--text");
  const context = intFlag(p, "--context", 3);
  const maxLines = intFlag(p, "--max-lines", 300);
  const keep = flag(p, "--keep");

  const baseInfo = readBuildInfo(baseDir);
  const candInfo = readBuildInfo(candDir);
  console.log(
    `base: ${baseDir}${baseInfo ? ` (${baseInfo.ref} ${baseInfo.commit.slice(0, 7)})` : ""}`,
  );
  console.log(
    `cand: ${candDir}${candInfo ? ` (${candInfo.ref} ${candInfo.commit.slice(0, 7)})` : ""}`,
  );
  console.log(
    `manifest: ${manifestPath} · 모드: ${text ? "텍스트(class·style 제외)" : "전체"}` +
      (allow.length ? ` · 허용: ${allow.join(", ")}` : ""),
  );
  if (baseInfo && candInfo && baseInfo.dbSha256 !== candInfo.dbSha256) {
    console.log(
      "⚠ 두 빌드의 DB 가 다르다(dbSha256) — 콘텐츠 차이가 섞인다. 같은 DB 로 다시 빌드한다(build --db).",
    );
  }

  const results: PageResult[] = [];
  for (const pg of manifest.pages) {
    const read = (dir: string, side: "base" | "cand"): string | null => {
      const f = path.join(dir, pg.path);
      if (!existsSync(f)) return null;
      const norm = normalizePage(pg.kind, readFileSync(f, "utf-8"), { text });
      if (keep) {
        const to = path.join(path.resolve(keep), side, `${pg.path}.txt`);
        mkdirSync(path.dirname(to), { recursive: true });
        writeFileSync(to, norm);
      }
      return norm;
    };
    const r = comparePage(pg.path, read(baseDir, "base"), read(candDir, "cand"), {
      allowed: isAllowed(pg.path, allow),
      context,
    });
    results.push(r);
    if (r.status === "same") continue;
    console.log(
      `\n=== ${pg.path} [${STATUS_LABEL[r.status]}] +${r.stats.added} -${r.stats.removed}`,
    );
    const lines = r.diff.trimEnd().split("\n");
    console.log(lines.slice(0, maxLines).join("\n"));
    if (lines.length > maxLines)
      console.log(`… (${lines.length - maxLines}줄 더 — --max-lines 로 늘린다)`);
  }

  console.log("\n요약");
  for (const r of results) {
    const delta = r.status === "same" ? "" : `+${r.stats.added} -${r.stats.removed}`;
    console.log(`  ${STATUS_LABEL[r.status]}  ${r.path.padEnd(32)} ${delta}`);
  }
  const bad = results.filter((r) => r.status === "diff" || r.status === "missing");
  const allowed = results.filter((r) => r.status === "allowed");
  console.log(
    `\n${results.length}페이지: 같음 ${results.length - bad.length - allowed.length} · 허용 ${allowed.length} · 차이 ${bad.length}` +
      (bad.length ? " → 실패" : " → 통과"),
  );
  return bad.length ? 1 : 0;
}

// ── main ────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  const p = parseArgs(rest);
  switch (cmd) {
    case "build":
      cmdBuild(p);
      return 0;
    case "select":
      await cmdSelect(p);
      return 0;
    case "snapshot":
      cmdSnapshot(p);
      return 0;
    case "compare":
      return cmdCompare(p);
    default:
      throw new UsageError(
        "하위 명령: build | select | snapshot | compare (scripts/html-regress.ts 머리말 참고)",
      );
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`사용법: ${err.message}`);
      process.exit(2);
    }
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  },
);
