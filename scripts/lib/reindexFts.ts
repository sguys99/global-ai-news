/**
 * articles_fts(FTS5)를 재생성하고 기존 articles 전량을 재색인한다.
 * 실행: npm run db:reindex  (= tsx scripts/lib/reindexFts.ts)
 *
 * 스키마가 IF NOT EXISTS 라서, 기존 DB의 옛 FTS 정의(컬럼 적음)는 자동 변경되지 않는다.
 * FTS는 articles 에서 파생되는 데이터이므로 안전하게 drop → 재생성 → rebuild 한다.
 * schema.sql 을 단일 출처로 재사용한다(DDL 중복 없음).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { DB_PATH } from "../../src/lib/paths";

const SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");

export function reindexFts(dbPath: string = DB_PATH): void {
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    // 옛 FTS 테이블·트리거 제거 → schema.sql 재실행(FTS/트리거만 재생성) → 전량 재색인
    db.exec(`
      DROP TRIGGER IF EXISTS articles_ai;
      DROP TRIGGER IF EXISTS articles_ad;
      DROP TRIGGER IF EXISTS articles_au;
      DROP TABLE IF EXISTS articles_fts;
    `);
    db.exec(schema);
    db.exec("INSERT INTO articles_fts(articles_fts) VALUES('rebuild')");

    const count = (db.prepare("SELECT COUNT(*) AS n FROM articles_fts").get() as { n: number }).n;
    console.log(`Reindexed articles_fts at ${dbPath} (${count} rows)`);
  } finally {
    db.close();
  }
}

// tsx로 직접 실행될 때만 동작
if (import.meta.url === `file://${process.argv[1]}`) {
  reindexFts();
}
