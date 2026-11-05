/*
 * 한국어판 세그먼트 404 자리 — 일부러 비워 둔다(Phase 4-1 페이지 무게, 분석 순위 4).
 *
 * 이 파일이 없으면 Next 가 기본 404 요소 트리("404: This page could not be found." + 인라인 스타일)를
 * 이 레이아웃 아래 **모든 페이지의 RSC 페이로드**(`index.txt`·인라인 `self.__next_f`)에 실어 보낸다(페이지당 약 4KB).
 * 정적 export 에서 이 화면은 나오지 않는다: 없는 주소는 서버(GitHub Pages·nginx)가 global-not-found 로 만든
 * out/404.html 을 주고, 클라이언트 이동도 RSC 404 를 받으면 전체 로드로 넘어가 같은 404.html 을 연다.
 * 기사·호 페이지의 `notFound()` 는 generateStaticParams 가 만든 id·날짜에만 돌므로 빌드에서도 불리지 않는다.
 */
export default function NotFound() {
  return null;
}
