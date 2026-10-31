/**
 * data/app.db 를 생성하고 schema.sql 의 테이블을 만든 뒤 sources 를 configs/sources.json 과 맞춘다.
 * 실행: npm run db:init  (= tsx scripts/lib/initDb.ts)
 *       기존 DB 에 다시 실행하면 신규 컬럼 추가 + 소스 동기화만 한다(멱등).
 *       `--existing`: DB 파일이 없으면 만들지 않고 실패한다(prebuild — 빈 DB 로 배포되는 것을 막는다).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { DB_PATH } from "../../src/lib/paths";
import { describeSync, loadSourcesConfig, syncSources } from "./syncSources";

const SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");

/** 기존 DB 에 나중에 추가된 컬럼. CREATE TABLE IF NOT EXISTS 는 기존 테이블을 바꾸지 않는다. */
const ADDED_COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: "articles", column: "related_json", ddl: "related_json TEXT" },
  { table: "sources", column: "format", ddl: "format TEXT NOT NULL DEFAULT 'news'" },
  { table: "articles", column: "follow_up_of", ddl: "follow_up_of INTEGER" },
];

/** 추가 컬럼에 거는 인덱스. schema.sql 에 두면 컬럼이 없는 기존 DB 에서 exec 가 실패하므로 컬럼 추가 뒤에 만든다. */
const ADDED_INDEXES = [
  // 상세 페이지의 후속 보도(역방향) 조회 — 빌드가 기사마다 부른다.
  "CREATE INDEX IF NOT EXISTS articles_follow_up_of ON articles(follow_up_of)",
];

/**
 * 스키마를 최신으로 맞춘다(멱등). 새 테이블은 schema.sql 의 IF NOT EXISTS 로,
 * 기존 테이블의 신규 컬럼은 ALTER TABLE 로 추가한다. 수집 배치가 매 실행 시작 시 호출한다.
 */
export function ensureSchema(db: DatabaseType): void {
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
  for (const ddl of ADDED_INDEXES) db.exec(ddl);
}

export function initDb(dbPath: string = DB_PATH, opts: { mustExist?: boolean } = {}): void {
  const db = new Database(dbPath, { fileMustExist: opts.mustExist ?? false });
  try {
    ensureSchema(db);
    const sync = syncSources(db, loadSourcesConfig());
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    console.log(`Initialized DB at ${dbPath}`);
    console.log(`Tables/views (${tables.length}):`);
    for (const t of tables) console.log(`  - ${t.name}`);
    console.log(`Sources sync: ${describeSync(sync)}`);
  } finally {
    db.close();
  }
}

// tsx로 직접 실행될 때만 동작
if (import.meta.url === `file://${process.argv[1]}`) {
  initDb(DB_PATH, { mustExist: process.argv.includes("--existing") });
}
