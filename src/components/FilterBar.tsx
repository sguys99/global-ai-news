/**
 * 피드 필터/정렬 바. 서버 컴포넌트 + 링크 기반(쿼리스트링) 네비게이션으로
 * 클라이언트 JS 없이 동작한다. PRD §3.5, DESIGN: rounded.pill / Action Blue.
 *
 * 정렬은 단일 선택, 소스·태그는 클릭 시 토글(같은 값 재클릭하면 해제)한다.
 */
import Link from "next/link";
import type { SearchOptions } from "@/lib/db";
import { cn } from "@/lib/utils";

const SORTS: { value: "latest" | "importance"; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "importance", label: "중요도순" },
];

/**
 * 현재 필터에 patch 를 병합해 `${basePath}?...` href 생성.
 * 값이 빈 문자열/undefined면 해당 키 제거. 검색어 q 는 보존한다.
 */
function buildHref(
  basePath: string,
  current: SearchOptions,
  patch: Partial<SearchOptions>,
): string {
  const merged = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.source) params.set("source", merged.source);
  if (merged.tag) params.set("tag", merged.tag);
  if (merged.sort) params.set("sort", merged.sort);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

const chip =
  "rounded-pill text-caption inline-flex items-center border px-3 py-1 transition-colors";
const chipOff = "border-border text-muted-foreground hover:border-foreground";
const chipOn = "border-foreground bg-foreground text-background font-medium";

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
    <Link href={href} className={cn(chip, active ? chipOn : chipOff)}>
      {children}
    </Link>
  );
}

export function FilterBar({
  current,
  sources,
  tags,
  basePath = "/",
}: {
  current: SearchOptions;
  sources: { id: string; name: string }[];
  tags: string[];
  basePath?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* 정렬 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground mr-1">정렬</span>
        {SORTS.map((s) => {
          const active = (current.sort ?? "latest") === s.value;
          return (
            <Chip
              key={s.value}
              href={buildHref(basePath, current, { sort: active ? undefined : s.value })}
              active={active}
            >
              {s.label}
            </Chip>
          );
        })}
      </div>

      {/* 소스 */}
      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground mr-1">소스</span>
          {sources.map((s) => {
            const active = current.source === s.id;
            return (
              <Chip
                key={s.id}
                href={buildHref(basePath, current, { source: active ? undefined : s.id })}
                active={active}
              >
                {s.name}
              </Chip>
            );
          })}
        </div>
      )}

      {/* 태그 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground mr-1">태그</span>
          {tags.map((t) => {
            const active = current.tag === t;
            return (
              <Chip
                key={t}
                href={buildHref(basePath, current, { tag: active ? undefined : t })}
                active={active}
              >
                {t}
              </Chip>
            );
          })}
        </div>
      )}
    </div>
  );
}
