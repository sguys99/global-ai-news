/**
 * 영어 가공용 한→영 용어집(configs/prompts/glossary.en.md) 파서와 묶음별 선택기. 영어판 Phase 1-2.
 *
 * 용어집 전체(약 3.2k토큰)를 가공 시스템 프롬프트에 넣으면 가공 4호출마다 붙어 회차당 약 +$0.018 이 든다(0-3 측정).
 * 그래서 항목마다 한국어 키를 두고, 묶음 입력(원문 제목·발췌)에 키가 나오는 항목만 골라 유저 메시지 끝에
 * `[용어집]` 블록으로 붙인다. 성씨·계급처럼 키로 고르기 어려운 짧은 표(`- Label: …` 줄)는 시스템 프롬프트에
 * 늘 싣는다(묶음마다 같은 값이라 시스템 프롬프트가 묶음 사이에 바뀌지 않는다).
 *
 * 파일 형식:
 *  - `### 절 제목` 아래 `- ` 글머리 한 줄에 항목 여럿을 ` · `로 잇는다.
 *    `과학기술정보통신부 · 과기정통부 → Ministry of Science and ICT (MSIT)` — `→` 앞의 ` · ` 조각은 모두 같은 이름의 키다.
 *    `국회 → National Assembly · 국정감사 · 국감 → the National Assembly's annual audit` — 한 줄에 항목 2개.
 *  - `- Military ranks: 대장 → General · …`처럼 `영문 라벨:`로 시작하는 줄은 표 — 키 대조 없이 늘 싣는다.
 *  - 글머리가 아닌 줄(머리말·절 안내문)은 관리용 설명이라 모델에 보내지 않는다.
 *
 * 키 대조(selectGlossary)는 넉넉하게 한다 — 빠진 항목은 고유명사 오기(VIDraft → "Bdraft")로 이어지지만 군더더기 항목은
 * 10~20토큰이면 끝난다. 그래서 1~2음절 키가 긴 낱말 안에 걸리는 것(`솔` ⊂ 솔루션, `메타` ⊂ 메타버스)은 막지 않는다.
 * 대신 띄어쓰기 차이(`LG AI 연구원`, `클로드코드`, `오픈 AI`)는 잡는다. 라틴 문자 키(`MS`·`KT`)만 영숫자 경계를 본다
 * (`LMS`·`KTX` 안에서 걸리지 않게).
 *
 * 파서·선택기는 순수 함수다(Phase 2 백필이 같은 함수를 쓴다). 파일 읽기는 readGlossary 하나.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PROMPTS_DIR } from "../../src/lib/paths";

/** 용어집 항목 1개: 같은 이름을 가리키는 한국어(또는 약칭) 키들과 모델에 보낼 한 줄. */
export interface GlossaryEntry {
  /** `→` 왼쪽 키들(원문 표기 그대로). */
  keys: string[];
  /** 영문 표기(설명 괄호 포함). */
  english: string;
  /** `[용어집]` 블록에 실을 줄: `키 · 키 → 영문`. */
  line: string;
}

export interface Glossary {
  /** 키로 골라 싣는 항목(파일 순서). */
  entries: GlossaryEntry[];
  /** 늘 싣는 표 줄(`Military ranks: …`·`Family names (usual spellings): …`). 앞의 `- `는 뗀다. */
  tables: string[];
  /** 해석하지 못한 조각(`→` 없이 끝난 키 등). 파일이 올바르면 비어 있다 — 테스트가 검사한다. */
  skipped: string[];
}

/** 늘 싣는 표 줄: `영문 라벨(괄호 가능):` 로 시작하고 라벨에 `→` 가 없다. */
const TABLE_LINE = /^[A-Za-z][^:→]*:\s/;
/** 한 줄 안의 항목·키 구분자. 영문 표기 안의 가운뎃점은 쓰지 않는다(파일 규칙). */
const SEPARATOR = " · ";
const ARROW = "→";

