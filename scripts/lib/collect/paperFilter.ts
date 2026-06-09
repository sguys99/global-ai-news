/**
 * configs/paper-filter.json 로더. arxiv 인용/기관 게이트와 HF upvote 임계값 설정.
 * 모듈 로드 시 1회 읽어 캐시한다(파일 부재·파싱 실패 시 보수적 기본값).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONFIGS_DIR } from "../../../src/lib/paths";

export interface ArxivFilter {
  /** 수집 윈도우: 제출일이 [now-windowDays, now-minAgeDays] 인 논문만 대상. */
  windowDays: number;
  /** 최소 경과일: 인용/인덱싱이 쌓일 시간(당일 논문은 인용 0이라 제외). */
  minAgeDays: number;
  /** 카테고리당 enrich(외부 API 조회) 상한. 비용·rate limit 가드. */
  maxResults: number;
  /** Semantic Scholar 총 인용수 임계값(이상이면 통과). */
  citationThreshold: number;
  /** Semantic Scholar 영향력 인용수 임계값(이상이면 통과). */
  influentialCitationThreshold: number;
  /** OpenAlex 저자 소속 화이트리스트(하나라도 일치하면 통과). */
  institutionAllowlist: string[];
}

export interface HfFilter {
  /** 이 upvote 미만인 HuggingFace Daily Paper 는 버린다. */
  minUpvotes: number;
}

export interface PaperFilter {
  arxiv: ArxivFilter;
  hf: HfFilter;
}

const DEFAULTS: PaperFilter = {
  arxiv: {
    windowDays: 120,
    minAgeDays: 30,
    maxResults: 120,
    citationThreshold: 3,
    influentialCitationThreshold: 1,
    institutionAllowlist: [],
  },
  hf: { minUpvotes: 0 },
};

let cached: PaperFilter | null = null;

/** configs/paper-filter.json 을 읽어 기본값과 병합한다. */
export function loadPaperFilter(): PaperFilter {
  if (cached) return cached;
  try {
    const file = path.join(CONFIGS_DIR, "paper-filter.json");
    const raw = JSON.parse(readFileSync(file, "utf-8")) as Partial<PaperFilter>;
    cached = {
      arxiv: { ...DEFAULTS.arxiv, ...(raw.arxiv ?? {}) },
      hf: { ...DEFAULTS.hf, ...(raw.hf ?? {}) },
    };
  } catch {
    cached = DEFAULTS;
  }
  return cached;
}
