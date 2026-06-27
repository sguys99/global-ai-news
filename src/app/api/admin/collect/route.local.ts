/**
 * POST /api/admin/collect — 재수집 트리거 (Phase 5).
 * GitHub Actions collect.yml 을 workflow_dispatch 로 실행한다.
 * collect.yml 은 Phase 6 에서 추가되므로, 미존재(404) 시 명확한 안내를 반환한다.
 *
 * Node 런타임. middleware 가 인증을 가드한다.
 */
import { dispatchWorkflow, WorkflowNotFoundError } from "@/lib/github";

export const dynamic = "force-dynamic";

const WORKFLOW = "collect.yml";

export async function POST() {
  try {
    await dispatchWorkflow(WORKFLOW);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return Response.json(
        {
          ok: false,
          reason: "collect.yml 워크플로가 아직 배포되지 않았습니다 (Phase 6에서 추가).",
        },
        { status: 409 },
      );
    }
    return Response.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}
