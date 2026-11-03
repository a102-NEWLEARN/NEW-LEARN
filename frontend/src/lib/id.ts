/**
 * 주소의 id — 1 이상의 정수만. 그 밖에는 null.
 * 자바스크립트 숫자로 틀림없이 옮길 수 있는 데까지만 받는다 — 넘으면 다른 id 로 바뀌거나 서버가 400 을 준다
 */
export function toId(raw: string | null | undefined) {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
