/**
 * 호 안 같은 사건 합치기(④-3단계, 코드만 — LLM 호출 없음). 선별이 같은 사건의 두 보도를 묶지 못하면(7-3 배치 회차:
 * OpenAI 110억 달러 유치의 HN 경유 WSJ 보도와 The Decoder 기사) 리드와 같은 사건이 브리핑에 함께 실린다. 1면 단계에서는
 * URL 도 달라 가를 근거가 없으므로, 가공·재보도 검사를 마친 오늘 게재분끼리 재보도 확인과 같은 내용어(textTokens)로
 * 다시 대조해, 같은 사건인 쌍은 대표 기사 하나만 싣고 나머지를 대표의 related_json 으로 합친다.
 *
 * 정밀도 우선이다. 잘못 합치면 그 호에서 진짜 기사 하나가 소리 없이 사라지고(중복 한 건보다 나쁘다), 같은 날 같은 회사의
 * 다른 소식(OpenAI 두 건)·같은 행사의 다른 꼭지(스마트라이프위크 사진 기사 20여 건)·같은 주제의 다른 회사(Form Energy ↔
 * Energy Dome)는 흔하다. 그래서 재보도 확인(증거 2)보다 훨씬 엄격하게, 아래를 모두 만족해야 합친다(isSameEvent):
 * - 그날의 주제어는 증거에서 뺀다 — 오늘 게재분 중 MAX_THEME_DF 건보다 많은 기사가 쓰는 낱말(행사명·장소·회사).
 * - 남은 증거 점수(repeatCheck.evidenceScore — 회사는 몇 개든 1점)가 MIN_SAME_EVENT_EVIDENCE 이상이고,
 *   짧은 쪽 기사 내용어 수의 MIN_SAME_EVENT_OVERLAP 이상이다.
 * - 두 제목끼리도 증거가 MIN_TITLE_EVIDENCE 이상이다(요약 첫 문장의 상투구만 겹치는 경우를 거른다).
 * - 공유 증거에 회사·숫자가 아닌 낱말(hasTopicWord — 후속 보도 연결과 같은 조건)과, 숫자·로마자가 든 고유 표지
 *   (hasMarker — 금액·모델명·제품명)가 하나씩은 있다.
 * - 뉴스끼리만 합친다(SAME_EVENT_FORMATS).
 *
 * 대표는 1면이 먼저 고를 기사(edition.byEditorial 과 같은 순서: 중요도 → 화제 → 최신 → 풀 번호)라, 1면에는 원래 오를 기사가 남고
 * 중복 쪽만 빠진다. 다른 기사는 대표와 직접 같은 사건이어야 합친다(A~B~C 사슬로 무관한 A·C 를 묶지 않는다).
 *
 * 실패에 열려 있다(mergeSameEvents): 어떤 오류든 합치지 않고 그대로 게재하며 notes 에만 남긴다.
 */
import type { Format } from "../../src/lib/labels";
import { evidenceScore, firstSentence, hasTopicWord } from "./repeatCheck";
import type { ArticleEnrichment } from "./schema";
import { contentTokensOf, ENTITY_KEYS, sharedTokens } from "./textTokens";
import type { Candidate, Pick as TriagePick } from "./triage";

/**
 * 이 수보다 많은 오늘 게재분이 함께 쓰는 낱말은 그날의 주제어로 보고 증거에서 뺀다. 실제 10-06 호는 스마트라이프위크 사진
 * 기사 20여 건이 요약 첫 문장("서울시와 세계스마트시티기구가 주최한 … 코엑스에서 개최됐다")을 통째로 공유해, 이 거르기
 * 없이는 서로 다른 꼭지끼리 8~10점이 나왔다.
 */
export const MAX_THEME_DF = 3;
/**
 * 같은 사건으로 보는 최소 증거 점수. 재보도 확인(2)보다 높다 — 호 안에서는 같은 회사·같은 주제 기사가 훨씬 흔하다.
 * 교정(실제 DB 29개 호 + no-save 스냅숏 3개): 3이면 "엔비디아 d-매트릭스 투자 ↔ 리플렉션 AI 인수"(같은 회사의 다른 거래)
 * 같은 다른 사건이 통과한다. 알려진 사례(OpenAI 110억 달러 유치, HN 경유 WSJ ↔ The Decoder)는 4점이다.
 */
