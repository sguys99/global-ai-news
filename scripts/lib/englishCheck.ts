/**
 * 영어 품질 검사(영어판 Phase 1-3) — 가공 호출이 함께 내는 `title_en`·`summary_en`을 코드로 확인한다.
 * 근거와 규칙: docs/english-version/phase0/0-3-english-quality.md "숫자 검사(1-3 ③) 오탐률"·"Phase 1-3 권장 규칙".
 *
 * fail-closed: 기각하면 그 기사의 영어만 비운다(한국어 게재에는 영향 없음). 검사 순서는 한글 → 길이 → 숫자이고,
 * 처음 걸린 사유 하나로 기각한다.
 *  ① 한글: 영어 제목·요약에 한글(음절·자모)이 한 글자라도 있으면 기각.
 *  ② 길이: 제목 TITLE_EN_MIN_CHARS~TITLE_EN_MAX_CHARS자, 요약 SUMMARY_EN_MIN_WORDS~SUMMARY_EN_MAX_WORDS단어.
 *     0-3 샘플 40건은 제목 46~97자·요약 8~47단어였다(본문 없는 HN 1문장 8단어 포함) — 넉넉히 잡았다.
 *  ③ 숫자: 출력의 숫자가 **원문 제목 + 모델에 준 발췌**에 있어야 한다. 한국어 요약은 근거에서 뺀다 — 같은 가공 호출의
 *     출력이라 같은 10배 단위 오류를 공유한다(1301 `$900B` → "900억 달러"). 넣으면 틀린 영어 숫자가 통과한다.
 *
 * 숫자 대조(0-3 numcheck2 최종 규칙 + 통화 검사):
 *  - 숫자는 /\d+(?:[.,]\d+)*\/, 쉼표를 지우고 값으로 비교한다(98.90 = 98.9, 04 = 4). 하이픈으로 붙은 수(GPT-5.1·
 *    27-year-old·26B-A4B)는 이것만으로 맞는다.
 *  - 금액·규모는 값으로 바꾼다. 한국어는 [숫자][십·백·천]?[만·억·조]를 이어 합산(`9억 2천만` = 9.2e8, `2만5000`,
 *    `1,550억`), 단독 `천`은 뒤에 한글이 오면 단위가 아니다(`천안`) — 단 `천여·천개·천명·천건·천원·천대·천곳`은 단위.
 *    영어는 scale 단어(thousand~trillion·bn·mn, `19-billion`)와 붙여 쓴 K·M·B·T(`27B`·`$62.5M`, 띄운 `5 m`은 제외).
 *  - 출력 숫자가 근거에 문자열로 없으면, 그 숫자가 속한 금액의 값(없으면 숫자 자체)이 근거 금액·숫자 값 중 하나와
 *    같아야 한다(`$465 million` ↔ `4억6500만달러`, `50,000` ↔ `5만`).
 *  - 엄격 모드: 근거에 문자열로 있는 숫자라도 단위가 붙은 금액 안에 있으면 금액 값까지 맞아야 한다 — 숫자는 같고
 *    단위만 틀린 오류(`$11 million` ↔ `$11 billion`, `KRW 5 billion` ↔ `5조원`, `155 billion` ↔ `155T`)를 잡는다.
 *  - 수 단어(one~nineteen·twenty~ninety·hundred·dozen, first~tenth, 첫·하루·이틀·사흘·나흘·열흘·두·세·네·다섯·열·스무)는
 *    근거 쪽에만 더한다. 출력 쪽 단어("one teammate")는 검사하지 않는다 — 규칙·용어집으로만 막는다.
 *    0-3 목록에 더해 근거 쪽에 ⓐ 수 단어 + scale("three million" = 3e6, "three dozen" = 36) ⓑ 배수·비율(twice·doubled·
 *    tripled·quadrupled·half) ⓒ "a week·a month" = 1 ⓓ 띄어 쓴 단위 없는 사슬 끝을 뺀 값(`10억 2023년` → 10억도)을 더한다.
 *    전부 근거 쪽이라 넉넉해질 뿐이다 — 게재분 대리 측정에서 "three million chips" → `300만 개`류 오탐이 실제로 나왔다.
 *  - 통화: 출력의 달러 금액(`$`·US$·USD·dollar·달러)은 근거에 달러 표기가, 원화 금액(KRW·₩·won·원)은 근거에 원화
 *    표기가 있어야 한다. 숫자·규모가 같은 통화 바꿔치기(`5조원` → `$5 trillion`)를 잡는다.
 *
 * 한국어 쪽(checkKoreanNumbers)은 같은 대조를 `title_ko`·`summary_ko`에 돌려 근거에 없는 숫자를 돌려준다 — notes 경고
 * 전용이고 게재를 막지 않는다(0-3 부록: 기존 게재분의 billion→억 10배 오류). 한국어 월 표기(`6월` ← "June")가 오탐의
 * 대부분이라 그쪽만 근거에 영어 달 이름을 숫자로 더한다.
 *
 * 이 모듈의 함수는 순수 함수이고 throw 하지 않는다.
 */

