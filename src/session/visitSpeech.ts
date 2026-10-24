import { startListening } from "../listen/speech";

export function listenForVisit(handlers: {
  onInterim: (text: string) => void;
  onFinal: (text: string, finalMs: number | null) => void;
  onHeard: (ms: number) => void;
  onShown: (ms: number) => void;
  onError: (message: string) => void;
}): { stop: () => void } | null {
  let speechStartedAt = 0;
  let heardThisUtterance = false;
  let speechEndedAt = 0;
  return startListening({
    onSpeechStart: () => {
      speechStartedAt = performance.now();
      heardThisUtterance = false;
      speechEndedAt = 0;
    },
    onSpeechEnd: () => {
      speechEndedAt = performance.now();
    },
    onInterim: (text) => {
      const arrived = performance.now();
      if (!heardThisUtterance && speechStartedAt) {
        heardThisUtterance = true;
        handlers.onHeard(Math.round(arrived - speechStartedAt));
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            handlers.onShown(Math.round(performance.now() - arrived));
          });
        });
      }
      handlers.onInterim(text);
    },
    onFinal: (text) => {
      const finalMs = speechEndedAt ? Math.round(performance.now() - speechEndedAt) : null;
      handlers.onFinal(text, finalMs);
    },
    onError: handlers.onError,
  });
}
