/*
 * 영어판 세그먼트 404 자리 — (ko)/not-found.tsx 와 같은 이유로 비워 둔다(Next 기본 404 트리가 영어 페이지 RSC 마다
 * 실리지 않게). 없는 `/en/…` 주소는 out/404.html(global-not-found, `/en` 아래면 영어 단이 앞)이 맡는다.
 */
export default function NotFound() {
  return null;
}
