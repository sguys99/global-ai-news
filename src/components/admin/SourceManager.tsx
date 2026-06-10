"use client";

/**
 * 소스 관리 (Phase 5). 표 + 추가/수정 폼 + 토글/삭제.
 * /api/admin/sources 에 fetch 하고, 응답으로 받은 최신 목록으로 갱신한다(낙관적 X).
 * WEB kind 는 "수집 예정" 배지(등록만, 수집 Post-MVP).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SourceConfig, SourceKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const KINDS: SourceKind[] = ["rss", "web", "hn", "github", "hf", "reddit"];

const EMPTY: SourceConfig = { id: "", name: "", kind: "rss", url: "", enabled: 1 };

type Message = { kind: "ok" | "error"; text: string } | null;

export function SourceManager({ initial }: { initial: SourceConfig[] }) {
  const [sources, setSources] = useState<SourceConfig[]>(initial);
  const [form, setForm] = useState<SourceConfig>(EMPTY);
  const [editing, setEditing] = useState(false); // true=수정(id 잠금), false=추가
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  function resetForm() {
    setForm(EMPTY);
    setEditing(false);
  }

  async function call(
    method: "POST" | "PUT" | "DELETE",
    payload: SourceConfig | { id: string },
  ): Promise<boolean> {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/sources", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        sources?: SourceConfig[];
        target?: string;
        error?: string;
      };
      if (res.ok && body.sources) {
        setSources(body.sources);
        setMessage({
          kind: "ok",
          text: body.target === "local" ? "로컬 파일에 저장했습니다." : "GitHub에 커밋했습니다.",
        });
        return true;
      }
      setMessage({ kind: "error", text: body.error ?? "요청에 실패했습니다." });
      return false;
    } catch {
      setMessage({ kind: "error", text: "네트워크 오류가 발생했습니다." });
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const okDone = await call(editing ? "PUT" : "POST", form);
    if (okDone) resetForm();
  }

  function onEdit(s: SourceConfig) {
    setForm(s);
    setEditing(true);
    setMessage(null);
  }

  async function onToggle(s: SourceConfig) {
    await call("PUT", { ...s, enabled: s.enabled ? 0 : 1 });
  }

  async function onDelete(s: SourceConfig) {
    await call("DELETE", { id: s.id });
    if (editing && form.id === s.id) resetForm();
  }

  // Input 프리미티브의 반응형 높이(h-11 md:h-9, Phase 2)를 그대로 상속받아 모바일 ≥44px 보장
  const input = "text-body rounded-lg shadow-none";

  return (
    <div className="flex flex-col gap-5">
      {/* 추가/수정 폼 */}
      <form
        onSubmit={onSubmit}
        className="border-border grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2"
      >
        <div className="flex flex-col gap-1">
          <label className="text-caption text-muted-foreground">id</label>
          <Input
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            placeholder="techcrunch_ai"
            disabled={editing}
            required
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-muted-foreground">name</label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="TechCrunch AI"
            required
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-muted-foreground">kind</label>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as SourceKind })}
            className="border-input text-body h-11 rounded-lg border bg-transparent px-3 md:h-9"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-muted-foreground">
            url {form.kind === "reddit" && "(r/Subreddit 형식)"}
          </label>
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder={form.kind === "reddit" ? "r/LocalLLaMA" : "https://..."}
            required
            className={input}
          />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending} className="rounded-lg">
            {editing ? "수정 저장" : "소스 추가"}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              disabled={pending}
              className="rounded-lg"
            >
              취소
            </Button>
          )}
          {message && (
            <span
              className={cn(
                "text-caption",
                message.kind === "ok" ? "text-primary" : "text-destructive",
              )}
            >
              {message.text}
            </span>
          )}
        </div>
      </form>

      {/* 소스 목록 */}
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="text-caption w-full border-collapse">
          <thead className="text-muted-foreground border-border border-b">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
              <th>id</th>
              <th>name</th>
              <th>kind</th>
              <th>url</th>
              <th>상태</th>
              <th className="text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr
                key={s.id}
                className={cn(
                  "border-border border-b last:border-b-0 [&>td]:px-3 [&>td]:py-2",
                  !s.enabled && "opacity-50",
                )}
              >
                <td className="font-mono">{s.id}</td>
                <td>{s.name}</td>
                <td>
                  {s.kind}
                  {s.kind === "web" && (
                    <span className="rounded-pill border-border text-muted-foreground ml-2 border px-2 py-0.5 text-[0.7rem]">
                      수집 예정
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground max-w-[14rem] truncate" title={s.url}>
                  {s.url}
                </td>
                <td>{s.enabled ? "활성" : "비활성"}</td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onToggle(s)}
                      disabled={pending}
                      className="text-primary inline-flex min-h-11 items-center px-2 hover:underline disabled:opacity-50 md:min-h-0 md:px-1"
                    >
                      {s.enabled ? "비활성화" : "활성화"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(s)}
                      disabled={pending}
                      className="text-primary inline-flex min-h-11 items-center px-2 hover:underline disabled:opacity-50 md:min-h-0 md:px-1"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s)}
                      disabled={pending}
                      className="text-destructive inline-flex min-h-11 items-center px-2 hover:underline disabled:opacity-50 md:min-h-0 md:px-1"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
