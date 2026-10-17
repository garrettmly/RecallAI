export function euclidean(left: ArrayLike<number>, right: ArrayLike<number>): number;
export function bestMatch(
  descriptor: ArrayLike<number>,
  people: { id: string; descriptors: number[][] }[],
): { id: string; distance: number } | null;
