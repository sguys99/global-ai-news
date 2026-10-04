/**
 * 피드/검색 필터·정렬 바. 링크 기반(쿼리스트링) 네비게이션 — 클라이언트 JS 없이 동작한다(PRD §3.5).
 * DESIGN.md §5: 정렬은 밑줄 탭, 분야·소스·태그는 pill 칩(활성 = 잉크 채움).
 *
 * 정렬은 단일 선택(화제순 = 쿼리 없음 = 기본), 분야·소스·태그는 클릭 시 토글(같은 값 재클릭 시 해제).
 */
import Link from "next/link";
import type { SearchOptions } from "@/lib/db";
import { CATEGORY_LABELS, shortSourceName } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** 기본 정렬(sort 미지정)은 트렌딩 점수순 — feedFilter/db 의 기본 정렬과 동일. */
const SORTS: { value: SearchOptions["sort"]; label: string }[] = [
  { value: undefined, label: "화제순" },
  { value: "latest", label: "최신순" },
  { value: "importance", label: "중요도순" },
];

/**
 * 현재 필터에 patch 를 병합해 `${basePath}?...` href 생성.
 * 값이 빈 문자열/undefined면 해당 키 제거. 검색어 q 는 보존한다.
 * anchor(예: "#all")를 주면 이동 후 해당 위치로 스크롤한다(홈 지면 중간의 전체 기사 목록).
 */
export function buildHref(
  basePath: string,
  current: SearchOptions,
  patch: Partial<SearchOptions>,
  anchor = "",
): string {
  const merged = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.category) params.set("category", merged.category);
  if (merged.source) params.set("source", merged.source);
  if (merged.tag) params.set("tag", merged.tag);
  if (merged.sort) params.set("sort", merged.sort);
  const qs = params.toString();
  return (qs ? `${basePath}?${qs}` : basePath) + anchor;
}

const focus = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-pill text-meta inline-flex min-h-11 items-center border px-3.5 transition-colors md:min-h-8",
        active
          ? "border-foreground bg-foreground text-background font-semibold"
          : "border-border text-foreground-soft hover:border-foreground hover:text-foreground",
        focus,
      )}
    >
      {children}
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
      <span className="text-label text-muted-foreground w-10 shrink-0 font-semibold">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function FilterBar({
  current,
  sources,
  tags,
  basePath = "/",
  anchor = "",
}: {
  current: SearchOptions;
  sources: { id: string; name: string }[];
  tags: string[];
  basePath?: string;
  anchor?: string;
}) {
  const href = (patch: Partial<SearchOptions>) => buildHref(basePath, current, patch, anchor);
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="정렬" className="flex gap-5">
        {SORTS.map((s) => {
          const active = current.sort === s.value;
          return (
            <Link
              key={s.label}
              href={href({ sort: s.value })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "text-caption min-h-11 border-b-2 font-semibold transition-colors md:min-h-0 md:py-1.5",
                active
                  ? "border-brand text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent",
                "inline-flex items-center",
                focus,
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      <Row label="분야">
        {Object.keys(CATEGORY_LABELS).map((c) => {
          const active = current.category === c;
          return (
            <Chip key={c} href={href({ category: active ? undefined : c })} active={active}>
              {CATEGORY_LABELS[c]}
            </Chip>
          );
        })}
      </Row>

      {sources.length > 0 && (
        <Row label="매체">
          {sources.map((s) => {
            const active = current.source === s.id;
            return (
              <Chip key={s.id} href={href({ source: active ? undefined : s.id })} active={active}>
                {shortSourceName(s.name)}
              </Chip>
            );
          })}
        </Row>
      )}

      {tags.length > 0 && (
        <Row label="태그">
          {tags.map((t) => {
            const active = current.tag === t;
            return (
              <Chip key={t} href={href({ tag: active ? undefined : t })} active={active}>
                {t}
              </Chip>
            );
          })}
        </Row>
      )}
    </div>
  );
}
