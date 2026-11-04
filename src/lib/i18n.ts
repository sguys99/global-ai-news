/**
 * 다국어 기반(영어판 Phase 3-2) — 언어 키·경로·문구 사전 도우미의 단일 출처.
 *
 * - 한국어(ko)가 기본 언어이자 원본이다. 한국어 주소·문구는 지금 그대로 두고(`localePath("ko", p) === p`),
 *   영어판만 `/en` 접두어를 붙인다(english-version-plan 기본값 "영어 URL").
 * - 문구 사전은 이름공간(namespace) 파일 하나에 ko·en 을 나란히 둔다(`src/lib/messages/*.ts`, `defineMessages`).
 *   집계 파일을 두지 않는다 — 컴포넌트가 자기 이름공간을 직접 import 하므로 여러 작업이 같은 줄을 고치지 않고,
 *   클라이언트 번들에도 쓰는 이름공간만 실린다. en 누락·종류 불일치는 타입(MessageShape)과 테스트(messages.test.ts)가 막는다.
 * - 분야·형식 표시명과 날짜 포맷은 기존 단일 출처인 src/lib/labels.ts 가 `locale` 인자로 맡는다.
 *
 * 서버 컴포넌트는 `locale` prop → `getMessages(ns, locale)`, 클라이언트 컴포넌트는 `useMessages(ns)`
 * (src/components/LocaleProvider.tsx). 함수 값(보간·복수형)이 있으므로 문구 객체를 클라이언트 컴포넌트 prop 으로 넘기지 않는다.
 */

export const LOCALES = ["ko", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** 기본 언어 — 접두어 없는 주소(`/`, `/article/1`)의 언어. */
export const DEFAULT_LOCALE: Locale = "ko";

/** 영어판 경로 접두어(basePath 제외 — Next `Link` 가 basePath 를 붙인다). */
const EN_PREFIX = "/en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** `<html lang>`·hreflang 값. */
export const HTML_LANG: Record<Locale, string> = { ko: "ko", en: "en" };

/**
 * 언어판 내부 경로. ko 는 입력을 **그대로** 돌려준다(한국어 HTML 무변화 — 끝 슬래시·쿼리·해시 모두 손대지 않는다).
 * en 은 루트 상대 경로(`/…`) 앞에 `/en` 을 붙인다: `/` → `/en/`, `/?sort=hot` → `/en/?sort=hot`,
 * `/article/1` → `/en/article/1`, `/edition/2026-11-03/` → `/en/edition/2026-11-03/`, `/#all` → `/en/#all`.
 * 이미 `/en` 으로 시작하면 그대로(두 번 붙지 않는다). 해시·쿼리만인 경로(`#front`, `?tag=x` — 지금 페이지 기준)와
 * 외부·프로토콜 상대 URL(`https://…`, `//host`)은 언어와 무관해 그대로 둔다.
 * basePath(`/global-ai-news`)는 붙이지 않는다 — `Link`·`router` 가 붙이고, 절대 URL 은 site.ts `abs()` 가 붙인다.
 */
export function localePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (splitLocalePath(path).locale === "en") return path;
  return `${EN_PREFIX}${path}`;
}

/**
 * 경로 → { 언어, 언어 접두어를 뗀 경로 }. `usePathname()`(basePath 제외) 결과로 활성 내비 판정·언어 전환 링크를 만든다.
 * `/en`·`/en/` → { en, "/" }, `/en/article/1/` → { en, "/article/1/" }, `/english` 처럼 접두어가 아닌 것은 ko.
 * 쿼리·해시는 경로 뒤에 그대로 남는다(`/en?x=1` → "/?x=1").
 */
export function splitLocalePath(path: string): { locale: Locale; path: string } {
  if (path === EN_PREFIX) return { locale: "en", path: "/" };
  const next = path.charAt(EN_PREFIX.length);
  if (path.startsWith(EN_PREFIX) && (next === "/" || next === "?" || next === "#")) {
    const rest = path.slice(EN_PREFIX.length);
    return { locale: "en", path: rest.startsWith("/") ? rest : `/${rest}` };
  }
  return { locale: DEFAULT_LOCALE, path };
}

// ─── 문구 사전 ────────────────────────────────────────────────────────────────

/** 문구 값: 문자열, 또는 보간·복수형 함수(예: `(n: number) => string`). 함수는 문자열을 돌려줘야 한다. */
export type MessageValue = string | ((...args: never[]) => string);

