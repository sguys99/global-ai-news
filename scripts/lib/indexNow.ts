/**
 * IndexNow 알림 — english-version-plan Phase 6-3(선택). CLI 는 scripts/indexnow.ts, 배포 연결은 deploy.yml(기본 꺼짐,
 * `vars.INDEXNOW_ENABLED == '1'` 일 때만).
 *
 * IndexNow(https://www.indexnow.org/documentation)는 "추가·갱신·삭제된 URL" 을 Bing·Yandex·Naver 등 참여 검색엔진에 한 번에
 * 알리는 규약이다. 우리 사이트는 GitHub Pages 프로젝트 페이지(`https://sguys99.github.io/global-ai-news/`)라 호스트 루트
 * (`/`)에 키 파일을 둘 수 없다 → 규약의 두 번째 방식: 키 파일을 `public/<키>.txt`(→ `/global-ai-news/<키>.txt`)에 두고
 * 요청에 `keyLocation` 을 싣는다. 규약상 키 파일 위치가 제출할 수 있는 URL 범위를 정한다 — `/global-ai-news/` 의 키는
 * `/global-ai-news/` 아래 URL 만 덮는다(우리 URL 은 전부 그 아래다, `buildIndexNowPayload` 가 확인).
 *
 * 무엇을 보내나: **최신 호에서 새로 생기거나 바뀐 페이지만** — 두 언어 홈(매일 바뀜), 최신 호 고정 링크, 그 호 기사 상세
 * (영어판은 영어 본문이 있는 기사·영어 기사가 있는 호만). 사이트맵은 보내지 않는다 — IndexNow 는 페이지 URL 알림이고
 * 사이트맵은 Search Console·Bing Webmaster 에 따로 제출한다(FAQ "IndexNow 와 사이트맵을 함께"). 바뀌지 않은 URL 을 매일
 * 다시 보내면 FAQ 가 말하는 흔한 실수(같은 URL 반복 제출)라, 지난 호·검색 페이지는 넣지 않는다.
 * 한 요청 상한은 URL 10,000개(우리는 호당 70개 남짓).
 *
 * 응답: 200(접수)·202(접수, 키 확인 대기)만 성공. 400 형식 오류·403 키 불일치·422 호스트/키 범위 밖·429 과다 제출.
 * 순수 함수만 둔다.
 */
import { localePath } from "../../src/lib/i18n";

/** IndexNow 키(32자 16진수). 같은 값이 `public/<키>.txt` 의 내용이다 — indexNow.test.ts 가 맞는지 본다. */
export const INDEXNOW_KEY = "6ed9c8afd10bad2985364bb10abc22d7";
/** 공용 엔드포인트 — 참여 검색엔진 모두에 전달된다. */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** 한 POST 의 URL 상한(규약). */
export const INDEXNOW_MAX_URLS = 10_000;

/** 키 파일의 public/·out/ 상대 경로. */
export const indexNowKeyFile = (key: string = INDEXNOW_KEY) => `${key}.txt`;

/** 키 형식(규약: 8~128자, 영문·숫자·`-`). */
export function isValidIndexNowKey(key: string): boolean {
  return /^[A-Za-z0-9-]{8,128}$/.test(key);
}

/** 최신 호 한 개 — 날짜와 기사(영어 본문 유무). */
export interface LatestIssue {
  date: string;
  articles: readonly { id: number; english: boolean }[];
}

/**
 * 최신 호에서 알릴 페이지 경로(basePath 제외, 끝 슬래시) — 한국어 홈·호·기사, 이어서 영어 홈·호·기사.
 * 영어 호는 영어 기사가 한 건이라도 있을 때만(src/views/data.ts `hasEnglishPage` 와 같은 판정).
 */
export function latestIssuePaths(issue: LatestIssue): string[] {
  const editionPath = `/edition/${issue.date}/`;
  const articlePath = (id: number) => `/article/${id}/`;
  const english = issue.articles.filter((a) => a.english);
  return [
    "/",
    editionPath,
    ...issue.articles.map((a) => articlePath(a.id)),
    localePath("en", "/"),
    ...(english.length > 0 ? [localePath("en", editionPath)] : []),
    ...english.map((a) => localePath("en", articlePath(a.id))),
  ];
}

/** 경로 → out/ 상대 파일(`/` → `index.html`, `/a/b/` → `a/b/index.html`). */
export function outFileOfPath(p: string): string {
  const rest = p.replace(/^\/+/, "");
  return rest === "" || rest.endsWith("/") ? `${rest}index.html` : `${rest}/index.html`;
}

/**
 * 경로 → 절대 URL. `exists`(out/ 상대 파일 있음)를 주면 산출물에 없는 페이지는 `missing` 으로 뺀다 —
 * 실제로 배포되는 페이지만 알린다.
 */
export function buildIndexNowUrls(
  paths: readonly string[],
  siteUrl: string,
  exists?: (outFile: string) => boolean,
): { urls: string[]; missing: string[] } {
  const urls: string[] = [];
  const missing: string[] = [];
  for (const p of [...new Set(paths)]) {
    if (exists && !exists(outFileOfPath(p))) missing.push(p);
    else urls.push(`${siteUrl}${p}`);
  }
  return { urls, missing };
}

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/**
 * 요청 본문. 키 파일은 사이트 주소(basePath) 바로 아래 — 그 디렉터리 밖 URL·다른 호스트·상한 초과·잘못된 키는 던진다
 * (보내 봐야 422·400 이라 미리 막는다).
 */
export function buildIndexNowPayload(
  urls: readonly string[],
  siteUrl: string,
  key: string = INDEXNOW_KEY,
): IndexNowPayload {
  if (!isValidIndexNowKey(key)) throw new Error(`IndexNow 키 형식이 아니다: ${key}`);
  if (urls.length === 0) throw new Error("알릴 URL 이 없다");
  if (urls.length > INDEXNOW_MAX_URLS) {
    throw new Error(`URL ${urls.length}개 — 한 요청 상한 ${INDEXNOW_MAX_URLS}개를 넘는다`);
  }
  const site = new URL(`${siteUrl.replace(/\/+$/, "")}/`);
  if (site.protocol !== "https:") throw new Error(`사이트 주소가 https 가 아니다: ${siteUrl}`);
  const scope = site.href; // 키 파일이 있는 디렉터리(끝 슬래시)
  for (const u of urls) {
    if (!u.startsWith(scope)) throw new Error(`키 파일 범위(${scope}) 밖 URL: ${u}`);
  }
  return {
    host: site.host,
    key,
    keyLocation: `${scope}${indexNowKeyFile(key)}`,
    urlList: [...urls],
  };
}

/** 응답 코드 → 성공 여부·뜻(규약 문서 표). */
export function indexNowOutcome(status: number): { ok: boolean; meaning: string } {
  const meanings: Record<number, string> = {
    200: "접수",
    202: "접수 — 키 확인 대기",
    400: "형식 오류",
    403: "키가 맞지 않음(키 파일 없음·내용 다름)",
    422: "URL 이 호스트·키 범위 밖이거나 키가 규약과 다름",
    429: "요청 과다(스팸 의심)",
  };
  return {
    ok: status === 200 || status === 202,
    meaning: meanings[status] ?? (status === 0 ? "요청 실패(네트워크)" : "알 수 없는 응답"),
  };
}
