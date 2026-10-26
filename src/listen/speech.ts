import { unreadSpeech } from "../../shared/unreadSpeech.mjs";

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
  abort: () => void;
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

  let stopped = false;
  let current: SpeechRecognitionLike | null = null;
  let recycleTimer = 0;
  let session = 0;

  const listen = () => {
    if (stopped) return;
    const mine = ++session;
    const recognition = new Ctor();
    current = recognition;
    let heard = 0;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onspeechstart = () => {
      if (mine === session) handlers.onSpeechStart?.();
    };
    recognition.onspeechend = () => {
      if (mine === session) handlers.onSpeechEnd?.();
    };
    recognition.onresult = (event) => {
      if (mine !== session) return;
      const next = unreadSpeech(event.results, heard);
      heard = next.emitted;
      if (next.confirmed) handlers.onFinal(next.confirmed);
      else if (next.interim) handlers.onInterim(next.interim);
    };
    recognition.onerror = (event) => {
      if (mine === session) reportSpeechError(event.error, handlers.onError);
    };
    recognition.onend = () => {
      if (stopped || mine !== session) return;
      window.setTimeout(listen, 250);
    };
    window.clearTimeout(recycleTimer);
    try {
      recognition.start();
    } catch {
      window.setTimeout(() => {
        if (!stopped && mine === session) listen();
      }, 300);
      return;
    }
    // Chrome gets slow if one listening session stays open for the whole visit.
    recycleTimer = window.setTimeout(() => {
      if (stopped || mine !== session) return;
      try {
        recognition.stop();
      } catch {
        listen();
      }
      window.setTimeout(() => {
        if (!stopped && current === recognition) listen();
      }, 500);
    }, 20000);
  };

  listen();

  return {
    stop() {
      stopped = true;
      session += 1;
      window.clearTimeout(recycleTimer);
      const recognition = current;
      current = null;
      if (!recognition) return;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        try {
          recognition.stop();
        } catch {
          // Already stopped.
        }
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
