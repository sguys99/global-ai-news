"use client";

/**
 * "지금 수집" 버튼. POST /api/admin/collect 로 workflow_dispatch 트리거.
 * 진행 중에는 비활성(중복 클릭 차단). 결과 메시지를 함께 표시한다.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Result = { kind: "ok" | "error"; message: string } | null;

export function CollectButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function onClick() {
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/collect", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (res.ok && body.ok) {
        setResult({ kind: "ok", message: "수집 워크플로를 트리거했습니다." });
      } else {
        setResult({ kind: "error", message: body.reason ?? "트리거에 실패했습니다." });
      }
    } catch {
      setResult({ kind: "error", message: "네트워크 오류가 발생했습니다." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={onClick} disabled={pending} className="rounded-lg">
        {pending ? "트리거 중…" : "지금 수집"}
      </Button>
      {result && (
        <span
          className={
            result.kind === "ok" ? "text-primary text-caption" : "text-destructive text-caption"
          }
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
