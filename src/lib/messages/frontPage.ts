import { defineMessages, plural } from "@/lib/i18n";
import { formatLabel, type Format } from "@/lib/labels";

/**
 * 편집 지면(src/components/Edition.tsx) 문구 — 1면·오늘의 브리핑·오픈소스·논문 레이더·지금 화제·이 호의 지면·
 * 주간 레이더 밴드·분야 섹션 밴드. 분야·형식 표시명과 날짜는 labels.ts, 주간 레이더 기간·요일과 레이더 메타 줄은
 * radar 이름공간(src/lib/messages/radar.ts) 몫이다.
 */

/** 레이더 보조 문구용 영어 복수 명사(형식 화면 표시명 "Repo"·"Paper"의 복수). */
const EN_FORMAT_PLURALS: Record<Format, string> = {
  news: "stories",
  oss: "repos",
  model: "models",
  paper: "papers",
};

/** ["repos", "papers"] → "Repos and papers", 셋이면 "Repos, models and papers". */
function enList(words: string[]): string {
  const text =
    words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0];
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export const frontPageMessages = defineMessages({
  ko: {
    /** 1면 `<section aria-label>`. */
    front: "1면",
    briefs: "오늘의 브리핑",
    radar: {
      heading: "오픈소스·논문 레이더",
      /** 보조 문구 — 실린 형식(FORMATS 순, 뉴스 제외)을 화면 표시명으로("이번 호의 저장소·논문"). 없으면 빈 문자열. */
      subtitle: (formats: Format[]) =>
        formats.length > 0 ? `이번 호의 ${formats.map((f) => formatLabel(f, "ko")).join("·")}` : "",
    },
    trending: {
      heading: "지금 화제",
      scale: "커뮤니티 반응 지수 0–100",
    },
    contents: {
      heading: "이 호의 지면",
      columns: "건수 · 1면",
      count: (n: number) => `${n}건`,
      onFront: (n: number) => `1면 ${n}`,
    },
    weekly: {
      kicker: "일요일 특집",
      heading: "주간 레이더",
      /** 맨 아래 각주 — 선정 규칙. 인자는 같은 대상을 합친 뒤의 이 주 후보 수. */
      footnote: (n: number) =>
        `월~일 7개 호에 실린 저장소·모델·논문 ${n}건에서 골랐습니다. 순서는 중요도 → 화제 지수 → 반응(스타·좋아요·추천) 순이고, 한 형식이 자리를 독차지하지 않도록 형식마다 2건씩 먼저 싣습니다.`,
    },
    section: {
      count: (n: number) => `${n}건`,
      /** 건수 뒤에 이어 붙는 1면 게재 수(앞 구분점 포함). */
      onFront: (n: number) => ` · 1면 ${n}건`,
      seeAll: "이 분야 전체 기사 →",
    },
  },
  en: {
    front: "Front page",
    briefs: "Today's briefing",
    radar: {
      heading: "Open source & papers radar",
      subtitle: (formats: Format[]) =>
        formats.length > 0
          ? `${enList(formats.map((f) => EN_FORMAT_PLURALS[f]))} in this issue`
          : "",
    },
    trending: {
      heading: "Trending now",
      scale: "Community buzz, 0–100",
    },
    contents: {
      heading: "In this issue",
      columns: "Stories · Front",
      count: (n: number) => `${n}`,
      onFront: (n: number) => `Front ${n}`,
    },
    weekly: {
      kicker: "Sunday special",
      heading: "Weekly radar",
      footnote: (n: number) =>
        `Picked from ${n} ${plural(n, "repo, model or paper", "repos, models and papers")} in this week's seven issues (Monday to Sunday). Ranked by importance, then trending score, then engagement (stars, likes, upvotes); each format gets two slots first so no single format takes over.`,
    },
    section: {
      count: (n: number) => `${n} ${plural(n, "story", "stories")}`,
      onFront: (n: number) => ` · ${n} on the front page`,
      seeAll: "All stories in this section →",
    },
  },
});
