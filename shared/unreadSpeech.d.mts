export function unreadSpeech(
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>,
  from: number,
): { confirmed: string; interim: string; emitted: number };