export const MIN_SAME_EVENT_EVIDENCE = 4;
/**
 * 증거 점수 / 짧은 쪽 내용어 수의 하한 — 긴 요약 둘이 우연히 몇 낱말 겹치는 경우를 거른다. 0.4 면 "웹사이트들의 AI 에이전트
 * 접근 제한 ↔ 은행들의 메타 뮤즈 계좌 접근 제한"(0.40), 주제어 거르기가 듣지 않는 작은 호에서는 "Form Energy 철 배터리 ↔
 * Energy Dome CO₂ 배터리"(0.45)가 통과한다. 실제로 합친 같은 사건은 모두 0.5 이상이었다.
 */
export const MIN_SAME_EVENT_OVERLAP = 0.5;
/**
 * 두 제목끼리의 최소 증거 점수. 같은 행사 기사는 요약 첫 문장(주최·장소 상투구)을 공유하므로, 그런 기사가 오늘 2~3건뿐이면
 * 주제어 거르기가 듣지 않는다("LG CNS 휴머노이드, 스마트라이프위크서 공개" ↔ "스마트라이프위크서 삼성 폴더블폰 선보여"는
 * 첫 문장만으로 9점). 제목도 주체·대상 두 가지를 함께 써야 같은 사건으로 본다. 대가로 제목이 갈린 같은 사건(실제 2쌍:
 * OpenAI 루프 트랜스포머 모델 두 보도 등)은 중복으로 남는다.
 */
export const MIN_TITLE_EVIDENCE = 2;
/**
 * 고유 표지: 숫자나 로마자가 든 낱말(금액·수치·모델명·제품명 — 110억·1조·rho-1·instagram). 회사 키는 표지가 아니다.
 * 한글 일반 명사(배터리·시뮬레이션·체험·드로잉)만 겹치는 쌍은 같은 주제일 뿐인 경우가 많아, 공유 증거에 표지가 하나는
 * 있어야 합친다. 대가로 한글로만 쓰인 같은 사건(실제 1쌍: 영국 세대별 담배 금지)은 중복으로 남는다.
 */
const MARKER_TOKEN = /[0-9a-z]/;
/**
 * 합치는 형식. 뉴스만 합친다 — 레이더(저장소·모델·논문)는 뉴스와 다른 축이라 리포·논문을 뉴스에 합치지 않고, 같은 방법·
 * 같은 도구를 다룬 다른 논문·저장소("다중 교사 온폴리시 증류" 논문 두 편, CLIProxyAPI 의 서로 다른 Rust 포트)는 이름을
 * 공유해도 별개 항목이라 합치면 안 된다. 같은 논문의 두 보도는 선별의 묶기에 맡긴다.
 */
export const SAME_EVENT_FORMATS: ReadonlySet<Format> = new Set<Format>(["news"]);

/** 대조할 오늘 게재분 1건. id 는 후보 풀 번호. */
export interface SameEventInput {
  id: number;
  title: string;
  summary: string;
  format: Format;
  importance: number;
  /** 화제 지수(trendingScore) — 대표 선정의 두 번째 기준. */
  trending: number;
  publishedAt: string;
}

/** 두 기사의 같은 사건 증거. */
export interface SameEventEvidence {
  /** 그날의 주제어를 뺀 공유 내용어(증거). */
  shared: string[];
  /** 함께 쓰지만 오늘 게재분 MAX_THEME_DF 건 초과가 쓰는 주제어(증거에서 뺌 — 검토용). */
  theme: string[];
  score: number;
  /** score / 짧은 쪽 내용어 수(회사는 1개로 센다). */
  overlap: number;
  /** 두 제목이 함께 쓰는 내용어(주제어 포함). */
  titleShared: string[];
  /** titleShared 의 증거 점수(회사는 1점). */
  titleScore: number;
}

/** 합친 쌍: merged(풀 번호)를 representative 의 related 로 합친다. */
export interface SameEventMerge extends SameEventEvidence {
  representative: number;
  merged: number;
}

const textsOf = (x: SameEventInput) => [x.title, firstSentence(x.summary)];

/** 재보도 검사와 같은 입력(제목 + 요약 첫 문장)의 내용어. */
export function eventTokens(x: SameEventInput): Set<string> {
  return contentTokensOf(textsOf(x));
}

/** 내용어 수(회사는 몇 개든 1개 — 증거 점수와 같은 셈). */
function evidenceSize(tokens: Set<string>): number {
  const all = [...tokens];
  const entities = all.filter((t) => ENTITY_KEYS.has(t)).length;
  return all.length - entities + Math.min(entities, 1);
}

