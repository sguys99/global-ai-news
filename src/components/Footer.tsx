import Link from "next/link";

/**
 * 전역 푸터. DESIGN.md footer 토큰 (파치먼트/muted 배경, 상단 hairline, fine-print).
 * 테마에 따라 배경·텍스트 색이 자동 전환된다.
 */
export function Footer() {
  return (
    <footer className="border-border bg-muted text-muted-foreground border-t">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-12">
        <div className="flex flex-col gap-2">
          <span className="text-foreground text-caption font-semibold tracking-tight">
            Daily AI Brief
          </span>
          <p className="text-caption max-w-md">
            글로벌 AI 뉴스를 매일 한국어 요약으로 큐레이션하는 데일리 브리핑.
          </p>
        </div>

        <nav className="text-caption flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/" className="hover:text-primary">
            피드
          </Link>
          <Link href="/search" className="hover:text-primary">
            검색
          </Link>
          {/* 운영 콘솔(/admin)은 로컬 전용 도구 — 정적 배포 산출엔 없으므로 공개 푸터에 노출하지 않는다(Phase 3). */}
        </nav>

        <p className="text-[12px] leading-none">
          © {new Date().getFullYear()} Nasica Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
