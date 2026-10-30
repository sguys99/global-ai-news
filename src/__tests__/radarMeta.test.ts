import { describe, expect, it } from "vitest";
import {
  compactCount,
  displayCount,
  formatParamCount,
  groupDigits,
  parseArxivId,
  parseGithubRepo,
  parseHfModelId,
  radarMeta,
  radarMetaBlock,
} from "@/lib/radarMeta";

const texts = (input: Parameters<typeof radarMeta>[0]) => radarMeta(input).map((m) => m.text);

describe("compactCount — 개수 축약(로케일 무관)", () => {
  it("1000 미만은 그대로", () => {
    expect(compactCount(0)).toBe("0");
    expect(compactCount(7)).toBe("7");
    expect(compactCount(999)).toBe("999");
  });

  it("k: 100 미만은 소수 1자리(.0 생략), 이상은 정수", () => {
    expect(compactCount(1000)).toBe("1k");
    expect(compactCount(1049)).toBe("1k");
    expect(compactCount(1050)).toBe("1.1k");
    expect(compactCount(1150)).toBe("1.2k"); // 부동소수 오차(1.15*10=11.4999…)로 내려가지 않는다
    expect(compactCount(1234)).toBe("1.2k");
    expect(compactCount(12_400)).toBe("12.4k");
    expect(compactCount(99_949)).toBe("99.9k");
    expect(compactCount(99_950)).toBe("100k");
    expect(compactCount(124_000)).toBe("124k");
  });

  it("반올림으로 1000 이 되면 다음 단위로 올린다", () => {
    expect(compactCount(999_499)).toBe("999k");
    expect(compactCount(999_500)).toBe("1M");
    expect(compactCount(1_234_567)).toBe("1.2M");
    expect(compactCount(12_400_000)).toBe("12.4M");
    expect(compactCount(2_500_000_000)).toBe("2.5B");
  });

  it("음수·NaN·소수는 안전하게 처리한다", () => {
    expect(compactCount(-5)).toBe("0");
    expect(compactCount(Number.NaN)).toBe("0");
    expect(compactCount(1234.9)).toBe("1.2k");
  });
});

describe("groupDigits", () => {
  it("천 단위 쉼표", () => {
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(999)).toBe("999");
    expect(groupDigits(1203)).toBe("1,203");
    expect(groupDigits(1_234_567)).toBe("1,234,567");
  });
});

describe("displayCount — 메타 줄 개수 표기(시안 결정 ⑨)", () => {
  it("1만 미만은 쉼표 정수, 이상은 축약", () => {
    expect(displayCount(0)).toBe("0");
    expect(displayCount(408)).toBe("408");
    expect(displayCount(7406)).toBe("7,406");
    expect(displayCount(9999)).toBe("9,999");
    expect(displayCount(10_000)).toBe("10k");
    expect(displayCount(16_598)).toBe("16.6k");
    expect(displayCount(1_204_311)).toBe("1.2M");
    expect(displayCount(-1)).toBe("0");
  });
});

describe("formatParamCount — 파라미터 수", () => {
  it("모델 카드 관례 표기", () => {
    expect(formatParamCount(8_030_261_248)).toBe("8B");
    expect(formatParamCount(70_000_000_000)).toBe("70B");
    expect(formatParamCount(70_553_706_496)).toBe("71B");
    expect(formatParamCount(1_543_714_304)).toBe("1.5B");
    expect(formatParamCount(350_000_000)).toBe("350M");
    expect(formatParamCount(1_000_000)).toBe("1M");
    expect(formatParamCount(1_200_000_000_000)).toBe("1.2T");
  });

  it("경계: 999.6M 은 1B 로 올리고, 1M 미만·없음은 undefined", () => {
    expect(formatParamCount(999_600_000)).toBe("1B");
    expect(formatParamCount(999_999)).toBeUndefined();
    expect(formatParamCount(0)).toBeUndefined();
    expect(formatParamCount(undefined)).toBeUndefined();
  });
});