/** 오늘 게재분 전체의 낱말별 기사 수(문서 빈도). */
export function themeFrequency(inputs: SameEventInput[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const x of inputs) for (const t of eventTokens(x)) df.set(t, (df.get(t) ?? 0) + 1);
  return df;
}

/** 두 기사의 증거. df 는 themeFrequency(오늘 게재분 전체). */
export function sameEventEvidence(
  a: SameEventInput,
  b: SameEventInput,
  df: ReadonlyMap<string, number>,
): SameEventEvidence {
  const ta = eventTokens(a);
  const tb = eventTokens(b);
  const all = sharedTokens(ta, tb);
  const shared = all.filter((t) => (df.get(t) ?? 0) <= MAX_THEME_DF);
  const theme = all.filter((t) => (df.get(t) ?? 0) > MAX_THEME_DF);
  const score = evidenceScore(shared, textsOf(a), textsOf(b));
  const size = Math.min(evidenceSize(ta), evidenceSize(tb));
  const titleShared = sharedTokens(contentTokensOf([a.title]), contentTokensOf([b.title]));
  return {
    shared,
    theme,
    score,
    overlap: size > 0 ? score / size : 0,
    titleShared,
    titleScore: evidenceScore(titleShared, [a.title], [b.title]),
  };
}

/** 공유 증거에 고유 표지(MARKER_TOKEN)가 있는가. */
export function hasMarker(shared: string[]): boolean {
  return shared.some((t) => !ENTITY_KEYS.has(t) && MARKER_TOKEN.test(t));
}

/** 합칠 만큼 같은 사건인가(모듈 머리 주석의 조건 — 형식은 findSameEventMerges 가 본다). */
export function isSameEvent(ev: SameEventEvidence): boolean {
  return (
    ev.score >= MIN_SAME_EVENT_EVIDENCE &&
    ev.overlap >= MIN_SAME_EVENT_OVERLAP &&
    ev.titleScore >= MIN_TITLE_EVIDENCE &&
    hasTopicWord(ev.shared) &&
    hasMarker(ev.shared)
  );
}

/** 대표 우선순위 — 1면 편집 순(edition.byEditorial)과 같다: 중요도 → 화제 → 최신 → 풀 번호. */
export function byRepresentative(a: SameEventInput, b: SameEventInput): number {
  return (
    b.importance - a.importance ||
    b.trending - a.trending ||
    b.publishedAt.localeCompare(a.publishedAt) ||
    a.id - b.id
  );
}

/**
 * 합칠 쌍 찾기. 대표 우선순위로 훑으며, 아직 배정되지 않은 기사가 대표가 되고 같은 형식(뉴스)의 나머지 미배정 기사 중
 * 대표와 직접 같은 사건인 것을 모두 합친다. 그래서 묶음의 모든 기사가 대표와 같은 사건이고, 결과는 입력 순서와 무관하다.
 */
export function findSameEventMerges(inputs: SameEventInput[]): SameEventMerge[] {
  const df = themeFrequency(inputs);
  const order = [...inputs].sort(byRepresentative);
  const assigned = new Set<number>();
  const merges: SameEventMerge[] = [];
  for (const rep of order) {
    if (assigned.has(rep.id)) continue;
    assigned.add(rep.id);
    for (const x of order) {
      if (assigned.has(x.id) || x.format !== rep.format) continue;
      if (!SAME_EVENT_FORMATS.has(rep.format)) continue;
      const ev = sameEventEvidence(rep, x, df);
      if (!isSameEvent(ev)) continue;
      assigned.add(x.id);
      merges.push({ representative: rep.id, merged: x.id, ...ev });
    }
  }
  return merges;
}

/** 가공을 마친 게재분 → 대조 입력(미가공 선정은 한국어 텍스트가 없어 대조하지 않는다). */
export function toSameEventInputs(
  picks: TriagePick[],
  pool: Candidate[],
  enriched: ReadonlyMap<number, ArticleEnrichment>,
): SameEventInput[] {
  return picks.flatMap((p) => {
    const e = enriched.get(p.index);
    const c = pool[p.index];
    if (!e) return [];
    return [
      {
        id: p.index,
        title: e.title_ko,
        summary: e.summary_ko,
        format: c.format,
        importance: p.importance,
        trending: c.score,
        publishedAt: c.item.publishedAt,
      },
    ];
  });
}

