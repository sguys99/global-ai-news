// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  comparePage,
  diffLines,
  isAllowed,
  normalizeHtml,
  normalizeXml,
  parseAllowList,
  parseManifest,
  pickArticles,
  unifiedDiff,
  weekdayOf,
  type ArticleRow,
  type DiffOp,
} from "../../scripts/lib/htmlRegress";

const page = (head: string, body: string, htmlAttrs = 'lang="ko"') =>
  `<!DOCTYPE html><html ${htmlAttrs}><head>${head}</head><body>${body}</body></html>`;

/** 편집 스크립트를 a 에 적용해 b 를 되살린다. */
const applyOps = (ops: DiffOp[]) => ops.filter((o) => o.op !== "-").map((o) => o.line);
const fromOps = (ops: DiffOp[]) => ops.filter((o) => o.op !== "+").map((o) => o.line);

describe("normalizeHtml — 빼는 것", () => {
  it("RSC·청크 스크립트는 빼고 JSON-LD 는 펼쳐 남긴다", () => {
    const html = page(
      `<script src="/global-ai-news/_next/static/chunks/main-abc123.js" async></script>
       <script type="application/ld+json">{"@type":"WebSite","name":"AI 데이북"}</script>`,
      `<p>본문</p><script>self.__next_f.push([1,"abc"])</script>`,
    );
    const out = normalizeHtml(html);
    expect(out).not.toContain("__next_f");
    expect(out).not.toContain("main-abc123");
    expect(out).toContain('<script type="application/ld+json">');
    expect(out).toContain('"@type": "WebSite"');
    expect(out).toContain('"name": "AI 데이북"');
  });

  it("빌드 해시 link(preload·modulepreload·stylesheet)는 빼고 canonical·alternate·아이콘은 해시만 지운다", () => {
    const a = normalizeHtml(
      page(
        `<link rel="stylesheet" href="/global-ai-news/_next/static/css/aaa.css" data-precedence="next">
         <link rel="preload" as="font" href="/global-ai-news/_next/static/media/x-s.p.woff2" crossorigin="">
         <link rel="modulepreload" href="/x.js">
         <link rel="canonical" href="https://sguys99.github.io/global-ai-news/">
         <link rel="alternate" hreflang="en" href="https://sguys99.github.io/global-ai-news/en/">
         <link rel="icon" href="/global-ai-news/icon.svg?f6a2b3c4d5e6f708" type="image/svg+xml">`,
        "",
      ),
    );
    const b = normalizeHtml(
      page(
        `<link rel="stylesheet" href="/global-ai-news/_next/static/css/bbb.css" data-precedence="next">
         <link rel="canonical" href="https://sguys99.github.io/global-ai-news/">
         <link rel="alternate" hreflang="en" href="https://sguys99.github.io/global-ai-news/en/">
         <link rel="icon" href="/global-ai-news/icon.svg?0123456789abcdef" type="image/svg+xml">`,
        "",
      ),
    );
    expect(a).toBe(b);
    expect(a).toContain('rel="canonical"');
    expect(a).toContain('hreflang="en"');
    expect(a).toContain('href="/global-ai-news/icon.svg?#"');
    expect(a).not.toContain("stylesheet");
  });

  it("속성값 안의 _next/static 경로를 해시와 무관하게 맞춘다", () => {
    const a = normalizeHtml(
      page("", '<img src="/global-ai-news/_next/static/media/logo.1a2b.png" alt="">'),
    );
    const b = normalizeHtml(
      page("", '<img src="/global-ai-news/_next/static/media/logo.9f8e.png" alt="">'),
    );
    expect(a).toBe(b);
  });

  it("주석(React 텍스트 경계·Suspense 표지)을 지우고 이어진 텍스트를 합친다", () => {
    const a = normalizeHtml(
      page("", "<p>이번 호 <!-- -->31<!-- -->건</p><!--$--><div>x</div><!--/$-->"),
    );
    const b = normalizeHtml(page("", "<p>이번 호 31건</p><div>x</div>"));
    expect(a).toBe(b);
    expect(a).toContain('<p>"이번 호 31건"</p>');
  });

  it("빈 hidden div(메타데이터 경계)는 빼고 내용이 있는 hidden 요소는 남긴다", () => {
    const out = normalizeHtml(
      page("", '<div hidden=""><!--$--><!--/$--></div><div hidden>숨김 글</div><p>a</p>'),
    );
    expect(out.match(/<div hidden>/g)).toHaveLength(1);
    expect(out).toContain("숨김 글");
  });
});

