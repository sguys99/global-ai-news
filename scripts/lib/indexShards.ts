/**
 * 클라이언트 색인 월별 조각 만들기·쓰기(빌드 전용 — 해시·파일 시스템). 형식·읽기는 src/lib/indexShards.ts.
 * export-search-index·export-feed-index 가 언어마다 부른다.
 */
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hasEnglish } from "../../src/lib/articleText";
import type { Locale } from "../../src/lib/i18n";
import {
  INDEX_SCHEMA,
  MANIFEST_FILE,
  ROW_FIELDS,
  encodeRow,
  issueMonthOf,
  type EncodableCard,
  type IndexKind,
  type IndexManifest,
  type IndexRow,
  type ManifestSource,
} from "../../src/lib/indexShards";
import type { ArticleCard } from "../../src/lib/types";

/**
 * 색인 공개 기본값 — 빌드 시 언어별로 만드는 언어(영어판 Phase 5-2 에서 "en" 추가). 그 언어에 실을 기사는
 * 호출하는 export 가 거른다(`indexArticlesFor` — 영어 본문이 있는 기사만).
 */
export const INDEX_BUILD_LOCALES: readonly Locale[] = ["ko", "en"];

export interface BuiltIndex {
  manifest: IndexManifest;
  /** 월 → 행(기본 정렬 순). manifest.months 와 같은 순서(최신 달 먼저). */
  shards: { month: string; rows: IndexRow[] }[];
}

/** 조각 내용 해시(캐시 키) — 같은 내용이면 빌드가 달라도 같은 값. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 10);
}

/**
 * 카드(기본 정렬 순) → 목록 + 월별 조각.
 * - 월: 기사 id 의 호 날짜(`issueDates`, created_at KST)의 'YYYY-MM'. 호 날짜가 없는 카드는 빌드를 멈춘다(색인에서 새면 안 된다).
 * - 매체 표: `sources`(매체 id → 이름·형식·영문명·지역) — 영문명·지역은 en 목록에만 싣는다.
 * - head: 홈 색인 머리로 실을 카드(기본 정렬 순, 이미 행 대상 카드와 같은 모양).
 */
export function buildIndexShards({
  kind,
  locale,
  cards,
  issueDates,
  sources,
  head,
}: {
  kind: IndexKind;
  locale: Locale;
  cards: readonly EncodableCard[];
  issueDates: ReadonlyMap<number, string>;
  sources: ReadonlyMap<string, ManifestSource>;
  head?: readonly EncodableCard[];
}): BuiltIndex {
  const withOriginal = kind === "search-index";
  const byMonth = new Map<string, IndexRow[]>();
  const usedSources = new Set<string>();
  for (const card of cards) {
    const date = issueDates.get(card.id);
    if (!date) throw new Error(`색인: 기사 ${card.id} 의 호 날짜가 없다`);
    const month = issueMonthOf(date);
    let rows = byMonth.get(month);
    if (!rows) byMonth.set(month, (rows = []));
    rows.push(encodeRow(card, locale, withOriginal));
    usedSources.add(card.source.id);
  }
  for (const card of head ?? []) usedSources.add(card.source.id);

  const shards = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, rows]) => ({ month, rows }));

  const sourceTable: Record<string, ManifestSource> = {};
  for (const id of [...usedSources].sort()) {
    const s = sources.get(id);
    if (!s) throw new Error(`색인: 매체 ${id} 가 매체 표에 없다`);
    sourceTable[id] = locale === "en" ? { ...s } : { name: s.name, format: s.format };
  }

  const manifest: IndexManifest = {
    schema: INDEX_SCHEMA,
    kind,
    locale,
    fields: [...ROW_FIELDS[kind]],
    total: cards.length,
    sources: sourceTable,
    months: shards.map(({ month, rows }) => ({
      month,
      count: rows.length,
      v: contentHash(JSON.stringify(rows)),
    })),
  };
  if (head) manifest.head = head.map((c) => encodeRow(c, locale, withOriginal));
  return { manifest, shards };
}

/**
 * 언어판 색인에 실을 기사 — ko 는 전부, en 은 영어 제목·요약이 있는 기사만(src/views/data.ts `localeArticles` 와 같은
 * 기준 `hasEnglish`).
 */
export function indexArticlesFor(locale: Locale, articles: readonly ArticleCard[]): ArticleCard[] {
  return locale === "en" ? articles.filter(hasEnglish) : [...articles];
}

/** 누적 카드의 매체 표(매체 id → 이름·형식·영문명·지역). */
export function sourceTableOf(articles: readonly ArticleCard[]): Map<string, ManifestSource> {
  const table = new Map<string, ManifestSource>();
  for (const a of articles) {
    if (table.has(a.source.id)) continue;
    const s: ManifestSource = { name: a.source.name, format: a.format };
    if (a.source.nameEn) s.nameEn = a.source.nameEn;
    if (a.source.region) s.region = a.source.region;
    table.set(a.source.id, s);
  }
  return table;
}

/**
 * `<dir>/<locale>/` 를 비우고 목록·조각을 쓴다(지난 빌드의 다른 달 조각이 남지 않게). 쓴 파일 수를 돌려준다.
 */
export function writeIndexShards(dir: string, built: BuiltIndex): number {
  const out = path.join(dir, built.manifest.locale);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const { month, rows } of built.shards) {
    writeFileSync(path.join(out, `${month}.json`), JSON.stringify(rows), "utf-8");
  }
  writeFileSync(path.join(out, MANIFEST_FILE), JSON.stringify(built.manifest), "utf-8");
  return built.shards.length + 1;
}