describe("parseGithubRepo", () => {
  it("owner/repo 를 꺼낸다 — 끝 슬래시·.git·쿼리·해시·하위 경로 무시", () => {
    expect(parseGithubRepo("https://github.com/vllm-project/vllm")).toBe("vllm-project/vllm");
    expect(parseGithubRepo("https://github.com/vllm-project/vllm/")).toBe("vllm-project/vllm");
    expect(parseGithubRepo("https://github.com/vllm-project/vllm.git")).toBe("vllm-project/vllm");
    expect(parseGithubRepo("https://github.com/a/b?tab=readme-ov-file#install")).toBe("a/b");
    expect(parseGithubRepo("https://www.github.com/a/b/tree/main/docs")).toBe("a/b");
    expect(parseGithubRepo("http://GitHub.com/a/b")).toBe("a/b");
  });

  it("저장소가 아닌 URL 은 undefined", () => {
    expect(parseGithubRepo("https://github.com/vllm-project")).toBeUndefined();
    expect(parseGithubRepo("https://github.com/trending/python")).toBeUndefined();
    expect(parseGithubRepo("https://github.com/topics/llm")).toBeUndefined();
    expect(parseGithubRepo("https://gitlab.com/a/b")).toBeUndefined();
    expect(parseGithubRepo("not a url")).toBeUndefined();
  });
});

describe("parseHfModelId", () => {
  it("org/model 을 꺼낸다", () => {
    expect(parseHfModelId("https://huggingface.co/Qwen/Qwen3-8B")).toBe("Qwen/Qwen3-8B");
    expect(parseHfModelId("https://huggingface.co/Qwen/Qwen3-8B/tree/main?x=1")).toBe(
      "Qwen/Qwen3-8B",
    );
  });

  it("논문·데이터셋·스페이스·단일 세그먼트는 undefined", () => {
    expect(parseHfModelId("https://huggingface.co/papers/2610.30949")).toBeUndefined();
    expect(parseHfModelId("https://huggingface.co/datasets/a/b")).toBeUndefined();
    expect(parseHfModelId("https://huggingface.co/spaces/a/b")).toBeUndefined();
    expect(parseHfModelId("https://huggingface.co/Qwen")).toBeUndefined();
    expect(parseHfModelId("https://github.com/a/b")).toBeUndefined();
  });
});

describe("parseArxivId", () => {
  it("arXiv·HF Papers·Takara URL 에서 ID(버전 제외)를 꺼낸다", () => {
    expect(parseArxivId("https://arxiv.org/abs/2609.21967")).toBe("2609.21967");
    expect(parseArxivId("https://arxiv.org/abs/2609.21967v2")).toBe("2609.21967");
    expect(parseArxivId("https://arxiv.org/pdf/2609.21967v3.pdf")).toBe("2609.21967");
    expect(parseArxivId("http://export.arxiv.org/abs/2609.21967/")).toBe("2609.21967");
    expect(parseArxivId("https://arxiv.org/html/2609.2196v1")).toBe("2609.2196");
    expect(parseArxivId("https://huggingface.co/papers/2610.30949")).toBe("2610.30949");
    expect(parseArxivId("https://huggingface.co/papers/2610.30949?utm=x#abs")).toBe("2610.30949");
    expect(parseArxivId("https://tldr.takara.ai/p/2610.30841")).toBe("2610.30841");
  });

  it("ID 가 아니거나 모르는 URL 은 undefined", () => {
    expect(parseArxivId("https://arxiv.org/abs/cs/0101001")).toBeUndefined(); // 구형 ID 미지원
    expect(parseArxivId("https://arxiv.org/list/cs.CL/recent")).toBeUndefined();
    expect(parseArxivId("https://huggingface.co/Qwen/Qwen3-8B")).toBeUndefined();
    expect(parseArxivId("https://example.com/abs/2609.21967")).toBeUndefined();
    expect(parseArxivId("")).toBeUndefined();
  });
});

