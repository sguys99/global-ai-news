// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";

const SCHEMA_PATH = path.join(process.cwd(), "scripts/lib/schema.sql");

const EXPECTED = ["sources", "articles", "tags", "article_tags", "articles_fts", "collection_runs"];

describe("schema.sql", () => {
  it("creates the 6 core tables/views in an in-memory db", () => {
    const db = new Database(":memory:");
    try {
      db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
      const names = (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'",
          )
          .all() as { name: string }[]
      ).map((r) => r.name);

      for (const expected of EXPECTED) {
        expect(names).toContain(expected);
      }
    } finally {
      db.close();
    }
  });
});
