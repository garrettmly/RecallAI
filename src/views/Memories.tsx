import { useState } from "react";
import type { Person } from "../types";

type MemoriesProps = {
  people: Person[];
  confirmingDelete: boolean;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onAskDeleteAll: () => void;
  onCancelDeleteAll: () => void;
  onRemoveAll: () => void;
};

function when(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MemoryCard({
  person,
  onRename,
  onRemove,
}: {
  person: Person;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(person.name ?? "");
  return (
    <article className="memory">
      <label>
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={(event) => onRename(person.id, event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          placeholder="No name yet"
          maxLength={40}
        />
      </label>
      {person.relationship ? <p className="relationship">{person.relationship}</p> : null}
      {person.facts.length > 0 ? (
        <ul className="facts compact">
          {person.facts.map((fact) => (
            <li key={fact.id}>{fact.text}</li>
          ))}
        </ul>
      ) : (
        <p className="quiet-line">Nothing saved from the conversation yet.</p>
      )}
      <p className="meta">Last seen {when(person.lastSeenAt)}</p>
      <button className="text-button" type="button" onClick={() => onRemove(person.id)}>
        Delete this memory
      </button>
    </article>
  );
}

export function Memories({
  people,
  confirmingDelete,
  onRename,
  onRemove,
  onAskDeleteAll,
  onCancelDeleteAll,
  onRemoveAll,
}: MemoriesProps) {
  return (
    <section className="memories">
      <h1>Memories</h1>
      <p className="lede">People this computer has learned. Correct a name if it heard one wrong.</p>
      {people.length === 0 ? <p className="quiet-line">No one has sat down yet.</p> : null}
      <div className="memory-list">
        {people.map((person) => (
          <MemoryCard key={person.id} person={person} onRename={onRename} onRemove={onRemove} />
        ))}
      </div>
      {people.length > 0 ? (
        <div className="danger-row">
          {confirmingDelete ? (
            <>
              <p>This removes every face and note stored on this computer.</p>
              <button className="danger" type="button" onClick={onRemoveAll}>
                Yes, delete it
              </button>
              <button className="secondary" type="button" onClick={onCancelDeleteAll}>
                Keep them
              </button>
            </>
          ) : (
            <button className="text-button" type="button" onClick={onAskDeleteAll}>
              Delete everything on this computer
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
