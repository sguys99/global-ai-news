/**
 * /api/admin/sources — 소스 CRUD (Phase 5).
 * GET    목록 조회
 * POST   추가      body: SourceConfig
 * PUT    수정/토글 body: SourceConfig (id 로 매칭)
 * DELETE 삭제      ?id=... 또는 body: { id }
 *
 * 변경은 readSources → 수정 → writeSources(GitHub 커밋 또는 로컬 파일).
 * Node 런타임. middleware 가 인증을 가드한다.
 */
import { readSources, sourceSchema, writeSources } from "@/lib/sources";
import type { SourceConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

function ok(data: unknown, status = 200) {
  return Response.json(data, { status });
}
function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** writeSources 실패(GitHub/FS 오류)를 502 로 변환. */
async function persist(sources: SourceConfig[], message: string) {
  try {
    const target = await writeSources(sources, message);
    return ok({ ok: true, target, sources });
  } catch (e) {
    return fail(`저장 실패: ${(e as Error).message}`, 502);
  }
}

export async function GET() {
  try {
    return ok({ sources: await readSources() });
  } catch (e) {
    return fail(`소스 조회 실패: ${(e as Error).message}`, 500);
  }
}

export async function POST(req: Request) {
  const parsed = sourceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "유효하지 않은 입력입니다.");
  const source = parsed.data as SourceConfig;

  const sources = await readSources();
  if (sources.some((s) => s.id === source.id)) {
    return fail(`이미 존재하는 id 입니다: ${source.id}`, 409);
  }
  return persist([...sources, source], `chore(sources): add ${source.id}`);
}

export async function PUT(req: Request) {
  const parsed = sourceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "유효하지 않은 입력입니다.");
  const source = parsed.data as SourceConfig;

  const sources = await readSources();
  const idx = sources.findIndex((s) => s.id === source.id);
  if (idx === -1) return fail(`존재하지 않는 id 입니다: ${source.id}`, 404);

  const next = [...sources];
  next[idx] = source;
  return persist(next, `chore(sources): update ${source.id}`);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  let id = url.searchParams.get("id") ?? "";
  if (!id) {
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    id = body.id ?? "";
  }
  if (!id) return fail("삭제할 id 가 필요합니다.");

  const sources = await readSources();
  if (!sources.some((s) => s.id === id)) {
    return fail(`존재하지 않는 id 입니다: ${id}`, 404);
  }
  return persist(
    sources.filter((s) => s.id !== id),
    `chore(sources): remove ${id}`,
  );
}
