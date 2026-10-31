// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assessSourceHealth, type HealthRunInput } from "@/lib/sourceHealth";
import { healthAnnotations, healthMarkdown, stripText } from "../../scripts/lib/healthReport";

const runs: HealthRunInput[] = [
  "techcrunch_ai: 20건(신규 9); industrial_ai: 실패 Status code 403; anthropic_news: 0건(신규 0)",
  "techcrunch_ai: 20건(신규 4); industrial_ai: 실패 Status code 403; anthropic_news: 0건(신규 0)",
  "techcrunch_ai: 20건(신규 7); industrial_ai: 실패 Status code 403; anthropic_news: 0건(신규 0); etnews_ai: 실패 fetch failed",
].map((notes, i) => ({ id: i + 1, startedAt: `2026-10-2${i + 7}T21:00:00.000Z`, notes }));

const sources = [
  { id: "techcrunch_ai", name: "TechCrunch AI", enabled: 1 },
  { id: "industrial_ai", name: "Industrial AI", enabled: 1 },
  { id: "anthropic_news", name: "Anthropic News", enabled: 1 },
  { id: "etnews_ai", name: "전자신문 AI", enabled: 1 },
  { id: "it_can_think", name: "It Can Think!", enabled: 0 },
];

describe("healthReport", () => {
  const report = assessSourceHealth(sources, runs);

  it("Markdown: 요약 줄·주의 이상 표·정상 접기", () => {
    const md = healthMarkdown(report);
    expect(md).toContain(
      "최근 3회(마지막 10.30 회차) · 활성 소스 4개 — 오류 1 · 경고 1 · 주의 1 · 정상 1 · 비활성 1개 제외",
    );
    expect(md).toContain(
      "| 오류 | Industrial AI `industrial_ai` | 3회 연속 수집 실패 | `✕✕✕` | 창 안에 없음 | Status code 403 |",
    );
    expect(md).toContain(
      "| 경고 | Anthropic News `anthropic_news` | 3회 연속 0건 — 피드가 빈 목록을 돌려준다 | `000` |",
    );
    expect(md).toContain("| 주의 | 전자신문 AI `etnews_ai` |");
    expect(md).toContain("<details><summary>정상 1개</summary>");
    expect(md).toContain("- TechCrunch `techcrunch_ai` `●●●`");
  });

  it("띠: 기록 없는 회차는 가운뎃점", () => {
    expect(stripText(["yield", null, "failed", "stale", "empty", "filtered"])).toBe("●·✕○0◇");
  });

  it("주석은 오류·경고만, 워크플로 명령 이스케이프", () => {
    const lines = healthAnnotations(report);
    expect(lines).toEqual([
      "::warning title=소스 헬스 오류::industrial_ai (Industrial AI): 3회 연속 수집 실패 — Status code 403",
      "::warning title=소스 헬스 경고::anthropic_news (Anthropic News): 3회 연속 0건 — 피드가 빈 목록을 돌려준다",
    ]);
    const odd = assessSourceHealth(
      [{ id: "x", name: "100% feed", enabled: 1 }],
      runs.map((r) => ({ ...r, notes: "x: 실패 bad\nline" })),
    );
    expect(healthAnnotations(odd)[0]).toContain("x (100%25 feed)");
    expect(healthAnnotations(odd)[0]).toContain("bad line"); // errorExcerpt 가 줄바꿈을 접는다
  });

  it("회차가 없으면 안내 한 줄", () => {
    expect(healthMarkdown(assessSourceHealth(sources, []))).toContain("수집 기록이 없습니다");
  });
});
