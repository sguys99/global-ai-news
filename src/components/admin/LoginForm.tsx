"use client";

/**
 * 관리자 로그인 폼. 비밀번호 POST → 성공 시 /admin 으로 이동.
 * DESIGN: 단일 강조색, hairline border, 그림자 금지.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "로그인에 실패했습니다.");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="관리자 비밀번호"
        aria-label="관리자 비밀번호"
        autoFocus
        className="text-body h-11 rounded-lg shadow-none"
      />
      {error && <p className="text-destructive text-caption">{error}</p>}
      <Button type="submit" disabled={pending || !password} className="h-11 rounded-lg">
        {pending ? "확인 중…" : "로그인"}
      </Button>
    </form>
  );
}