describe("radarMeta — 리포(oss)", () => {
  it("owner/repo · ★ 스타 · 오늘 +증가분 · 언어 순서", () => {
    const meta = radarMeta({
      format: "oss",
      url: "https://github.com/vllm-project/vllm",
      engagement: { stars: 48_836, stars_today: 1203, language: "Python" },
    });
    expect(meta).toEqual([
      {
        key: "repo",
        value: "vllm-project/vllm",
        text: "vllm-project/vllm",
        label: "저장소 vllm-project/vllm",
        numeric: false,
      },
      {
        key: "stars",
        icon: "★",
        value: "48.8k",
        text: "★ 48.8k",
        label: "스타 48,836개",
        numeric: true,
      },
      {
        key: "starsToday",
        prefix: "오늘",
        value: "+1,203",
        text: "오늘 +1,203",
        label: "오늘 스타 1,203개 증가",
        numeric: true,
      },
      { key: "language", value: "Python", text: "Python", label: "주 언어 Python", numeric: false },
    ]);
  });

  it("증가분이 1만 이상이면 축약한다", () => {
    expect(
      texts({ format: "oss", url: "https://github.com/a/b", engagement: { stars_today: 12_400 } }),
    ).toEqual(["a/b", "오늘 +12.4k"]);
  });

  it("없는 값·0(수집기의 '모름')은 빠진다", () => {
    expect(
      texts({
        format: "oss",
        url: "https://github.com/a/b",
        engagement: { stars: 0, language: "" },
      }),
    ).toEqual(["a/b"]);
    expect(texts({ format: "oss", url: "https://github.com/a/b" })).toEqual(["a/b"]);
    expect(
      texts({ format: "oss", url: "https://example.com/x", engagement: { stars: 20 } }),
    ).toEqual(["★ 20"]);
  });
});

describe("radarMeta — 모델(model)", () => {
  it("org/model · 파라미터 · 태스크 · ♥ likes · ↓ downloads 순서", () => {
    const meta = radarMeta({
      format: "model",
      url: "https://huggingface.co/Qwen/Qwen3-8B",
      engagement: {
        likes: 1234,
        downloads: 2_345_678,
        hf_trending: 99,
        pipeline_tag: "text-generation",
        params: 8_030_261_248,
      },
    });
    expect(meta.map((m) => m.text)).toEqual([
      "Qwen/Qwen3-8B",
      "8B",
      "text-generation",
      "♥ 1,234",
      "↓ 2.3M",
    ]);
    expect(meta.map((m) => m.label)).toEqual([
      "모델 Qwen/Qwen3-8B",
      "파라미터 약 80억 개",
      "태스크 text-generation",
      "좋아요 1,234개",
      "최근 30일 다운로드 2,345,678회",
    ]);
    expect(meta.map((m) => m.numeric)).toEqual([false, true, false, true, true]);
  });

  it("파라미터 한국어 읽기: 억·조·만", () => {
    const label = (params: number) =>
      radarMeta({ format: "model", url: "", engagement: { params } })[0]?.label;
    expect(label(350_000_000)).toBe("파라미터 약 3.5억 개");
    expect(label(70_000_000_000)).toBe("파라미터 약 700억 개");
    expect(label(1_500_000_000_000)).toBe("파라미터 약 1.5조 개");
    expect(label(50_000_000)).toBe("파라미터 약 5,000만 개");
  });

  it("없는 값은 빠진다 — 1M 미만 파라미터·빈 태스크·0 likes", () => {
    expect(
      texts({
        format: "model",
        url: "https://huggingface.co/a/b",
        engagement: { params: 500_000, pipeline_tag: " ", likes: 0, downloads: 15 },
      }),
    ).toEqual(["a/b", "↓ 15"]);
  });
});

