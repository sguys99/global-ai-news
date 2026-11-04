// @vitest-environment node
/**
 * configs/sources.json 자체 검증 — 손으로 고친 설정이 관리 화면 스키마(sourceSchema)를 통과하는지.
 * 스키마를 통과하지 못하는 항목은 관리 화면에서 저장할 때 400 이 나거나 필드가 지워진다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIGS_DIR } from "@/lib/paths";
import { sourceSchema } from "@/lib/sources";
import type { SourceConfig } from "@/lib/types";

const sources = JSON.parse(
  readFileSync(path.join(CONFIGS_DIR, "sources.json"), "utf-8"),
) as SourceConfig[];

describe("configs/sources.json", () => {
  it("모든 항목이 sourceSchema 를 통과하고, 검증 후에도 필드가 그대로다", () => {
    for (const s of sources) {
      const parsed = sourceSchema.safeParse(s);
      expect(parsed.success, `${s.id}: ${parsed.error?.issues[0]?.message}`).toBe(true);
      // 스키마에 없는 키는 zod 가 지운다 → 관리 화면 저장 시 사라질 필드가 없는지 확인
      expect(parsed.data).toEqual(s);
    }
  });

  it("id 가 중복되지 않는다", () => {
    const ids = sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("로보틱스 소스에 topic: physical 이 붙어 있다(Phase 3-5 선별 풀 할당 대상)", () => {
    const physical = sources.filter((s) => s.topic === "physical").map((s) => s.id);
    expect(physical).toEqual(
      expect.arrayContaining(["the_robot_report", "gnews_physical_ai", "irobotnews"]),
    );
  });

  it("한국 매체 4곳만 region: kr — geeknews 는 해외 글을 소개하는 커뮤니티라 두지 않는다(영어판 1-1)", () => {
    const kr = sources.filter((s) => s.region === "kr").map((s) => s.id);
    expect(kr.sort()).toEqual(["aitimes", "byline_network", "etnews_ai", "irobotnews"]);
  });

  it("이름에 한글이 있는 소스는 모두 영문 매체명(nameEn)이 있다", () => {
    const missing = sources.filter((s) => /[\uac00-\ud7a3]/.test(s.name) && !s.nameEn);
    expect(missing.map((s) => s.id)).toEqual([]);
  });
});

describe("sourceSchema — 영어판 소스 속성(region·nameEn)", () => {
  const base = { id: "aitimes", name: "AI타임스", kind: "rss", url: "https://a", enabled: 1 };
  const parse = (extra: Record<string, unknown>) => sourceSchema.safeParse({ ...base, ...extra });

  it("region 은 생략하거나 kr 만", () => {
    expect(parse({}).success).toBe(true);
    expect(parse({ region: "kr" }).data).toMatchObject({ region: "kr" });
    expect(parse({ region: "jp" }).success).toBe(false);
    expect(parse({ region: "" }).success).toBe(false);
  });

  it("nameEn 은 비지 않은 라틴 문자열 — 앞뒤 공백은 지운다", () => {
    expect(parse({ nameEn: "AI Times" }).data).toMatchObject({ nameEn: "AI Times" });
    expect(parse({ nameEn: "  Byline Network " }).data).toMatchObject({ nameEn: "Byline Network" });
    expect(parse({ nameEn: "GitHub (topic:ai-agents·mcp)" }).success).toBe(true);
    expect(parse({ nameEn: "Café IA" }).success).toBe(true);
    expect(parse({ nameEn: "" }).success).toBe(false);
    expect(parse({ nameEn: "   " }).success).toBe(false);
    expect(parse({ nameEn: "AI타임스" }).success).toBe(false);
    expect(parse({ nameEn: "電子新聞" }).success).toBe(false);
  });

  it("스키마가 두 필드를 선언해 저장 시 지워지지 않는다", () => {
    const parsed = parse({ region: "kr", nameEn: "AI Times" });
    expect(parsed.data).toEqual({ ...base, region: "kr", nameEn: "AI Times" });
  });
});
