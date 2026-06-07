/**
 * 수집 배치 오케스트레이터. PRD §3.2 / WORK-PLAN Phase 1.
 * 실행: npm run collect  (= tsx scripts/collect.ts)
 *
 * Phase 1: RSS 소스만 수집 → 정규화/dedup → trendingScore → SQLite 저장.
 * LLM 가공(③단계)·다중 어댑터는 이후 Phase 에서 결합한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { CONFIGS_DIR, DB_PATH } from "../src/lib/paths";
import { fetchRss, type SourceConfig } from "./lib/collect/rss";
import { dedupKey } from "./lib/dedup";
import { trendingScore } from "./lib/trending";

function loadSources(): SourceConfig[] {
  const file = path.join(CONFIGS_DIR, "sources.json");
  return JSON.parse(readFileSync(file, "utf-8")) as SourceConfig[];
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  let itemsCollected = 0;
  let itemsNew = 0;
  let status: "success" | "partial" | "failed" = "success";
  const notes: string[] = [];

  try {
    const sources = loadSources().filter(
      (s) => s.enabled === 1 && s.kind === "rss",
    );

    const upsertSource = db.prepare(
      `INSERT INTO sources (id, name, kind, url, enabled)
       VALUES (@id, @name, @kind, @url, @enabled)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, kind = excluded.kind,
         url = excluded.url, enabled = excluded.enabled`,
    );

    const existsKey = db.prepare(
      "SELECT 1 FROM articles WHERE dedup_key = ? LIMIT 1",
    );

    const insertArticle = db.prepare(
      `INSERT OR IGNORE INTO articles
         (dedup_key, source_id, url, title_original, content_raw,
          published_at, engagement_json, trending_score)
       VALUES
         (@dedup_key, @source_id, @url, @title_original, @content_raw,
          @published_at, @engagement_json, @trending_score)`,
    );

    for (const source of sources) {
      upsertSource.run(source);
      try {
        const items = await fetchRss(source);
        itemsCollected += items.length;

        const seen = new Set<string>();
        for (const item of items) {
          const key = dedupKey(item.url);
          if (seen.has(key)) continue; // 배치 내 중복
          seen.add(key);
          if (existsKey.get(key)) continue; // 기존 저장분

          const result = insertArticle.run({
            dedup_key: key,
            source_id: item.sourceId,
            url: item.url,
            title_original: item.title,
            content_raw: item.contentRaw ?? null,
            published_at: item.publishedAt,
            engagement_json: item.engagement
              ? JSON.stringify(item.engagement)
              : null,
            trending_score: trendingScore(item),
          });
          if (result.changes > 0) itemsNew += 1;
        }
      } catch (err) {
        status = "partial";
        notes.push(`${source.id}: ${(err as Error).message}`);
        console.error(`[collect] source ${source.id} failed:`, err);
      }
    }
  } catch (err) {
    status = "failed";
    notes.push((err as Error).message);
    console.error("[collect] fatal:", err);
  } finally {
    db.prepare(
      `INSERT INTO collection_runs
         (started_at, finished_at, items_collected, items_new, status, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      startedAt,
      new Date().toISOString(),
      itemsCollected,
      itemsNew,
      status,
      notes.length ? notes.join("; ") : null,
    );
    db.close();
  }

  console.log(
    `[collect] status=${status} collected=${itemsCollected} new=${itemsNew}`,
  );
  if (status === "failed") process.exit(1);
}

main();
