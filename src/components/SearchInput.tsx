"use client";

/**
 * 검색 입력. 입력값을 디바운스(300ms) 후 URL 쿼리 q 로 반영한다.
 * category/source/tag/sort 등 기존 필터는 보존한다. DESIGN.md v2: 잉크 밑줄 입력(지면의 괘선 문법).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

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
    <label className="border-rule focus-within:border-brand flex items-center gap-3 border-b-2 pb-2 transition-colors">
      <Search aria-hidden className="text-muted-foreground size-6 shrink-0" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="키워드로 검색 — 제목·요약·원문·태그"
        aria-label="기사 검색"
        autoFocus
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-2 text-[1.375rem] font-medium tracking-[-0.03em] outline-none md:text-[1.75rem] [&::-webkit-search-cancel-button]:appearance-none"
      />
    </label>
  );
}
