type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  }
}

export type SpeechHandlers = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
};

export function startListening(handlers: SpeechHandlers): { stop: () => void } | null {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  let alive = true;

  recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript?.trim() ?? "";
      if (!text) continue;
      if (result.isFinal) handlers.onFinal(text);
      else interim = text;
    }
    if (interim) handlers.onInterim(interim);
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    if (event.error === "not-allowed") {
      handlers.onError("The microphone is blocked. Allow it in the browser, then press Resume.");
      return;
    }
    if (event.error === "audio-capture") {
      handlers.onError("No microphone was found.");
      return;
    }
    if (event.error === "network") {
      handlers.onError("Speech recognition needs a network connection.");
    }
  };

  recognition.onend = () => {
    if (!alive) return;
    window.setTimeout(() => {
      if (!alive) return;
      try {
        recognition.start();
      } catch {
        // Chrome throws if start overlaps the previous session. The next onend retries.
      }
    }, 250);
  };

  try {
    recognition.start();
  } catch {
    handlers.onError("The microphone did not start.");
    return null;
  }

  return {
    stop() {
      alive = false;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
    },
  };
}
