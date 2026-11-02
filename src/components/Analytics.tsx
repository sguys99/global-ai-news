"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GOATCOUNTER_URL } from "@/lib/site";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

declare global {
  interface Window {
    goatcounter?: { count: (vars: { path: string }) => void };
  }
}

/** 집계 경로 = 실제 주소(basePath + trailingSlash). 대시보드 링크가 리다이렉트 없이 열린다. */
export function countPath(pathname: string): string {
  const path = `${BASE_PATH}${pathname}`;
  return path.endsWith("/") ? path : `${path}/`;
}

/**
 * 방문 집계(GoatCounter count.js). 홈 → 기사 이동은 Next 클라이언트 전환이라 페이지를 다시 불러오지 않는다 →
 * 자동 집계(onload)를 끄고 경로가 바뀔 때마다 직접 센다. 쿼리(?category= 등 필터)는 빼고 경로만 센다.
 * localhost·사설 IP 는 count.js 가 스스로 거른다(로컬 dev·Docker 확인은 집계되지 않음).
 */
export function Analytics() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) window.goatcounter?.count({ path: countPath(pathname) });
  }, [ready, pathname]);

  return (
    <Script
      src="https://gc.zgo.at/count.js"
      data-goatcounter={`${GOATCOUNTER_URL}/count`}
      data-goatcounter-settings='{"no_onload": true}'
      strategy="afterInteractive"
      onReady={() => setReady(true)}
    />
  );
}
