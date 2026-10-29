// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyKeywordFilter,
  keywordMatcher,
  loadKeywordFilters,
} from "../../scripts/lib/collect/keywordFilter";
import type { RawItem } from "@/lib/types";

const item = (title: string, contentRaw?: string): RawItem => ({
  sourceId: "github_trending",
  url: `https://github.com/${title}`,
  title,
  contentRaw,
  publishedAt: "2026-10-29T00:00:00.000Z",
});

describe("keywordMatcher — 키워드 문법", () => {
  it("단어 단위로 일치한다(대소문자 무시, -·_·/·. 는 경계)", () => {
    const m = keywordMatcher(["ai"]);
    expect(m("An AI agent")).toBe(true);
    expect(m("ai-design-skills")).toBe(true);
    expect(m("my_ai_tool")).toBe(true);
    expect(m("owner/ai")).toBe(true);
    expect(m("想到，开箱即用的 AI Agent")).toBe(true);
  });

  it("짧은 키워드가 다른 단어 속에서 오탐하지 않는다", () => {
    const m = keywordMatcher(["ai", "ml", "rag", "agi"]);
    for (const text of [
      "email client",
      "maintain your dotfiles",
      "Paint brush",
      "HTML to PDF",
      "YAML parser",
      "drag and drop",
      "storage engine",
      "magic link auth",
      "WhatsApp web API",
    ]) {
      expect(m(text), text).toBe(false);
    }
  });

  it("끝의 * 는 접두어 일치", () => {
    const m = keywordMatcher(["agent*"]);
    expect(m("agents")).toBe(true);
    expect(m("agentic workflows")).toBe(true);
    expect(m("useragent parser")).toBe(false); // 앞쪽 경계는 그대로
    expect(keywordMatcher(["agent"])("agents")).toBe(false); // * 없으면 정확히 그 단어만
  });

  it("공백은 공백·-·_ 와 일치한다", () => {
    const m = keywordMatcher(["machine learning"]);
    expect(m("Machine Learning for beginners")).toBe(true);
    expect(m("machine-learning")).toBe(true);
    expect(m("machine_learning")).toBe(true);
    expect(m("machinelearning")).toBe(false);
  });

  it("한중일 키워드는 부분 문자열로 일치한다", () => {
    const m = keywordMatcher(["大模型", "인공지능"]);
    expect(m("零基础入门大模型教程")).toBe(true);
    expect(m("인공지능 튜토리얼")).toBe(true);
    expect(m("网盘文件下载")).toBe(false);
  });

  it("정규식 특수문자는 글자 그대로 쓴다", () => {
    const m = keywordMatcher(["llama.cpp", "c++"]);
    expect(m("bindings for llama.cpp")).toBe(true);
    expect(m("llamaXcpp")).toBe(false);
    expect(m("modern c++ library")).toBe(true);
  });

  it("빈 목록은 모두 통과", () => {
    expect(keywordMatcher([])("anything")).toBe(true);
    expect(keywordMatcher(["", " "])("anything")).toBe(true);
  });
});

describe("applyKeywordFilter", () => {
  const filters = { ai: ["ai", "llm*", "agent*"] };

  it("제목·contentRaw(설명·토픽) 중 하나라도 일치하면 남기고 나머지는 버린다", () => {
    const { kept, dropped } = applyKeywordFilter(
      [
        item("elayadesign/ai-design-skills"), // 제목
        item("x/tutor", "Lifelong tutoring · topics: ai-agents, rag"), // 토픽
        item("hmjz100/LinkSwift", "网盘文件下载地址获取工具"),
        item("tulir/whatsmeow", "Go library for the WhatsApp web API"),
      ],
      "ai",
      filters,
    );
    expect(kept.map((i) => i.title)).toEqual(["elayadesign/ai-design-skills", "x/tutor"]);
    expect(dropped.map((i) => i.title)).toEqual(["hmjz100/LinkSwift", "tulir/whatsmeow"]);
  });

  it("없는 목록 이름이면 실패한다(필터가 조용히 꺼지지 않게)", () => {
    expect(() => applyKeywordFilter([item("a/b")], "nope", filters)).toThrow(
      '키워드 필터 "nope" 없음',
    );
  });
});

describe("configs/keyword-filters.json — ai 목록", () => {
  const ai = keywordMatcher(loadKeywordFilters().ai ?? []);

  it("_comment 같은 설명 키는 목록으로 읽지 않는다", () => {
    expect(Object.keys(loadKeywordFilters())).toEqual(["ai"]);
  });

  it("2026-10-29 실측 트렌딩의 AI 저장소를 통과시킨다", () => {
    for (const text of [
      "JetBrains/thinkrail\nVibe code with pi in a lightweight, real IDE",
      "obra/superpowers\nAn agentic skills framework & software development methodology",
      "p-e-w/heretic\nFully automatic censorship removal for language models",
      "baidu/Unlimited-OCR\nUnlimited OCR Works: Welcome the Era of One-shot Long-horizon Parsing.",
      "aa1143/NamiGPT\n零基础入门大模型（LLM）的基础教程",
      "ollama/ollama\nGet up and running with Kimi, GLM, MiniMax, DeepSeek, gpt-oss, Qwen",
      "gaoxiang12/ga-wm\nGeometry aware world model for VLA tasks",
    ]) {
      expect(ai(text), text).toBe(true);
    }
  });

  it("같은 날 트렌딩의 비 AI 저장소와 범용어는 버린다", () => {
    for (const text of [
      "hmjz100/LinkSwift\n一个基于 JavaScript 的网盘文件下载地址获取工具",
      "xiaolai/the-craft-of-selfteaching\nOne has no future if one couldn't teach themself.",
      "cloudflare/cloudflared\nCloudflare Tunnel client",
      "zed-industries/zed\nCode at the speed of thought – a high-performance, multiplayer code editor",
      "alchemy-run/alchemy\nInfrastructure as Effects · topics: cloud, effect, iac, typescript",
      "x/db\nDatabase cursor, data model and type inference for email · maintain · HTML",
    ]) {
      expect(ai(text), text).toBe(false);
    }
  });
});
