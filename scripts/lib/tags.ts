/**
 * 태그 저장 헬퍼. WORK-PLAN Phase 2.
 * LLM 출력 tags[] 를 정규화해 tags / article_tags 테이블에 멱등 저장한다.
 */
import type { Database } from "better-sqlite3";

/** 태그 정규화: 공백 정리, 영문 전용이면 소문자화(한글은 보존), 빈 값 제거. */
export function normalizeTag(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return "";
  // ASCII(영문/숫자/기호)만으로 구성되면 소문자화. 한글 등은 원형 유지.
  return /^[\x00-\x7F]+$/.test(t) ? t.toLowerCase() : t;
}

/** 정규화 + 중복 제거. 최대 max 개로 제한. */
export function normalizeTags(tags: string[], max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = normalizeTag(raw);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 기사 1건의 태그를 tags / article_tags 에 저장한다.
 * 한 기사 단위 트랜잭션으로 묶어 원자성을 보장한다(better-sqlite3 동기 API).
 */
export function saveTags(
  db: Database,
  articleId: number | bigint,
  tags: string[],
): void {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) return;

  const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const selectTag = db.prepare("SELECT id FROM tags WHERE name = ?");
  const linkTag = db.prepare(
    "INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)",
  );

  const run = db.transaction((names: string[]) => {
    for (const name of names) {
      insertTag.run(name);
      const row = selectTag.get(name) as { id: number } | undefined;
      if (row) linkTag.run(articleId, row.id);
    }
  });

  run(normalized);
}
