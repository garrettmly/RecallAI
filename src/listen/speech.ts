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
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
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
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onDone?: () => void;
};

function speechConstructor(): SpeechConstructor | null {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function reportSpeechError(error: string, onError: (message: string) => void): void {
  if (error === "no-speech" || error === "aborted") return;
  if (error === "not-allowed") {
    onError("The microphone is blocked. Allow it in the browser, then turn the microphone on.");
    return;
  }
  if (error === "audio-capture") {
    onError("No microphone was found.");
    return;
  }
  if (error === "network") onError("Speech recognition needs a network connection.");
}

function spokenText(event: SpeechResultEvent, from = 0): { interim: string; confirmed: string } {
  let interim = "";
  let confirmed = "";
  for (let index = from; index < event.results.length; index += 1) {
    const result = event.results[index];
    const text = result[0]?.transcript?.trim() ?? "";
    if (!text) continue;
    if (result.isFinal) confirmed = `${confirmed} ${text}`.trim();
    else interim = `${interim} ${text}`.trim();
  }
  return { interim, confirmed };
}

export function startListening(handlers: SpeechHandlers): { stop: () => void } | null {
  const Ctor = speechConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  let alive = true;

  recognition.onspeechstart = () => handlers.onSpeechStart?.();
  recognition.onspeechend = () => handlers.onSpeechEnd?.();

  recognition.onresult = (event) => {
    const { interim, confirmed } = spokenText(event, event.resultIndex);
    if (confirmed) handlers.onFinal(confirmed);
    else if (interim) handlers.onInterim(interim);
  };

  recognition.onerror = (event) => {
    reportSpeechError(event.error, handlers.onError);
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
    }, 40);
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

export function dictateOnce(handlers: SpeechHandlers): { stop: () => void } | null {
  const Ctor = speechConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  let stopped = false;
  let finish: (() => void) | null = null;

  const done = () => {
    if (stopped) return;
    stopped = true;
    handlers.onDone?.();
  };

  recognition.onresult = (event) => {
    const { interim, confirmed } = spokenText(event);
    const text = `${confirmed} ${interim}`.trim();
    if (!text) return;
    if (confirmed && !interim) handlers.onFinal(confirmed);
    else handlers.onInterim(text);
  };

  recognition.onerror = (event) => {
    reportSpeechError(event.error, handlers.onError);
  };

  recognition.onend = () => done();

  const begin = () => {
    if (stopped) return;
    try {
      recognition.start();
    } catch {
      window.setTimeout(() => {
        if (stopped) return;
        try {
          recognition.start();
        } catch {
          handlers.onError("The microphone did not start.");
          done();
        }
      }, 220);
    }
  };
  begin();

  finish = () => {
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // Already stopped.
    }
    done();
  };

  return {
    stop() {
      finish?.();
    },
  };
}
