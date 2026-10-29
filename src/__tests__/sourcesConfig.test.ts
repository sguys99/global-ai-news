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
});
