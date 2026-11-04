/**
 * 영어판 KPI(docs/english-version-plan.md Phase 1-4·2-3·8-1) — 순수 함수·타입, DB·파일 접근 없음.
 * 집계 쿼리는 src/lib/db.ts `getEnglishKpi`, 출력은 `npm run kpi`(scripts/lib/englishReport.ts)와
 * 로컬 admin KPI 패널(src/components/admin/EnglishKpiPanel.tsx)이 같은 값을 쓴다.
 *
 * 재료 두 가지:
 *  - DB: 게재 기사(`summary_ko IS NOT NULL`)의 `title_en`·`summary_en` 보유 여부 — 커버리지(지금 상태, 백필 반영).
 *  - 회차 notes(scripts/lib/englishCheck.ts `englishCheckNotes` — src/ 는 scripts/ 를 import 하지 않으므로 문구를
 *    여기서 다시 읽는다. 형식이 어긋나면 englishKpi.test.ts 가 깨진다):
 *      `영어 가공 N/M건` · `영어 기각 K건(한글 a·숫자 b·길이 c)` · `한국어 숫자 불일치 N건(예시…)`
 *    — 그 회차가 검사한 수·기각 사유(기각은 DB 에 사유가 남지 않는다).
 *
 * "영어판 이전" 처리: 영어 가공 회차(notes 에 `영어 가공`)도 영어가 있는 게재 기사도 없으면 커버리지를 0%로 보이지 않고
 * "아직 없음"으로 둔다. 영어판 시작 시각 = 첫 영어 회차 시작과 영어가 있는 가장 이른 게재 기사 중 이른 쪽 — Phase 2
 * 백필이 지난 기사에 영어를 채우면 시작이 앞당겨져 커버리지가 전체 게재 기준이 된다(2-3 "100%에서 기각 건수를 뺀 값").
 */

/** 기각 사유 키 — scripts/lib/englishCheck.ts `ENGLISH_REJECT_REASONS`와 같은 집합(테스트가 확인). 표시 순서 = notes 순서. */
export const ENGLISH_REJECT_KEYS = ["hangul", "number", "length"] as const;
export type EnglishRejectKey = (typeof ENGLISH_REJECT_KEYS)[number];

export const ENGLISH_REJECT_LABELS: Record<EnglishRejectKey, string> = {
  hangul: "한글",
  number: "숫자",
  length: "길이",
};

/** 기각 사유 설명(패널 툴팁·CLI 범례). 규칙 원문은 englishCheck.ts 머리 주석. */
export const ENGLISH_REJECT_HINTS: Record<EnglishRejectKey, string> = {
  hangul: "영어 제목·요약에 한글이 섞임",
  number: "원문 제목·발췌에 없는 숫자·금액·통화",
  length: "제목 20~110자·요약 8~90단어 밖",
};

export type EnglishRejectCounts = Record<EnglishRejectKey, number>;

/** 한 회차 notes 의 영어 검사 줄. */
export interface EnglishRunNotes {
  /** 검사한 기사 수(M). */
  checked: number;
  /** 영어를 저장한 기사 수(N). */
  passed: number;
  rejected: EnglishRejectCounts;
  /** 한국어 숫자 불일치 경고가 난 기사 수(게재는 막지 않는다). */
  koreanMismatch: number;
}

const zeroRejects = (): EnglishRejectCounts => ({ hangul: 0, number: 0, length: 0 });

/**
 * notes(`;` 구분) → 영어 검사 줄. `영어 가공` 줄이 없으면 null(영어판 이전 회차, 또는 게재 0건이라 검사가 없던 회차).
 * 기각·불일치 줄은 0건이면 생략되므로 없으면 0이다.
 */
