"use client";

/** 로그아웃 버튼. 세션 쿠키 만료 후 로그인 페이지로 이동. */
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  async function onClick() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} className="rounded-lg">
      로그아웃
    </Button>
  );
}
