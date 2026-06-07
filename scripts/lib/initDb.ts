/**
 * data/app.db 를 생성하고 schema.sql 의 테이블을 만든다.
 * 실행: npm run db:init  (= tsx scripts/lib/initDb.ts)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { DB_PATH } from "../../src/lib/paths";

const SCHEMA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "schema.sql",
);

export function initDb(dbPath: string = DB_PATH): void {
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  const db = new Database(dbPath);
  try {
    db.exec(schema);
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
