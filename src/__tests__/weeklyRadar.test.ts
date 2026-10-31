import { describe, expect, it } from "vitest";
import type { Format } from "@/lib/labels";
import type { ArticleCard } from "@/lib/types";
import {
  WEEKLY_LIMITS,
  buildWeeklyRadar,
  identityKeys,
  isWeeklyIssue,
  issueDayLabel,
  weekRangeLabel,
  weekWindow,
  weekdayOfKey,
  weeklyFormatMix,
  weeklyMetaBlock,
  type WeeklyCandidate,
} from "@/lib/weeklyRadar";

const SUNDAY = "2026-10-25";
const WEEK = [
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
  "2026-10-24",
  "2026-10-25",
];

let seq = 0;
function cand(format: Format, issueDate: string, p: Partial<ArticleCard> = {}): WeeklyCandidate {
  seq += 1;
  const url =
    format === "oss"
      ? `https://github.com/o${seq}/r${seq}`
      : format === "model"
        ? `https://huggingface.co/org${seq}/m${seq}`
        : format === "paper"
          ? `https://huggingface.co/papers/2610.${String(10000 + seq)}`
          : `https://news.example/${seq}`;
  return {
    issueDate,
    article: {
      id: seq,
      source: { id: `src-${format}`, name: format === "oss" ? "GitHub" : "HuggingFace Papers" },
      url,
      titleKo: `제목${seq}`,
      summaryKo: "요약",
      titleOriginal: `Original title number ${seq}`,
      category: "research",
      format,
      tags: [],
      trendingScore: 0,
      importance: 3,
      publishedAt: `${issueDate}T00:00:00Z`,
      ...p,
    },
  };
}

const ids = (w: ReturnType<typeof buildWeeklyRadar>) => w?.items.map((i) => i.id) ?? [];

describe("주 경계", () => {
  it("요일은 KST 달력 날짜 키 그대로 계산 — 2026-11-01·10-25 는 일요일", () => {
    expect(weekdayOfKey("2026-11-01")).toBe(0);
    expect(weekdayOfKey("2026-10-25")).toBe(0);
    expect(weekdayOfKey("2026-10-26")).toBe(1);
    expect(weekdayOfKey("2026-10-31")).toBe(6);
    expect(isWeeklyIssue("2026-11-01")).toBe(true);
    expect(isWeeklyIssue("2026-10-31")).toBe(false);
  });

  it("잘못된 날짜 키는 일요일이 아니다", () => {
    expect(weekdayOfKey("2026-02-30")).toBe(-1);
    expect(weekdayOfKey("2026-10-25T00:00:00Z")).toBe(-1);
    expect(isWeeklyIssue("")).toBe(false);
  });

  it("일요일 → 월~일 7일(오래된 순), 월·연 경계를 넘는다", () => {
    expect(weekWindow(SUNDAY)).toEqual({ start: "2026-10-19", end: SUNDAY, dates: WEEK });
    expect(weekWindow("2026-11-01")?.dates).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(weekWindow("2027-01-03")?.start).toBe("2026-12-28");
    expect(weekWindow("2026-10-24")).toBeNull();
  });

  it("표기: 실린 호 요일 · 기간", () => {
    expect(issueDayLabel("2026-10-20")).toBe("화요일 호");
    expect(issueDayLabel("2026-10-25")).toBe("일요일 호");
    expect(weekRangeLabel("2026-10-26", "2026-11-01")).toBe("10월 26일 – 11월 1일");
  });
});

