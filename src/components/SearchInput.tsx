"use client";

/**
 * 검색 입력. 입력값을 디바운스(300ms) 후 URL 쿼리 q 로 반영한다.
 * source/tag/sort 등 기존 필터는 보존한다. DESIGN: hairline border, 그림자 금지.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

export function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initial);

  // 뒤로가기/링크 등으로 URL q 가 바뀌면 입력값 동기화
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  // 가장 최근 입력만 반영하기 위해 직전 타이머를 정리
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const q = next.trim();
      if (q) params.set("q", q);
      else params.delete("q");
      const qs = params.toString();
      router.push(qs ? `/search?${qs}` : "/search");
    }, DEBOUNCE_MS);
  }

  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="키워드로 기사 검색 (제목·요약·원문·태그)"
      aria-label="기사 검색"
      autoFocus
      className="text-body h-11 rounded-lg shadow-none"
    />
  );
}