export function parseEnglishNotes(notes: string | null | undefined): EnglishRunNotes | null {
  if (!notes) return null;
  let out: EnglishRunNotes | null = null;
  let rejected = zeroRejects();
  let koreanMismatch = 0;
  for (const raw of notes.split(";")) {
    const part = raw.trim();
    const kept = /^영어 가공 (\d+)\/(\d+)건/.exec(part);
    if (kept) {
      out = {
        checked: Number(kept[2]),
        passed: Number(kept[1]),
        rejected: zeroRejects(),
        koreanMismatch: 0,
      };
      continue;
    }
    const rej = /^영어 기각 (\d+)건\(한글 (\d+)·숫자 (\d+)·길이 (\d+)\)/.exec(part);
    if (rej) {
      rejected = { hangul: Number(rej[2]), number: Number(rej[3]), length: Number(rej[4]) };
      continue;
    }
    const ko = /^한국어 숫자 불일치 (\d+)건/.exec(part);
    if (ko) koreanMismatch = Number(ko[1]);
  }
  if (!out) return null;
  out.rejected = rejected;
  out.koreanMismatch = koreanMismatch;
  return out;
}

export const rejectTotal = (r: EnglishRejectCounts): number =>
  ENGLISH_REJECT_KEYS.reduce((s, k) => s + r[k], 0);

/** 게재 대비 영어 보유. */
export interface EnglishCoverage {
  /** 게재 기사 수(`summary_ko IS NOT NULL`). */
  published: number;
  /** 그중 영어 제목·요약이 모두 있는 수. */
  english: number;
}

/** 최근 회차 한 줄. */
export interface EnglishRunKpi {
  id: number;
  startedAt: string;
  status: string;
  /** notes 의 영어 검사 줄(회차 당시 값). 없으면 null. */
  notes: EnglishRunNotes | null;
  /** 이 회차가 게재한 기사(created_at 이 이 회차 시작 ~ 다음 회차 시작) — 지금 DB 기준(백필 반영). */
  coverage: EnglishCoverage;
}

export interface EnglishKpi {
  /** DB 에 영어 컬럼(articles.title_en·summary_en)이 있는가. 없으면 마이그레이션 전 DB. */
  hasColumns: boolean;
  /** 영어판 시작 시각(ISO UTC). null = 영어판 이전(영어 회차도 영어 기사도 없음). */
  since: string | null;
  /** 전체 게재 기사 수(시작 이전 포함) — 영어판 이전 안내·백필 대상 규모. */
  allPublished: number;
  /** 시작 이후 누적 커버리지. */
  overall: EnglishCoverage;
  /** 한국 매체(`sources.region = 'kr'`). */
  korea: EnglishCoverage;
  /** 해외 매체(region 없음). */
  overseas: EnglishCoverage;
  /** 시작 이후 회차 notes 합계. */
  checks: {
    /** `영어 가공` 줄이 있는 회차 수. */
    runs: number;
    checked: number;
    passed: number;
    rejected: EnglishRejectCounts;
    koreanMismatch: number;
  };
  /** 시작 이후 최근 회차(최신 순). */
  runs: EnglishRunKpi[];
}

/** notes 줄들의 합계. */
export function sumEnglishNotes(list: readonly (EnglishRunNotes | null)[]): EnglishKpi["checks"] {
  const out: EnglishKpi["checks"] = {
    runs: 0,
    checked: 0,
    passed: 0,
    rejected: zeroRejects(),
    koreanMismatch: 0,
  };
  for (const n of list) {
    if (!n) continue;
    out.runs += 1;
    out.checked += n.checked;
    out.passed += n.passed;
    for (const k of ENGLISH_REJECT_KEYS) out.rejected[k] += n.rejected[k];
    out.koreanMismatch += n.koreanMismatch;
  }
  return out;
}

/** 영어판 이전 — 커버리지를 0%로 보이지 않고 "아직 없음"으로 둔다. */
export function englishNotStarted(k: EnglishKpi): boolean {
  return k.since === null;
}

/** 비율(0~1). 분모가 0이면 null. */
export function coverageRate(c: EnglishCoverage): number | null {
  return c.published > 0 ? c.english / c.published : null;
}

/** 비율 표기 — "94.3%"·"100%"(소수 0은 뗀다). 분모 0이면 "—". */
export function percentText(numer: number, denom: number): string {
  if (denom <= 0) return "—";
  const p = ((numer / denom) * 100).toFixed(1);
  return `${p.endsWith(".0") ? p.slice(0, -2) : p}%`;
}

/** "한글 0 · 숫자 1 · 길이 1". */
export function rejectBreakdownText(r: EnglishRejectCounts, sep = " · "): string {
  return ENGLISH_REJECT_KEYS.map((k) => `${ENGLISH_REJECT_LABELS[k]} ${r[k]}`).join(sep);
}
