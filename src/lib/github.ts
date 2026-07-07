/**
 * GitHub REST API 클라이언트 (Phase 5). fetch 기반, SDK 미사용.
 * - Contents API: configs/sources.json 조회/커밋.
 * - Actions API: collect.yml workflow_dispatch 트리거.
 *
 * Node 런타임(라우트 핸들러) 전용 — Buffer 사용. GITHUB_PAT/GITHUB_REPO 필요.
 */

const API = "https://api.github.com";

/** workflow_dispatch 대상 워크플로가 없을 때(collect.yml 미배포 등). */
export class WorkflowNotFoundError extends Error {
  constructor(message = "워크플로를 찾을 수 없습니다.") {
    super(message);
    this.name = "WorkflowNotFoundError";
  }
}

function requireEnv(): { repo: string; pat: string } {
  const repo = process.env.GITHUB_REPO;
  const pat = process.env.GITHUB_PAT;
  if (!repo || !pat) {
    throw new Error("GITHUB_REPO / GITHUB_PAT 환경변수가 필요합니다.");
  }
  return { repo, pat };
}

/** GitHub 설정(PAT+REPO)이 모두 있는지. 소스 저장 경로 분기에 사용. */
export function hasGithubConfig(): boolean {
  return Boolean(process.env.GITHUB_REPO && process.env.GITHUB_PAT);
}

/** 배포 운영 브랜치(미지정 시 deploy/github-pages). */
export function defaultBranch(): string {
  return process.env.GITHUB_BRANCH || "deploy/github-pages";
}

function headers(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** 파일의 현재 SHA 와 디코드된 내용을 조회한다. 파일이 없으면 sha=null. */
export async function getFile(
  path: string,
): Promise<{ sha: string | null; content: string | null }> {
  const { repo, pat } = requireEnv();
  const res = await fetch(
    `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(defaultBranch())}`,
    { headers: headers(pat) },
  );
  if (res.status === 404) return { sha: null, content: null };
  if (!res.ok) {
    throw new Error(`GitHub getFile ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { sha: string; content: string };
  return {
    sha: body.sha,
    content: Buffer.from(body.content, "base64").toString("utf-8"),
  };
}

/** 파일을 커밋한다(생성·갱신). sha 미지정 시 자동 조회. */
export async function commitFile(
  path: string,
  content: string,
  message: string,
  sha?: string | null,
): Promise<void> {
  const { repo, pat } = requireEnv();
  let resolvedSha = sha;
  if (resolvedSha === undefined) {
    resolvedSha = (await getFile(path)).sha;
  }
  const res = await fetch(`${API}/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...headers(pat), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch: defaultBranch(),
      ...(resolvedSha ? { sha: resolvedSha } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub commitFile ${res.status}: ${await res.text()}`);
  }
}

/**
 * workflow_dispatch 트리거. workflow 는 파일명(예: "collect.yml").
 * 워크플로가 없으면(404) WorkflowNotFoundError 를 던진다.
 */
export async function dispatchWorkflow(
  workflow: string,
  ref: string = defaultBranch(),
): Promise<void> {
  const { repo, pat } = requireEnv();
  const res = await fetch(`${API}/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { ...headers(pat), "Content-Type": "application/json" },
    body: JSON.stringify({ ref }),
  });
  if (res.status === 404) {
    throw new WorkflowNotFoundError(`워크플로 ${workflow} 를 찾을 수 없습니다.`);
  }
  if (!res.ok) {
    throw new Error(`GitHub dispatchWorkflow ${res.status}: ${await res.text()}`);
  }
}
