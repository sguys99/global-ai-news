/**
 * data/app.db 를 생성하고 schema.sql 의 테이블을 만든다.
 * 실행: npm run db:init  (= tsx scripts/lib/initDb.ts)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { DB_PATH } from "../../src/lib/paths";

const SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");

/** 기존 DB 에 나중에 추가된 컬럼. CREATE TABLE IF NOT EXISTS 는 기존 테이블을 바꾸지 않는다. */
const ADDED_COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: "articles", column: "related_json", ddl: "related_json TEXT" },
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
}

export function initDb(dbPath: string = DB_PATH): void {
  const db = new Database(dbPath);
  try {
    ensureSchema(db);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    console.log(`Initialized DB at ${dbPath}`);
    console.log(`Tables/views (${tables.length}):`);
    for (const t of tables) console.log(`  - ${t.name}`);
  } finally {
    db.close();
  }
}

// tsx로 직접 실행될 때만 동작
if (import.meta.url === `file://${process.argv[1]}`) {
  initDb();
}
