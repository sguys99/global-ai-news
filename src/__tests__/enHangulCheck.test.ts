// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildHangulReport,
  groupViolations,
  hangulAnnotations,
  hangulConsole,
  hangulExitCode,
  isKoLang,
  isScanTarget,
  parseRscRows,
  scanFile,
  scanHtml,
  scanJson,
  scanRsc,
  snippetAround,
} from "../../scripts/lib/enHangulCheck";

/** 인라인 RSC 조각 한 개(Next 가 HTML 에 넣는 모양). */
const push = (chunk: string) =>
  `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`;

const SWITCH =
  '<a class="sh-lsw" href="/global-ai-news/article/1/" lang="ko" hreflang="ko" aria-label="한국어로 읽기" title="한국어로 읽기">한국어</a>';
const ORIGINAL =
  '<p class="ar-orig"><span class="ar-orig-l">Original article in Korean</span><span class="ar-orig-t" lang="ko">한국어 원제</span></p>';

describe("scanHtml — lang=ko 요소 안만 허용", () => {
  it("전환 링크(속성·글자)와 원제 줄은 통과, 허용 요소 모양을 센다", () => {
    const r = scanHtml(
      `<!doctype html><html lang="en"><body>${SWITCH}<main>${ORIGINAL}</main></body></html>`,
    );
    expect(r.violations).toEqual([]);
    expect(r.allowed.map((a) => a.element).sort()).toEqual([
      "a.sh-lsw",
      "a.sh-lsw",
      "a.sh-lsw",
      "span.ar-orig-t",
    ]);
  });

  it("같은 글자가 lang=ko 밖이면 위반(텍스트·속성·head)", () => {
    const r = scanHtml(
      '<html lang="en"><head><title>한국어 원제</title><meta name="description" content="한국어 설명"></head>' +
        '<body><p class="ar-ot">한국어 원제</p><a href="/" title="한국어로 읽기">x</a></body></html>',
    );
    expect(r.violations.map((v) => v.where)).toEqual([
      "text",
      "attr:content",
      "text",
      "attr:title",
    ]);
    expect(r.violations[2].context).toContain("p.ar-ot");
  });

  it("lang 은 가장 가까운 조상을 따른다 — ko 안의 en 은 다시 위반, 형제·닫힌 뒤는 원래 언어", () => {
    const r = scanHtml(
      '<html lang="en"><div lang="ko">가<span lang="en">나</span>다<br>라</div>마<img alt="바"></html>',
    );
    expect(r.violations.map((v) => v.snippet)).toEqual(["나", "마", "바"]);
    expect(r.allowed.map((a) => a.snippet)).toEqual(["가", "다", "라"]);
  });

  it("lang 값 ko-KR 도 한국어, 숫자 문자 참조로 숨긴 한글도 잡는다", () => {
    expect(isKoLang("ko-KR")).toBe(true);
    expect(isKoLang("kok")).toBe(false);
    expect(isKoLang(undefined)).toBe(false);
    expect(scanHtml('<p lang="en">&#xD55C;&#44544;</p>').violations).toHaveLength(1);
  });

  it("주석·style·일반 스크립트·JSON-LD 의 한글은 늘 위반(lang=ko 안이어도)", () => {
    const r = scanHtml(
      '<div lang="ko"><!-- 주석 --><style>.a::after{content:"가"}</style>' +
        '<script>var t="한글"</script><script type="application/ld+json">{"alternateName":"AI 데이북"}</script></div>',
    );
    expect(r.violations.map((v) => v.where)).toEqual(["comment", "style", "script", "json-ld"]);
  });

  it("따옴표 안의 > 와 자기 닫힘 태그(svg)를 견딘다", () => {
    const r = scanHtml(
      '<div lang="ko"><a title="a > b">가</a><svg><path d="M0 0"/></svg>나</div><p>ok</p>',
    );
    expect(r.violations).toEqual([]);
    expect(r.allowed).toHaveLength(2);
  });

  it("인라인 RSC 는 이어 붙여 RSC 규칙으로 본다(조각 경계가 문자열 중간이어도)", () => {
    const rsc =
      '0:["$","p",null,{"children":[["$","span",null,{"className":"ar-orig-t","lang":"ko","children":"한국어 원제"}],"AI타임스"]}]\n';
    const cut = rsc.indexOf("타임");
    const r = scanHtml(`<html lang="en">${push(rsc.slice(0, cut))}${push(rsc.slice(cut))}</html>`);
    expect(r.violations).toEqual([
      expect.objectContaining({ where: "inline-rsc", snippet: "AI타임스" }),
    ]);
    expect(r.allowed).toEqual([{ element: "rsc span.ar-orig-t", snippet: "한국어 원제" }]);
  });
});

