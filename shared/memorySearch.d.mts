export function usableNote(text: string): boolean;

export function searchMemories<T extends { text: string }>(
  question: string,
  memories: T[],
): Array<T & { score: number }>;