/** 영어 제목 최소·최대 글자 수(코드 포인트). */
export const TITLE_EN_MIN_CHARS = 20;
export const TITLE_EN_MAX_CHARS = 110;
/** 영어 요약 최소·최대 단어 수(공백 기준). */
export const SUMMARY_EN_MIN_WORDS = 8;
export const SUMMARY_EN_MAX_WORDS = 90;

/** 기각 사유 — notes·kpi 집계 단위. 검사 순서와 같다. */
export const ENGLISH_REJECT_REASONS = ["hangul", "length", "number"] as const;
export type EnglishRejectReason = (typeof ENGLISH_REJECT_REASONS)[number];

/** 가공 출력의 영어 필드. 모델이 빠뜨린 필드(null·undefined·빈 문자열)는 길이 기각이다. */
export interface EnglishOutput {
  titleEn: string | null | undefined;
  summaryEn: string | null | undefined;
}

/** 한국어 가공 결과(한국어 숫자 경고용). */
export interface KoreanOutput {
  titleKo: string | null | undefined;
  summaryKo: string | null | undefined;
}

/**
 * 숫자 대조의 근거 — 원문 제목과 **모델에 준 발췌**(enrich 의 MAX_INPUT_CHARS 로 자른 본문). 한국어 요약은 넣지 않는다.
 */
export interface ArticleEvidence {
  title: string;
  content: string | null | undefined;
}

export type EnglishCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: EnglishRejectReason;
      /** 사람이 읽는 근거: 한글이 든 필드, 길이(`title 15자`), 근거에 없는 숫자·금액(`$90 billion`·`USD(통화)`). */
      detail: string[];
    };

// ---------------------------------------------------------------------------------------------------------------
// 숫자·금액 추출

const NUM = /\d+(?:[.,]\d+)*/g;
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

const clean = (s: string) => s.replace(/,/g, "");
/** 같은 값(부동소수 오차 허용). 25,000 = 2만5000 = 2.5e4. */
const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

const KO_SMALL: Record<string, number> = { 십: 10, 백: 100, 천: 1e3 };
const KO_BIG: Record<string, number> = { 만: 1e4, 억: 1e8, 조: 1e12 };
const EN_SCALE: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
  bn: 1e9,
  mn: 1e6,
  k: 1e3,
  m: 1e6,
  b: 1e9,
  t: 1e12,
};

/** 수 단어 뒤 scale 단어(EN_WORD_AMOUNT). */
const WORD_SCALE: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
  dozen: 12,
};

