/**
 * 수집 배치 오케스트레이터. PRD §3.2 / WORK-PLAN Phase 1~2.
 * 실행: npm run collect  (= tsx scripts/collect.ts)
 *
 * ① RSS 수집(rss-parser) → ② 정규화/dedup/trendingScore
 * → ③ 신규 항목 LLM 가공(enrichArticle, 1건당 1호출) → ④ SQLite 저장 + collection_runs(비용) 기록.
 * 다중 어댑터(HN/GitHub/HF/Reddit)·비용 가드는 이후 Phase 에서 결합한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { CONFIGS_DIR, DB_PATH } from "../src/lib/paths";
import { fetchRss, type SourceConfig } from "./lib/collect/rss";
import { estimateCost } from "./lib/cost";
import { dedupKey } from "./lib/dedup";
import { enrichArticle } from "./lib/enrich";
import { saveTags } from "./lib/tags";
import { trendingScore } from "./lib/trending";

/** 가공 비용 추정에 쓰는 모델 (enrich.ts 와 동일 기본값). */
const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5";

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
  let llmCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
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

    // 가공 후 완성 INSERT (WORK-PLAN Phase 2 결정 #1): LLM 필드 포함.
    const insertArticle = db.prepare(
      `INSERT OR IGNORE INTO articles
         (dedup_key, source_id, url, title_original, content_raw,
          published_at, engagement_json, trending_score,
          title_ko, summary_ko, category, importance)
       VALUES
         (@dedup_key, @source_id, @url, @title_original, @content_raw,
          @published_at, @engagement_json, @trending_score,
          @title_ko, @summary_ko, @category, @importance)`,
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
          if (existsKey.get(key)) continue; // 기존 저장분 → 재가공 0

          // ③ 신규 항목만 LLM 가공. 실패 시 null(기사 유지, 한국어 null).
          const result = await enrichArticle(item);
          if (result) {
            llmCalls += 1;
            inputTokens += result.usage.inputTokens;
            outputTokens += result.usage.outputTokens;
          }
          const enrichment = result?.enrichment ?? null;

          const insert = insertArticle.run({
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
            title_ko: enrichment?.title_ko ?? null,
            summary_ko: enrichment?.summary_ko ?? null,
            category: enrichment?.category ?? null,
            importance: enrichment?.importance ?? null,
          });

          if (insert.changes > 0) {
            itemsNew += 1;
            if (enrichment) {
              saveTags(db, insert.lastInsertRowid, enrichment.tags);
            } else {
              notes.push(`${item.url}: enrichment failed`);
            }
          }
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
    const estCost = estimateCost(inputTokens, outputTokens, MODEL);
    db.prepare(
      `INSERT INTO collection_runs
         (started_at, finished_at, items_collected, items_new,
          llm_calls, input_tokens, output_tokens, est_cost_usd, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      startedAt,
      new Date().toISOString(),
      itemsCollected,
      itemsNew,
      llmCalls,
      inputTokens,
      outputTokens,
      estCost,
      status,
      notes.length ? notes.join("; ") : null,
    );
    db.close();
  }

  console.log(
    `[collect] status=${status} collected=${itemsCollected} new=${itemsNew} ` +
      `llm_calls=${llmCalls} tokens=${inputTokens}/${outputTokens} ` +
      `est_cost=$${estimateCost(inputTokens, outputTokens, MODEL).toFixed(4)}`,
  );
  if (status === "failed") process.exit(1);
}

main();
