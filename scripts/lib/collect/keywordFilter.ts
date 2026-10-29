/**
 * 키워드 사전 필터. configs/keyword-filters.json 의 이름 붙은 키워드 목록으로,
 * 주제가 섞인 소스(예: 전체 언어 GitHub Trending)에서 관련 없는 항목을 선별 풀 전에 버린다.
 * 소스는 sources.json 의 keywordFilter(목록 이름)로 고르며, kind 와 무관하게 collect.ts 가 수집 직후 적용한다.
 *
 * 키워드 문법(대소문자 무시):
 * - `llm`     — 단어 단위 일치. 앞뒤가 영숫자가 아니어야 한다("ai" 는 "email"·"maintain" 에 걸리지 않는다).
 *               `_`·`-`·`/`·`.` 는 경계로 본다(my_ai_tool, ai-agent, owner/ai 모두 일치).
 * - `agent*`  — 접두어 일치(agent, agents, agentic).
 * - `machine learning` — 공백은 공백·`-`·`_` 어느 것과도 일치(machine-learning).
 * - `大模型`   — 영숫자로 시작·끝나지 않는 키워드(한·중·일)는 부분 문자열로 일치한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RawItem } from "../../../src/lib/types";
import { CONFIGS_DIR } from "../../../src/lib/paths";

/** 목록 이름 → 키워드 목록. "_" 로 시작하는 키(_comment)는 설명용이라 무시한다. */
export type KeywordFilters = Record<string, string[]>;

let cached: KeywordFilters | null = null;

/** configs/keyword-filters.json 을 읽는다(모듈당 1회). 파일이 없거나 깨지면 빈 설정 — 이름 조회에서 실패한다. */
export function loadKeywordFilters(): KeywordFilters {
  if (cached) return cached;
  try {
    const raw = JSON.parse(
      readFileSync(path.join(CONFIGS_DIR, "keyword-filters.json"), "utf-8"),
    ) as Record<string, unknown>;
    cached = Object.fromEntries(
      Object.entries(raw).filter(
        (e): e is [string, string[]] => !e[0].startsWith("_") && Array.isArray(e[1]),
      ),
    );
  } catch {
    cached = {};
  }
  return cached;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 키워드 하나 → 정규식 조각. 경계는 \b 대신 영숫자 전후 검사로 둔다(\b 는 `_` 를 단어 문자로 본다). */
function keywordPattern(keyword: string): string {
  const prefix = keyword.endsWith("*");
  const word = (prefix ? keyword.slice(0, -1) : keyword).trim();
  const body = word.split(/\s+/).map(escapeRegExp).join("[\\s_-]+");
  const start = /^[A-Za-z0-9]/.test(word) ? "(?<![A-Za-z0-9])" : "";
  const end = !prefix && /[A-Za-z0-9]$/.test(word) ? "(?![A-Za-z0-9])" : "";
  return start + body + end;
}

/** 키워드 목록 → 텍스트 판정 함수(하나라도 일치하면 true). 빈 목록은 모두 통과시킨다. */
export function keywordMatcher(keywords: string[]): (text: string) => boolean {
  const patterns = keywords.filter((k) => k.trim() && k.trim() !== "*").map(keywordPattern);
  if (patterns.length === 0) return () => true;
  const re = new RegExp(patterns.join("|"), "i");
  return (text) => re.test(text);
}

/**
 * 제목·본문 발췌(contentRaw)에 키워드가 하나도 없는 항목을 버린다.
 * GitHub 어댑터는 설명 뒤에 토픽을 덧붙여 두므로 토픽도 함께 검사된다.
 * @throws 목록 이름이 configs/keyword-filters.json 에 없을 때 — 조용히 전부 통과시키면 필터가 꺼진 걸 모른다.
 */
export function applyKeywordFilter(
  items: RawItem[],
  listName: string,
  filters: KeywordFilters = loadKeywordFilters(),
): { kept: RawItem[]; dropped: RawItem[] } {
  const keywords = filters[listName];
  if (!keywords) throw new Error(`키워드 필터 "${listName}" 없음(configs/keyword-filters.json)`);
  const matches = keywordMatcher(keywords);

  const kept: RawItem[] = [];
  const dropped: RawItem[] = [];
  for (const item of items) {
    (matches(`${item.title}\n${item.contentRaw ?? ""}`) ? kept : dropped).push(item);
  }
  return { kept, dropped };
}