/** 영어 수 단어(근거 쪽만). */
const EN_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  dozen: 12,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  // 배수·비율 — "triples signups" → 3배, "doubled" → 2배, "half" → 50%
  twice: 2,
  double: 2,
  doubled: 2,
  doubles: 2,
  twofold: 2,
  triple: 3,
  tripled: 3,
  triples: 3,
  threefold: 3,
  quadruple: 4,
  quadrupled: 4,
  quadruples: 4,
  fourfold: 4,
  half: 50,
};
/** "three million"·"one billion"·"a dozen" — 수 단어(또는 a) + scale 단어. 값을 근거 금액으로 더한다. */
const EN_WORD_AMOUNT = /\b([a-z]+)[\s-]+(thousand|million|billion|trillion|dozen)\b/gi;
/** 한국어 수 단어(근거 쪽만). 0-3 프로토타입처럼 부분 문자열로 찾는다 — 근거 쪽이라 넉넉한 쪽이 안전하다. */
const KO_NUMBER_WORDS: Record<string, number> = {
  첫: 1,
  하루: 1,
  이틀: 2,
  사흘: 3,
  나흘: 4,
  열흘: 10,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  열: 10,
  스무: 20,
};
/** 영어 달 이름(한국어 경고의 근거 쪽만 — `6월` ← "June"). May 는 조동사와 겹치지만 근거 쪽이라 넉넉해질 뿐이다. */
const EN_MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/** 텍스트 안 금액 하나 — [start, end) 구간과 환산 값. */
interface Amount {
  start: number;
  end: number;
  value: number;
  /**
   * 띄어 쓴 단위 없는 숫자로 사슬을 닫았을 때 그 숫자를 뺀 값(`2만 5000` = 25,000 이지만 `10억 2023년`은 10억).
   * 근거 쪽에서만 두 값을 다 쓴다.
   */
  partial?: number;
}

/**
 * 한국어 금액 조각: 숫자 + (선택) 단위. 단위가 있는 조각에서 사슬이 시작되고, 1자 이하 공백으로 이어진 조각을 합산한다.
 * 단독 십·백·천은 뒤에 한글이 없거나 수량 접미(여·개·명·건·원·대·곳)일 때만 단위다(`천안`은 아님).
 */
const KO_SEGMENT =
  /(\d+(?:[.,]\d+)*)\s*([십백천]?[만억조]|[십백천](?![가-힣])|[십백천](?=[여개명건원대곳]))?/g;
/** 영어 금액: scale 단어(띄움·하이픈 허용) 또는 붙여 쓴 K·M·B·T. 뒤에 영문자가 이어지면(`5km`·`10th`) 아니다. */
const EN_AMOUNT =
  /(\d+(?:[.,]\d+)*)([\s-]*)(thousand|million|billion|trillion|bn|mn|[kmbt])(?![a-z])/gi;

function koreanAmounts(text: string): Amount[] {
  const segs = [...text.matchAll(KO_SEGMENT)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    n: parseFloat(clean(m[1])),
    unit: m[2] as string | undefined,
  }));
  const out: Amount[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (!segs[i].unit) continue;
    let value = 0;
    let partial: number | undefined;
    let end = segs[i].end;
    let j = i;
    for (; j < segs.length; j++) {
      const g = segs[j];
      if (j > i) {
        if (!/^\s?$/.test(text.slice(segs[j - 1].end, g.start))) break;
        if (!segs[j - 1].unit) break; // 단위 없는 숫자는 사슬을 닫기만 한다(`2만5000`)
      }
      const u = g.unit ?? "";
      if (!u && g.start > segs[j - 1].end) partial = value; // `10억 2023년`일 수도 있다
      value += g.n * (u ? (KO_SMALL[u[0]] ?? 1) * (KO_BIG[u[u.length - 1]] ?? 1) : 1);
      end = g.end;
      if (!g.unit) {
        j++;
        break;
      }
    }
    out.push({ start: segs[i].start, end, value, ...(partial === undefined ? {} : { partial }) });
    i = j - 1;
  }
  return out;
}

function englishAmounts(text: string): Amount[] {
  const out: Amount[] = [];
  for (const m of text.matchAll(EN_AMOUNT)) {
    const unit = m[3].toLowerCase();
    if (unit.length === 1 && m[2]) continue; // "27B"는 금액, "5 m"은 아니다
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      value: parseFloat(clean(m[1])) * EN_SCALE[unit],
    });
  }
  return out;
}

