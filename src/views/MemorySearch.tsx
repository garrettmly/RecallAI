import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { searchMemories } from "../../shared/memorySearch.mjs";
import { askMemories } from "../listen/ask";
import { dictateOnce } from "../listen/speech";
import type { Person } from "../types";

type MemorySearchProps = {
  person: Person | null;
  onListenHold: (held: boolean) => void;
  onVoiceError: (message: string | null) => void;
};

function joinQuestion(prefix: string, spoken: string): string {
  return `${prefix} ${spoken}`.replace(/\s+/g, " ").trim().slice(0, 300);
}

type Line = { who: string; text: string; kind: "fact" | "said" | "relationship" };

function linesFrom(person: Person): Line[] {
  const who = person.name || "This person";
  const lines: Line[] = [];
  if (person.relationship) lines.push({ who, kind: "relationship", text: person.relationship });
  for (const fact of person.facts) lines.push({ who, kind: "fact", text: fact.text });
  for (const excerpt of person.excerpts) lines.push({ who, kind: "said", text: excerpt.text });
  return lines;
}

function shownLines(question: string, memories: Line[], relevant: string[]): Line[] {
  const picked: Line[] = [];
  for (const line of relevant) {
    const cleaned = line.replace(/^[^:]{1,40}:\s*/, "").trim();
    const found = memories.find((memory) => memory.text === cleaned || memory.text === line.trim());
    if (!found || picked.some((item) => item.text === found.text)) continue;
    if (found.kind === "said" && searchMemories(question, [found]).length === 0) continue;
    picked.push(found);
  }
  if (picked.length > 0) return picked.slice(0, 4);
  return searchMemories(question, memories).slice(0, 4);
}

export function MemorySearch({ person, onListenHold, onVoiceError }: MemorySearchProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [hits, setHits] = useState<Line[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const sessionRef = useRef<{ stop: () => void } | null>(null);
  const waitRef = useRef(0);
  const holdRef = useRef(onListenHold);
  holdRef.current = onListenHold;

  useEffect(() => {
    return () => {
      window.clearTimeout(waitRef.current);
      sessionRef.current?.stop();
      holdRef.current(false);
    };
  }, []);

  function stopVoice() {
    window.clearTimeout(waitRef.current);
    const session = sessionRef.current;
    sessionRef.current = null;
    setListening(false);
    onListenHold(false);
    session?.stop();
  }

  function startVoice() {
    const prefix = question.replace(/\s+/g, " ").trim();
    setListening(true);
    onListenHold(true);
    onVoiceError(null);
    waitRef.current = window.setTimeout(() => {
      const session = dictateOnce({
        onInterim: (text) => setQuestion(joinQuestion(prefix, text)),
        onFinal: (text) => setQuestion(joinQuestion(prefix, text)),
        onError: (message) => onVoiceError(message),
        onDone: () => {
          sessionRef.current = null;
          setListening(false);
          onListenHold(false);
        },
      });
      if (!session) {
        setListening(false);
        onListenHold(false);
        onVoiceError("This browser cannot listen. Open Porchlight in Chrome.");
        return;
      }
      sessionRef.current = session;
    }, 180);
  }

  const title = person?.name ? `Search ${person.name}` : "Search memories";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const asked = question.replace(/\s+/g, " ").trim();
    if (asked.length < 2 || busy) return;
    setOpen(true);
    if (!person) {
      setHits([]);
      setAnswer(null);
      setNote("Someone needs to be recognized first. Their memories stay private until then.");
      return;
    }
    const memories = linesFrom(person);
    if (memories.length === 0) {
      setHits([]);
      setAnswer(null);
      setNote(person.name ? `No memories saved for ${person.name} yet.` : "No memories saved for this person yet.");
      return;
    }
    setHits([]);
    setAnswer(null);
    setNote(null);
    setBusy(true);
    const packet = memories.slice(0, 24).map((line) => `${line.who}: ${line.text}`);
    try {
      const result = await askMemories({
        question: asked,
        name: person.name,
        memories: packet,
      });
      if ("error" in result) {
        const local = searchMemories(asked, memories);
        setAnswer(null);
        setHits(local);
        setNote(
          local.length === 0
            ? "Nothing saved answers that."
            : result.error === "missing_key"
              ? "Matching memories are below. A written answer needs the Anthropic key."
              : "The question could not be answered. Matching memories are below.",
        );
        return;
      }
      setAnswer(result.answer);
      setHits(shownLines(asked, memories, result.relevant));
    } catch {
      setNote("The question could not be answered. Matching memories are below.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="search-bar" onSubmit={onSubmit}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={person?.name ? `Ask about ${person.name}` : "Ask about this person"}
          aria-label="Question"
          maxLength={300}
        />
        <button
          className={listening ? "search-voice live" : "search-voice"}
          type="button"
          aria-pressed={listening}
          aria-label={listening ? "Stop voice input" : "Ask with your voice"}
          onClick={listening ? stopVoice : startVoice}
        >
          <MicIcon />
        </button>
        <button className="search-send" type="submit" disabled={busy} aria-label={busy ? "Sending" : "Send"}>
          <SendIcon />
        </button>
      </form>
      {open
        ? createPortal(
            <aside className="memory-search" aria-label={title}>
              <div className="search-head">
                <p className="search-title">{title}</p>
                <button className="text-button" type="button" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              {answer ? <p className="search-answer">{answer}</p> : null}
              {note ? <p className="search-note">{note}</p> : null}
              {hits.length > 0 ? (
                <>
                  {answer ? <p className="search-bridge">Here is what was saved:</p> : null}
                  <ul className="search-hits">
                    {hits.map((hit) => (
                      <li key={`${hit.who}-${hit.text}`}>{hit.text}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.2M8.5 20.2h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20V4.5M5 12.2 12 4.5 19 12.2" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
