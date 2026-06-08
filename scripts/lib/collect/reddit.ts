/**
 * Reddit 수집 어댑터. PRD §3.1.
 * OAuth2 client_credentials 로 앱 전용 토큰을 발급(모듈 내 캐시·만료 갱신)하고,
 * /r/{sub}/top?t=day 상위 글을 RawItem[] 으로 정규화한다.
 *
 * 서브레딧 슬러그는 source.url("r/LocalLLaMA" 또는 전체 URL)에서 파싱한다.
 * REDDIT_CLIENT_ID/SECRET 가 없으면 에러를 throw → collect.ts 가 격리한다.
 */
import type { RawItem } from "../../../src/lib/types";
import type { SourceConfig } from "./rss";

const MAX_CONTENT_CHARS = 2000;
const USER_AGENT = "daily-ai-brief/0.1 (by /u/daily-ai-brief)";

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}
let cached: CachedToken | null = null;

/** client_credentials 로 access_token 발급. 60초 여유를 둔 캐시를 재사용. */
async function getAccessToken(): Promise<string> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("REDDIT_CLIENT_ID/SECRET not configured");
  }
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit token HTTP ${res.status}`);

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("Reddit token missing in response");

  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

/** source.url 에서 서브레딧 슬러그 추출 ("r/LocalLLaMA" / 전체 URL 모두 허용). */
export function parseSubreddit(raw: string): string {
  const m = raw.match(/r\/([A-Za-z0-9_]+)/);
  if (!m) throw new Error(`invalid subreddit: ${raw}`);
  return m[1];
}

interface RedditChild {
  data?: {
    title?: string;
    url?: string;
    permalink?: string;
    selftext?: string;
    created_utc?: number;
    ups?: number;
    num_comments?: number;
    stickied?: boolean;
  };
}

/** Reddit 서브레딧 한 곳의 일일 상위 글을 수집한다. */
export async function fetchReddit(source: SourceConfig): Promise<RawItem[]> {
  const sub = parseSubreddit(source.url);
  const token = await getAccessToken();

  const res = await fetch(`https://oauth.reddit.com/r/${sub}/top?t=day&limit=25`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Reddit r/${sub} HTTP ${res.status}`);

  const data = (await res.json()) as {
    data?: { children?: RedditChild[] };
  };

  const items: RawItem[] = [];
  for (const child of data.data?.children ?? []) {
    const post = child.data;
    if (!post || post.stickied) continue;
    const title = post.title;
    if (!title || post.created_utc === undefined) continue;

    const publishedAt = new Date(post.created_utc * 1000);
    if (Number.isNaN(publishedAt.getTime())) continue;

    // 외부 링크 글이면 그 url, self post 면 퍼머링크.
    const url = post.url ?? `https://www.reddit.com${post.permalink ?? ""}`;

    items.push({
      sourceId: source.id,
      url,
      title,
      contentRaw: post.selftext ? post.selftext.slice(0, MAX_CONTENT_CHARS) : undefined,
      publishedAt: publishedAt.toISOString(),
      engagement: {
        ups: post.ups ?? 0,
        num_comments: post.num_comments ?? 0,
      },
    });
  }
  return items;
}
