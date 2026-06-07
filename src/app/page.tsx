export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <span className="text-primary text-caption font-semibold tracking-tight">
        Daily AI Brief
      </span>
      <h1 className="text-display-md font-semibold tracking-tight">
        매일 한 곳에서 보는 글로벌·한국 AI/IT 뉴스
      </h1>
      <p className="text-muted-foreground text-body">
        하루 한 번 수집한 AI/IT 뉴스를 한국어 요약으로 제공합니다. 피드는 곧
        제공될 예정입니다.
      </p>
    </main>
  );
}
