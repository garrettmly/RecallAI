import type { Person } from "../types";

type VisitProps = {
  person: Person | null;
  uncertain: boolean;
  hearing: string;
  ready: boolean;
  paused: boolean;
  status: string | null;
  speechError: string | null;
  extractError: string | null;
  keyMissing: boolean;
};

function displayName(person: Person | null): string {
  if (!person) return "I’m here.";
  return person.name || "Someone who visited today";
}

export function Visit({
  person,
  uncertain,
  hearing,
  ready,
  paused,
  status,
  speechError,
  extractError,
  keyMissing,
}: VisitProps) {
  const waiting = !person;
  return (
    <section className="visit" aria-live="polite">
      {keyMissing ? (
        <p className="banner" role="status">
          Add your Anthropic key to a <code>.env</code> file and restart. The microphone
          still works, but memories will not be written until Claude can read the conversation.
        </p>
      ) : null}
      {speechError ? (
        <p className="banner" role="alert">
          {speechError}
        </p>
      ) : null}
      {extractError ? (
        <p className="banner" role="alert">
          {extractError}
        </p>
      ) : null}

      {status && !ready ? <p className="quiet-line">{status}</p> : null}
      {paused ? <p className="quiet-line">Paused. The camera and microphone are off.</p> : null}

      {uncertain && person?.name ? <p className="maybe">This might be</p> : null}
      <h1 className={waiting ? "waiting" : undefined}>{displayName(person)}</h1>
      {person?.relationship ? <p className="relationship">{person.relationship}</p> : null}

      {person && person.facts.length > 0 ? (
        <ul className="facts">
          {person.facts.map((fact) => (
            <li key={fact.id}>{fact.text}</li>
          ))}
        </ul>
      ) : (
        <p className="quiet-line">
          {waiting
            ? "When someone sits down and talks, their name will show up here."
            : "Listening for something worth remembering."}
        </p>
      )}

      {hearing && !paused ? <p className="hearing">Hearing: {hearing}</p> : null}
    </section>
  );
}