function amountsIn(text: string): Amount[] {
  return [...koreanAmounts(text), ...englishAmounts(text)];
}

// ---------------------------------------------------------------------------------------------------------------
// 통화

type Currency = "USD" | "KRW";

/** 출력 쪽: 숫자에 붙은 통화 표기. */
const OUTPUT_CURRENCY: Record<Currency, readonly RegExp[]> = {
  USD: [
    /\$\s?\d/,
    /\bUSD\s?\d/i,
    /\d\s?USD\b/i,
    /\d(?:[\d.,]*)\s*(?:(?:thousand|million|billion|trillion)\s+)?(?:US\s+)?dollars?\b/i,
    /(?:\d|[십백천만억조])\s*(?:미국\s*)?달러/,
  ],
  KRW: [
    /\bKRW\s?\d/i,
    /\d\s?KRW\b/i,
    /₩\s?\d/,
    /\d(?:[\d.,]*)\s*(?:(?:thousand|million|billion|trillion)\s+)?won\b/i,
    /(?:\d|[십백천만억조])\s*원(?![칙소])/, // `3원칙`·`4원소`는 통화가 아니다
  ],
};
/** 근거 쪽: 그 통화 표기가 어디든 있으면 된다. */
const EVIDENCE_CURRENCY: Record<Currency, RegExp> = {
  USD: /\$|달러|\bUSD\b|dollar/i,
  KRW: /\bKRW\b|₩|(?:\d|[십백천만억조])\s*원|\d\s*(?:(?:thousand|million|billion|trillion)\s+)?won\b/i,
};
/** 한국어 금액 뒤의 외화 표기 — 이게 없으면 원화로 본다. */
const FOREIGN_AFTER_KO_AMOUNT = /^\s*(?:미국\s*|미\s*)?(?:달러|유로|엔|위안|파운드|루피|프랑)/;

function currenciesIn(text: string): Currency[] {
  return (Object.keys(OUTPUT_CURRENCY) as Currency[]).filter((c) =>
    OUTPUT_CURRENCY[c].some((re) => re.test(text)),
  );
}

/**
 * 근거에 그 통화가 있는가. 한국 매체는 원화를 `월 매출 10억`처럼 `원` 없이 쓰므로, 만·억·조 금액 뒤에 외화 표기가
 * 없으면 원화 근거로 친다(`4억6500만달러`는 달러 근거일 뿐 원화 근거가 아니다).
 */
