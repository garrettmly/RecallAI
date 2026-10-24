import { useState, type FormEvent } from "react";
import type { Person } from "../types";

type NoteLine = {
  key: string;
  personId: string;
  text: string;
  at: number;
  who: string | null;
};

function linesFrom(people: Person[]): NoteLine[] {
  const lines: NoteLine[] = [];
  for (const person of people) {
    const who = person.name;
    for (const fact of person.facts) {
      lines.push({ key: fact.id, personId: person.id, text: fact.text, at: fact.at, who });
    }
    for (const reminder of person.reminders ?? []) {
      lines.push({ key: reminder.id, personId: person.id, text: reminder.text, at: reminder.at, who });
    }
  }
  const seen = new Set<string>();
  return lines
    .sort((left, right) => left.at - right.at)
    .filter((line) => {
      const id = `${line.who ?? ""}:${line.text.toLowerCase()}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(-12);
}

export function Reminders({
  people,
  personId,
  onAdd,
  onDelete,
}: {
  people: Person[];
  personId: string | null;
  onAdd: (personId: string, text: string) => void;
  onDelete: (personId: string, text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const lines = linesFrom(people);
  const canAdd = Boolean(personId);

  function addNote(event: FormEvent) {
    event.preventDefault();
    const text = draft.replace(/\s+/g, " ").trim();
    if (!personId || text.length === 0) return;
    onAdd(personId, text);
    setDraft("");
  }

  return (
    <aside className="notepad" aria-label="Notes">
      <h2>Notes</h2>
      {lines.length === 0 ? (
        <p className="quiet-line">Notes will appear as you talk.</p>
      ) : (
        <ul className="notepad-lines">
          {lines.map((line) => (
            <li key={line.key}>
              <div>
                {line.who ? <span className="who">{line.who}</span> : null}
                <span>{line.text}</span>
              </div>
              <button
                className="notepad-delete"
                type="button"
                aria-label={`Delete note: ${line.text}`}
                onClick={() => onDelete(line.personId, line.text)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="notepad-add" onSubmit={addNote}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a note"
          title={canAdd ? "Add a note" : "Someone needs to be recognized first"}
          aria-label="New note"
          maxLength={140}
          disabled={!canAdd}
        />
        <button type="submit" disabled={!canAdd || draft.trim().length === 0} aria-label="Add note">
          Add
        </button>
      </form>
    </aside>
  );
}
