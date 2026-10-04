/* 시안 공용 헬퍼: 날짜·카테고리 표기·테마 토글·시안 전환 바. (프로토타입 전용 — 제품 코드 아님) */
(function () {
  const CAT = {
    "Language Models": { ko: "언어 모델", code: "LLM", key: "llm" },
    Agents: { ko: "에이전트", code: "AGT", key: "agt" },
    "Dev Tools": { ko: "개발 도구", code: "DEV", key: "dev" },
    MLOps: { ko: "MLOps", code: "OPS", key: "ops" },
    "연구·논문": { ko: "연구·논문", code: "RES", key: "res" },
    "산업·정책": { ko: "산업·정책", code: "BIZ", key: "biz" },
  };
  const SHORT = {
    "TechCrunch AI": "TechCrunch",
    "GitHub (topic:llm)": "GitHub",
    "HuggingFace Daily Papers": "HuggingFace",
    "MIT Technology Review": "MIT Tech Review",
  };
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const pad = (n) => String(n).padStart(2, "0");

  window.KIT = {
    CAT,
    cat: (c) => CAT[c] || { ko: c || "미분류", code: "—", key: "none" },
    src: (s) => SHORT[s] || s,
    md: (iso) => {
      const d = new Date(iso);
      return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    },
    ymd: (iso) => {
      const d = new Date(iso);
      return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    },
    longDate: (iso) => {
      const d = new Date(iso);
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
    },
    esc: (s) =>
      String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]),
    meter: (imp, cls = "meter") =>
      imp > 0
        ? `<span class="${cls}" role="img" aria-label="중요도 ${imp}/5">${[1, 2, 3, 4, 5]
            .map((i) => `<i class="${i <= imp ? "on" : ""}"></i>`)
            .join("")}</span>`
        : "",
  };

  // 테마: data-theme 를 루트에 기록 (미지정 = 시스템 설정 추종)
  function currentTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  window.KIT.toggleTheme = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("dab-mock-theme", next);
    } catch (e) {}
  };
  try {
    const forced = new URLSearchParams(location.search).get("theme");
    const saved = forced || localStorage.getItem("dab-mock-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  } catch (e) {}

  // 시안 전환 바 (디자인 외부 요소)
  window.KIT.switcher = (active) => {
    const items = [
      ["a-signal.html", "A", "Signal"],
      ["b-edition.html", "B", "Edition"],
      ["c-spectrum.html", "C", "Spectrum"],
    ];
    const bar = document.createElement("div");
    bar.className = "proto-bar";
    bar.innerHTML = `<span class="proto-label">시안 비교</span>${items
      .map(
        ([href, k, n]) =>
          `<a href="${href}" class="${k === active ? "is-on" : ""}"><b>${k}</b> ${n}</a>`,
      )
      .join("")}<a href="index.html" class="proto-home">목록</a>`;
    document.body.prepend(bar);
    const st = document.createElement("style");
    st.textContent = `.proto-bar{position:relative;z-index:100;display:flex;gap:4px;align-items:center;justify-content:center;flex-wrap:wrap;padding:6px 12px;background:#111;color:#bbb;font:500 12px/1.2 ui-sans-serif,system-ui,sans-serif}
.proto-bar a{color:#bbb;text-decoration:none;padding:4px 10px;border-radius:99px}
.proto-bar a:hover{color:#fff}.proto-bar a.is-on{background:#fff;color:#111}
.proto-bar .proto-label{opacity:.6;margin-right:6px}.proto-bar .proto-home{opacity:.6}`;
    document.head.append(st);
  };
})();
