import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FrontPage, SectionBands, WeeklyRadarBand } from "@/components/Edition";
import { EditionBody } from "@/components/EditionBody";
import { FeedFallback } from "@/components/FeedClient";
import { FeedView } from "@/components/FeedView";
import { StoryIndex } from "@/components/StoryIndex";
import { toListCards } from "@/lib/db";
import { buildEdition } from "@/lib/edition";
import { packEdition, packWeekly, unpackEdition } from "@/lib/editionPayload";
import { editionMessages } from "@/lib/messages/edition";
import type { ArticleCard } from "@/lib/types";
import type { WeeklyRadar } from "@/lib/weeklyRadar";

let nextId = 1;
function card(p: Partial<ArticleCard>): ArticleCard {
  const id = p.id ?? nextId++;
  return {
    id,
    source: { id: "the_decoder", name: "The Decoder", nameEn: "The Decoder EN" },
    url: `https://example.com/${id}`,
    titleKo: `기사 ${id}`,
    summaryKo: `요약 ${id}. 둘째 문장.`,
    titleOriginal: `Original ${id}`,
    titleEn: `English ${id}`,
    summaryEn: `English summary ${id}.`,
    category: "llm",
    format: "news",
    tags: ["tag-a", "태그"],
    trendingScore: 0,
    importance: 3,
    publishedAt: `2026-11-03T0${id % 10}:00:00.000Z`,
    related: [],
    ...p,
  };
}

const github = { id: "github_trending", name: "GitHub Trending" };
const hf = { id: "hf_models", name: "HuggingFace Trending Models" };
const papers = { id: "hf_daily_papers", name: "HuggingFace Daily Papers" };

/** 실제 호처럼: 뉴스 여러 분야·묶인 보도·화제·원제 폴백 + 저장소·모델·논문(메트릭·식별자 URL), 섹션 밴드로 넘치는 분량. */
function issue(): ArticleCard[] {
  nextId = 1;
  const cats = ["llm", "agent", "physical", "industry", "research", "oss"];
  const news = Array.from({ length: 24 }, (_, i) =>
    card({
      category: cats[i % cats.length],
      importance: 5 - (i % 5),
      trendingScore: i % 4 === 0 ? 40 + i : 0,
      related:
        i % 5 === 0
          ? [{ source: "TechCrunch AI", url: "https://techcrunch.com/x", title: "x" }]
          : [],
      ...(i === 7 ? { titleKo: "" } : {}),
    }),
  );
  return [
    ...news,
    card({
      source: github,
      format: "oss",
      category: "agent",
      importance: 4,
      trendingScore: 62,
      url: "https://github.com/max-sixty/worktrunk",
      engagement: { stars: 10418, stars_today: 437, language: "Rust" },
    }),
    card({
      source: github,
      format: "oss",
      category: "oss",
      importance: 3,
      url: "https://github.com/a/b",
      engagement: { stars: 900 },
    }),
    card({
      source: hf,
      format: "model",
      category: "llm",
      importance: 4,
      url: "https://huggingface.co/org/model-7b",
      engagement: { likes: 120, downloads: 34000, params: 7.6e9 },
    }),
    card({
      source: papers,
      format: "paper",
      category: "research",
      importance: 5,
      url: "https://huggingface.co/papers/2611.03178",
      engagement: { ups: 88 },
    }),
    card({ source: papers, format: "paper", category: "physical", importance: 2 }),
  ];
}

const weekly: WeeklyRadar = {
  start: "2026-10-26",
  end: "2026-11-01",
  candidates: 12,
  formats: [
    { format: "oss", count: 2 },
    { format: "paper", count: 2 },
  ],
  items: [1, 2, 3, 4].map((i) => ({
    id: 100 + i,
    title: `주간 ${i}`,
    titleEn: `Weekly ${i}`,
    format: i % 2 ? "oss" : "paper",
    category: "agent",
    source: { name: "GitHub Trending", nameEn: "GitHub" },
    url: i % 2 ? `https://github.com/o/r${i}` : `https://arxiv.org/abs/2611.0000${i}`,
    engagement: { stars: 1000 * i, stars_today: 10 * i },
    issueDate: "2026-10-2" + (6 + i),
  })),
};

/** 섬 이전의 호 본문(서버 컴포넌트 밴드 + 목록 카드 색인) — 같은 마크업이어야 한다. */
function before(articles: ArticleCard[], w: WeeklyRadar | null) {
  const edition = buildEdition(articles);
  const t = editionMessages.ko;
  return renderToString(
    <>
      <FrontPage edition={edition} locale="ko" />
      {w && <WeeklyRadarBand weekly={w} locale="ko" />}
      <SectionBands sections={edition.sections} locale="ko" />
      <section id="all" aria-label={t.index} className="scroll-mt-20">
        <div className="border-rule mb-5 flex items-baseline gap-3 border-t-2 pt-3">
          <h2 className="text-display-md font-serif font-extrabold">{t.index}</h2>
          <span className="ed-cnt">{t.count(edition.issue.length)}</span>
        </div>
        <StoryIndex articles={toListCards(edition.issue)} />
      </section>
    </>,
  );
}