describe("buildWeeklyRadar — 선정·순서", () => {
  it("일요일이 아니면 null", () => {
    const cs = WEEK.map((d) => cand("paper", d));
    expect(buildWeeklyRadar(cs, "2026-10-24")).toBeNull();
  });

  it("주 밖·뉴스 후보는 거른다", () => {
    const inWeek = [cand("paper", "2026-10-19"), cand("paper", "2026-10-21")];
    const inWeek2 = [cand("oss", "2026-10-23"), cand("oss", "2026-10-25")];
    const outside = [cand("paper", "2026-10-18", { importance: 5 }), cand("oss", "2026-10-26")];
    const news = cand("news", "2026-10-22", { importance: 5 });
    const w = buildWeeklyRadar([...outside, news, ...inWeek, ...inWeek2], SUNDAY);
    expect(ids(w).sort((a, b) => a - b)).toEqual(
      [...inWeek, ...inWeek2].map((c) => c.article.id).sort((a, b) => a - b),
    );
  });

  it("형식 안 순서: 중요도 → 화제 → 반응 신호(저장소 당일 스타·모델 좋아요·논문 추천) → 최신 호", () => {
    const p1 = cand("paper", "2026-10-19", { importance: 3, trendingScore: 10 });
    const p2 = cand("paper", "2026-10-20", { importance: 4, trendingScore: 0 });
    const p3 = cand("paper", "2026-10-21", {
      importance: 3,
      trendingScore: 10,
      engagement: { ups: 50 },
    });
    const p4 = cand("paper", "2026-10-22", { importance: 3, trendingScore: 10 });
    const w = buildWeeklyRadar([p1, p2, p3, p4], SUNDAY);
    // p2(중요도 4) → p3(추천 50) → p4(p1 과 동점, 더 최신 호) → p1
    expect(ids(w)).toEqual([p2, p3, p4, p1].map((c) => c.article.id));
  });

  it("형식 혼합 보장: 한 형식이 강해도 후보가 있는 형식은 각 2건씩 먼저 싣는다", () => {
    const strongOss = WEEK.flatMap((d) => [
      cand("oss", d, { importance: 5, trendingScore: 90 }),
      cand("oss", d, { importance: 5, trendingScore: 80 }),
    ]); // 14건
    const weakModel = [cand("model", "2026-10-20", { importance: 1 })];
    const weakPapers = [
      cand("paper", "2026-10-21", { importance: 1 }),
      cand("paper", "2026-10-22", { importance: 2 }),
      cand("paper", "2026-10-23", { importance: 1 }),
    ];
    const w = buildWeeklyRadar([...strongOss, ...weakModel, ...weakPapers], SUNDAY)!;
    expect(w.items).toHaveLength(10);
    const byFormat = (f: Format) => w.items.filter((i) => i.format === f).length;
    expect(byFormat("model")).toBe(1); // 후보가 1건뿐
    expect(byFormat("paper")).toBe(2);
    expect(byFormat("oss")).toBe(7);
    expect(w.formats).toEqual([
      { format: "oss", count: 7 },
      { format: "model", count: 1 },
      { format: "paper", count: 2 },
    ]);
    // 표시는 합친 순서 — 강한 저장소가 위, 확보분(약한 모델·논문)은 아래.
    expect(w.items.slice(0, 7).every((i) => i.format === "oss")).toBe(true);
    // 논문 2건은 형식 안 순서(중요도 2 → 1, 동점은 최신 호)
    expect(w.items.filter((i) => i.format === "paper").map((i) => i.id)).toEqual([
      weakPapers[1].article.id,
      weakPapers[2].article.id,
    ]);
    expect(w.candidates).toBe(18);
  });

  it("상한 10건, 남는 자리는 형식을 가리지 않고 합친 순서로 채운다", () => {
    const papers = WEEK.map((d, i) => cand("paper", d, { importance: 5, trendingScore: 70 - i }));
    const repos = WEEK.map((d, i) => cand("oss", d, { importance: 4, trendingScore: 90 - i }));
    const w = buildWeeklyRadar([...repos, ...papers], SUNDAY)!;
    expect(w.items).toHaveLength(WEEKLY_LIMITS.items);
    // 논문(중요도 5) 7건 전부 → 저장소는 확보분 2건 + 남은 1자리
    expect(w.items.filter((i) => i.format === "paper")).toHaveLength(7);
    expect(w.items.filter((i) => i.format === "oss").map((i) => i.id)).toEqual(
      repos.slice(0, 3).map((c) => c.article.id),
    );
    expect(w.items.slice(0, 7).every((i) => i.format === "paper")).toBe(true);
  });

  it("결정적: 입력 순서와 무관하게 같은 결과", () => {
    const cs = WEEK.flatMap((d) => [
      cand("oss", d, { importance: 3, trendingScore: 5 }),
      cand("paper", d, { importance: 3, trendingScore: 5 }),
      cand("model", d, { importance: 3, trendingScore: 5 }),
    ]);
    const a = buildWeeklyRadar(cs, SUNDAY);
    const b = buildWeeklyRadar([...cs].reverse(), SUNDAY);
    const c = buildWeeklyRadar([...cs.slice(7), ...cs.slice(0, 7)], SUNDAY);
    expect(ids(a)).toHaveLength(10);
    expect(ids(b)).toEqual(ids(a));
    expect(ids(c)).toEqual(ids(a));
  });
});

