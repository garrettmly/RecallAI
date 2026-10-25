import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { searchMemories, usableNote } from "../../shared/memorySearch.mjs";
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

function questionFromFact(text: string, who: string): string {
  const fact = text.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
  if (!fact) return "";
  const lower = fact.toLowerCase();

  const named = lower.match(/^(?:has|have|had)\s+(?:a|an|the)\s+([a-z]+(?:\s+[a-z]+)?)\s+named\s+/);
  if (named) {
    const thing = named[1];
    const possessive = thing.endsWith("s") ? `${thing}'` : `${thing}'s`;
    return `What is the ${possessive} name?`;
  }
  if (/^(?:likes|loves|enjoys)\b/.test(lower)) return `What does ${who} like?`;
  if (/^visits?\b/.test(lower)) return `When does ${who} visit?`;
  if (/^lives?\b/.test(lower)) return `Where does ${who} live?`;
  if (/^(?:works|worked)\b/.test(lower)) return `Where does ${who} work?`;
  if (/^brings?\b/.test(lower)) return `What does ${who} bring?`;

  return "";
}

function questionFromReminder(text: string): string {
  const cleaned = text.replace(/[.?!]+$/, "").trim();
  if (!/^(?:call|bring|remember|take|pick|give|tell|buy|get|visit|text|email|pack)\b/i.test(cleaned)) return "";
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return "";
  const phrase = words.join(" ");
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}?`;
}

function suggestionsFor(person: Person | null): string[] {
  if (!person) return [];
  const name = person.name?.replace(/\s+/g, " ").trim() || "";
  const who = name || "they";
  const questions: string[] = [];
  const seen = new Set<string>();
  const add = (question: string) => {
    const cleaned = question.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (cleaned.length < 3 || seen.has(key)) return;
    seen.add(key);
    questions.push(cleaned);
  };

  for (const fact of [...person.facts].reverse()) {
    if (usableNote(fact.text)) add(questionFromFact(fact.text, who));
  }
  if (person.relationship) add(name ? `How is ${name} related?` : "How are we related?");
  for (const reminder of [...(person.reminders ?? [])].reverse()) {
    if (!reminder.done && usableNote(reminder.text)) add(questionFromReminder(reminder.text));
  }
  return questions;
}

function SuggestionRow({ items, onPick }: { items: string[]; onPick: (text: string) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(items.length);
  const key = items.join("\n");

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measure = () => {
      const buttons = [...row.querySelectorAll("button")];
      for (const button of buttons) button.hidden = false;
      const styles = getComputedStyle(row);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
      const width = row.clientWidth;
      let used = 0;
      let fit = 0;
      for (const button of buttons) {
        const next = used + button.offsetWidth + (fit > 0 ? gap : 0);
        if (next > width + 1) break;
        used = next;
        fit += 1;
      }
      buttons.forEach((button, index) => {
        button.hidden = index >= fit;
      });
      setVisible(fit);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [key]);

  return (
    <div className="suggestions" ref={rowRef} role="group" aria-label="Suggested questions">
      {items.map((text, index) => (
        <button className="suggestion" type="button" key={text} hidden={index >= visible} onClick={() => onPick(text)}>
          {text}
        </button>
      ))}
    </div>
  );
}

type Line = { who: string; text: string; kind: "fact" | "said" | "relationship" };

function linesFrom(person: Person): Line[] {
  const who = person.name || "This person";
  const lines: Line[] = [];
  if (person.relationship) lines.push({ who, kind: "relationship", text: person.relationship });
  for (const fact of person.facts) {
    if (usableNote(fact.text)) lines.push({ who, kind: "fact", text: fact.text });
  }
  for (const excerpt of person.excerpts) {
    if (usableNote(excerpt.text)) lines.push({ who, kind: "said", text: excerpt.text });
  }
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
  const chosen = picked.length > 0 ? picked : searchMemories(question, memories);
  return chosen.filter((line) => usableNote(line.text)).slice(0, 4);
}

export function MemorySearch({ person, onListenHold, onVoiceError }: MemorySearchProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [hits, setHits] = useState<Line[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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
        onVoiceError("This browser cannot listen. Open Recall AI in Chrome.");
        return;
      }
      sessionRef.current = session;
    }, 180);
  }

  const title = person?.name ? `Search ${person.name}` : "Search memories";
  const suggestions = suggestionsFor(person);

  function useSuggestion(text: string) {
    setQuestion(text);
    inputRef.current?.focus();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const asked = question.replace(/\s+/g, " ").trim();
    if (asked.length < 2 || busy) return;
    setQuestion("");
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
      <div className="search-stack">
        {suggestions.length > 0 ? (
          <SuggestionRow items={suggestions} onPick={useSuggestion} />
        ) : null}
        <form className="search-bar" onSubmit={onSubmit}>
          <input
            ref={inputRef}
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
      </div>
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