describe("호 지면 섬 페이로드(packEdition·unpackEdition)", () => {
  it("섬(EditionBody)의 마크업 = 서버 밴드 + 목록 카드 색인 마크업 (주간 레이더 유무 모두)", () => {
    const articles = issue();
    const edition = buildEdition(articles);
    for (const w of [null, weekly]) {
      const island = renderToString(
        <EditionBody edition={packEdition(edition, "ko")} weekly={packWeekly(w, "ko")} />,
      );
      expect(island).toBe(before(articles, w));
    }
    // 시험 데이터가 모든 칸을 채우는지(레이더 4·섹션 밴드·화제·묶인 보도·색인 더 보기)
    expect(edition.radar).toHaveLength(4);
    expect(edition.sections.length).toBeGreaterThan(2);
    expect(edition.trending.length).toBeGreaterThan(0);
  });

  it("되살린 편집은 같은 기사·같은 순서·같은 슬롯이다", () => {
    const edition = buildEdition(issue());
    const back = unpackEdition(packEdition(edition, "ko"), "ko");
    const idsOf = (a: { id: number }[]) => a.map((x) => x.id);
    expect(back.lead?.id).toBe(edition.lead?.id);
    expect(idsOf(back.seconds)).toEqual(idsOf(edition.seconds));
    expect(idsOf(back.briefs)).toEqual(idsOf(edition.briefs));
    expect(idsOf(back.radar)).toEqual(idsOf(edition.radar));
    expect(idsOf(back.trending)).toEqual(idsOf(edition.trending));
    expect(idsOf(back.issue)).toEqual(idsOf(edition.issue));
    expect(back.sections.map((s) => [s.category, s.count, s.onFront, idsOf(s.items)])).toEqual(
      edition.sections.map((s) => [s.category, s.count, s.onFront, idsOf(s.items)]),
    );
    // 레이더 칸만 메타 레일용 URL·메트릭을 갖는다.
    for (const [i, a] of back.radar.entries()) {
      expect(a.url).toBe(edition.radar[i].url);
      expect(a.engagement).toEqual(edition.radar[i].engagement);
    }
    expect(back.issue.every((a) => !("url" in a))).toBe(true);
  });

  it("한국어 페이로드에는 지면이 그리지 않는 값(태그·원제·URL·묶인 보도 목록·영어)이 없다 — 목록 카드보다 훨씬 작다", () => {
    const edition = buildEdition(issue());
    const json = JSON.stringify(packEdition(edition, "ko"));
    for (const absent of ["tag-a", 'Original 1"', "English", "The Decoder EN", "techcrunch.com"])
      expect(json).not.toContain(absent);
    expect(json).toContain("Original 8"); // 한국어 제목이 빈 기사만 원제 폴백
    expect(json.length).toBeLessThan(JSON.stringify(toListCards(edition.issue)).length * 0.6);
  });

  it("영어판 페이로드는 영어 제목·요약·영문 매체명을 싣는다", () => {
    const edition = buildEdition(issue());
    const back = unpackEdition(packEdition(edition, "en"), "en");
    const lead = edition.lead!;
    expect(back.lead?.titleEn).toBe(lead.titleEn);
    expect(back.lead?.summaryEn).toBe(lead.summaryEn);
    expect(back.lead?.source.nameEn).toBe("The Decoder EN");
  });

  it("지역(KOREA 표시·Korea Desk)은 영어판 페이로드에만 싣는다", () => {
    const korean = (a: ArticleCard): ArticleCard => ({
      ...a,
      source: { ...a.source, region: "kr" },
    });
    const edition = buildEdition(issue().map(korean));
    const back = unpackEdition(packEdition(edition, "en"), "en");
    expect(back.issue.every((a) => a.source.region === "kr")).toBe(true);
    expect(JSON.stringify(packEdition(edition, "ko"))).not.toContain("region");
  });

  it("주간 레이더: 한국어판은 영어 제목·영문 매체명을 떼고, 영어판은 한국어 제목만 비운다", () => {
    const ko = packWeekly(weekly, "ko")!;
    expect(ko.items.every((i) => i.titleEn === undefined && i.source.nameEn === undefined)).toBe(
      true,
    );
    expect(ko.items.map((i) => i.title)).toEqual(weekly.items.map((i) => i.title));
    const en = packWeekly(weekly, "en")!;
    expect(en.items.every((i) => i.title === "")).toBe(true);
    expect(en.items.map((i) => i.titleEn)).toEqual(weekly.items.map((i) => i.titleEn));
    expect(en.items.map((i) => i.source)).toEqual(weekly.items.map((i) => i.source));
    expect({ ...en, items: [] }).toEqual({ ...weekly, items: [] });
    expect(packWeekly(null, "ko")).toBeNull();
    expect(packWeekly(null, "en")).toBeNull();
  });
});

describe("홈 fallback(FeedFallback)", () => {
  it("기본 옵션 FeedView 와 같은 마크업", () => {
    const issueArticles = toListCards(issue());
    const props = {
      issueArticles,
      indexHead: [],
      indexTotal: 120,
      sources: [],
      tags: ["mcp"],
      editionInfo: { issueNo: 7, publishedAt: "2026-11-03T21:00:00.000Z" },
      initialDelayGap: 0,
      weekly,
      brief: [],
    };
    const { indexHead, indexTotal, ...feed } = props;
    expect(renderToString(<FeedFallback {...props} />)).toBe(
      renderToString(
        <FeedView {...feed} index={indexHead} indexTotal={indexTotal} options={{}} locale="ko" />,
      ),
    );
  });
});