/** 이름공간 한 벌(중첩 허용). */
export interface MessageTree {
  readonly [key: string]: MessageValue | MessageTree;
}

/**
 * ko 원본 → 언어 공통 모양. 리터럴 문자열을 string 으로 넓히고 함수는 인자 목록을 그대로 둔다 —
 * en 은 이 모양을 그대로 채워야 한다(키 누락·남는 키·문자열 ↔ 함수 뒤바뀜·인자 형 불일치가 타입 오류).
 */
export type MessageShape<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends (...args: infer A) => string
      ? (...args: A) => string
      : MessageShape<T[K]>;
};

const NAMESPACE_BRAND: unique symbol = Symbol.for("ai-daybook.messages");

/** `defineMessages` 결과 — 언어별 같은 모양의 문구 한 벌. */
export type MessageNamespace<S> = { readonly [L in Locale]: S } & {
  readonly [NAMESPACE_BRAND]: true;
};

/** 이름공간의 문구 모양(컴포넌트 prop 타입 등에 쓴다). 예: `MessagesOf<typeof commonMessages>`. */
export type MessagesOf<N> = N extends MessageNamespace<infer S> ? S : never;

/**
 * 이름공간 정의. ko 가 원본이고 en 은 ko 와 키·값 종류가 같아야 한다(타입 검사).
 * 결과에는 식별 표시(심볼, 열거 안 됨)를 달아 테스트가 `src/lib/messages/*` 의 모든 이름공간을 자동으로 찾는다.
 *
 * ```ts
 * export const storyMessages = defineMessages({
 *   ko: { more: "더 보기", count: (n: number) => `${n}건` },
 *   en: { more: "More", count: (n: number) => `${n} ${plural(n, "story", "stories")}` },
 * });
 * ```
 */
export function defineMessages<T extends MessageTree>(messages: {
  ko: T;
  en: NoInfer<MessageShape<T>>;
}): MessageNamespace<MessageShape<T>> {
  const ns = { ko: messages.ko as unknown as MessageShape<T>, en: messages.en };
  Object.defineProperty(ns, NAMESPACE_BRAND, { value: true, enumerable: false });
  return ns as MessageNamespace<MessageShape<T>>;
}

export function isMessageNamespace(value: unknown): value is MessageNamespace<MessageTree> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[NAMESPACE_BRAND] === true
  );
}

/** 언어의 문구(서버 컴포넌트·순수 함수용). 클라이언트 컴포넌트는 `useMessages(ns)`. */
export function getMessages<S>(ns: MessageNamespace<S>, locale: Locale): S {
  return ns[locale];
}

/**
 * ko·en 두 문구 트리의 모양 차이(테스트용): 한쪽에만 있는 키, 값 종류(문자열·함수·중첩) 불일치,
 * 빈 문자열(번역 누락 자리표시)을 `경로: 사유` 로 돌려준다. 같으면 빈 배열.
 */
export function messageShapeErrors(ko: unknown, en: unknown, prefix = ""): string[] {
  const kind = (v: unknown) =>
    typeof v === "string"
      ? "string"
      : typeof v === "function"
        ? "function"
        : v && typeof v === "object"
          ? "tree"
          : typeof v;
  const errors: string[] = [];
  const a = ko as Record<string, unknown>;
  const b = en as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (!Object.hasOwn(b, key)) errors.push(`${at}: en 에 없음`);
    else if (!Object.hasOwn(a, key)) errors.push(`${at}: ko 에 없음(en 에만 있음)`);
    else if (kind(a[key]) !== kind(b[key]))
      errors.push(`${at}: 값 종류 다름(ko ${kind(a[key])}, en ${kind(b[key])})`);
    else if (kind(a[key]) === "tree") errors.push(...messageShapeErrors(a[key], b[key], at));
    else if (kind(a[key]) === "string" && (a[key] === "") !== (b[key] === ""))
      errors.push(`${at}: 한쪽만 빈 문자열`);
  }
  return errors;
}

// ─── 문구 도우미 ──────────────────────────────────────────────────────────────

/** 영어 복수형 명사: `plural(1, "story", "stories")` → "story", 0·2 이상 → "stories". 수는 붙이지 않는다. */
export function plural(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}

/** 천 단위 구분 숫자(1,234). 두 언어 모두 쉼표지만 Intl 로케일을 언어에 맞춘다. */
export function formatNumber(n: number, locale: Locale): string {
  return n.toLocaleString(locale === "en" ? "en-US" : "ko-KR");
}