describe("scanRsc — Flight 트리의 호스트 요소 lang", () => {
  it("lang=ko 호스트 요소 props 안만 허용, 클라이언트 컴포넌트 props·일반 값은 위반", () => {
    const payload = [
      '1:I[9,["c.js"],"FeedClient"]',
      '0:["$","main",null,{"children":[["$","span",null,{"lang":"ko","className":"ar-orig-t","children":"원제"}],' +
        '["$","$L1",null,{"sources":[{"id":"aitimes","name":"AI타임스"}],"lang":"ko"}]]}]',
      "",
    ].join("\n");
    const r = scanRsc(payload);
    // 클라이언트 컴포넌트($L1)에 lang 을 넘겨도 허용되지 않는다 — 호스트 요소만 HTML 의 lang 이 된다.
    expect(r.violations.map((v) => v.snippet)).toEqual(["AI타임스"]);
    expect(r.violations[0].context).toContain("<$L1>.sources[0].name");
    expect(r.allowed.map((a) => a.snippet)).toEqual(["원제"]);
  });

  it("참조 행(긴 문자열 T 행·$L 행)은 참조한 자리의 언어를 물려받는다", () => {
    const text = "한국어 원제";
    const bytes = Buffer.byteLength(text).toString(16);
    const payload =
      `2:T${bytes},${text}` +
      `3:T${bytes},${text}` +
      '0:["$","div",null,{"children":[["$","span",null,{"lang":"ko","children":"$2"}],["$","p",null,{"children":"$3"}]]}]\n';
    const rows = parseRscRows(payload);
    expect(rows.map((r) => [r.id, r.tag])).toEqual([
      ["2", "T"],
      ["3", "T"],
      ["0", ""],
    ]);
    const r = scanRsc(payload);
    expect(r.allowed).toHaveLength(1);
    expect(r.violations).toEqual([expect.objectContaining({ context: "row 3 T" })]);
  });

  it("JSON 으로 못 읽는 행은 평문으로 보고, 객체 키의 한글도 잡는다", () => {
    expect(scanRsc("0:{not json 한글}\n").violations[0].context).toContain("unparsed");
    expect(scanRsc('0:{"한글키":1}\n').violations).toHaveLength(1);
    expect(scanRsc(':HL["/a.css","style"]\n0:"ok"\n').violations).toEqual([]);
  });
});

describe("scanJson·파일 고르기·보고서", () => {
  it("색인 JSON 은 허용 없음 — 경로를 적는다", () => {
    const r = scanJson('{"sources":{"aitimes":{"name":"AI타임스"}},"rows":[[1,"ok"]]}');
    expect(r.violations).toEqual([
      { where: "json", context: "$.sources.aitimes.name", snippet: "AI타임스" },
    ]);
  });

  it("검사 대상: out/en 의 html·txt·json·xml 과 영어 색인 조각만", () => {
    expect(isScanTarget("en/index.html")).toBe(true);
    expect(isScanTarget("en/edition/2026-11-03/index.txt")).toBe(true);
    expect(isScanTarget("search-index/en/2026-11.json")).toBe(true);
    expect(isScanTarget("feed-index/en/manifest.json")).toBe(true);
    expect(isScanTarget("feed-index/ko/manifest.json")).toBe(false);
    expect(isScanTarget("index.html")).toBe(false);
    expect(isScanTarget("en/og.png")).toBe(false);
    expect(isScanTarget("latest.json")).toBe(false);
    expect(scanFile("en/index.txt", '0:"한"\n').violations[0].where).toBe("rsc");
    expect(scanFile("feed-index/en/a.json", '["한"]').violations[0].where).toBe("json");
  });

  it("보고서: 파일·위반 수, 같은 조각 묶음, 콘솔·CI 주석·종료 코드", () => {
    const report = buildHangulReport([
      { path: "en/index.html", content: `<html lang="en">${SWITCH}<p>AI타임스</p></html>` },
      { path: "en/search/index.html", content: '<html lang="en"><p>AI타임스</p></html>' },
      { path: "feed-index/en/manifest.json", content: '{"a":"ok"}' },
    ]);
    expect(report).toMatchObject({ filesScanned: 3, filesWithViolations: 2 });
    expect(report.allowedByElement).toEqual({ "a.sh-lsw": 3 });
    expect(groupViolations(report.violations)).toEqual([
      {
        snippet: "AI타임스",
        where: "text",
        count: 2,
        files: ["en/index.html", "en/search/index.html"],
      },
    ]);
    const text = hangulConsole(report, "out");
    expect(text).toContain("검사 파일 3개 · 위반 파일 2개 · 위반 2건");
    expect(text).toContain("a.sh-lsw ×3");
    expect(hangulAnnotations(report)[0]).toMatch(
      /^::error file=out\/en\/index\.html,title=.*×2 \(2개 파일\)/,
    );
    expect(hangulExitCode(report)).toBe(1);

    const clean = buildHangulReport([{ path: "en/index.html", content: SWITCH }]);
    expect(hangulExitCode(clean)).toBe(0);
    expect(hangulAnnotations(clean)).toEqual([]);
    // 검사할 파일이 하나도 없으면(빌드가 영어 페이지를 못 냈으면) 실패
    const empty = buildHangulReport([]);
    expect(hangulExitCode(empty)).toBe(1);
    expect(hangulAnnotations(empty)[0]).toContain("::error");
  });

  it("snippetAround: 첫 한글 둘레만, 줄바꿈은 공백", () => {
    expect(snippetAround(`${"a".repeat(100)}\n한글${"b".repeat(100)}`)).toBe(
      `…${"a".repeat(39)} 한글${"b".repeat(38)}…`,
    );
  });
});
