/**
 * 배치 환경변수 읽기 헬퍼.
 *
 * GitHub Actions 의 `${{ vars.X }}` 는 변수가 없으면 "미설정"이 아니라 빈 문자열을 주입한다.
 * `process.env.X ?? 기본값` 은 빈 문자열을 통과시키므로(예: Number("") === 0 → 가공 상한 0건),
 * 빈 문자열·공백도 미설정으로 보고 기본값을 쓴다.
 */

/** 문자열 환경변수. 미설정·빈 문자열·공백이면 fallback. */
export function envString(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

/** 0 이상 정수 환경변수. 미설정·빈 값·숫자 아님·음수·소수면 fallback. 명시적 "0" 은 허용. */
export function envNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
