/**
 * 수집 배치 오케스트레이터. PRD §3.2 / WORK-PLAN Phase 1~3.
 * 실행: npm run collect  (= tsx scripts/collect.ts)
 *
 * ① 다중 어댑터 수집(RSS/HN/GitHub/HF/Reddit) → ② 정규화/dedup/trendingScore
 * → ③ 신규 후보 중 트렌딩 상위 MAX_ITEMS_PER_RUN 건만 LLM 가공(1건당 1호출)
 * → ④ SQLite 저장 + collection_runs(비용·소스별 건수) 기록.
 *
 * 소스별 try/catch 로 부분 실패를 격리한다(한 소스 실패가 전체를 막지 않음).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { CONFIGS_DIR, DB_PATH } from "../src/lib/paths";
import type { RawItem } from "../src/lib/types";
import { fetchGithub, fetchHf, fetchHn } from "./lib/collect/api";
import { fetchArxiv } from "./lib/collect/arxiv";
import { fetchReddit } from "./lib/collect/reddit";
import { fetchRss, type SourceConfig } from "./lib/collect/rss";
import { estimateCost } from "./lib/cost";
import { dedupKey } from "./lib/dedup";
import { enrichArticle } from "./lib/enrich";
import { saveTags } from "./lib/tags";
import { trendingScore } from "./lib/trending";

/** 가공 비용 추정에 쓰는 모델 (enrich.ts 와 동일 기본값). */
const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5";

/** 1회 실행당 LLM 가공 상한. 초과 시 trending_score 상위만 가공한다(비용 가드). */
const MAX_ITEMS_PER_RUN = Number(process.env.MAX_ITEMS_PER_RUN ?? 150);

/** kind → 수집 어댑터. WEB 은 등록만 하고 수집하지 않는다(Post-MVP). */
const ADAPTERS: Record<string, (s: SourceConfig) => Promise<RawItem[]>> = {
  rss: fetchRss,
  hn: fetchHn,
  github: fetchGithub,
  hf: fetchHf,
  reddit: fetchReddit,
  arxiv: fetchArxiv,
};

/** 수집·dedup 을 통과한 신규 후보(아직 미가공). */
interface Candidate {
  item: RawItem;
  key: string;
  score: number;
}

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
    const sources = loadSources().filter((s) => s.enabled === 1 && s.kind in ADAPTERS);

    const upsertSource = db.prepare(
      `INSERT INTO sources (id, name, kind, url, enabled)
       VALUES (@id, @name, @kind, @url, @enabled)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, kind = excluded.kind,
         url = excluded.url, enabled = excluded.enabled`,
    );

    const existsKey = db.prepare("SELECT 1 FROM articles WHERE dedup_key = ? LIMIT 1");

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

    // ── 1패스: 전 소스 수집 → 배치/DB dedup → 신규 후보 누적(가공 전) ──
    const seen = new Set<string>(); // 배치 전체 중복 방지
    const candidates: Candidate[] = [];

    for (const source of sources) {
      upsertSource.run(source);
      try {
        const items = await ADAPTERS[source.kind](source);
        itemsCollected += items.length;

        let newCount = 0;
        for (const item of items) {
          const key = dedupKey(item.url);
          if (seen.has(key)) continue; // 배치 내 중복
          seen.add(key);
          if (existsKey.get(key)) continue; // 기존 저장분 → 재가공 0

          candidates.push({ item, key, score: trendingScore(item) });
          newCount += 1;
        }
        notes.push(`${source.id}: ${items.length}건(신규 ${newCount})`);
      } catch (err) {
        status = "partial";
        notes.push(`${source.id}: 실패 ${(err as Error).message}`);
        console.error(`[collect] source ${source.id} failed:`, err);
      }
    }

    // ── 비용 가드: 후보 > 상한이면 trending_score 상위만 가공 ──
    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates.slice(0, MAX_ITEMS_PER_RUN);
    if (candidates.length > selected.length) {
      notes.push(`capped: 후보 ${candidates.length}건 중 ${selected.length}건 가공`);
    }

    // ── 2패스: 선정된 후보만 LLM 가공 후 완성 INSERT ──
    for (const { item, key, score } of selected) {
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
        engagement_json: item.engagement ? JSON.stringify(item.engagement) : null,
        trending_score: score,
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