describe("buildWeeklyRadar — 같은 대상 합치기", () => {
  it("같은 논문(arXiv ID)이 HF Papers·Takara·arXiv 로 여러 날 실려도 한 번 — 앞선 기사가 남는다", () => {
    const hf = cand("paper", "2026-10-20", {
      url: "https://huggingface.co/papers/2610.37381",
      importance: 3,
      engagement: { ups: 138 },
    });
    const takara = cand("paper", "2026-10-22", { url: "https://tldr.takara.ai/p/2610.37381" });
    const arxiv = cand("paper", "2026-10-24", { url: "https://arxiv.org/abs/2610.37381v2" });
    const others = [
      cand("paper", "2026-10-21"),
      cand("oss", "2026-10-23"),
      cand("oss", "2026-10-25"),
    ];
    const w = buildWeeklyRadar([takara, arxiv, hf, ...others], SUNDAY)!;
    expect(ids(w)).toContain(hf.article.id);
    expect(ids(w)).not.toContain(takara.article.id);
    expect(ids(w)).not.toContain(arxiv.article.id);
    expect(w.items.find((i) => i.id === hf.article.id)?.issueDate).toBe("2026-10-20");
    expect(w.candidates).toBe(4);
  });

  it("같은 저장소(owner/repo, 대소문자·하위 경로 무시)·같은 원제도 하나로", () => {
    const r1 = cand("oss", "2026-10-19", { url: "https://github.com/vllm-project/vllm" });
    const r2 = cand("oss", "2026-10-22", {
      url: "https://github.com/VLLM-project/vllm/tree/main/",
    });
    const t1 = cand("paper", "2026-10-20", {
      titleOriginal: "Unified Causal Learning for World Models",
    });
    const t2 = cand("paper", "2026-10-21", {
      titleOriginal: "unified causal learning for world-models",
    });
    const fill = [cand("paper", "2026-10-23"), cand("oss", "2026-10-24")];
    const w = buildWeeklyRadar([r1, r2, t1, t2, ...fill], SUNDAY)!;
    expect(ids(w)).toHaveLength(4);
    // 동점이면 최신 호가 앞선다 → 나중 호의 r2 가 남고 r1 은 빠진다.
    expect(ids(w)).toContain(r2.article.id);
    expect(ids(w)).not.toContain(r1.article.id);
    expect(ids(w).filter((id) => [t1.article.id, t2.article.id].includes(id))).toHaveLength(1);
  });

  it("짧은 원제·다른 형식은 원제만으로 합치지 않는다", () => {
    expect(
      identityKeys({ format: "oss", url: "https://github.com/a/b", titleOriginal: "agent" }),
    ).toEqual(["oss:id:a/b"]);
    const paper = identityKeys({
      format: "paper",
      url: "https://example.org/x",
      titleOriginal: "Same Long Title Here",
    });
    const repo = identityKeys({
      format: "oss",
      url: "https://example.org/x",
      titleOriginal: "Same Long Title Here",
    });
    expect(paper.some((k) => repo.includes(k))).toBe(false);
  });
});

describe("buildWeeklyRadar — 빈약한 주", () => {
  it("4건 미만이면 null", () => {
    const cs = [
      cand("paper", "2026-10-19"),
      cand("paper", "2026-10-21"),
      cand("oss", "2026-10-25"),
    ];
    expect(buildWeeklyRadar(cs, SUNDAY)).toBeNull();
    expect(buildWeeklyRadar([...cs, cand("oss", "2026-10-23")], SUNDAY)?.items).toHaveLength(4);
  });

  it("모두 한 호에서 왔으면(그날 레이더의 반복) null", () => {
    const cs = [1, 2, 3, 4, 5].map(() => cand("paper", SUNDAY));
    expect(buildWeeklyRadar(cs, SUNDAY)).toBeNull();
    expect(buildWeeklyRadar([...cs, cand("oss", "2026-10-20")], SUNDAY)).not.toBeNull();
  });

  it("합친 뒤 건수로 판단 — 같은 논문 4번은 1건", () => {
    const url = "https://huggingface.co/papers/2610.11111";
    const cs = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"].map((d) =>
      cand("paper", d, { url }),
    );
    expect(buildWeeklyRadar(cs, SUNDAY)).toBeNull();
  });
});

describe("표시 헬퍼", () => {
  it("형식 구성은 화면 표시명", () => {
    expect(
      weeklyFormatMix([
        { format: "oss", count: 3 },
        { format: "paper", count: 5 },
      ]),
    ).toBe("저장소 3 · 논문 5");
  });

  it('메타: "오늘 +N" 스타 증가분은 "당일 +N"', () => {
    const block = weeklyMetaBlock(
      {
        id: 1,
        title: "t",
        format: "oss",
        category: "oss",
        source: { name: "GitHub Trending" },
        url: "https://github.com/vllm-project/vllm",
        engagement: { stars: 48836, stars_today: 1203, language: "Python" },
        issueDate: "2026-10-20",
      },
      "GitHub",
    );
    expect(block.id?.text).toBe("vllm-project/vllm");
    expect(block.stats.map((m) => m.text)).toEqual(["★ 48.8k", "당일 +1,203", "Python"]);
    expect(block.stats[1].prefix).toBe("당일");
    expect(block.stats[1].label).toBe("그 호 당일 스타 1,203개 증가");
  });

  it("행 DTO 는 렌더에 필요한 필드만 — 요약·태그·원문 발췌는 싣지 않는다", () => {
    const cs = [
      cand("paper", "2026-10-19", { contentRaw: "긴 원문", tags: ["a"], titleKo: "" }),
      cand("paper", "2026-10-20"),
      cand("oss", "2026-10-21"),
      cand("oss", "2026-10-22"),
    ];
    const w = buildWeeklyRadar(cs, SUNDAY)!;
    const first = w.items.find((i) => i.id === cs[0].article.id)!;
    expect(Object.keys(first).sort()).toEqual(
      ["category", "format", "id", "issueDate", "source", "title", "url"].sort(),
    );
    expect(first.title).toBe(cs[0].article.titleOriginal); // 한국어 제목이 없으면 원제
  });
});
