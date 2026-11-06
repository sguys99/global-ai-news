import type { SVGProps } from "react";

/**
 * 공개 페이지용 인라인 SVG 아이콘(english-version-plan Phase 4-1 — 페이지 무게).
 * lucide-react 컴포넌트는 요소마다 기본 속성 9개(xmlns·width·height·fill·stroke·stroke-width…)와 `lucide lucide-<이름>`
 * 클래스를 HTML·인라인 RSC·index.txt 에 싣는다. 그 값은 globals.css `.ic`(base 층)로 옮기고 여기서는 viewBox·class 와
 * 도형만 쓴다 — 그림은 같다. 도형은 lucide 0.460.0(ISC 라이선스)의 아이콘 정의 그대로다(요소를 합치지 않는다 —
 * 겹치는 획의 안티에일리어싱이 달라진다). 운영 콘솔 등 공개 페이지 밖은 lucide-react 를 그대로 쓴다.
 */
const ICONS = {
  arrowLeft: (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
  arrowUpRight: (
    <>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  house: (
    <>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  share: (
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className,
  ...rest
}: { name: IconName } & Omit<SVGProps<SVGSVGElement>, "children" | "viewBox">) {
  return (
    <svg viewBox="0 0 24 24" className={className ? `ic ${className}` : "ic"} {...rest}>
      {ICONS[name]}
    </svg>
  );
}
