/**
 * *더 보기* 로 쪽을 이어 붙일 때 같은 id 는 처음 것만 남긴다 — 쪽마다 앞에서 안 나온 것만 남긴 쪽을 돌려준다.
 * 쪽 번호(offset) 목록은 쪽을 받는 사이 기사가 앞이나 중간에 들어오면 다음 쪽이 밀려, 이미 보인 기사가 다시 온다.
 * 처음 것을 그대로 두어 보이던 행이 바뀌지 않는다. 쪽 모양을 남기는 것은 붙인 쪽의 행 차례를 그 쪽 첫 행부터 세려고다
 */
export function uniqueById<T extends { id: number }>(
  pages: readonly (readonly T[])[],
): T[][] {
  const seen = new Set<number>();
  return pages.map((items) =>
    items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  );
}

/** 받은 쪽들에서 서로 다른 id 의 수 — *더 보기* 로 새로 붙은 것이 있는지 본다 */
export function uniqueCount<T extends { id: number }>(data?: {
  pages: readonly { items: readonly T[] }[];
}): number {
  return new Set(data?.pages.flatMap((page) => page.items.map(({ id }) => id)))
    .size;
}