describe("radarMeta — 논문(paper)", () => {
  it("HF Daily Papers: arXiv ID · ▲ upvotes", () => {
    const meta = radarMeta({
      format: "paper",
      url: "https://huggingface.co/papers/2610.30949",
      engagement: { ups: 53 },
    });
    expect(meta).toEqual([
      {
        key: "arxiv",
        value: "arXiv 2610.30949",
        text: "arXiv 2610.30949",
        label: "arXiv 2610.30949",
        numeric: false,
      },
      { key: "upvotes", icon: "▲", value: "53", text: "▲ 53", label: "추천 53개", numeric: true },
    ]);
  });

  it("arXiv 소스: 인용 수(영향력 인용은 표시하지 않는다)", () => {
    expect(
      texts({
        format: "paper",
        url: "https://arxiv.org/abs/2609.21967v2",
        engagement: { citations: 4, influential: 1 },
      }),
    ).toEqual(["arXiv 2609.21967", "인용 4"]);
    expect(
      radarMeta({
        format: "paper",
        url: "https://arxiv.org/abs/2609.21967",
        engagement: { citations: 1500 },
      })[1],
    ).toMatchObject({ prefix: "인용", value: "1,500", text: "인용 1,500", label: "인용 1,500회" });
  });

  it("메트릭이 없는 Takara 논문은 ID 만, ID 도 없으면 []", () => {
    expect(texts({ format: "paper", url: "https://tldr.takara.ai/p/2610.30841" })).toEqual([
      "arXiv 2610.30841",
    ]);
    expect(texts({ format: "paper", url: "https://example.com/paper", engagement: {} })).toEqual(
      [],
    );
  });
});

describe("radarMeta — 뉴스", () => {
  it("뉴스는 메트릭이 있어도 []", () => {
    expect(
      radarMeta({
        format: "news",
        url: "https://news.ycombinator.com/item?id=1",
        engagement: { points: 300, num_comments: 120 },
      }),
    ).toEqual([]);
  });
});

describe("radarMeta — 손상된 값", () => {
  it("문자열·NaN·음수 수치는 빠진다(engagement_json 은 형 검증 없이 파싱된다)", () => {
    const engagement = {
      stars: "12" as unknown as number,
      stars_today: -3,
      language: 42 as unknown as string,
    };
    expect(texts({ format: "oss", url: "https://github.com/a/b", engagement })).toEqual(["a/b"]);
    expect(
      texts({ format: "model", url: "", engagement: { likes: Number.NaN, params: Infinity } }),
    ).toEqual([]);
  });
});

describe("radarMetaBlock — 카드 메타 블록(시안 결정 ⑧·⑩)", () => {
  const source = { id: "gh", name: "GitHub" };

  it("식별자는 따로, 나머지는 수치 줄로 나눈다", () => {
    const block = radarMetaBlock({
      format: "oss",
      url: "https://github.com/milind-soni/OpenMausBot",
      engagement: { stars: 7406, stars_today: 1190, language: "TypeScript" },
      source,
    });
    expect(block.id?.text).toBe("milind-soni/OpenMausBot");
    expect(block.stats.map((m) => m.text)).toEqual(["★ 7,406", "오늘 +1,190", "TypeScript"]);
  });

  it("수치가 없으면 식별자 한 줄만", () => {
    const block = radarMetaBlock({
      format: "paper",
      url: "https://arxiv.org/abs/2609.36870",
      engagement: {},
      source,
    });
    expect(block).toEqual({ id: expect.objectContaining({ text: "arXiv 2609.36870" }), stats: [] });
  });

  it("식별자가 없으면 수치 줄만(매체명으로 채우지 않는다)", () => {
    const block = radarMetaBlock({
      format: "oss",
      url: "https://example.com/x",
      engagement: { stars: 20 },
      source,
    });
    expect(block.id).toBeUndefined();
    expect(block.stats.map((m) => m.text)).toEqual(["★ 20"]);
  });

  it("식별자도 수치도 없으면 매체명(축약명을 넘길 수 있다)", () => {
    const article = {
      format: "paper" as const,
      url: "https://example.com/p",
      source: { id: "tk", name: "Takara TLDR" },
    };
    expect(radarMetaBlock(article)).toEqual({
      id: expect.objectContaining({ key: "source", text: "Takara TLDR", numeric: false }),
      stats: [],
    });
    expect(radarMetaBlock(article, "Takara").id?.text).toBe("Takara");
  });
});
