import { LoginForm } from "@/components/admin/LoginForm";

/** 로그인은 인증 상태에 따라 매 요청 처리 → 캐싱하지 않는다. */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <span className="text-primary text-caption font-semibold tracking-tight">
          Daily AI Brief
        </span>
        <h1 className="text-display-md font-semibold tracking-tight">관리자 로그인</h1>
        <p className="text-muted-foreground text-body">운영 콘솔에 접근하려면 인증이 필요합니다.</p>
      </header>
      <LoginForm />
    </main>
  );
}
