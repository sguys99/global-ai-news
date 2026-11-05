/*
 * 앱 루트 세그먼트 404 자리 — (ko)/not-found.tsx 와 같은 이유로 비워 둔다(Phase 4-1 페이지 무게, 분석 순위 4).
 * 루트 레이아웃이 없어도 Next 는 루트 세그먼트("")에 기본 404 트리를 달아 모든 페이지 RSC 에 싣는다 — 이 파일이 그 자리를 null 로 채운다.
 * 사용자에게 보이는 404 는 global-not-found.tsx(out/404.html)다.
 */
export default function NotFound() {
  return null;
}