/** glossary.en.md 본문 → 항목·표. */
export function parseGlossary(markdown: string): Glossary {
  const entries: GlossaryEntry[] = [];
  const tables: string[] = [];
  const skipped: string[] = [];

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("- ")) continue;
    const body = line.slice(2).trim();
    if (TABLE_LINE.test(body)) {
      tables.push(body);
      continue;
    }
    // `키 · 키 → 영문 · 키 → 영문` — `→` 가 없는 조각은 다음 항목의 키로 쌓는다.
    let pending: string[] = [];
    for (const segment of body.split(SEPARATOR)) {
      const arrow = segment.indexOf(ARROW);
      if (arrow < 0) {
        pending.push(segment.trim());
        continue;
      }
      const keys = [...pending, segment.slice(0, arrow).trim()].filter(Boolean);
      const english = segment.slice(arrow + ARROW.length).trim();
      pending = [];
      if (keys.length === 0 || !english) {
        skipped.push(segment);
        continue;
      }
      entries.push({ keys, english, line: `${keys.join(SEPARATOR)} ${ARROW} ${english}` });
    }
    if (pending.length > 0) skipped.push(pending.join(SEPARATOR));
  }
  return { entries, tables, skipped };
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const ALNUM = /[A-Za-z0-9]/;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 키 → 대조 정규식. 공백과 한글↔비한글 경계에 띄어쓰기를 허용하고(`LG AI연구원` ↔ `LG AI 연구원`, `오픈AI` ↔ `오픈 AI`,
 * `클로드 코드` ↔ `클로드코드`), 키 끝이 영숫자면 그쪽에 영숫자 경계를 둔다. 한글 끝에는 경계를 두지 않는다 — 조사가 붙는다
 * (`앤트로픽이`). 대소문자는 구분한다(`MS` ≠ `ms`).
 */
export function keyPattern(key: string): RegExp {
  const parts: string[] = [];
  for (const word of key.trim().split(/\s+/)) {
    let run = "";
    for (const ch of word) {
      if (run && HANGUL.test(ch) !== HANGUL.test(run.at(-1)!)) {
        parts.push(run);
        run = "";
      }
      run += ch;
    }
    if (run) parts.push(run);
  }
  const lead = ALNUM.test(key.trim()[0] ?? "") ? "(?<![A-Za-z0-9])" : "";
  const trail = ALNUM.test(key.trim().at(-1) ?? "") ? "(?![A-Za-z0-9])" : "";
  return new RegExp(lead + parts.map(escapeRegex).join("\\s*") + trail, "u");
}

/** 정규식은 키마다 한 번만 만든다(묶음마다 약 250개 키를 대조한다). */
const patternCache = new Map<string, RegExp>();
const cachedPattern = (key: string) => {
  let re = patternCache.get(key);
  if (!re) patternCache.set(key, (re = keyPattern(key)));
  return re;
};

/** 입력 텍스트에 키가 하나라도 나오는 항목(파일 순서 유지). */
export function selectGlossary(glossary: Glossary, text: string): GlossaryEntry[] {
  const haystack = text.normalize("NFC");
  return glossary.entries.filter((e) =>
    e.keys.some((k) => cachedPattern(k.normalize("NFC")).test(haystack)),
  );
}

/** 가공 유저 메시지 끝에 붙이는 `[용어집]` 블록. 고른 항목이 없으면 빈 문자열(블록 생략). */
export function glossaryBlock(entries: GlossaryEntry[]): string {
  if (entries.length === 0) return "";
  return `[용어집] title_en·summary_en 에 쓸 영문 표기\n${entries.map((e) => `- ${e.line}`).join("\n")}`;
}

/** 시스템 프롬프트에 늘 싣는 표(성씨·계급). 표가 없으면 빈 문자열. */
export function glossaryTables(glossary: Glossary): string {
  return glossary.tables.map((t) => `- ${t}`).join("\n");
}

/** configs/prompts/glossary.en.md 를 읽어 해석한다. */
export function readGlossary(): Glossary {
  return parseGlossary(readFileSync(path.join(PROMPTS_DIR, "glossary.en.md"), "utf-8"));
}
