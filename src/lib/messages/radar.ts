import { defineMessages } from "@/lib/i18n";
import { EN_MONTHS_SHORT, EN_WEEKDAYS, KO_WEEKDAYS } from "@/lib/labels";

/**
 * 레이더 메타 줄(src/lib/radarMeta.ts)과 주간 레이더 표기(src/lib/weeklyRadar.ts) 문구 — 순수 함수가 locale 인자로 쓴다.
 * - meta.*: 스크린리더·title 용 label(값은 호출자가 쉼표 정수·근사치로 만들어 넘긴다)과 값 앞 낱말(prefix).
 * - weekly.*: 실린 호 요일("화요일 호"), 기간의 월·일("10월 26일"). 기간 사이 " – " 는 두 언어 공통이라 코드에 둔다.
 * 영어 label 은 "Stars: 1,203" 처럼 이름: 값 — 수가 문자열로 들어와 단·복수를 가르지 않아도 된다.
 * 요일·월 이름 표는 labels.ts 가 단일 출처다.
 */
export const radarMessages = defineMessages({
  ko: {
    meta: {
      repo: (id: string) => `저장소 ${id}`,
      stars: (n: string) => `스타 ${n}개`,
      /** 그날 트렌딩 스타 증가분 — 값 앞 낱말과 label. */
      starsTodayPrefix: "오늘",
      starsToday: (n: string) => `오늘 스타 ${n}개 증가`,
      /** 주간 레이더(일요일 지면)에서 지난 호의 증가분 — "오늘"은 틀린 말이라 "당일". */
      starsSameDayPrefix: "당일",
      starsSameDay: (n: string) => `그 호 당일 스타 ${n}개 증가`,
      language: (lang: string) => `주 언어 ${lang}`,
      model: (id: string) => `모델 ${id}`,
      /** 인자는 근사치 읽기("약 80억"). */
      params: (approx: string) => `파라미터 ${approx} 개`,
      task: (task: string) => `태스크 ${task}`,
      likes: (n: string) => `좋아요 ${n}개`,
      downloads: (n: string) => `최근 30일 다운로드 ${n}회`,
      upvotes: (n: string) => `추천 ${n}개`,
      citationsPrefix: "인용",
      citations: (n: string) => `인용 ${n}회`,
      source: (name: string) => `출처 ${name}`,
    },
    weekly: {
      /** weekday: 0 = 일요일. 범위 밖은 빈 문자열. */
      issueDay: (weekday: number) =>
        weekday >= 0 && weekday < 7 ? `${KO_WEEKDAYS[weekday]}요일 호` : "",
      monthDay: (month: number, day: number) => `${month}월 ${day}일`,
    },
  },
  en: {
    meta: {
      repo: (id: string) => `Repository: ${id}`,
      stars: (n: string) => `Stars: ${n}`,
      starsTodayPrefix: "Today",
      starsToday: (n: string) => `New stars today: ${n}`,
      starsSameDayPrefix: "That day",
      starsSameDay: (n: string) => `New stars that day: ${n}`,
      language: (lang: string) => `Language: ${lang}`,
      model: (id: string) => `Model: ${id}`,
      params: (approx: string) => `Parameters: ${approx}`,
      task: (task: string) => `Task: ${task}`,
      likes: (n: string) => `Likes: ${n}`,
      downloads: (n: string) => `Downloads (last 30 days): ${n}`,
      upvotes: (n: string) => `Upvotes: ${n}`,
      citationsPrefix: "Cited",
      citations: (n: string) => `Citations: ${n}`,
      source: (name: string) => `Source: ${name}`,
    },
    weekly: {
      issueDay: (weekday: number) =>
        weekday >= 0 && weekday < 7 ? `${EN_WEEKDAYS[weekday]} issue` : "",
      monthDay: (month: number, day: number) => `${EN_MONTHS_SHORT[month - 1] ?? ""} ${day}`,
    },
  },
});