function evidenceHasCurrency(c: Currency, text: string): boolean {
  if (EVIDENCE_CURRENCY[c].test(text)) return true;
  if (c !== "KRW") return false;
  return koreanAmounts(text).some(
    (a) =>
      /[만억조]/.test(text.slice(a.start, a.end)) &&
      !FOREIGN_AFTER_KO_AMOUNT.test(text.slice(a.end)),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 근거와 대조

interface NumberEvidence {
  text: string;
  /** 근거의 숫자 문자열(쉼표 제거). */
  raw: Set<string>;
  /** 근거의 숫자 값 + 수 단어 값. */
  nums: number[];
  /** 근거의 금액 환산 값. */
  values: number[];
}

function buildEvidence(evidence: ArticleEvidence, { months = false } = {}): NumberEvidence {
  const text = [evidence.title, evidence.content].filter(Boolean).join("\n");
  const raw = new Set((text.match(NUM) ?? []).map(clean));
  const nums = [...raw].map(Number).filter((n) => Number.isFinite(n));
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const w of words) {
    if (Object.hasOwn(EN_NUMBER_WORDS, w)) nums.push(EN_NUMBER_WORDS[w]);
    if (months && Object.hasOwn(EN_MONTHS, w)) nums.push(EN_MONTHS[w]);
  }
  if (/\ban?\s+(?:hour|day|week|month|year|decade)\b/i.test(text)) nums.push(1); // "a week later" → 1주일
  for (const [w, n] of Object.entries(KO_NUMBER_WORDS)) if (text.includes(w)) nums.push(n);
  const values = amountsIn(text).flatMap((a) =>
    a.partial === undefined ? [a.value] : [a.value, a.partial],
  );
  for (const m of text.matchAll(EN_WORD_AMOUNT)) {
    const w = m[1].toLowerCase();
    const n = w === "a" ? 1 : Object.hasOwn(EN_NUMBER_WORDS, w) ? EN_NUMBER_WORDS[w] : undefined;
    if (n !== undefined) values.push(n * WORD_SCALE[m[2].toLowerCase()]);
  }
  return { text, raw, nums, values };
}

const matchesAny = (list: readonly number[], v: number) => list.some((x) => close(x, v));

/**
 * 출력 텍스트에서 근거로 뒷받침되지 않는 숫자·금액(표시용 문자열). 같은 금액에서 여러 숫자가 걸리면 한 번만 적는다.
 * 통화가 근거에 없으면 `USD(통화)`·`KRW(통화)`를 더한다.
 */
function unsupportedIn(text: string, ev: NumberEvidence): string[] {
  const amounts = amountsIn(text);
  const bad: string[] = [];
  const add = (s: string) => {
    if (!bad.includes(s)) bad.push(s);
  };
  for (const m of text.matchAll(NUM)) {
    const tok = clean(m[0]);
    const amount = amounts.find((a) => m.index >= a.start && m.index < a.end);
    const shown = amount ? text.slice(amount.start, amount.end).trim() : m[0];
    if (ev.raw.has(tok) || matchesAny(ev.nums, Number(tok))) {
      // 엄격 모드: 금액 안의 숫자는 금액 값까지 맞아야 한다(근거에 금액이 하나도 없으면 따질 수 없어 통과).
      if (!amount || ev.values.length === 0) continue;
      if (matchesAny(ev.values, amount.value) || matchesAny(ev.nums, amount.value)) continue;
      add(shown);
      continue;
    }
    const value = amount ? amount.value : Number(tok); // 단위 없는 "50,000"도 근거 "5만"과 값으로 맞춘다
    if (matchesAny(ev.values, value) || matchesAny(ev.nums, value)) continue;
    add(shown);
  }
  for (const c of currenciesIn(text)) if (!evidenceHasCurrency(c, ev.text)) add(`${c}(통화)`);
  return bad;
}

/**
 * 출력 텍스트의 숫자를 근거(원문 제목 + 발췌)와 대조해, 뒷받침되지 않는 숫자·금액을 돌려준다(빈 배열 = 통과).
 * checkEnglish·checkKoreanNumbers 가 쓰는 대조를 그대로 노출한다(테스트·스크립트용).
 */
export function findUnsupportedNumbers(text: string, evidence: ArticleEvidence): string[] {
  return unsupportedIn(text, buildEvidence(evidence));
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const charCount = (s: string) => [...s].length;

/**
 * 한 기사의 영어 출력 검사. 한글 → 길이 → 숫자 순서로 처음 걸린 사유 하나로 기각한다.
 * `evidence`는 원문 제목 + 모델에 준 발췌만(한국어 요약 제외 — 파일 머리 주석).
 */
export function checkEnglish(output: EnglishOutput, evidence: ArticleEvidence): EnglishCheckResult {
  const title = (output.titleEn ?? "").replace(/\s+/g, " ").trim();
  const summary = (output.summaryEn ?? "").replace(/\s+/g, " ").trim();

  const hangul = [
    ...(HANGUL.test(title) ? ["title"] : []),
    ...(HANGUL.test(summary) ? ["summary"] : []),
  ];
  if (hangul.length > 0) return { ok: false, reason: "hangul", detail: hangul };

  const length: string[] = [];
  const chars = charCount(title);
  if (chars < TITLE_EN_MIN_CHARS || chars > TITLE_EN_MAX_CHARS) length.push(`title ${chars}자`);
  const words = wordCount(summary);
  if (words < SUMMARY_EN_MIN_WORDS || words > SUMMARY_EN_MAX_WORDS)
    length.push(`summary ${words}단어`);
  if (length.length > 0) return { ok: false, reason: "length", detail: length };

  const ev = buildEvidence(evidence);
  const numbers = [...new Set([...unsupportedIn(title, ev), ...unsupportedIn(summary, ev)])];
  if (numbers.length > 0) return { ok: false, reason: "number", detail: numbers };
  return { ok: true };
}

/**
 * 한국어 가공 결과의 숫자 경고: `title_ko`·`summary_ko`에서 근거(원문 제목 + 발췌)로 뒷받침되지 않는 숫자·금액.
 * 경고 전용(게재를 막지 않는다). 근거에 영어 달 이름을 숫자로 더해 `6월` ← "June"을 맞춘다.
 */
export function checkKoreanNumbers(output: KoreanOutput, evidence: ArticleEvidence): string[] {
  const ev = buildEvidence(evidence, { months: true });
  return [
    ...new Set([
      ...unsupportedIn(output.titleKo ?? "", ev),
      ...unsupportedIn(output.summaryKo ?? "", ev),
    ]),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// notes 집계

/** 한 회차의 영어 검사 집계(notes·kpi 용). */
export interface EnglishCheckTally {
  /** 검사한 기사 수(= 게재되는 가공 기사). */
  checked: number;
  /** 영어를 저장하는 기사 수. */
  passed: number;
  rejected: Record<EnglishRejectReason, number>;
  /** 한국어 숫자 불일치 경고가 난 기사 수. */
  koreanMismatched: number;
  /** 한국어 불일치 숫자 예시(notes 에 앞 KOREAN_NOTE_EXAMPLES 개). */
  koreanExamples: string[];
}

/** notes 한 줄에 싣는 한국어 불일치 예시 수. */
export const KOREAN_NOTE_EXAMPLES = 3;

/**
 * 기사별 결과 → 집계. `korean`은 기사별 checkKoreanNumbers 결과(같은 순서일 필요 없음, 빈 배열 = 경고 없음).
 */
export function tallyEnglishChecks(
  english: readonly EnglishCheckResult[],
  korean: readonly (readonly string[])[] = [],
): EnglishCheckTally {
  const rejected: Record<EnglishRejectReason, number> = { hangul: 0, length: 0, number: 0 };
  let passed = 0;
  for (const r of english) {
    if (r.ok) passed += 1;
    else rejected[r.reason] += 1;
  }
  const flagged = korean.filter((k) => k.length > 0);
  return {
    checked: english.length,
    passed,
    rejected,
    koreanMismatched: flagged.length,
    koreanExamples: flagged.map((k) => k[0]),
  };
}

/**
 * notes 줄. 예: `영어 가공 33/35건`, `영어 기각 2건(한글 0·숫자 1·길이 1)`, `한국어 숫자 불일치 2건(900억 달러·27억)`.
 * 검사한 기사가 없으면 빈 배열, 기각·불일치가 0건이면 그 줄은 뺀다. kpi baseline 의 notes 파싱(`선정 N건`·
 * `후보 N건 중`·`재보도 …`·`같은 사건 합침 N건`)과 겹치지 않고, notes 구분자 `;`를 쓰지 않는다.
 */
export function englishCheckNotes(t: EnglishCheckTally): string[] {
  if (t.checked === 0) return [];
  const notes = [`영어 가공 ${t.passed}/${t.checked}건`];
  const k = t.rejected.hangul + t.rejected.number + t.rejected.length;
  if (k > 0)
    notes.push(
      `영어 기각 ${k}건(한글 ${t.rejected.hangul}·숫자 ${t.rejected.number}·길이 ${t.rejected.length})`,
    );
  if (t.koreanMismatched > 0) {
    const examples = t.koreanExamples
      .slice(0, KOREAN_NOTE_EXAMPLES)
      .map((s) => s.replace(/[;\s]+/g, " "))
      .join("·");
    notes.push(`한국어 숫자 불일치 ${t.koreanMismatched}건(${examples})`);
  }
  return notes;
}
