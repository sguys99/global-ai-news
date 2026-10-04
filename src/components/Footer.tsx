import Link from "next/link";

/**
 * 전역 푸터 (DESIGN.md v2 footer). 굵은 잉크 괘선 + 세리프 제호 + 콜로폰.
 * 테마에 따라 색이 자동 전환된다.
 */
export function Footer() {
  return (
    <footer className="border-rule mt-auto border-t-4">
      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 pt-7 pb-10 md:grid-cols-[1fr_auto] md:items-end md:px-8">
        <div className="flex flex-col gap-2">
          <span className="font-serif text-[2.5rem] leading-none font-extrabold tracking-[-0.045em]">
            Daily <span className="text-brand">AI</span> Brief
          </span>
          <p className="text-meta text-muted-foreground max-w-md">
            글로벌·한국 AI 뉴스를 매일 06:00 KST에 수집해 LLM이 한국어로 요약·분류합니다.
          </p>
          <p className="text-label text-muted-foreground">
            © {new Date().getFullYear()} Nasica Inc. All rights reserved.
          </p>
        </div>

        <nav className="text-caption flex gap-6 font-semibold">
          <Link href="/" className="hover:text-brand">
            오늘의 지면
          </Link>
          <Link href="/search" className="hover:text-brand">
            검색
          </Link>
          {/* 운영 콘솔(/admin)은 로컬 전용 도구 — 정적 배포 산출엔 없으므로 공개 푸터에 노출하지 않는다. */}
        </nav>
      </div>
    </footer>
  );
}
