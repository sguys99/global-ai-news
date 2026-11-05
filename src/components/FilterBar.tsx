/**
 * 피드/검색 필터·정렬 바. 링크 기반(쿼리스트링) 네비게이션 — 클라이언트 JS 없이 동작한다(PRD §3.5).
 * DESIGN.md §5: 정렬은 밑줄 탭, 분야·소스·태그는 pill 칩(활성 = 잉크 채움).
 *
 * 정렬은 단일 선택(화제순 = 쿼리 없음 = 기본), 분야·소스·태그는 클릭 시 토글(같은 값 재클릭 시 해제).
 * 매체 칩은 축약명 단위로 하나씩만 둔다(`groupSources`) — 같은 매체의 여러 피드(Hacker News 두 피드 등)는
 * 칩 하나로 묶이고, URL 에는 대표 id 를 싣는다. 묶음의 어느 id 로 들어와도 그 칩이 활성으로 보인다.
 */
import Link from "next/link";
import type { SearchOptions } from "@/lib/db";
import { groupSources, type SourceOption } from "@/lib/feedFilter";
import { getMessages, localePath, type Locale } from "@/lib/i18n";
import { CATEGORIES, categoryLabel } from "@/lib/labels";
import { filterMessages } from "@/lib/messages/filter";

/** 기본 정렬(sort 미지정)은 트렌딩 점수순 — feedFilter/db 의 기본 정렬과 동일. 표시명은 filter 이름공간 `sort`. */
const SORTS: { value: SearchOptions["sort"]; key: "trending" | "latest" | "importance" }[] = [
  { value: undefined, key: "trending" },
  { value: "latest", key: "latest" },
  { value: "importance", key: "importance" },
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
      className={active ? "fb-chip fb-chip-on" : "fb-chip fb-chip-off"}
    >
      {children}
    </Link>
  );
}

/**
 * 라벨 + 칩 묶음 한 행. 모바일(시트)은 라벨을 칩 위에 쌓고, md 이상은 라벨을 왼쪽 열에 둔다.
 * md 정렬은 baseline — 칩이 여러 줄로 감겨도 라벨이 칩 묶음 세로 가운데로 떠내려가지 않고
 * **첫 줄 칩 글자와 같은 기준선**에 놓인다(행이 한 줄일 때도 12px 라벨과 13px 칩 글자가 기준선으로 맞는다).
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-col gap-2 md:flex-row md:items-baseline md:gap-4"
    >
      <span className="text-label text-muted-foreground w-10 shrink-0 font-semibold">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * 훅이 없는 공용 프레젠테이션이라 서버(FeedView fallback)·클라(FilterSheet·SearchClient) 어디서나 그린다 —
 * 언어는 `locale` prop 으로 받는다(클라 부모가 `useLocale()` 을 넘긴다). 링크는 언어판 경로(`localePath`)로 만든다.
 */
export function FilterBar({
  current,
  sources,
  tags,
  basePath = "/",
  anchor = "",
  locale = "ko",
}: {
  current: SearchOptions;
  sources: readonly SourceOption[];
  tags: string[];
  /** 언어 접두어 없는 경로("/"·"/search") — 영어판은 여기에 `/en` 을 붙인다. */
  basePath?: string;
  anchor?: string;
  locale?: Locale;
}) {
  const t = getMessages(filterMessages, locale);
  const base = localePath(locale, basePath);
  const href = (patch: Partial<SearchOptions>) => buildHref(base, current, patch, anchor);
  const outlets = groupSources(sources, locale);
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t.sortLabel} className="flex gap-5">
        {SORTS.map((s) => {
          const active = current.sort === s.value;
          return (
            <Link
              key={s.key}
              href={href({ sort: s.value })}
              aria-current={active ? "true" : undefined}
              // fb-tab 15px — 시안(front-v3 `.tabs`)의 정렬 탭 크기. 칩(13px `text-meta`)보다 한 단계 크게 둬 위계를 만든다.
              className={active ? "fb-tab fb-tab-on" : "fb-tab fb-tab-off"}
            >
              {t.sort[s.key]}
            </Link>
          );
        })}
      </div>

      <Row label={t.rows.category}>
        {CATEGORIES.map((c) => {
          const active = current.category === c;
          return (
            <Chip key={c} href={href({ category: active ? undefined : c })} active={active}>
              {categoryLabel(c, locale)}
            </Chip>
          );
        })}
      </Row>

      {outlets.length > 0 && (
        <Row label={t.rows.source}>
          {outlets.map((o) => {
            const active = Boolean(current.source && o.ids.includes(current.source));
            return (
              <Chip key={o.id} href={href({ source: active ? undefined : o.id })} active={active}>
                {o.label}
              </Chip>
            );
          })}
        </Row>
      )}

      {tags.length > 0 && (
        <Row label={t.rows.tag}>
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