describe("normalizeHtml — 남기는 것", () => {
  it("html lang 이 다르면 차이로 남는다", () => {
    expect(normalizeHtml(page("", "<p>a</p>"))).not.toBe(
      normalizeHtml(page("", "<p>a</p>", 'lang="en"')),
    );
  });

  it("title·meta 내용 변화는 차이로 남는다", () => {
    const a = normalizeHtml(
      page('<title>AI 데이북</title><meta name="description" content="가">', ""),
    );
    const b = normalizeHtml(
      page('<title>AI 데이북</title><meta name="description" content="나">', ""),
    );
    expect(a).not.toBe(b);
    expect(a).toContain('<title>"AI 데이북"</title>');
  });

  it("텍스트 한 글자 변화도 차이로 남는다", () => {
    expect(normalizeHtml(page("", "<h1>오늘의 브리핑</h1>"))).not.toBe(
      normalizeHtml(page("", "<h1>오늘의 브리핑.</h1>")),
    );
  });

  it("공백은 접되 인라인 요소 사이 띄어쓰기는 남긴다", () => {
    const a = normalizeHtml(page("", "<p><b>가</b>   \n  <i>나</i></p>"));
    const b = normalizeHtml(page("", "<p><b>가</b> <i>나</i></p>"));
    const c = normalizeHtml(page("", "<p><b>가</b><i>나</i></p>"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("pre 안의 공백은 그대로 둔다", () => {
    expect(normalizeHtml(page("", "<pre>a  b</pre>"))).not.toBe(
      normalizeHtml(page("", "<pre>a b</pre>")),
    );
  });

  it("클래스 토큰·속성 순서는 무시하고 클래스 값 변화는 잡는다", () => {
    const a = normalizeHtml(page("", '<a href="/x" class="text-brand font-bold">x</a>'));
    const b = normalizeHtml(page("", '<a class="font-bold  text-brand" href="/x">x</a>'));
    const c = normalizeHtml(page("", '<a class="font-bold text-ink" href="/x">x</a>'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("next/font 해시 클래스는 해시만 지운다", () => {
    const a = normalizeHtml(
      page("", "", 'lang="ko" class="__variable_1a2b3c __className_aaa111 antialiased"'),
    );
    const b = normalizeHtml(
      page("", "", 'lang="ko" class="__variable_9f9f9f __className_bbb222 antialiased"'),
    );
    expect(a).toBe(b);
    expect(a).toContain("__variable_#");
  });

  it("useId 값은 등장 순서 번호로 바꾸되 연결 관계는 유지한다", () => {
    const a = normalizeHtml(
      page("", '<label for="«R1a»">x</label><input id="«R1a»"><div aria-labelledby="«R2b»"></div>'),
    );
    const b = normalizeHtml(
      page("", '<label for="_R_9_">x</label><input id="_R_9_"><div aria-labelledby="_R_k_"></div>'),
    );
    expect(a).toBe(b);
    expect(a).toContain('for="«#id1»"');
    expect(a).toContain('aria-labelledby="«#id2»"');
  });

  it("--text 모드는 class·style 만 빼고 나머지 속성·구조는 비교한다", () => {
    const a = normalizeHtml(page("", '<a class="x" style="color:red" href="/a">가</a>'), {
      text: true,
    });
    const b = normalizeHtml(page("", '<a class="y" href="/a">가</a>'), { text: true });
    const c = normalizeHtml(page("", '<a class="y" href="/b">가</a>'), { text: true });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("class");
  });
});

describe("normalizeHtml — 시각 의존", () => {
  const notice = (label: string) =>
    `<p role="status" class="text-caption"><span class="text-brand">${label}</span><span>제140호가 아직 나오지 않았습니다</span></p>`;

  it("발행 지연 안내 줄(빌드 시각 의존)은 있든 없든 같게 본다", () => {
    const none = normalizeHtml(page("", "<header>제호</header><main>a</main>"));
    expect(normalizeHtml(page("", `<header>제호</header>${notice("발행 전")}<main>a</main>`))).toBe(
      none,
    );
    expect(
      normalizeHtml(page("", `<header>제호</header>${notice("발행 지연")}<main>a</main>`)),
    ).toBe(none);
    // 영어판 라벨(issueDelayCopy en)도 같은 처리.
    for (const label of ["Not out yet", "Delayed"]) {
      expect(normalizeHtml(page("", `<header>제호</header>${notice(label)}<main>a</main>`))).toBe(
        none,
      );
    }
  });

  it("다른 role=status 문구(검색 결과 수 등)는 남긴다", () => {
    expect(normalizeHtml(page("", '<p role="status">검색 결과 3건</p>'))).toContain(
      "검색 결과 3건",
    );
  });

  it("푸터 연도는 YYYY 로 맞춘다", () => {
    const a = normalizeHtml(page("", "<footer>© 2026 Nasica Inc.</footer>"));
    const b = normalizeHtml(page("", "<footer>© 2027 Nasica Inc.</footer>"));
    expect(a).toBe(b);
    expect(a).toContain("© YYYY");
  });
});

describe("normalizeXml", () => {
  it("태그마다 한 줄로 펴고 공백 차이는 무시한다", () => {
    const a = normalizeXml('<?xml version="1.0"?><urlset><url><loc>a</loc></url></urlset>');
    const b = normalizeXml(
      '<?xml version="1.0"?>\n<urlset>\n  <url>\n    <loc>a</loc>\n  </url>\n</urlset>\n',
    );
    expect(a).toBe(b);
    expect(a.split("\n")).toContain("<loc>a</loc>");
  });
});

describe("diffLines·unifiedDiff", () => {
  it("편집 스크립트가 양쪽을 정확히 되살린다", () => {
    const a = ["a", "b", "c", "d", "e", "f"];
    const b = ["a", "x", "c", "d", "f", "g"];
    const ops = diffLines(a, b)!;
    expect(fromOps(ops)).toEqual(a);
    expect(applyOps(ops)).toEqual(b);
    expect(ops.filter((o) => o.op !== "=")).toEqual([
      { op: "-", line: "b" },
      { op: "+", line: "x" },
      { op: "-", line: "e" },
      { op: "+", line: "g" },
    ]);
  });

  it("빈 쪽·같은 쪽을 다룬다", () => {
    expect(applyOps(diffLines([], ["a"])!)).toEqual(["a"]);
    expect(fromOps(diffLines(["a"], [])!)).toEqual(["a"]);
    expect(diffLines(["a", "b"], ["a", "b"])!.every((o) => o.op === "=")).toBe(true);
    expect(unifiedDiff(diffLines(["a"], ["a"])!)).toBe("");
  });

  it("편집 거리 상한을 넘으면 null", () => {
    expect(diffLines(["a", "b", "c"], ["x", "y", "z"], 2)).toBeNull();
  });

  it("unified hunk 머리·문맥 줄", () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
    const b = [...a];
    b[9] = "changed";
    const out = unifiedDiff(diffLines(a, b)!, { context: 2, labelA: "base/x", labelB: "cand/x" });
    expect(out).toBe(
      [
        "--- base/x",
        "+++ cand/x",
        "@@ -8,5 +8,5 @@",
        " l8",
        " l9",
        "-l10",
        "+changed",
        " l11",
        " l12",
        "",
      ].join("\n"),
    );
  });

  it("가까운 변경은 한 hunk, 먼 변경은 따로", () => {
    const a = Array.from({ length: 40 }, (_, i) => `l${i}`);
    const near = [...a];
    near[5] = "x";
    near[9] = "y";
    expect(unifiedDiff(diffLines(a, near)!).match(/^@@/gm)).toHaveLength(1);
    const far = [...a];
    far[5] = "x";
    far[30] = "y";
    expect(unifiedDiff(diffLines(a, far)!).match(/^@@/gm)).toHaveLength(2);
  });
});

describe("comparePage·허용 목록", () => {
  it("같음·차이·허용·누락", () => {
    expect(comparePage("a.html", "x\n", "x\n").status).toBe("same");
    const d = comparePage("a.html", "x\ny\n", "x\nz\n");
    expect(d.status).toBe("diff");
    expect(d.stats).toEqual({ added: 1, removed: 1 });
    expect(d.diff).toContain("-y");
    expect(d.diff).toContain("+z");
    expect(comparePage("404.html", "x\n", "y\n", { allowed: true }).status).toBe("allowed");
    const m = comparePage("a.html", "x\n", null);
    expect(m.status).toBe("missing");
    expect(m.missing).toEqual(["cand"]);
    expect(comparePage("a.html", null, "x", { allowed: true }).status).toBe("allowed");
  });

  it("허용 패턴: 정확한 경로·접두어*", () => {
    expect(isAllowed("404.html", ["404.html"])).toBe(true);
    expect(isAllowed("article/12/index.html", ["article/*"])).toBe(true);
    expect(isAllowed("index.html", ["404.html", "article/*"])).toBe(false);
  });

  it("허용 목록 파일은 주석·빈 줄을 건너뛴다", () => {
    expect(parseAllowList("# Phase 3\n404.html  # global-not-found\n\narticle/*\n")).toEqual([
      "404.html",
      "article/*",
    ]);
  });
});

describe("parseManifest", () => {
  it("형식을 확인한다", () => {
    const ok = {
      version: 1,
      selectedFrom: {},
      pages: [{ path: "index.html", kind: "html", why: "" }],
    };
    expect(parseManifest(JSON.stringify(ok)).pages).toHaveLength(1);
    expect(() => parseManifest(JSON.stringify({ ...ok, version: 2 }))).toThrow();
    expect(() =>
      parseManifest(JSON.stringify({ ...ok, pages: [{ path: "x", kind: "pdf" }] })),
    ).toThrow();
  });
});

describe("pickArticles", () => {
  const row = (id: number, over: Partial<ArticleRow> = {}): ArticleRow => ({
    id,
    date: "2026-11-04",
    format: "news",
    region: null,
    hasRelated: false,
    inThread: false,
    hasOgImage: true,
    ...over,
  });
  const rows: ArticleRow[] = [
    row(1, { region: "kr", hasOgImage: false, date: "2026-10-20" }),
    row(2, { region: "kr" }),
    row(3, { hasRelated: true }),
    row(4, { hasRelated: true, inThread: true }),
    row(5, { hasRelated: true }),
    row(6, { format: "oss" }),
    row(7, { format: "oss" }),
    row(8, { format: "paper" }),
  ];

  it("조건마다 id 가 가장 큰 기사, 같은 기사를 두 번 고르지 않는다", () => {
    expect(pickArticles(rows).map((p) => p.id)).toEqual([4, 5, 1, 7, 8]);
  });

  it("입력 순서와 무관하게 같은 결과", () => {
    expect(pickArticles([...rows].reverse())).toEqual(pickArticles(rows));
  });

  it("한국 기사는 썸네일 창 밖을 먼저, 없으면 아무 한국 기사", () => {
    const krRecentOnly = rows.filter((r) => r.id !== 1);
    expect(pickArticles(krRecentOnly).map((p) => p.id)).toContain(2);
  });

  it("타임라인+묶음이 없으면 타임라인만, 모델이 있으면 6번째로", () => {
    const r = [
      row(10, { inThread: true }),
      row(11, { hasRelated: true }),
      row(12, { format: "model" }),
    ];
    const picks = pickArticles(r);
    expect(picks.map((p) => p.id)).toEqual([10, 11, 12]);
    expect(picks[2].why).toContain("MODEL");
  });
});

describe("weekdayOf", () => {
  it("KST 날짜 문자열의 요일", () => {
    expect(weekdayOf("2026-11-01")).toBe(0); // 일요일
    expect(weekdayOf("2026-11-04")).toBe(3);
  });
});