/** 합친 뒤의 게재 목록. */
export interface SameEventApplied {
  picks: TriagePick[];
  enriched: Map<number, ArticleEnrichment>;
  /** 합쳐진 풀 번호 → 대표 풀 번호. 선정 id 를 참조하는 다른 출력(편집자 노트 등)을 대표로 옮길 때 쓴다. */
  mergedInto: Map<number, number>;
  /** 합쳐져 빠진 선정. */
  merged: TriagePick[];
}

/**
 * 합치기 적용. 합쳐진 선정과 그 묶음(duplicates)은 대표의 duplicates 끝에 붙는다 — persist 가 대표의 related_json 에
 * 넣고(묶인 기사와 같은 모양 {source,url,title}) 키를 seen_items 에 남기며, 재심사 중이던 미가공 행이면 지운다.
 * 선정·가공 목록에 없는 짝(대표든 합칠 쪽이든)은 무시한다.
 */
export function applySameEventMerges(
  picks: TriagePick[],
  enriched: ReadonlyMap<number, ArticleEnrichment>,
  merges: SameEventMerge[],
): SameEventApplied {
  const byIndex = new Map(picks.map((p) => [p.index, p]));
  const mergedInto = new Map<number, number>();
  const extra = new Map<number, number[]>();
  for (const m of merges) {
    const rep = byIndex.get(m.representative);
    const away = byIndex.get(m.merged);
    if (!rep || !away || rep === away || mergedInto.has(m.merged)) continue;
    if (mergedInto.has(m.representative) || !enriched.has(m.merged)) continue;
    mergedInto.set(m.merged, m.representative);
    extra.set(m.representative, [
      ...(extra.get(m.representative) ?? []),
      away.index,
      ...away.duplicates,
    ]);
  }
  const kept = picks
    .filter((p) => !mergedInto.has(p.index))
    .map((p) => {
      const more = extra.get(p.index);
      return more ? { ...p, duplicates: [...p.duplicates, ...more] } : p;
    });
  return {
    picks: kept,
    enriched: new Map([...enriched].filter(([i]) => !mergedInto.has(i))),
    mergedInto,
    merged: picks.filter((p) => mergedInto.has(p.index)),
  };
}

/**
 * 후속 보도 연결(풀 번호 → 이전 보도 id)을 합친 뒤로 옮긴다. 대표에 연결이 없고 합쳐진 기사에 있으면 대표가 받는다
 * (같은 사건이므로 같은 이전 보도다). 대표에 이미 있으면 대표 것을 둔다. 합쳐진 기사의 연결은 지운다(저장되지 않는다).
 */
export function adoptFollowUps(
  followUpOf: ReadonlyMap<number, number>,
  mergedInto: ReadonlyMap<number, number>,
): Map<number, number> {
  const out = new Map(followUpOf);
  for (const [away, rep] of mergedInto) {
    const prev = out.get(away);
    if (prev === undefined) continue;
    if (!out.has(rep)) out.set(rep, prev);
    out.delete(away);
  }
  return out;
}

/**
 * notes 한 줄. kpi baseline 은 parseRunWarnings.sameEventMerged 로 읽는다 — `재보도 …`·`할당 …`·`선정 N건` 파싱과
 * 겹치지 않는다.
 */
export function sameEventNote(merged: number): string | null {
  return merged > 0 ? `같은 사건 합침 ${merged}건` : null;
}

/** mergeSameEvents 결과. */
export interface SameEventOutcome extends SameEventApplied {
  status: "ok" | "failed";
  merges: SameEventMerge[];
  /** notes 에 넣을 줄(없으면 null). */
  note: string | null;
}

/**
 * 오늘 게재분에서 같은 사건을 찾아 합친다. 실패에 열려 있다 — 어떤 오류든 아무것도 합치지 않은 원래 목록을 돌려주고
 * note 에 `같은 사건 합침 실패(그대로 게재): 사유`를 남긴다.
 */
export function mergeSameEvents(
  picks: TriagePick[],
  pool: Candidate[],
  enriched: ReadonlyMap<number, ArticleEnrichment>,
): SameEventOutcome {
  try {
    const merges = findSameEventMerges(toSameEventInputs(picks, pool, enriched));
    const applied = applySameEventMerges(picks, enriched, merges);
    const used = merges.filter((m) => applied.mergedInto.get(m.merged) === m.representative);
    return { status: "ok", ...applied, merges: used, note: sameEventNote(applied.merged.length) };
  } catch (err) {
    return {
      status: "failed",
      picks,
      enriched: new Map(enriched),
      mergedInto: new Map(),
      merged: [],
      merges: [],
      note: `같은 사건 합침 실패(그대로 게재): ${(err as Error).message}`,
    };
  }
}
