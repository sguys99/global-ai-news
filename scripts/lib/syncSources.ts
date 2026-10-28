/**
 * configs/sources.json → sources 테이블 동기화(멱등). 수집 배치 시작과 `npm run db:init` 이 호출한다.
 *
 * - sources.json 의 **전 소스**(비활성 포함)를 id/name/kind/url/enabled/format 으로 맞춘다.
 *   format 생략 → 'news'. 형식은 이 테이블에만 있고 기사는 JOIN 으로 읽으므로, 값을 바꾸면 지난 기사에도 소급된다.
 * - sources.json 에서 빠진 행: 기사가 참조하지 않으면 DELETE, 참조하면 enabled=0 으로 남긴다(FK·JOIN 유지).
 * - 바뀐 행만 쓴다. 이미 맞는 DB 에서는 읽기만 하므로 빌드(prebuild)에서 돌려도 data/app.db 가 바뀌지 않는다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import { isFormat, toFormat, type Format } from "../../src/lib/labels";
import { CONFIGS_DIR } from "../../src/lib/paths";
import type { SourceConfig } from "./collect/rss";

/** configs/sources.json 전체(비활성 포함). */
export function loadSourcesConfig(
  file: string = path.join(CONFIGS_DIR, "sources.json"),
): SourceConfig[] {
  return JSON.parse(readFileSync(file, "utf-8")) as SourceConfig[];
}

/** 동기화 결과(소스 id 목록). */
export interface SyncSourcesResult {
  inserted: string[];
  updated: string[];
  /** sources.json 에서 빠졌고 기사도 없어 지운 행. */
  deleted: string[];
  /** sources.json 에서 빠졌지만 기사가 참조해 enabled=0 으로 남긴 행. */
  disabled: string[];
}

interface SourceRow {
  id: string;
  name: string;
  kind: string;
  url: string;
  enabled: number;
  format: Format;
}

const FIELDS = ["name", "kind", "url", "enabled", "format"] as const;

export function syncSources(db: DatabaseType, sources: SourceConfig[]): SyncSourcesResult {
  const result: SyncSourcesResult = { inserted: [], updated: [], deleted: [], disabled: [] };
  const existing = new Map(
    (
      db.prepare("SELECT id, name, kind, url, enabled, format FROM sources").all() as SourceRow[]
    ).map((r) => [r.id, r]),
  );
  const insert = db.prepare(
    `INSERT INTO sources (id, name, kind, url, enabled, format)
     VALUES (@id, @name, @kind, @url, @enabled, @format)`,
  );
  const update = db.prepare(
    `UPDATE sources SET name = @name, kind = @kind, url = @url, enabled = @enabled, format = @format
      WHERE id = @id`,
  );
  const referenced = db.prepare("SELECT 1 FROM articles WHERE source_id = ? LIMIT 1");
  const remove = db.prepare("DELETE FROM sources WHERE id = ?");
  const disable = db.prepare("UPDATE sources SET enabled = 0 WHERE id = ?");

  db.transaction(() => {
    const ids = new Set<string>();
    for (const s of sources) {
      if (ids.has(s.id)) continue; // 중복 id 는 앞의 것만(admin 이 막지만 수기 편집 대비)
      ids.add(s.id);
      // 오타 형식으로 수집 전체를 멈추지 않는다 — 경고 후 news 로 둔다(admin 은 zod 로 막는다).
      if (s.format !== undefined && !isFormat(s.format)) {
        console.warn(`[syncSources] ${s.id}: 알 수 없는 format "${String(s.format)}" → news`);
      }
      const row: SourceRow = {
        id: s.id,
        name: s.name,
        kind: s.kind,
        url: s.url,
        enabled: s.enabled ? 1 : 0,
        format: toFormat(s.format),
      };
      const prev = existing.get(s.id);
      if (!prev) {
        insert.run(row);
        result.inserted.push(s.id);
      } else if (FIELDS.some((f) => prev[f] !== row[f])) {
        update.run(row);
        result.updated.push(s.id);
      }
    }
    for (const [id, prev] of existing) {
      if (ids.has(id)) continue;
      if (!referenced.get(id)) {
        remove.run(id);
        result.deleted.push(id);
      } else if (prev.enabled !== 0) {
        disable.run(id);
        result.disabled.push(id);
      }
    }
  })();
  return result;
}

/** 로그용 한 줄 요약. 변경이 없으면 "변경 없음". */
export function describeSync(r: SyncSourcesResult): string {
  const parts = (
    [
      ["추가", r.inserted],
      ["갱신", r.updated],
      ["삭제", r.deleted],
      ["비활성", r.disabled],
    ] as const
  )
    .filter(([, ids]) => ids.length > 0)
    .map(([label, ids]) => `${label} ${ids.length}(${ids.join(", ")})`);
  return parts.length ? parts.join(" · ") : "변경 없음";
}
